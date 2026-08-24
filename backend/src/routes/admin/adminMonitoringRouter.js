import express from "express";
import {
  getMonitoringEvents,
  getMonitoringJourney,
  getMonitoringSnapshot,
  getScreenshotBacklog,
} from "../../services/monitoringService.js";
import { getBackendHealthSnapshot } from "../../services/healthMonitoringService.js";
import { runNotificationPass } from "../../services/notificationService.js";

const router = express.Router();

async function handleSummary(req, res) {
  try {
    const snapshot = await getMonitoringSnapshot({
      days: req.query.days,
      resellerId: req.query.reseller_id || null,
    });

    return res.json(snapshot);
  } catch (err) {
    console.error("GET /api/admin/monitoring error:", err);
    return res.status(500).json({ error: "Failed to load monitoring data" });
  }
}

router.get("/", handleSummary);
router.get("/summary", handleSummary);

router.get("/health", async (_req, res) => {
  try {
    const result = await getBackendHealthSnapshot();
    return res.json(result);
  } catch (err) {
    console.error("GET /api/admin/monitoring/health error:", err);
    return res.status(500).json({ error: "Failed to load backend health" });
  }
});

router.get("/events", async (req, res) => {
  try {
    const result = await getMonitoringEvents({
      days: req.query.days,
      resellerId: req.query.reseller_id || null,
      eventName: req.query.event_name || null,
      status: req.query.status || null,
      search: req.query.search || "",
      page: req.query.page,
      limit: req.query.limit,
    });

    return res.json(result);
  } catch (err) {
    console.error("GET /api/admin/monitoring/events error:", err);
    return res.status(500).json({ error: "Failed to load monitoring events" });
  }
});

router.get("/journey", async (req, res) => {
  try {
    const result = await getMonitoringJourney({
      days: req.query.days,
      resellerId: req.query.reseller_id || null,
      sessionId: req.query.session_id || null,
      customerId: req.query.customer_id || null,
      telegramUserId: req.query.telegram_user_id || null,
    });

    return res.json(result);
  } catch (err) {
    if (err.status === 400) {
      return res.status(400).json({ error: err.message });
    }
    console.error("GET /api/admin/monitoring/journey error:", err);
    return res.status(500).json({ error: "Failed to load monitoring journey" });
  }
});

router.get("/screenshot-backlog", async (req, res) => {
  try {
    const minStale = Number(req.query.min_stale_minutes);
    const result = await getScreenshotBacklog({
      resellerId: req.query.reseller_id || null,
      minStaleMinutes: Number.isFinite(minStale) && minStale > 0 ? minStale : 15,
    });
    return res.json(result);
  } catch (err) {
    console.error("GET /api/admin/monitoring/screenshot-backlog error:", err);
    return res.status(500).json({ error: "Failed to load screenshot backlog" });
  }
});

// Manual trigger for the customer-notifications pass. Bypasses the 10-min
// scheduler tick and the quiet-hours guard so admins can test the pipeline
// on demand. Still respects dedup, daily cap, and per-reseller kill switch
// — this is a "fire now" button, not a "spam everyone" button.
router.post("/notifications/run-pass", async (_req, res) => {
  try {
    const result = await runNotificationPass({ force: true });
    return res.json(result);
  } catch (err) {
    console.error("POST /api/admin/monitoring/notifications/run-pass error:", err);
    return res.status(500).json({ error: "Failed to run notification pass" });
  }
});

export default router;
