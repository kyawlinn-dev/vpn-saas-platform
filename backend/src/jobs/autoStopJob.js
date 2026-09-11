/**
 * autoStopJob.js
 *
 * Runs every hour.
 *
 * Lifecycle sweep for the queued-plan model:
 *   - Expires any active order that has run out of TIME (expiry_date passed) or
 *     DATA (order allowance consumed), whichever comes first.
 *   - Promotes the customer's next queued ("scheduled") plan when one ends,
 *     provisioning its fresh keys.
 *
 * All of this is done by processExpiredOrdersAndQueue() in the lifecycle
 * service; this job just schedules and logs it.
 */

import { logger } from "../lib/logger.js";
import { processExpiredOrdersAndQueue } from "../services/orderLifecycleService.js";

const INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const log = logger.child({ job: "autoStop" });

async function runAutoStop() {
  log.info("running");
  try {
    const results = await processExpiredOrdersAndQueue();
    const ended = results.filter((r) => !r.error).length;
    const promoted = results.filter((r) => r.promoted).length;
    const failed = results.filter((r) => r.error);
    if (ended > 0 || promoted > 0) {
      log.info({ ended, promoted }, "lifecycle sweep applied");
    }
    for (const f of failed) {
      log.error({ order_id: f.ended, err: f.error }, "lifecycle sweep order failed");
    }
  } catch (err) {
    log.error({ err }, "lifecycle sweep error");
  }
}

export function startAutoStopJob() {
  runAutoStop().catch((err) => log.error({ err }, "initial run error"));

  setInterval(() => {
    runAutoStop().catch((err) => log.error({ err }, "interval run error"));
  }, INTERVAL_MS);

  log.info({ interval_ms: INTERVAL_MS }, "job scheduled");
}
