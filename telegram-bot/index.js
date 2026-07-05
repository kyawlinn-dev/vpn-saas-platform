import "dotenv/config";
import { Telegraf, Markup } from "telegraf";
import { createClient } from "@supabase/supabase-js";

const botToken = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
const miniAppBaseUrl = String(process.env.TELEGRAM_MINIAPP_URL || "").trim();
const miniAppSlug = String(process.env.MINIAPP_SLUG || "").trim();
const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
const supabaseServiceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

const miniAppUrl = miniAppSlug
  ? `${miniAppBaseUrl.replace(/\/$/, "")}?slug=${encodeURIComponent(miniAppSlug)}`
  : miniAppBaseUrl;

console.log("TELEGRAM_MINIAPP_URL =", miniAppUrl);

if (!botToken) throw new Error("Missing TELEGRAM_BOT_TOKEN");
if (!miniAppBaseUrl) throw new Error("Missing TELEGRAM_MINIAPP_URL");
if (!supabaseUrl) throw new Error("Missing SUPABASE_URL");
if (!supabaseServiceRoleKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
const bot = new Telegraf(botToken);

function parseStartPayload(text) {
  const parts = String(text || "").trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(1).join(" ").trim() : "";
}

async function findActiveToken(token) {
  const { data, error } = await supabase
    .from("access_tokens")
    .select(`
      id,
      token,
      customer_id,
      reseller_id,
      status,
      expires_at,
      customer:vpn_customers(
        id,
        full_name,
        phone,
        telegram_username
      )
    `)
    .eq("token", token)
    .eq("status", "active")
    .single();

  if (error || !data) return null;
  return data;
}

async function linkTelegramUserToCustomer({ telegramUser, tokenRow }) {
  const payload = {
    telegram_user_id: telegramUser.id,
    telegram_username: telegramUser.username || null,
    customer_id: tokenRow.customer_id,
    reseller_id: tokenRow.reseller_id || null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("telegram_links")
    .upsert(payload, { onConflict: "telegram_user_id" });

  if (error) throw new Error(error.message);
}

function openAppKeyboard() {
  return Markup.inlineKeyboard([
    Markup.button.webApp("Open NovaNet MM", miniAppUrl),
  ]);
}

bot.start(async (ctx) => {
  try {
    const payload = parseStartPayload(ctx.message?.text);

    if (payload?.startsWith("tok_")) {
      const tokenRow = await findActiveToken(payload);

      if (!tokenRow) {
        await ctx.reply("Invalid or expired access token.");
        return;
      }

      await linkTelegramUserToCustomer({
        telegramUser: ctx.from,
        tokenRow,
      });

      await ctx.reply(
        `Linked successfully for ${tokenRow.customer?.full_name || "customer"}.\nOpen the app below.`,
        openAppKeyboard()
      );
      return;
    }

    await ctx.reply(
      "Welcome to NovaNet MM.\nUse the button below to open the app.",
      openAppKeyboard()
    );
  } catch (error) {
  console.error("/start crash:", error?.response?.description || error?.message || error);

  try {
    await ctx.reply(
      `Start failed: ${error?.response?.description || error?.message || "unknown error"}`
    );
  } catch (replyErr) {
    console.error("Failed to send error reply:", replyErr);
  }
}
});

bot.command("app", async (ctx) => {
  try {
    console.log("Mini app URL:", miniAppUrl);
    await ctx.reply("Open NovaNet MM:", openAppKeyboard());
  } catch (error) {
    console.error("/app crash:", error?.response?.description || error?.message || error);

    try {
      await ctx.reply(
        `App failed: ${error?.response?.description || error?.message || "unknown error"}`
      );
    } catch (replyErr) {
      console.error("Failed to send app error reply:", replyErr);
    }
  }
});

async function bootstrap() {
  await bot.telegram.setMyCommands([
    { command: "start", description: "Start NovaNet MM" },
    { command: "app", description: "Open mini app" },
  ]);

  await bot.telegram.setChatMenuButton({
    menu_button: {
      type: "web_app",
      text: "Open NovaNet MM",
      web_app: { url: miniAppUrl },
    },
  });

  await bot.launch();
  console.log("Telegram bot started");
}

bootstrap();

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
