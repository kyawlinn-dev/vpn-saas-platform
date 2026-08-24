/**
 * autoStopJob.js
 *
 * Runs every hour.
 *
 * Stops expired active orders immediately once expiry_date is in the past.
 * Deletes the Outline key and sets status = "stopped".
 */

import { supabase } from "../lib/supabase.js";
import { logger } from "../lib/logger.js";
import { stopOrder } from "../services/orderLifecycleService.js";
import { businessDateOnly } from "../utils/businessTime.js";

const INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const log = logger.child({ job: "autoStop" });

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
    log.error({ err: error }, "stopExpired query error");
    return;
  }

  if (!orders?.length) return;

  for (const order of orders) {
    try {
      await stopOrder({ orderId: order.id, resellerId: order.reseller_id });
      log.info({ order_id: order.id }, "auto-stopped expired order");
    } catch (err) {
      log.error({ err, order_id: order.id }, "error stopping order");
    }
  }
}

async function runAutoStop() {
  log.info("running");
  await stopExpiredOrders();
}

export function startAutoStopJob() {
  runAutoStop().catch((err) => log.error({ err }, "initial run error"));

  setInterval(() => {
    runAutoStop().catch((err) => log.error({ err }, "interval run error"));
  }, INTERVAL_MS);

  log.info({ interval_ms: INTERVAL_MS }, "job scheduled");
}
