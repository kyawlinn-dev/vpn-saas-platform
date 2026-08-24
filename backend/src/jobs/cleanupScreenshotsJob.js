import { supabase } from "../lib/supabase.js";
import { logger } from "../lib/logger.js";

const INTERVAL_MS = 24 * 60 * 60 * 1000; // daily
const RETENTION_DAYS = 30;
const log = logger.child({ job: "cleanupScreenshots" });

async function cleanupOldScreenshots() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
  const cutoffIso = cutoff.toISOString();

  const { data: orders, error } = await supabase
    .from("vpn_orders")
    .select("id, payment_screenshot_url")
    .in("review_status", ["confirmed", "rejected"])
    .not("payment_screenshot_url", "is", null)
    .lt("updated_at", cutoffIso);

  if (error) {
    log.error({ err: error }, "query error");
    return;
  }

  if (!orders?.length) {
    log.debug("nothing to clean up");
    return;
  }

  const paths = orders.map((o) => o.payment_screenshot_url);

  const { error: removeError } = await supabase.storage
    .from("payment-screenshots")
    .remove(paths);

  if (removeError) {
    log.error({ err: removeError }, "storage remove error");
    return;
  }

  // Null out the paths so this job is idempotent on the next run
  const ids = orders.map((o) => o.id);
  const { error: updateError } = await supabase
    .from("vpn_orders")
    .update({ payment_screenshot_url: null })
    .in("id", ids);

  if (updateError) {
    log.error({ err: updateError }, "db nullify error");
    return;
  }

  log.info({ deleted: paths.length }, "screenshots deleted");
}

async function runCleanupScreenshots() {
  log.info("running");
  await cleanupOldScreenshots();
}

export function startCleanupScreenshotsJob() {
  runCleanupScreenshots().catch((err) => log.error({ err }, "initial run error"));

  setInterval(() => {
    runCleanupScreenshots().catch((err) => log.error({ err }, "interval run error"));
  }, INTERVAL_MS);

  log.info({ interval_ms: INTERVAL_MS }, "job scheduled");
}
