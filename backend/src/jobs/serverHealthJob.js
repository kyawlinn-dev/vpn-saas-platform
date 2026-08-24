import { checkAllOutlineServerHealth } from "../services/healthMonitoringService.js";
import { logger } from "../lib/logger.js";

const DEFAULT_INTERVAL_MS = 10 * 60 * 1000;
const log = logger.child({ job: "serverHealth" });

function getIntervalMs() {
  const value = Number(process.env.SERVER_HEALTH_CHECK_INTERVAL_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_INTERVAL_MS;
}

async function runServerHealthCheck() {
  log.info("running");
  try {
    await checkAllOutlineServerHealth();
  } catch (err) {
    log.error({ err }, "health check failed");
  }
}

export function startServerHealthJob() {
  const intervalMs = getIntervalMs();

  // Run once at boot (small delay so the DB pool and health tables are ready).
  setTimeout(() => {
    void runServerHealthCheck();
  }, 5 * 1000);

  setInterval(() => {
    void runServerHealthCheck();
  }, intervalMs);

  log.info({ interval_ms: intervalMs }, "job scheduled");
}
