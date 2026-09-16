import { supabase } from "../lib/supabase.js";
import { logger } from "../lib/logger.js";
import { getOutlineTransferMetrics } from "../services/outlineService.js";
import { stopOrder } from "../services/orderLifecycleService.js";
import { notifyDataLimitReached, notifyDataLimitWarning } from "../services/notificationService.js";
import { getOrderQuotaSnapshot } from "../services/subscriptionProvisionService.js";
import {
  markJobFailure,
  markJobStarted,
  markJobSuccess,
  recordServerHealthFailure,
  recordServerUsageSyncSuccess,
} from "../services/healthMonitoringService.js";

const INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const WARNING_THRESHOLD = 0.8; // 80% of the plan's data limit
const log = logger.child({ job: "syncUsage" });

// Advance warning at 80% usage — the data-limit side's equivalent of
// trial_ending_24h / subscription_expiring_3d, so customers get a heads-up
// before a hard cutoff either way (by date or by data), not just the
// date-based one. The notifications_sent unique constraint on (customer,
// event_type, order_id) makes this naturally fire-once even though this
// function re-checks every order on every hourly tick — once sent for an
// order, later ticks just no-op on the dedup check inside sendAndRecord.
async function warnOrdersNearDataLimit() {
  const { data: orders, error } = await supabase
    .from("vpn_orders")
    .select("id, reseller_id")
    .eq("status", "active");

  if (error) {
    log.error({ err: error }, "near-limit query error");
    return;
  }

  for (const order of orders || []) {
    // Warn at 80% of the order's TRUE allowance (plan base + any applied
    // extend/top-up, reconstructed from the order's key history) — the same
    // getOrderQuotaSnapshot autoStopJob uses. The raw plan data_limit_gb
    // ignores extends, so an extended customer would be warned/stopped at
    // their base plan limit instead of their real entitlement.
    let quota;
    try {
      quota = await getOrderQuotaSnapshot(order.id);
    } catch (err) {
      log.error({ err, order_id: order.id }, "near-limit quota snapshot failed");
      continue;
    }
    if (quota.isUnlimited) continue;
    const allowance = Number(quota.totalAllowanceBytes || 0);
    if (allowance <= 0) continue;
    const total = Number(quota.totalUsedBytes || 0);
    // Strictly in [80%, 100%). At/over the allowance it gets stopped +
    // data_limit_reached (stopOrdersOverDataLimit, right after), not warned.
    if (total < allowance * WARNING_THRESHOLD || total >= allowance) continue;

    const percentUsed = Math.floor((total / allowance) * 100);
    const remainingGb = Math.max(0, (allowance - total) / 1024 / 1024 / 1024).toFixed(2);

    try {
      await notifyDataLimitWarning(order.id, { percentUsed, remainingGb });
    } catch (err) {
      log.error({ err, order_id: order.id }, "failed to send data-limit-warning notification");
    }
  }
}

async function stopOrdersOverDataLimit() {
  const { data: orders, error } = await supabase
    .from("vpn_orders")
    .select("id, reseller_id")
    .eq("status", "active");

  if (error) {
    log.error({ err: error }, "over-limit query error");
    return;
  }

  for (const order of orders || []) {
    // Stop only when the order's TRUE remaining allowance (plan base + applied
    // extend/top-up, reconstructed from the order's key history) is exhausted —
    // the same getOrderQuotaSnapshot autoStopJob uses. Checking the raw plan
    // data_limit_gb instead wrongly stopped extended customers at their base
    // plan limit (e.g. a 100 GB plan + 100 GB extend stopped at 100 GB).
    let quota;
    try {
      quota = await getOrderQuotaSnapshot(order.id);
    } catch (err) {
      log.error({ err, order_id: order.id }, "over-limit quota snapshot failed");
      continue;
    }
    const exhausted =
      !quota.isUnlimited && quota.remainingBytes !== null && quota.remainingBytes <= 0;
    if (!exhausted) continue;

    try {
      await stopOrder({ orderId: order.id, resellerId: order.reseller_id });
      log.info({ order_id: order.id }, "auto-stopped order (data limit reached)");
    } catch (err) {
      log.error({ err, order_id: order.id }, "failed to stop over-limit order");
      continue;
    }

    // Best-effort — a failed notification should never be treated as a
    // failure of the actual stop-order operation above, which already
    // succeeded and shouldn't be retried because of this.
    try {
      await notifyDataLimitReached(order.id);
    } catch (err) {
      log.error({ err, order_id: order.id }, "failed to send data-limit-reached notification");
    }
  }
}

async function syncUsage() {
  const { data: servers, error: serverError } = await supabase
    .from("vpn_servers")
    .select("id, outline_api_url, outline_cert_sha256")
    .eq("status", "active")
    .not("outline_api_url", "is", null);

  if (serverError) {
    log.error({ err: serverError }, "failed to fetch servers");
    throw serverError;
  }

  if (!servers?.length) return;

  for (const server of servers) {
    try {
      const metricsMap = await getOutlineTransferMetrics({
        apiUrl: server.outline_api_url,
        certSha256: server.outline_cert_sha256,
      });

      const { data: keys, error: keysError } = await supabase
        .from("vpn_keys")
        .select("id, outline_key_id, used_bytes")
        .eq("server_id", server.id)
        .eq("status", "active")
        .is("deleted_at", null);

      if (keysError) {
        log.warn({ err: keysError, server_id: server.id }, "failed to fetch keys for server");
        await recordServerHealthFailure(server.id, keysError);
        continue;
      }

      let updated = 0;

      for (const key of keys) {
        const newBytes = metricsMap[String(key.outline_key_id)];
        if (newBytes === undefined) continue;
        if (Number(newBytes) === Number(key.used_bytes)) continue;

        const { error: updateError } = await supabase
          .from("vpn_keys")
          .update({ used_bytes: newBytes })
          .eq("id", key.id);

        if (updateError) {
          log.warn({ err: updateError, key_id: key.id }, "failed to update used_bytes");
        } else {
          updated += 1;
        }
      }

      await recordServerUsageSyncSuccess(server.id, {
        activeKeysSeen: keys?.length || 0,
      });
      log.info({ server_id: server.id, keys_updated: updated, keys_seen: keys?.length || 0 }, "server usage synced");
    } catch (err) {
      await recordServerHealthFailure(server.id, err);
      log.error({ err, server_id: server.id }, "error syncing server");
    }
  }
}

async function reconcileServerActiveKeyCounts() {
  const { data: servers, error } = await supabase
    .from("vpn_servers")
    .select("id, current_active_keys")
    .eq("status", "active");

  if (error) {
    log.error({ err: error }, "failed to load server counters");
    return;
  }

  for (const server of servers || []) {
    const { count, error: countError } = await supabase
      .from("vpn_keys")
      .select("id", { count: "exact", head: true })
      .eq("server_id", server.id)
      .eq("status", "active")
      .is("deleted_at", null);

    if (countError) {
      log.warn({ err: countError, server_id: server.id }, "failed to count active keys");
      continue;
    }

    const expected = Number(count || 0);
    const current = Number(server.current_active_keys || 0);
    if (expected === current) continue;

    const { data: updatedServers, error: updateError } = await supabase
      .from("vpn_servers")
      .update({ current_active_keys: expected, updated_at: new Date().toISOString() })
      .eq("id", server.id)
      .eq("current_active_keys", current)
      .select("id");

    if (updateError) {
      log.warn({ err: updateError, server_id: server.id }, "failed to reconcile server");
    } else if (updatedServers?.length) {
      log.info({ server_id: server.id, from: current, to: expected }, "reconciled server counter");
    } else {
      log.debug({ server_id: server.id }, "skipped stale counter update");
    }
  }
}

async function runSyncUsage() {
  log.info("running");
  await markJobStarted("usage_sync");
  try {
    await syncUsage();
    await reconcileServerActiveKeyCounts();
    await warnOrdersNearDataLimit();
    await stopOrdersOverDataLimit();
    await markJobSuccess("usage_sync");
  } catch (err) {
    await markJobFailure("usage_sync", err);
    throw err;
  }
}

export function startSyncUsageJob() {
  runSyncUsage().catch((err) => log.error({ err }, "initial run error"));

  setInterval(() => {
    runSyncUsage().catch((err) => log.error({ err }, "interval run error"));
  }, INTERVAL_MS);

  log.info({ interval_ms: INTERVAL_MS }, "job scheduled (every 1 hour)");
}
