import crypto from "node:crypto";
import { Telegraf } from "telegraf";
import { supabase } from "../lib/supabase.js";
import { decrypt } from "../lib/tokenEncryption.js";
import { buildWebAppUrl, setupHandlers } from "./handlers.js";

// Refinement 3: a fresh random secretToken is generated per bot on every server boot,
// which means setWebhook is called for all bots on every restart. This is a known
// future optimization — secrets could be persisted to skip re-registration when
// the token hasn't changed, if bot count grows large enough to matter.
const activeBots = new Map(); // resellerId → { bot, secretToken, tokenEncrypted }

function getWebhookUrl(resellerId) {
  const base = process.env.WEBHOOK_BASE_URL?.replace(/\/$/, "");
  if (!base) throw new Error("WEBHOOK_BASE_URL is not set in environment");
  return `${base}/api/bot-webhook/${resellerId}`;
}

function withTimeout(promise, ms, label) {
  const timer = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
  );
  return Promise.race([promise, timer]);
}

async function registerWebhook(bot, resellerId) {
  const secretToken = crypto.randomBytes(32).toString("hex");
  await withTimeout(
    bot.telegram.setWebhook(getWebhookUrl(resellerId), { secret_token: secretToken }),
    10_000,
    "Webhook registration"
  );
  return secretToken;
}

async function startBotForReseller(row) {
  const { reseller_id, bot_token_encrypted, brand_name, miniapp_slug, support_username } = row;
  const miniappBaseUrl = String(process.env.TELEGRAM_MINIAPP_URL || "").replace(/\/$/, "");

  const plainToken = decrypt(bot_token_encrypted);
  const bot = new Telegraf(plainToken);

  setupHandlers(bot, {
    resellerId: reseller_id,
    brandName: brand_name || "",
    miniappSlug: miniapp_slug || "",
    miniappBaseUrl,
    supportUsername: support_username || "",
  });

  bot.catch((err) => {
    console.error(`[bot:${reseller_id}] handler error:`, err.message);
  });

  // Throws on bad token or timeout — callers handle the error
  const secretToken = await registerWebhook(bot, reseller_id);

  // Menu button + commands are non-fatal — a failure here doesn't prevent the bot going live
  try {
    const label = brand_name || "App";
    const webAppUrl = buildWebAppUrl(miniappBaseUrl, miniapp_slug || "");
    if (webAppUrl) {
      await bot.telegram.setChatMenuButton({
        menu_button: { type: "web_app", text: `Open ${label}`, web_app: { url: webAppUrl } },
      });
    }
    await bot.telegram.setMyCommands([
      { command: "start", description: `Start ${label}` },
      { command: "app", description: `Open ${label}` },
    ]);
  } catch (err) {
    console.warn(`[bot:${reseller_id}] menu/commands setup warning (non-fatal):`, err.message);
  }

  activeBots.set(reseller_id, { bot, secretToken, tokenEncrypted: bot_token_encrypted });
  console.log(`[bot:${reseller_id}] online`);
}

async function stopBotForReseller(resellerId) {
  const entry = activeBots.get(resellerId);
  if (!entry) return;
  try {
    await entry.bot.telegram.deleteWebhook();
  } catch (err) {
    console.warn(`[bot:${resellerId}] deleteWebhook warning:`, err.message);
  }
  activeBots.delete(resellerId);
  console.log(`[bot:${resellerId}] stopped`);
}

// Called once after app.listen() — Refinement 2: per-bot try/catch so one
// bad token cannot prevent other bots from registering.
export async function start() {
  const { data, error } = await supabase
    .from("reseller_miniapps")
    .select("reseller_id, bot_token_encrypted, brand_name, miniapp_slug, support_username")
    .eq("is_enabled", true)
    .not("bot_token_encrypted", "is", null);

  if (error) {
    console.error("[botManager] failed to load bots at startup:", error.message);
    return;
  }

  for (const row of data) {
    try {
      await startBotForReseller(row);
    } catch (err) {
      console.error(`[bot:${row.reseller_id}] startup failed (skipped):`, err.message);
    }
  }

  console.log(`[botManager] startup complete — ${activeBots.size}/${data.length} bot(s) online`);
}

// Called from resellerWorkspaceRouter after a token save.
// Throws on registration failure so the caller can report the result to the reseller.
export async function restartBot(resellerId) {
  await stopBotForReseller(resellerId);

  const { data, error } = await supabase
    .from("reseller_miniapps")
    .select("reseller_id, bot_token_encrypted, brand_name, miniapp_slug, support_username")
    .eq("reseller_id", resellerId)
    .eq("is_enabled", true)
    .not("bot_token_encrypted", "is", null)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch bot config: ${error.message}`);
  if (!data) return; // token removed or reseller disabled — already stopped above

  await startBotForReseller(data); // throws on bad token or timeout
}

// Called from webhookRouter — never throws.
export async function processUpdate(resellerId, incomingSecret, update) {
  const entry = activeBots.get(resellerId);
  if (!entry) return { found: false };

  const expected = entry.secretToken;
  let authorized = false;
  if (incomingSecret.length === expected.length) {
    authorized = crypto.timingSafeEqual(
      Buffer.from(incomingSecret, "utf8"),
      Buffer.from(expected, "utf8")
    );
  }
  if (!authorized) return { found: true, authorized: false };

  try {
    await entry.bot.handleUpdate(update);
  } catch (err) {
    console.error(`[bot:${resellerId}] handleUpdate error:`, err.message);
  }
  return { found: true, authorized: true };
}
