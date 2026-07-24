import express from "express";
import { supabase } from "../../lib/supabase.js";
import { buildBotStatus, applyWorkspacePostUpdateEffects } from "../../services/workspaceSettingsService.js";

const router = express.Router();

// GET /api/reseller/workspace
//
// Telegram bot, mini app slug, brand logo/color, and trial settings are
// admin-managed now (see adminResellersRouter.js's /:id/workspace routes) —
// this only exposes bot_connected/bot_status as a read-only indicator so a
// reseller can tell whether to ping the admin, not act on it directly.
router.get("/", async (req, res) => {
  const { data, error } = await supabase
    .from("reseller_miniapps")
    .select(
      "brand_name, support_username, payment_info, " +
        "bot_token_encrypted, bot_connected, bot_username, bot_id"
    )
    .eq("reseller_id", req.reseller.id)
    .maybeSingle();

  if (error) {
    console.error("workspace GET error:", error);
    return res.status(500).json({ error: "Failed to load workspace settings" });
  }
  if (!data) {
    return res.status(404).json({ error: "Workspace not configured" });
  }

  const botStatus = buildBotStatus(data, req.reseller.id);

  // bot_token_encrypted is read only to derive status; it is never decrypted or sent.
  return res.json({
    brand_name: data.brand_name ?? "",
    support_username: data.support_username ?? "",
    payment_info: Array.isArray(data.payment_info) ? data.payment_info : [],
    bot_connected: botStatus.connected,
    bot_status: botStatus,
  });
});

// PATCH /api/reseller/workspace
router.patch("/", async (req, res) => {
  const resellerId = req.reseller.id;
  const body = req.body;
  const updates = {};

  const stringFields = ["brand_name", "support_username"];
  for (const f of stringFields) {
    if (f in body) {
      if (typeof body[f] !== "string") {
        return res.status(400).json({ error: `${f} must be a string` });
      }
      updates[f] = body[f];
    }
  }

  if ("payment_info" in body) {
    const pi = body.payment_info;
    if (!Array.isArray(pi)) {
      return res.status(400).json({ error: "payment_info must be an array" });
    }
    for (const item of pi) {
      if (
        !item ||
        typeof item.method !== "string" ||
        typeof item.account_name !== "string" ||
        typeof item.account_number !== "string"
      ) {
        return res.status(400).json({
          error: "Each payment method requires method, account_name, and account_number as strings",
        });
      }
    }
    updates.payment_info = pi;
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "No valid fields to update" });
  }

  const { error } = await supabase
    .from("reseller_miniapps")
    .update(updates)
    .eq("reseller_id", resellerId); // only this reseller's row can be touched

  if (error) {
    console.error("workspace PATCH error:", error);
    return res.status(500).json({ error: "Failed to update workspace settings" });
  }

  const result = await applyWorkspacePostUpdateEffects({ resellerId, body, updates });
  return res.json(result);
});

export default router;
