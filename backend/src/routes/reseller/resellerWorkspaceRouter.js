import express from "express";
import { supabase } from "../../lib/supabase.js";
import { encrypt } from "../../lib/tokenEncryption.js";

const router = express.Router();

// GET /api/reseller/workspace
router.get("/", async (req, res) => {
  const { data, error } = await supabase
    .from("reseller_miniapps")
    .select(
      "miniapp_slug, brand_name, brand_logo_url, support_username, " +
        "primary_color, trial_enabled, trial_data_limit_gb, trial_duration_days, " +
        "payment_info, bot_token_encrypted"
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

  // bot_token_encrypted is read only to derive the boolean — never decrypted, never sent.
  return res.json({
    miniapp_slug: data.miniapp_slug,
    brand_name: data.brand_name ?? "",
    brand_logo_url: data.brand_logo_url ?? "",
    support_username: data.support_username ?? "",
    primary_color: data.primary_color ?? "",
    trial_enabled: data.trial_enabled ?? false,
    trial_data_limit_gb: data.trial_data_limit_gb ?? null,
    trial_duration_days: data.trial_duration_days ?? null,
    payment_info: Array.isArray(data.payment_info) ? data.payment_info : [],
    bot_connected: Boolean(data.bot_token_encrypted),
  });
});

// PATCH /api/reseller/workspace
router.patch("/", async (req, res) => {
  const resellerId = req.reseller.id;
  const body = req.body;
  const updates = {};

  const stringFields = ["brand_name", "brand_logo_url", "support_username", "primary_color"];
  for (const f of stringFields) {
    if (f in body) {
      if (typeof body[f] !== "string") {
        return res.status(400).json({ error: `${f} must be a string` });
      }
      updates[f] = body[f];
    }
  }

  if ("trial_enabled" in body) {
    if (typeof body.trial_enabled !== "boolean") {
      return res.status(400).json({ error: "trial_enabled must be a boolean" });
    }
    updates.trial_enabled = body.trial_enabled;
  }

  for (const f of ["trial_data_limit_gb", "trial_duration_days"]) {
    if (f in body) {
      if (body[f] !== null && typeof body[f] !== "number") {
        return res.status(400).json({ error: `${f} must be a number or null` });
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

  if ("bot_token" in body) {
    if (typeof body.bot_token !== "string" || !body.bot_token.trim()) {
      return res.status(400).json({ error: "bot_token must be a non-empty string" });
    }
    updates.bot_token_encrypted = encrypt(body.bot_token.trim());
    // plaintext token is never logged or persisted beyond this scope
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

  return res.json({ success: true });
});

export default router;
