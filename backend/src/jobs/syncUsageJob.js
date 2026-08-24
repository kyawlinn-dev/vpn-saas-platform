import { supabase } from "../lib/supabase.js";
import { logger } from "../lib/logger.js";
import { getOutlineTransferMetrics } from "../services/outlineService.js";
import { stopOrder } from "../services/orderLifecycleService.js";
import { notifyDataLimitReached, notifyDataLimitWarning } from "../services/notificationService.js";
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

function planLimitToBytes(gb) {
  if (!gb || Number(gb) <= 0) return null;
  return Math.floor(Number(gb) * 1024 * 1024 * 1024);
}

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
    .select("id, reseller_id, vpn_plans ( data_limit_gb )")
    .eq("status", "active");

  if (error) {
    log.error({ err: error }, "near-limit query error");
    return;
  }

  for (const order of orders || []) {
    const limitGb = Number(order.vpn_plans?.data_limit_gb || 0);
    const limitBytes = planLimitToBytes(limitGb);
    if (!limitBytes) continue;

    const { data: keys, error: keysErr } = await supabase
      .from("vpn_keys")
      .select("used_bytes")
      .eq("order_id", order.id)
      .in("status", ["active", "deleted"]);

    if (keysErr) continue;

    const total = (keys || []).reduce((sum, k) => sum + Number(k.used_bytes || 0), 0);
    // Strictly below the limit — an order at or over it gets stopped and
    // gets data_limit_reached instead (stopOrdersOverDataLimit, right after
    // this function), not this warning.
    if (total < limitBytes * WARNING_THRESHOLD || total >= limitBytes) continue;

    const percentUsed = Math.floor((total / limitBytes) * 100);
    const remainingGb = Math.max(0, (limitBytes - total) / 1024 / 1024 / 1024).toFixed(2);

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
    .select("id, reseller_id, vpn_plans ( data_limit_gb )")
    .eq("status", "active");

  if (error) {
    log.error({ err: error }, "over-limit query error");
    return;
  }

  for (const order of orders || []) {
    const limitBytes = planLimitToBytes(order.vpn_plans?.data_limit_gb);
    if (!limitBytes) continue;

    const { data: keys, error: keysErr } = await supabase
      .from("vpn_keys")
      .select("used_bytes")
      .eq("order_id", order.id)
      .in("status", ["active", "deleted"]);

    if (keysErr) continue;

    const total = (keys || []).reduce((sum, k) => sum + Number(k.used_bytes || 0), 0);
    if (total < limitBytes) continue;

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
