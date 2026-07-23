/**
 * autoStopJob.js
 *
 * Runs every hour.
 *
 * Stops expired active orders immediately once expiry_date is in the past.
 * Deletes the Outline key and sets status = "stopped".
 */

import { supabase } from "../lib/supabase.js";
import { stopOrder } from "../services/orderLifecycleService.js";
import { businessDateOnly } from "../utils/businessTime.js";

const INTERVAL_MS = 60 * 60 * 1000; // 1 hour

function today() {
  return businessDateOnly();
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
      await stopOrder({ orderId: order.id, resellerId: order.reseller_id });

      console.log(
        `[autoStop] Auto-stopped order ${order.id}.`
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
