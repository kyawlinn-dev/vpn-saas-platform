import express from "express";
import * as botManager from "./manager.js";

const router = express.Router();

// POST /api/bot-webhook/:resellerId
// Public endpoint — Telegram cannot authenticate as a reseller.
// Sole security gate: X-Telegram-Bot-Api-Secret-Token header, verified with
// timingSafeEqual in botManager.processUpdate before any update is processed.
router.post("/:resellerId", async (req, res) => {
  const { resellerId } = req.params;
  const result = await botManager.processUpdate(resellerId, req.body);
  if (!result.found) return res.sendStatus(404);
  return res.sendStatus(200);
});

export default router;
