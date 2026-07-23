import express from "express";
import { supabase } from "../../lib/supabase.js";
import { encrypt } from "../../lib/tokenEncryption.js";
import * as botManager from "../../bot/manager.js";

const router = express.Router();

function buildBotStatus(row, resellerId) {
  const runtimeStatus = botManager.getRuntimeStatus(resellerId);
  const tokenSaved = Boolean(row?.bot_token_encrypted);
  const webhookRegistered = Boolean(row?.bot_connected && runtimeStatus.webhook_registered);

  return {
    token_saved: tokenSaved,
    token_valid: Boolean(row?.bot_username || row?.bot_id || runtimeStatus.bot_username || runtimeStatus.bot_id),
    webhook_registered: webhookRegistered,
    running: runtimeStatus.running,
    connected: Boolean(tokenSaved && webhookRegistered && runtimeStatus.running),
    bot_username: runtimeStatus.bot_username || row?.bot_username || null,
    bot_id: runtimeStatus.bot_id || row?.bot_id || null,
    webhook_registered_at: runtimeStatus.webhook_registered_at,
  };
}

// GET /api/reseller/workspace
router.get("/", async (req, res) => {
  const { data, error } = await supabase
    .from("reseller_miniapps")
    .select(
      "miniapp_slug, brand_name, brand_logo_url, support_username, " +
        "primary_color, trial_enabled, trial_data_limit_gb, trial_duration_days, " +
        "payment_info, bot_token_encrypted, bot_connected, bot_username, bot_id"
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
    miniapp_slug: data.miniapp_slug,
    brand_name: data.brand_name ?? "",
    brand_logo_url: data.brand_logo_url ?? "",
    support_username: data.support_username ?? "",
    primary_color: data.primary_color ?? "",
    trial_enabled: data.trial_enabled ?? false,
    trial_data_limit_gb: data.trial_data_limit_gb ?? null,
    trial_duration_days: data.trial_duration_days ?? null,
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
      if (!Number.isInteger(body[f]) || body[f] <= 0) {
        return res.status(400).json({ error: `${f} must be a positive integer` });
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

  async function loadWorkspaceForStatus() {
    const { data, error: readError } = await supabase
      .from("reseller_miniapps")
      .select("bot_token_encrypted, bot_connected, bot_username, bot_id")
      .eq("reseller_id", resellerId)
      .maybeSingle();

    if (readError) {
      console.warn("workspace PATCH status read warning:", readError.message);
    }

    return data || { bot_token_encrypted: updates.bot_token_encrypted || null };
  }

  // support_username is captured at bot-start time, not re-read per message — restart to pick it up.
  if ("support_username" in updates && !("bot_token" in body)) {
    try {
      await botManager.restartBot(resellerId);
    } catch {
      // Non-fatal — workspace saved; best-effort restart
    }
    return res.json({ success: true });
  }

  // If a bot token was saved, restart the bot and wait for webhook registration.
  // The reseller sees whether their token actually worked, not just that it was stored.
  if ("bot_token" in body) {
    try {
      await botManager.restartBot(resellerId);
      const statusRow = await loadWorkspaceForStatus();
      return res.json({
        success: true,
        bot_registered: true,
        bot_status: buildBotStatus(statusRow, resellerId),
      });
    } catch (err) {
      console.error(`[bot:${resellerId}] post-save registration failed:`, err.message);
      return res.json({
        success: true,
        bot_registered: false,
        bot_status: {
          ...buildBotStatus(await loadWorkspaceForStatus(), resellerId),
          token_saved: true,
          token_valid: false,
          webhook_registered: false,
          running: false,
          connected: false,
        },
        bot_error: err.message || "Webhook registration failed — check your bot token",
      });
    }
  }

  return res.json({ success: true });
});

export default router;
