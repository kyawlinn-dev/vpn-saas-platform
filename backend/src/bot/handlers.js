import { Markup } from "telegraf";
import {
  BTN,
  startWelcome,
  START_CTA_TEXT,
  START_BTN_BUY,
  START_BTN_ADMIN,
  PLACEHOLDER,
} from "./strings.js";

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
}) {
  const packagesUrl = buildWebAppUrl(miniappBaseUrl, miniappSlug, "/packages");

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
  // Two messages: (1) branded Burmese welcome + persistent reply keyboard,
  // (2) inline CTA buttons (Buy/Extend, Admin) — Telegram only allows one
  // reply_markup type per message, so the two keyboards must be separate messages.

  bot.start(async (ctx) => {
    try {
      await ctx.replyWithHTML(startWelcome(brandName), mainKeyboard());

      const ctaButtons = [];
      if (packagesUrl) {
        ctaButtons.push([Markup.button.webApp(START_BTN_BUY, packagesUrl)]);
      }
      if (supportUsername) {
        ctaButtons.push([
          Markup.button.url(START_BTN_ADMIN, `https://t.me/${supportUsername}`),
        ]);
      }
      if (ctaButtons.length > 0) {
        await ctx.reply(START_CTA_TEXT, Markup.inlineKeyboard(ctaButtons));
      }
    } catch (err) {
      console.error(`[bot:${resellerId}] /start error:`, err.message);
    }
  });

  // ── Reply keyboard button handlers ───────────────────────────────────────────
  // Stage 1: all return placeholders. Replace with real logic in later stages.

  bot.hears(BTN.KEY, async (ctx) => {
    try {
      await ctx.reply(PLACEHOLDER.KEY);
    } catch (err) {
      console.error(`[bot:${resellerId}] KEY handler error:`, err.message);
    }
  });

  bot.hears(BTN.BALANCE, async (ctx) => {
    try {
      await ctx.reply(PLACEHOLDER.BALANCE);
    } catch (err) {
      console.error(`[bot:${resellerId}] BALANCE handler error:`, err.message);
    }
  });

  bot.hears(BTN.SERVER, async (ctx) => {
    try {
      await ctx.reply(PLACEHOLDER.SERVER);
    } catch (err) {
      console.error(`[bot:${resellerId}] SERVER handler error:`, err.message);
    }
  });

  bot.hears(BTN.DOWNLOAD, async (ctx) => {
    try {
      await ctx.reply(PLACEHOLDER.DOWNLOAD);
    } catch (err) {
      console.error(`[bot:${resellerId}] DOWNLOAD handler error:`, err.message);
    }
  });

  bot.hears(BTN.HOWTO, async (ctx) => {
    try {
      await ctx.reply(PLACEHOLDER.HOWTO);
    } catch (err) {
      console.error(`[bot:${resellerId}] HOWTO handler error:`, err.message);
    }
  });
}
