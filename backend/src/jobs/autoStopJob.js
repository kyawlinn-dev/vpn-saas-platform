/**
 * autoStopJob.js
 *
 * Runs every hour.
 *
 * Stops expired active orders immediately once expiry_date is in the past.
 * Deletes the Outline key and sets status = "stopped".
 */

import { supabase } from "../lib/supabase.js";
import { deleteOutlineKey } from "../services/outlineService.js";
import { getServerById, decrementServerUsage } from "../services/serverService.js";

const INTERVAL_MS = 60 * 60 * 1000; // 1 hour

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function stopExpiredOrders() {
  const { data: orders, error } = await supabase
    .from("vpn_orders")
    .select("id, reseller_id")
    .eq("status", "active")
    .lt("expiry_date", today());

  if (error) {
    console.error("[autoStop] stopExpired query error:", error.message);
    return;
  }

  if (!orders?.length) return;

  for (const order of orders) {
    try {
      const { data: keys, error: keysError } = await supabase
        .from("vpn_keys")
        .select("id, outline_key_id, server_id")
        .eq("order_id", order.id)
        .eq("status", "active")
        .is("deleted_at", null);

      if (keysError) {
        console.warn(
          `[autoStop] Failed to fetch keys for order ${order.id}:`,
          keysError.message
        );
      }

      for (const key of keys || []) {
        const server = key.server_id ? await getServerById(key.server_id) : null;

        if (server?.outline_api_url && key.outline_key_id) {
          try {
            await deleteOutlineKey({
              apiUrl: server.outline_api_url,
              certSha256: server.outline_cert_sha256,
              outlineKeyId: key.outline_key_id,
            });
          } catch (e) {
            console.warn(
              `[autoStop] Failed to delete Outline key for order ${order.id}:`,
              e.message
            );
          }

          try {
            await decrementServerUsage(key.server_id);
          } catch (_) {}
        }

        const { error: deleteKeyError } = await supabase
          .from("vpn_keys")
          .delete()
          .eq("id", key.id);

        if (deleteKeyError) {
          console.warn(
            `[autoStop] Failed to delete vpn_keys row for order ${order.id}:`,
            deleteKeyError.message
          );
        }
      }

      const { error: updateOrderError } = await supabase
        .from("vpn_orders")
        .update({
          status: "stopped",
          stopped_at: new Date().toISOString(),
        })
        .eq("id", order.id);

      if (updateOrderError) {
        throw new Error(updateOrderError.message);
      }

      console.log(
        `[autoStop] Auto-stopped order ${order.id} (${(keys || []).length} key(s) removed).`
      );
    } catch (err) {
      console.error(`[autoStop] Error stopping order ${order.id}:`, err.message);
    }
  }
}

async function runAutoStop() {
  console.log("[autoStop] Running...");
  await stopExpiredOrders();
}

export function startAutoStopJob() {
  runAutoStop().catch((err) =>
    console.error("[autoStop] Initial run error:", err.message)
  );

  setInterval(() => {
    runAutoStop().catch((err) =>
      console.error("[autoStop] Interval run error:", err.message)
    );
  }, INTERVAL_MS);

  console.log("[autoStop] Job scheduled (every 1 hour).");
}