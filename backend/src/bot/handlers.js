import { Markup } from "telegraf";

/**
 * Builds the WebApp URL for a reseller's miniapp button.
 *
 * The slug is passed as ?slug=<miniappSlug> so that future miniapp versions can
 * read it via: new URLSearchParams(window.location.search).get('slug')
 * or Telegram.WebApp.initDataUnsafe.start_param when opened via a t.me link.
 *
 * TODO (future phase): miniapp must read this start param for per-reseller routing.
 * Until then, all bots point to the same miniapp URL and the slug is ignored at runtime.
 */
export function buildWebAppUrl(miniappBaseUrl, miniappSlug) {
  if (!miniappBaseUrl) return "";
  return `${miniappBaseUrl}?slug=${encodeURIComponent(miniappSlug || "")}`;
}

export function setupHandlers(bot, { resellerId, brandName, miniappSlug, miniappBaseUrl }) {
  const label = brandName || "VPN Service";
  const webAppUrl = buildWebAppUrl(miniappBaseUrl, miniappSlug);

  function openAppKeyboard() {
    return Markup.inlineKeyboard([
      Markup.button.webApp(`Open ${label}`, webAppUrl),
    ]);
  }

  bot.start(async (ctx) => {
    try {
      const reply = webAppUrl
        ? `Welcome to ${label}.\nTap the button below to open the app.`
        : `Welcome to ${label}.`;
      await ctx.reply(reply, webAppUrl ? openAppKeyboard() : {});
    } catch (err) {
      console.error(`[bot:${resellerId}] /start error:`, err.message);
    }
  });

  bot.command("app", async (ctx) => {
    try {
      if (webAppUrl) {
        await ctx.reply(`Open ${label}:`, openAppKeyboard());
      } else {
        await ctx.reply(`${label} — app URL not configured yet.`);
      }
    } catch (err) {
      console.error(`[bot:${resellerId}] /app error:`, err.message);
    }
  });
}
