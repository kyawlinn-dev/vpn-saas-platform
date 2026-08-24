// Periodic cleanup of the app_events ledger.
//
// Runs once at boot and then every 24 hours. Deletes rows older than
// APP_EVENTS_RETENTION_DAYS (default 90). The RPC enforces a minimum of 7
// days server-side, so a misconfigured env can never accidentally wipe recent
// events.

import { supabase } from "../lib/supabase.js";
import { logger } from "../lib/logger.js";

const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RETENTION_DAYS = 90;
const log = logger.child({ job: "cleanupAppEvents" });

function getRetentionDays() {
  const value = Number(process.env.APP_EVENTS_RETENTION_DAYS);
  return Number.isFinite(value) && value >= 7 ? value : DEFAULT_RETENTION_DAYS;
}

async function runCleanup() {
  const days = getRetentionDays();
  log.info({ retention_days: days }, "running");
  try {
    const { data, error } = await supabase.rpc("cleanup_old_app_events", { p_days: days });
    if (error) throw error;
    log.info({ deleted: data ?? 0 }, "cleanup complete");
  } catch (err) {
    log.error({ err }, "cleanup failed");
  }
}

export function startCleanupAppEventsJob() {
  // Delay initial run a bit so it doesn't race with other boot work.
  setTimeout(() => {
    void runCleanup();
  }, 15 * 1000);

  setInterval(() => {
    void runCleanup();
  }, DEFAULT_INTERVAL_MS);

  log.info({ interval_ms: DEFAULT_INTERVAL_MS }, "job scheduled");
}
