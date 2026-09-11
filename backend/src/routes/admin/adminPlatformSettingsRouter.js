import express from "express";
import {
  getPlatformSettings,
  updatePlatformSettings,
} from "../../services/platformSettingsService.js";

const router = express.Router();

// GET /api/admin/platform-settings — current payout accounts + instruction.
router.get("/", async (_req, res) => {
  try {
    return res.json(await getPlatformSettings());
  } catch (err) {
    console.error("GET /api/admin/platform-settings crash:", err);
    return res.status(500).json({ error: "Failed to load platform settings" });
  }
});

// PUT /api/admin/platform-settings — update payout accounts / instruction.
router.put("/", async (req, res) => {
  try {
    const updated = await updatePlatformSettings({
      payment_accounts: req.body?.payment_accounts,
      settlement_instructions: req.body?.settlement_instructions,
    });
    return res.json(updated);
  } catch (err) {
    console.error("PUT /api/admin/platform-settings crash:", err);
    return res.status(500).json({ error: "Failed to update platform settings" });
  }
});

export default router;
