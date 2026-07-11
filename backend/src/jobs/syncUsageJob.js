import { supabase } from "../lib/supabase.js";
import { getOutlineTransferMetrics } from "../services/outlineService.js";
import { stopOrder } from "../services/orderLifecycleService.js";

const INTERVAL_MS = 60 * 60 * 1000; // 1 hour

function planLimitToBytes(gb) {
  if (!gb || Number(gb) <= 0) return null;
  return Math.floor(Number(gb) * 1024 * 1024 * 1024);
}

async function stopOrdersOverDataLimit() {
  const { data: orders, error } = await supabase
    .from("vpn_orders")
    .select("id, reseller_id, vpn_plans ( data_limit_gb )")
    .eq("status", "active");

  if (error) {
    console.error("[syncUsage] over-limit query error:", error.message);
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
      console.log(`[syncUsage] Auto-stopped order ${order.id} (data limit reached).`);
    } catch (err) {
      console.error(`[syncUsage] Failed to stop over-limit order ${order.id}:`, err.message);
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
    console.error("[syncUsage] Failed to fetch servers:", serverError.message);
    return;
  }

  if (!servers?.length) return;

  for (const server of servers) {
    try {
      const metricsMap = await getOutlineTransferMetrics({
        apiUrl: server.outline_api_url,
        certSha256: server.outline_cert_sha256,
      });

      if (!Object.keys(metricsMap).length) continue;

      const { data: keys, error: keysError } = await supabase
        .from("vpn_keys")
        .select("id, outline_key_id, used_bytes")
        .eq("server_id", server.id)
        .eq("status", "active")
        .is("deleted_at", null);

      if (keysError) {
        console.warn(
          `[syncUsage] Failed to fetch keys for server ${server.id}:`,
          keysError.message
        );
        continue;
      }

      if (!keys?.length) continue;

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
          console.warn(
            `[syncUsage] Failed to update used_bytes for key ${key.id}:`,
            updateError.message
          );
        } else {
          updated += 1;
        }
      }

      console.log(`[syncUsage] Server ${server.id}: updated ${updated} key(s).`);
    } catch (err) {
      console.error(`[syncUsage] Error syncing server ${server.id}:`, err.message);
    }
  }
}

async function runSyncUsage() {
  console.log("[syncUsage] Running...");
  await syncUsage();
  await stopOrdersOverDataLimit();
}

export function startSyncUsageJob() {
  runSyncUsage().catch((err) =>
    console.error("[syncUsage] Initial run error:", err.message)
  );

  setInterval(() => {
    runSyncUsage().catch((err) =>
      console.error("[syncUsage] Interval run error:", err.message)
    );
  }, INTERVAL_MS);

  console.log("[syncUsage] Job scheduled (every 1 hour).");
}
