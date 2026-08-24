// Scheduled customer-notification pass. Runs every 10 minutes inside the
// backend process, alongside autoStop / syncUsage / etc.
//
// The notification service handles all filtering (quiet hours, dedup, cap);
// this job just calls it on a timer.

import { logger } from "../lib/logger.js";
import { runNotificationPass } from "../services/notificationService.js";

const INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const log = logger.child({ job: "customerNotifications" });

async function run() {
  log.info("running");
  try {
    const result = await runNotificationPass();
    log.info({ result }, "pass complete");
  } catch (err) {
    log.error({ err }, "pass failed");
  }
}

export function startCustomerNotificationsJob() {
  // Small startup delay so the pass doesn't race with bot registration —
  // the notification service DMs via active bots, and bots take a moment
  // to come online after boot.
  setTimeout(() => void run(), 20 * 1000);

  setInterval(() => void run(), INTERVAL_MS);

  log.info({ interval_ms: INTERVAL_MS }, "job scheduled");
}
