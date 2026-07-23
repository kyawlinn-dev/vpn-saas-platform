import express from "express";
import * as botManager from "./manager.js";

const router = express.Router();

// POST /api/bot-webhook/:resellerId
// Public endpoint. Telegram authenticates by sending the secret token that was
// registered with setWebhook for this reseller bot.
router.post("/:resellerId", async (req, res) => {
  const { resellerId } = req.params;
  const incomingSecret = req.get("X-Telegram-Bot-Api-Secret-Token") || "";

  const result = await botManager.processUpdate(
    resellerId,
    incomingSecret,
    req.body
  );

  if (!result.found) return res.sendStatus(404);
  if (!result.authorized) return res.sendStatus(403);
  return res.sendStatus(200);
});

export default router;
