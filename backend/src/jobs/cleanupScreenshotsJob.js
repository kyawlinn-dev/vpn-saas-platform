import { supabase } from "../lib/supabase.js";

const INTERVAL_MS = 24 * 60 * 60 * 1000; // daily
const RETENTION_DAYS = 30;

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
    console.error("[cleanupScreenshots] Query error:", error.message);
    return;
  }

  if (!orders?.length) {
    console.log("[cleanupScreenshots] Nothing to clean up.");
    return;
  }

  const paths = orders.map((o) => o.payment_screenshot_url);

  const { error: removeError } = await supabase.storage
    .from("payment-screenshots")
    .remove(paths);

  if (removeError) {
    console.error("[cleanupScreenshots] Storage remove error:", removeError.message);
    return;
  }

  // Null out the paths so this job is idempotent on the next run
  const ids = orders.map((o) => o.id);
  const { error: updateError } = await supabase
    .from("vpn_orders")
    .update({ payment_screenshot_url: null })
    .in("id", ids);

  if (updateError) {
    console.error("[cleanupScreenshots] DB nullify error:", updateError.message);
    return;
  }

  console.log(`[cleanupScreenshots] Deleted ${paths.length} screenshot(s).`);
}

async function runCleanupScreenshots() {
  console.log("[cleanupScreenshots] Running...");
  await cleanupOldScreenshots();
}

export function startCleanupScreenshotsJob() {
  runCleanupScreenshots().catch((err) =>
    console.error("[cleanupScreenshots] Initial run error:", err.message)
  );

  setInterval(() => {
    runCleanupScreenshots().catch((err) =>
      console.error("[cleanupScreenshots] Interval run error:", err.message)
    );
  }, INTERVAL_MS);

  console.log("[cleanupScreenshots] Job scheduled (every 24 hours).");
}
