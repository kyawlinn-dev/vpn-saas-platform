import { Markup } from "telegraf";
import {
  BTN,
  startWelcome,
  START_CTA_TEXT,
  START_BTN_BUY,
  START_BTN_ADMIN,
  APP_BTN_OPEN,
  appOpenText,
  PLACEHOLDER,
  keyFoundHeader,
  keyServerLine,
  KEY_BTN_ADD,
  KEY_NO_ACTIVE,
  KEY_ERROR,
  BALANCE_TEXT,
  BALANCE_BTN_OPEN,
  SERVER_TEXT,
  SERVER_BTN_OPEN,
  DL_CB,
  DOWNLOAD_PICKER_TEXT,
  DOWNLOAD_BTNS,
  DOWNLOAD_PLATFORMS,
  howToUse,
} from "./strings.js";
import {
  resolveCustomerByTelegram,
  getBestActiveOrder,
  resolveActiveKey,
  buildDynamicAccessUrl,
  ensureCustomerAndLink,
  ensureCustomerSsconfToken,
} from "./botCustomerService.js";
import { createTrialOrder, provisionTrialKey } from "../services/trialService.js";

/**
 * Builds the WebApp URL for a reseller's miniapp.
 *
 * The slug is passed as ?slug=<miniappSlug> so that future miniapp versions can
 * read it via: new URLSearchParams(window.location.search).get('slug')
 * or Telegram.WebApp.initDataUnsafe.start_param when opened via a t.me link.
 *
 * @param {string} miniappBaseUrl  Base URL of the deployed miniapp.
 * @param {string} miniappSlug     Reseller's miniapp slug.
 * @param {string} [path=""]       Optional sub-path (e.g. "/packages", "/servers").
 */
export function buildWebAppUrl(miniappBaseUrl, miniappSlug, path = "") {
  if (!miniappBaseUrl) return "";
  const base = miniappBaseUrl.replace(/\/$/, "");
  const qs = `?slug=${encodeURIComponent(miniappSlug || "")}`;
  return path ? `${base}${path}${qs}` : `${base}${qs}`;
}

function miniAppButton(text, url) {
  return Markup.button.webApp(text, url);
}

function safeButtonUrlMeta(url) {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.host,
      path: parsed.pathname || "/",
      has_slug: parsed.searchParams.has("slug"),
      slug: parsed.searchParams.get("slug") || "",
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

function logInlineButtonPayload(resellerId, source, markup) {
  const rows = markup?.reply_markup?.inline_keyboard || [];
  const buttons = rows.flat().map((button) => ({
    text: button.text,
    has_web_app: Boolean(button.web_app),
    web_app_url: button.web_app?.url ? safeButtonUrlMeta(button.web_app.url) : null,
    has_url: Boolean(button.url),
    url: button.url ? safeButtonUrlMeta(button.url) : null,
  }));

  console.info(`[bot:${resellerId}] miniapp inline payload`, {
    source,
    buttons,
  });
}

/**
 * Registers all bot handlers for a single reseller bot.
 *
 * @param {import("telegraf").Telegraf} bot
 * @param {object} ctx
 * @param {string} ctx.resellerId
 * @param {string} ctx.brandName        reseller_miniapps.brand_name
 * @param {string} ctx.miniappSlug      reseller_miniapps.miniapp_slug
 * @param {string} ctx.miniappBaseUrl   TELEGRAM_MINIAPP_URL env var
 * @param {string} ctx.supportUsername  reseller_miniapps.support_username (no @)
 */
export function setupHandlers(bot, {
  resellerId,
  brandName,
  miniappSlug,
  miniappBaseUrl,
  supportUsername,
  trialEnabled,
}) {
  const homeUrl = buildWebAppUrl(miniappBaseUrl, miniappSlug);

  // ── Persistent reply keyboard ────────────────────────────────────────────────
  // Sent on /start and persists in the user's chat. Layout: 2-2-1.

  function mainKeyboard() {
    return Markup.keyboard([
      [BTN.KEY,    BTN.BALANCE  ],
      [BTN.SERVER, BTN.DOWNLOAD ],
      [BTN.HOWTO                ],
    ]).resize();
  }

  // ── /start ───────────────────────────────────────────────────────────────────
  // FIX A: upsert customer + telegram_links, then call the shared trialService
  // to create a trial order and immediately provision a key on the default server.
  // Idempotent — safe to call on every /start (existing users are no-ops).
  //
  // Two messages: (1) branded Burmese welcome + persistent reply keyboard,
  // (2) inline CTA buttons — Telegram only allows one reply_markup type per message.

  bot.start(async (ctx) => {
    try {
      const telegramUserId = ctx.from?.id;
      if (!telegramUserId) return;

      const telegramUsername = ctx.from?.username || null;
      const fullName =
        [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ") ||
        `Telegram User ${telegramUserId}`;

      // 1. Upsert vpn_customers + telegram_links (no-op for returning users)
      const { customerId, telegramLinkId, trial_used_at } =
        await ensureCustomerAndLink(telegramUserId, telegramUsername, fullName, resellerId);

      // 2. Ensure ssconf_token exists (needed by KEY handler's URL builder)
      await ensureCustomerSsconfToken(customerId);

      // 3. Auto-create trial if eligible
      let trialJustCreated = false;
      if (trialEnabled && !trial_used_at) {
        const existingOrder = await getBestActiveOrder(customerId, resellerId);
        if (!existingOrder) {
          const { order, plan, created } = await createTrialOrder({
            customerId,
            resellerId,
            telegramLinkId,
            telegramUsername,
          });

          if (created && order) {
            trialJustCreated = true;
            // Provision key on default server (non-fatal — trial order stands on failure)
            const label = [brandName, telegramUsername].filter(Boolean).join("-");
            try {
              await provisionTrialKey({
                customerId,
                resellerId,
                orderId: order.id,
                plan,
                customerFullName: fullName,
                keyName: label,
              });
            } catch (provErr) {
              console.warn(`[bot:${resellerId}] /start trial key provision failed:`, provErr.message);
            }
          }
        }
      }

      // 4. Welcome message; append trial-ready line if we just created one
      const welcomeText = trialJustCreated
        ? startWelcome(brandName) +
          "\n\n✅ Trial Package ကို အလိုအလျောက် ဖန်တီးပြီးပါပြီ! 🔑 Outline Key ရယူရန် ကို နှိပ်ပါ"
        : startWelcome(brandName);

      await ctx.replyWithHTML(welcomeText, mainKeyboard());

      // 5. CTA inline buttons (second message)
      const ctaButtons = [];
      if (homeUrl) {
        ctaButtons.push([miniAppButton(START_BTN_BUY, homeUrl)]);
      }
      if (supportUsername) {
        ctaButtons.push([
          Markup.button.url(START_BTN_ADMIN, `https://t.me/${supportUsername}`),
        ]);
      }
      if (ctaButtons.length > 0) {
        const markup = Markup.inlineKeyboard(ctaButtons);
        logInlineButtonPayload(resellerId, "/start", markup);
        await ctx.reply(START_CTA_TEXT, markup);
      }
    } catch (err) {
      console.error(`[bot:${resellerId}] /start error:`, err.message);
    }
  });

  bot.command("app", async (ctx) => {
    try {
      if (!homeUrl) {
        await ctx.reply("Mini App is not configured yet. Please contact support.");
        return;
      }

      const markup = Markup.inlineKeyboard([[miniAppButton(APP_BTN_OPEN, homeUrl)]]);
      logInlineButtonPayload(resellerId, "/app", markup);
      await ctx.replyWithHTML(appOpenText(brandName), markup);
    } catch (err) {
      console.error(`[bot:${resellerId}] /app error:`, err.message);
    }
  });

  // ── Reply keyboard button handlers ───────────────────────────────────────────
  // Stage 1: all return placeholders. Replace with real logic in later stages.

  bot.hears(BTN.KEY, async (ctx) => {
    const telegramUserId = ctx.from?.id;
    if (!telegramUserId) return;

    try {
      // 1. Telegram user → customer (reseller-scoped)
      const customer = await resolveCustomerByTelegram(telegramUserId, resellerId);
      if (!customer?.ssconfToken) {
        await ctx.reply(KEY_NO_ACTIVE);
        return;
      }

      // 2. Best active order for this customer + reseller
      const order = await getBestActiveOrder(customer.customerId, resellerId);
      if (!order) {
        await ctx.reply(KEY_NO_ACTIVE);
        return;
      }

      // 3. Current active key + server
      const keyRow = await resolveActiveKey(customer.customerId, resellerId, order.id);
      if (!keyRow) {
        await ctx.reply(KEY_NO_ACTIVE);
        return;
      }

      // 4. Build ssconf:// dynamic access URL (follows customer across server switches)
      const backendBase = String(process.env.WEBHOOK_BASE_URL || "").replace(/\/$/, "");
      const telegramUsername = ctx.from?.username || null;
      const label = [brandName, telegramUsername].filter(Boolean).join("-");
      const dynamicUrl = buildDynamicAccessUrl(backendBase, customer.ssconfToken, label);

      // 5. Bridge URL — worker /open-key renders the "Add to Outline" interstitial
      const workerBase = String(process.env.PUBLIC_WORKER_BASE_URL || "").replace(/\/$/, "");
      const bridgeUrl = `${workerBase}/open-key?url=${encodeURIComponent(dynamicUrl)}`;

      // 6. Server display info
      const flag       = keyRow.vpn_servers?.flag_emoji || "🌐";
      const serverName = keyRow.vpn_servers?.name || "Server";

      // 7. Reply: header + copyable key in code block + server line + inline button
      const text =
        `${keyFoundHeader(customer.fullName || "Customer")}\n\n` +
        `<code>${dynamicUrl}</code>\n\n` +
        `${keyServerLine(flag, serverName)}`;

      await ctx.replyWithHTML(
        text,
        Markup.inlineKeyboard([[Markup.button.url(KEY_BTN_ADD, bridgeUrl)]])
      );
    } catch (err) {
      console.error(`[bot:${resellerId}] KEY handler error:`, err.message);
      await ctx.reply(KEY_ERROR).catch(() => {});
    }
  });

  bot.hears(BTN.BALANCE, async (ctx) => {
    try {
      const markup = homeUrl
        ? Markup.inlineKeyboard([[miniAppButton(BALANCE_BTN_OPEN, homeUrl)]])
        : {};
      logInlineButtonPayload(resellerId, "balance", markup);
      await ctx.replyWithHTML(
        BALANCE_TEXT,
        markup
      );
    } catch (err) {
      console.error(`[bot:${resellerId}] BALANCE handler error:`, err.message);
    }
  });

  // v1: opens miniapp at home tab — user taps Servers tab to switch.
  // Deep-linking to the servers tab requires the miniapp to read start_param (future stage).
  bot.hears(BTN.SERVER, async (ctx) => {
    try {
      const markup = homeUrl
        ? Markup.inlineKeyboard([[miniAppButton(SERVER_BTN_OPEN, homeUrl)]])
        : {};
      logInlineButtonPayload(resellerId, "server", markup);
      await ctx.replyWithHTML(
        SERVER_TEXT,
        markup
      );
    } catch (err) {
      console.error(`[bot:${resellerId}] SERVER handler error:`, err.message);
    }
  });

  // ── Download Outline — device picker ────────────────────────────────────────
  // The picker and all platform replies share the same message (edited in place).

  function downloadPickerKeyboard() {
    return Markup.inlineKeyboard([
      [Markup.button.callback(DOWNLOAD_BTNS.IOS,     DL_CB.IOS    ),
       Markup.button.callback(DOWNLOAD_BTNS.ANDROID, DL_CB.ANDROID)],
      [Markup.button.callback(DOWNLOAD_BTNS.MACOS,   DL_CB.MACOS  ),
       Markup.button.callback(DOWNLOAD_BTNS.WINDOWS, DL_CB.WINDOWS)],
    ]);
  }

  function platformKeyboard(platform) {
    return Markup.inlineKeyboard([
      [Markup.button.url(platform.urlLabel, platform.url)],
      [Markup.button.callback(DOWNLOAD_BTNS.BACK, DL_CB.BACK)],
    ]);
  }

  bot.hears(BTN.DOWNLOAD, async (ctx) => {
    try {
      await ctx.replyWithHTML(DOWNLOAD_PICKER_TEXT, downloadPickerKeyboard());
    } catch (err) {
      console.error(`[bot:${resellerId}] DOWNLOAD handler error:`, err.message);
    }
  });

  // Platform callbacks — edit the picker message in place, add Back button
  for (const [key, platform] of Object.entries(DOWNLOAD_PLATFORMS)) {
    bot.action(DL_CB[key.toUpperCase()], async (ctx) => {
      try {
        await ctx.answerCbQuery();
        await ctx.editMessageText(platform.text, {
          parse_mode: "HTML",
          reply_markup: platformKeyboard(platform).reply_markup,
        });
      } catch (err) {
        console.error(`[bot:${resellerId}] DOWNLOAD ${key} callback error:`, err.message);
      }
    });
  }

  // Back — edit message back to the device picker
  bot.action(DL_CB.BACK, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      await ctx.editMessageText(DOWNLOAD_PICKER_TEXT, {
        parse_mode: "HTML",
        reply_markup: downloadPickerKeyboard().reply_markup,
      });
    } catch (err) {
      console.error(`[bot:${resellerId}] DOWNLOAD back callback error:`, err.message);
    }
  });

  // ── How to Use ───────────────────────────────────────────────────────────────

  bot.hears(BTN.HOWTO, async (ctx) => {
    try {
      await ctx.replyWithHTML(howToUse(supportUsername));
    } catch (err) {
      console.error(`[bot:${resellerId}] HOWTO handler error:`, err.message);
    }
  });
}
