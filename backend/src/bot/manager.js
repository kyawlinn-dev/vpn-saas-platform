import crypto from "node:crypto";
import { Telegraf } from "telegraf";
import { supabase } from "../lib/supabase.js";
import { decrypt } from "../lib/tokenEncryption.js";
import { setupHandlers } from "./handlers.js";
import { buildWebAppUrl } from "./webAppUrl.js";

// A fresh webhook secret is generated per bot on every server boot, so startup
// registers webhooks for all configured bots. Persisting secrets can be added
// later if bot count grows large enough to matter.
const activeBots = new Map(); // resellerId -> { bot, secretToken, tokenEncrypted }

function getWebhookUrl(resellerId) {
  const base = process.env.WEBHOOK_BASE_URL?.trim().replace(/\/$/, "");
  if (!base) throw new Error("WEBHOOK_BASE_URL is not set in environment");
  return `${base}/api/bot-webhook/${resellerId}`;
}

function withTimeout(promise, ms, label) {
  const timer = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
  );
  return Promise.race([promise, timer]);
}

function createWebhookSecret() {
  return crypto.randomBytes(32).toString("hex");
}

function hasValidWebhookSecret(expectedSecret, incomingSecret) {
  if (!expectedSecret || !incomingSecret) return false;

  const expected = Buffer.from(String(expectedSecret));
  const incoming = Buffer.from(String(incomingSecret));
  if (expected.length !== incoming.length) return false;

  return crypto.timingSafeEqual(expected, incoming);
}

async function registerWebhook(plainToken, resellerId, secretToken) {
  const webhookUrl = getWebhookUrl(resellerId);
  const apiUrl = new URL(`https://api.telegram.org/bot${plainToken}/setWebhook`);
  apiUrl.searchParams.set("url", webhookUrl);
  apiUrl.searchParams.set("secret_token", secretToken);

  const res = await withTimeout(fetch(apiUrl.toString()), 10_000, "Webhook registration");
  const data = await res.json();
  if (!data.ok) throw new Error(`${data.error_code}: ${data.description}`);
}

async function persistBotStatus(resellerId, patch) {
  try {
    const { error } = await supabase
      .from("reseller_miniapps")
      .update({
        ...patch,
        updated_at: new Date().toISOString(),
      })
      .eq("reseller_id", resellerId);

    if (error) {
      console.warn(`[bot:${resellerId}] status update warning:`, error.message);
    }
  } catch (err) {
    console.warn(`[bot:${resellerId}] status update warning:`, err.message);
  }
}

function safeWebAppUrlMeta(url) {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.host,
      path: parsed.pathname || "/",
      has_slug: parsed.searchParams.has("slug"),
      slug: parsed.searchParams.get("slug") || "",
      has_version: parsed.searchParams.has("v"),
      version: parsed.searchParams.get("v") || "",
    };
  } catch {
    return {
      host: "",
      path: "",
      has_slug: false,
      slug: "",
    };
  }
}

async function startBotForReseller(row) {
  const { reseller_id, bot_token_encrypted, brand_name, miniapp_slug, support_username, trial_enabled } = row;
  const miniappBaseUrl = String(process.env.TELEGRAM_MINIAPP_URL || "").replace(/\/$/, "");

  const plainToken = decrypt(bot_token_encrypted);
  const bot = new Telegraf(plainToken);
  const secretToken = createWebhookSecret();
  // 30s ceiling per attempt + up to 3 attempts with 2s backoff — Telegram
  // is occasionally slow or unreachable over roaming/hotel networks, and a
  // single hard failure here kills the entire bot registration for minutes
  // (Telegram's rate-limit backoff kicks in). Retry until we get an answer
  // or genuinely give up.
  let botInfo = null;
  let lastGetMeErr = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      botInfo = await withTimeout(bot.telegram.getMe(), 30_000, "Bot identity lookup");
      break;
    } catch (err) {
      lastGetMeErr = err;
      if (attempt < 3) {
        console.warn(`[bot:${reseller_id}] getMe attempt ${attempt}/3 failed: ${err.message} — retrying in 2s`);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }
  if (!botInfo) throw lastGetMeErr;

  setupHandlers(bot, {
    resellerId: reseller_id,
    brandName: brand_name || "",
    miniappSlug: miniapp_slug || "",
    miniappBaseUrl,
    supportUsername: support_username || "",
    trialEnabled: trial_enabled ?? false,
  });

  bot.catch((err) => {
    console.error(`[bot:${reseller_id}] handler error:`, err.message);
  });

  // Throws on bad token or timeout — callers handle the error
  await registerWebhook(plainToken, reseller_id, secretToken);

  // Menu button + commands are non-fatal — a failure here doesn't prevent the bot going live.
  // MENU_BUTTON_TEXT is deliberately hardcoded to "Open VPN" (English) across
  // every reseller bot: (1) it matches what operators set in @BotFather so we
  // don't fight that setting on every restart, (2) it stays consistent per
  // reseller regardless of brand_name, and (3) it avoids the cache/fallback
  // issues Telegram clients hit when the text drifts.
  try {
    const label = brand_name || "App";
    const MENU_BUTTON_TEXT = "Open VPN";
    const webAppUrl = buildWebAppUrl(miniappBaseUrl, miniapp_slug || "");
    if (webAppUrl) {
      console.info(`[bot:${reseller_id}] menu web_app payload`, {
        text: MENU_BUTTON_TEXT,
        has_web_app: true,
        web_app_url: safeWebAppUrlMeta(webAppUrl),
      });
      await bot.telegram.setChatMenuButton({
        menu_button: { type: "web_app", text: MENU_BUTTON_TEXT, web_app: { url: webAppUrl } },
      });
    }
    await bot.telegram.setMyCommands([
      { command: "start", description: `Start ${label}` },
      { command: "app", description: `Open ${label}` },
    ]);
  } catch (err) {
    console.warn(`[bot:${reseller_id}] menu/commands setup warning (non-fatal):`, err.message);
  }

  activeBots.set(reseller_id, {
    bot,
    secretToken,
    tokenEncrypted: bot_token_encrypted,
    botInfo,
    webhookRegisteredAt: new Date().toISOString(),
  });

  await persistBotStatus(reseller_id, {
    bot_connected: true,
    bot_username: botInfo?.username || null,
    bot_id: botInfo?.id || null,
  });

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
  await persistBotStatus(resellerId, { bot_connected: false });
  console.log(`[bot:${resellerId}] stopped`);
}

// Called once after app.listen() — Refinement 2: per-bot try/catch so one
// bad token cannot prevent other bots from registering.
export async function start() {
  const { data, error } = await supabase
    .from("reseller_miniapps")
    .select("reseller_id, bot_token_encrypted, brand_name, miniapp_slug, support_username, trial_enabled")
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
      await persistBotStatus(row.reseller_id, { bot_connected: false });
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
    .select("reseller_id, bot_token_encrypted, brand_name, miniapp_slug, support_username, trial_enabled")
    .eq("reseller_id", resellerId)
    .eq("is_enabled", true)
    .not("bot_token_encrypted", "is", null)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch bot config: ${error.message}`);
  if (!data) {
    await persistBotStatus(resellerId, { bot_connected: false });
    return;
  }

  try {
    await startBotForReseller(data); // throws on bad token or timeout
  } catch (err) {
    await persistBotStatus(resellerId, { bot_connected: false });
    throw err;
  }
}

/**
 * Return the raw Telegraf bot instance for a reseller so services outside
 * the bot module (e.g. notificationService) can send outbound messages
 * without going through the update dispatcher.
 * Returns undefined if the reseller's bot is not currently online.
 */
export function getActiveBot(resellerId) {
  return activeBots.get(resellerId)?.bot;
}

/**
 * Send a Telegram DM via a specific reseller's bot.
 * Returns { ok: true } on success or { ok: false, code, message } on any
 * failure — callers should treat all failures as non-retryable (dropped),
 * per the notifications design ("missed > duplicate").
 *
 * Common error codes worth knowing:
 *   - "bot_not_running": no active bot for this reseller (dead config or 429)
 *   - Telegram error codes 403 (user blocked bot), 400 (chat not found), etc.
 */
export async function sendMessageAsReseller(resellerId, chatId, text, options = {}) {
  const entry = activeBots.get(resellerId);
  if (!entry) return { ok: false, code: "bot_not_running", message: "reseller bot is not online" };
  try {
    await entry.bot.telegram.sendMessage(chatId, text, options);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      code: err?.code || err?.response?.error_code || "send_failed",
      message: err?.message || err?.description || String(err),
    };
  }
}

export function getRuntimeStatus(resellerId) {
  const entry = activeBots.get(resellerId);
  return {
    running: Boolean(entry),
    webhook_registered: Boolean(entry?.webhookRegisteredAt),
    webhook_registered_at: entry?.webhookRegisteredAt || null,
    bot_username: entry?.botInfo?.username || null,
    bot_id: entry?.botInfo?.id || null,
  };
}

// Called from webhookRouter — never throws.
export async function processUpdate(resellerId, incomingSecret, update) {
  const entry = activeBots.get(resellerId);
  if (!entry) return { found: false };

  if (!hasValidWebhookSecret(entry.secretToken, incomingSecret)) {
    return { found: true, authorized: false };
  }

  try {
    await entry.bot.handleUpdate(update);
  } catch (err) {
    console.error(`[bot:${resellerId}] handleUpdate error:`, err.message);
  }
  return { found: true, authorized: true };
}
