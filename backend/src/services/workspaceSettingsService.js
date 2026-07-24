import { supabase } from "../lib/supabase.js";
import * as botManager from "../bot/manager.js";

// Shared between resellerWorkspaceRouter.js (brand_name, support_username,
// payment_info — reseller self-service) and adminResellersRouter.js's
// workspace endpoints (Telegram bot, mini app slug, brand logo/color, trial
// settings — admin-managed). Both routers touch the same reseller_miniapps
// row and need identical bot-restart/status behavior after a save.

export function buildBotStatus(row, resellerId) {
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

export async function loadWorkspaceForStatus(resellerId, fallbackEncrypted) {
  const { data, error } = await supabase
    .from("reseller_miniapps")
    .select("bot_token_encrypted, bot_connected, bot_username, bot_id")
    .eq("reseller_id", resellerId)
    .maybeSingle();

  if (error) {
    console.warn("workspace status read warning:", error.message);
  }

  return data || { bot_token_encrypted: fallbackEncrypted || null };
}

// Runs whatever bot-manager side effect a workspace save requires, and
// shapes the response body the caller should send:
//   - bot_token changed: restart + wait for webhook registration, report
//     whether it actually succeeded
//   - support_username changed (no bot_token): support_username is only
//     read at bot-start time, so best-effort restart to pick it up
//   - otherwise: no bot side effect needed
export async function applyWorkspacePostUpdateEffects({ resellerId, body, updates }) {
  if ("bot_token" in body) {
    try {
      await botManager.restartBot(resellerId);
      const statusRow = await loadWorkspaceForStatus(resellerId, updates.bot_token_encrypted);
      return {
        success: true,
        bot_registered: true,
        bot_status: buildBotStatus(statusRow, resellerId),
      };
    } catch (err) {
      console.error(`[bot:${resellerId}] post-save registration failed:`, err.message);
      const statusRow = await loadWorkspaceForStatus(resellerId, updates.bot_token_encrypted);
      return {
        success: true,
        bot_registered: false,
        bot_status: {
          ...buildBotStatus(statusRow, resellerId),
          token_saved: true,
          token_valid: false,
          webhook_registered: false,
          running: false,
          connected: false,
        },
        bot_error: err.message || "Webhook registration failed — check your bot token",
      };
    }
  }

  if ("support_username" in updates) {
    try {
      await botManager.restartBot(resellerId);
    } catch {
      // Non-fatal — workspace saved; best-effort restart
    }
    return { success: true };
  }

  return { success: true };
}
