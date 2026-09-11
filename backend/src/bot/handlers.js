import QRCode from "qrcode";
import { Markup } from "telegraf";
import {
  BTN,
  BTN_TRIAL,
  BTN_BUY,
  startWelcome,
  START_CTA_TEXT,
  START_BTN_ADMIN,
  START_BTN_TRIAL_KEY,
  START_BTN_GET_KEY,
  START_BTN_BUY_PACKAGE,
  START_CB_GET_KEY,
  START_CB_GET_TRIAL,
  APP_BTN_OPEN,
  appOpenText,
  keyFoundHeader,
  keyServerLine,
  KEY_COPY_INSTRUCTIONS,
  KEY_COPY_INSTRUCTIONS_SS,
  KEY_BTN_DOWNLOAD,
  KEY_NO_ACTIVE,
  KEY_ERROR,
  BALANCE_TEXT,
  balanceText,
  BALANCE_BTN_OPEN,
  SERVER_BTN_OPEN,
  SERVER_NO_ACCOUNT,
  SERVER_NO_ACTIVE,
  SERVER_VLESS_EXPLAIN,
  SERVER_VLESS_TRIAL,
  serverChooseText,
  SERVER_SWITCHING,
  serverSwitchSuccess,
  SERVER_TRIAL_LOCKED,
  SERVER_ALREADY_LINKED,
  SERVER_NO_KEY,
  SERVER_SWITCH_ERROR,
  DL_CB,
  DOWNLOAD_PICKER_TEXT,
  DL_PROTO_BTNS,
  DL_OS_BTNS,
  DL_SS_TEXT,
  DL_VLESS_TEXT,
  DL_SS_PLATFORMS,
  DL_VLESS_PLATFORMS,
  howToUse,
  howToUseSS,
  howToUseVless,
  TRIAL_SELECT_PROTOCOL,
  TRIAL_PROCESSING,
  TRIAL_ALREADY_USED,
  TRIAL_NO_ACCOUNT,
  TRIAL_ERROR,
  BUY_SELECT_PROTOCOL,
  BUY_PROTO_SS_BTN,
  BUY_PROTO_VLESS_BTN,
  BUY_SELECT_PLAN,
  BUY_NO_PLANS,
  buyPaymentInstructions,
  BUY_PROCESSING,
  BUY_ALREADY_ACTIVE,
  BUY_CANCELLED,
  BUY_ERROR,
  BUY_NO_SESSION,
  resellerNotifyCaption,
  NOTIFY_CONFIRM_BTN,
  NOTIFY_REJECT_BTN,
  NOTIFY_CONFIRMED,
  NOTIFY_REJECTED,
  CUSTOMER_PAYMENT_CONFIRMED,
  CUSTOMER_PAYMENT_REJECTED,
} from "./strings.js";
import {
  resolveCustomerByTelegram,
  getBestActiveOrder,
  resolveActiveKey,
  getFullActiveOrder,
  getAllActiveServersForDisplay,
  getFullServerById,
  ensureCustomerAndLink,
  getCustomerTrialInfo,
  ensureCustomerSsconfToken,
} from "./botCustomerService.js";
import {
  buildDynamicAccessUrl,
  getPublicSubscriptionBaseUrl,
} from "../services/publicAccessUrlService.js";
import { createTrialOrder, provisionTrialKey } from "../services/trialService.js";

import { buildWebAppUrl } from "./webAppUrl.js";
import {
  getOrderQuotaSnapshot,
  switchOrderServer,
} from "../services/subscriptionProvisionService.js";
import { formatBurmeseDate } from "./notificationTemplates.js";
import { getRegionLocation } from "../constants/doRegions.js";
import { getSession, setSession, clearSession } from "./botSession.js";
import {
  getPurchasablePlans,
  getResellerPaymentInfo,
  uploadScreenshot,
  createBotPurchaseOrder,
  setCustomerProtocolPreference,
  getOrderCustomerTelegramId,
} from "./botPurchaseService.js";
import { confirmPayment, rejectPayment } from "../services/orderLifecycleService.js";

// Same fallback the dashboards use (mapServerForMiniApp in
// resellerMiniappRoutes.js, toDisplayServer in resellerServerSwitchRouter.js)
// — a server inserted without display_country/display_city/flag_emoji set
// directly still gets a real city/flag via its DigitalOcean region instead
// of showing the raw internal slug (e.g. "sgp1-3111") to the customer.
function resolveServerDisplay(server) {
  if (!server) return { flag: "🌐", name: "Server" };
  const loc = getRegionLocation(server.region);
  return {
    flag: server.flag_emoji || loc?.flag || "🌐",
    name: server.display_city || loc?.city || server.name || "Server",
  };
}

function bytesToGb(bytes) {
  const value = Number(bytes || 0);
  return value > 0 ? Number((value / 1024 / 1024 / 1024).toFixed(2)) : 0;
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
  adminTelegramUserId: _adminTelegramUserId = null,
}) {
  // Loaded from reseller_miniapps.admin_telegram_user_id at bot start via manager.js.
  // Update it through the reseller dashboard — no bot restart needed if manager
  // live-reloads the bot row (it does on config changes).
  let adminTelegramUserId = _adminTelegramUserId;
  const homeUrl = buildWebAppUrl(miniappBaseUrl, miniappSlug);

  // ── Persistent reply keyboard ────────────────────────────────────────────────
  // Sent on /start and persists in the user's chat. Layout: 2-2-1.
  //
  // is_persistent: true (Bot API 6.0+) — Telegram treats the keyboard as
  // permanent. When the user taps the collapse icon it only hides for that
  // session; on the next chat re-open the keyboard reappears automatically.
  // Without this flag, a user who dismisses the keyboard never sees it again
  // unless we send another reply_markup — which is exactly what the user
  // reported ("5 buttons missing on chat re-open").

  function mainKeyboard() {
    const markup = Markup.keyboard([
      [BTN_TRIAL,  BTN_BUY     ],
      [BTN.KEY,    BTN.BALANCE  ],
      [BTN.SERVER, BTN.DOWNLOAD ],
      [BTN.HOWTO                ],
    ]).resize();
    markup.reply_markup.is_persistent = true;
    return markup;
  }

  // ── /start ───────────────────────────────────────────────────────────────────
  // FIX A: upsert customer + telegram_links, then call the shared trialService
  // to create a trial order and immediately provision a key on the default server.
  // Idempotent — safe to call on every /start (existing users are no-ops).
  //
  // Two messages: (1) branded Burmese welcome + persistent reply keyboard,
  // (2) inline CTA buttons — Telegram only allows one reply_markup type per message.
  //
  // Also FORCES this chat's menu button to our web_app URL. setChatMenuButton
  // without chat_id sets the DEFAULT for new chats only; existing chats keep
  // whatever they had at first open. Calling it here with chat_id repairs any
  // chat where Telegram reverted to "Menu" (ngrok tunnel drift, older
  // deployments, etc).

  bot.start(async (ctx) => {
    try {
      const telegramUserId = ctx.from?.id;
      if (!telegramUserId) return;

      const telegramUsername = ctx.from?.username || null;
      const fullName =
        [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ") ||
        `Telegram User ${telegramUserId}`;

      // 1. Upsert vpn_customers + telegram_links (no-op for returning users)
      const { customerId, trial_used_at } =
        await ensureCustomerAndLink(telegramUserId, telegramUsername, fullName, resellerId);

      // 2. Force-set the per-chat menu button so it always shows our brand +
      //    web_app, even for chats that opened before the default was set.
      //    Non-fatal — bot still works if this fails (e.g. Telegram rate limit).
      if (homeUrl) {
        try {
          await ctx.telegram.setChatMenuButton({
            chat_id: ctx.chat.id,
            menu_button: {
              type: "web_app",
              text: "Open VPN",
              web_app: { url: homeUrl },
            },
          });
        } catch (menuErr) {
          console.warn(`[bot:${resellerId}] setChatMenuButton warning:`, menuErr.message);
        }
      }

      // 4. Welcome + persistent keyboard
      await ctx.replyWithHTML(startWelcome(brandName), mainKeyboard());

      // 5. CTA inline buttons (second message)
      // New users (no trial yet) → point them to try the trial first.
      // Returning users (trial already used) → show "Get VPN Key".
      const hasUsedTrial = Boolean(trial_used_at);
      const ctaButtons = [
        [Markup.button.callback(
          hasUsedTrial ? START_BTN_GET_KEY : START_BTN_TRIAL_KEY,
          hasUsedTrial ? START_CB_GET_KEY  : START_CB_GET_TRIAL,
        )],
      ];
      if (homeUrl) {
        ctaButtons.push([miniAppButton(START_BTN_BUY_PACKAGE, homeUrl)]);
      }
      if (supportUsername) {
        ctaButtons.push([
          Markup.button.url(START_BTN_ADMIN, `https://t.me/${supportUsername}`),
        ]);
      }
      const markup = Markup.inlineKeyboard(ctaButtons);
      logInlineButtonPayload(resellerId, "/start", markup);
      await ctx.reply(START_CTA_TEXT, markup);
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

  // ── Get Key flow ─────────────────────────────────────────────────────────────
  // Shared by both the "🔑 VPN Key ရယူရန်" reply-keyboard button (hears)
  // and the inline [Get Key] / [Trial Key] buttons on /start (action).

  async function sendActiveKey(ctx) {
    const telegramUserId = ctx.from?.id;
    if (!telegramUserId) return;

    try {
      // 1. Telegram user → customer (reseller-scoped)
      const customer = await resolveCustomerByTelegram(telegramUserId, resellerId);
      if (!customer?.customerId) {
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

      const { flag, name: serverName } = resolveServerDisplay(keyRow.vpn_servers);
      const isVless = keyRow.protocol !== "shadowsocks";

      if (isVless) {
        // ── VLESS: Marzneshin subscription URL → QR + copyable URL ───────────
        const subUrl = keyRow.access_url;
        if (!subUrl) {
          await ctx.reply(KEY_NO_ACTIVE);
          return;
        }

        const caption =
          `${keyFoundHeader(customer.fullName || "Customer")}\n\n` +
          `${KEY_COPY_INSTRUCTIONS}\n\n` +
          `<code>${subUrl}</code>\n\n` +
          `${keyServerLine(flag, serverName)}`;

        const qrBuffer = await QRCode.toBuffer(subUrl, { width: 512, errorCorrectionLevel: "M" });
        await ctx.replyWithPhoto(
          { source: qrBuffer },
          {
            caption,
            parse_mode: "HTML",
            ...Markup.inlineKeyboard([[Markup.button.callback(KEY_BTN_DOWNLOAD, "key:download")]]),
          }
        );
      } else {
        // ── Shadowsocks (Outline): ssconf:// URL served by our backend ────────
        // Ensure the customer has a token; generate one on the fly if needed.
        const ssconfToken =
          customer.ssconfToken ||
          (await ensureCustomerSsconfToken(customer.customerId));

        const backendBase = getPublicSubscriptionBaseUrl();
        const label = [brandName, customer.fullName].filter(Boolean).join("-");
        const ssconfUrl = buildDynamicAccessUrl(ssconfToken, label);

        if (!ssconfUrl) {
          console.error(`[bot:${resellerId}] ssconf URL could not be built — check PUBLIC_SUBSCRIPTION_BASE_URL`);
          await ctx.reply(KEY_ERROR);
          return;
        }

        const text =
          `${keyFoundHeader(customer.fullName || "Customer")}\n\n` +
          `${KEY_COPY_INSTRUCTIONS_SS}\n\n` +
          `<code>${ssconfUrl}</code>\n\n` +
          `${keyServerLine(flag, serverName)}`;

        await ctx.replyWithHTML(
          text,
          Markup.inlineKeyboard([[Markup.button.callback(KEY_BTN_DOWNLOAD, "key:download")]])
        );
      }
    } catch (err) {
      console.error(`[bot:${resellerId}] KEY handler error:`, err.message);
      await ctx.reply(KEY_ERROR).catch(() => {});
    }
  }

  bot.hears(BTN.KEY, sendActiveKey);

  // /start CTA inline button — same key-lookup flow as the reply-keyboard button.
  bot.action(START_CB_GET_KEY, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {}); // ack the tap so Telegram stops spinning
    await sendActiveKey(ctx);
  });

  // /start CTA inline button for new users who haven't trialed yet.
  bot.action(START_CB_GET_TRIAL, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await showTrialMenu(ctx);
  });

  // "Download App" button on the key message — sends the protocol picker.
  // dlProtoKeyboard() is defined further below; JS hoists function declarations.
  bot.action("key:download", async (ctx) => {
    try {
      await ctx.answerCbQuery().catch(() => {});
      await ctx.replyWithHTML(DOWNLOAD_PICKER_TEXT, dlProtoKeyboard());
    } catch (err) {
      console.error(`[bot:${resellerId}] KEY download button error:`, err.message);
    }
  });

  bot.hears(BTN.BALANCE, async (ctx) => {
    try {
      const markup = homeUrl
        ? Markup.inlineKeyboard([[miniAppButton(BALANCE_BTN_OPEN, homeUrl)]])
        : {};
      logInlineButtonPayload(resellerId, "balance", markup);

      // Try to show real usage numbers — falls back to the generic text
      // when there's no resolvable active order (mirrors sendActiveKey's
      // lookup chain: telegram user -> customer -> best active order).
      let text = BALANCE_TEXT;
      const telegramUserId = ctx.from?.id;
      if (telegramUserId) {
        const customer = await resolveCustomerByTelegram(telegramUserId, resellerId);
        const order = customer?.customerId
          ? await getBestActiveOrder(customer.customerId, resellerId)
          : null;
        if (order) {
          const quota = await getOrderQuotaSnapshot(order.id);
          text = balanceText({
            usedGb: bytesToGb(quota.totalUsedBytes),
            remainingGb:
              typeof quota.remainingBytes === "number" ? bytesToGb(quota.remainingBytes) : null,
            isUnlimited: quota.isUnlimited,
            expiryDate: order.expiry_date,
            formatBurmeseDate,
          });
        }
      }

      await ctx.replyWithHTML(text, markup);
    } catch (err) {
      console.error(`[bot:${resellerId}] BALANCE handler error:`, err.message);
      await ctx.replyWithHTML(BALANCE_TEXT, homeUrl ? Markup.inlineKeyboard([[miniAppButton(BALANCE_BTN_OPEN, homeUrl)]]) : {}).catch(() => {});
    }
  });

  // ── 🌐 Server ပြောင်းရန် ────────────────────────────────────────────────────
  //
  // Flow:
  //   1. No customer account → SERVER_NO_ACCOUNT
  //   2. No active order    → SERVER_NO_ACTIVE
  //   3. VLESS/Hysteria2    → SERVER_VLESS_EXPLAIN (subscription covers all nodes)
  //   4. SS                 → inline server picker (trial + premium, trial-locked servers show 🔒)
  //
  // Callback srv:sel:{uuid} handles the actual switch.
  // Callback srv:cancel dismisses the picker.

  bot.hears(BTN.SERVER, async (ctx) => {
    try {
      const tgId = ctx.from.id;

      // ── 1. Resolve customer ────────────────────────────────────────────────
      const customer = await resolveCustomerByTelegram(tgId, resellerId);
      if (!customer) {
        return ctx.replyWithHTML(SERVER_NO_ACCOUNT);
      }

      // ── 2. Resolve active order ────────────────────────────────────────────
      const order = await getBestActiveOrder(customer.customerId, resellerId);
      if (!order) {
        return ctx.replyWithHTML(SERVER_NO_ACTIVE);
      }

      // ── 3. Protocol check — resolve from active key, fall back to preference
      const activeKey = await resolveActiveKey(customer.customerId, resellerId, order.id);
      const protocol = activeKey?.protocol || customer.protocolPreference || "shadowsocks";

      if (protocol !== "shadowsocks") {
        // VLESS Trial: only the trial node is accessible — tell them to upgrade.
        // VLESS Premium: subscription URL already includes all server nodes.
        const isTrial = order.order_type === "trial";
        return ctx.replyWithHTML(isTrial ? SERVER_VLESS_TRIAL : SERVER_VLESS_EXPLAIN);
      }

      // ── 4. SS: build inline server picker ────────────────────────────────
      const isTrial = order.order_type === "trial";
      const currentServerId = activeKey?.server_id || null;

      const allServers = await getAllActiveServersForDisplay();

      const buttons = allServers.map((srv) => {
        const loc = getRegionLocation(srv.region);
        const flag = srv.flag_emoji || loc?.flag || "🌐";
        const city = srv.display_city || loc?.city || srv.name;

        const isCurrentServer = srv.id === currentServerId;
        const isSrvTrial = (srv.server_tier || "premium") === "trial";
        const isPremiumLocked = isTrial && !isSrvTrial;

        let label = `${flag} ${city}`;
        if (isSrvTrial) {
          label += " · Trial";
        } else {
          label += " · Premium";
        }
        if (isCurrentServer) {
          label = `✅ ${label}`;
        } else if (isPremiumLocked) {
          label = `🔒 ${label}`;
        }

        return [Markup.button.callback(label, `srv:sel:${srv.id}`)];
      });

      buttons.push([Markup.button.callback("❌ ပယ်ဖျက်မည်", "srv:cancel")]);

      const markup = Markup.inlineKeyboard(buttons);
      await ctx.replyWithHTML(serverChooseText(isTrial), markup);
    } catch (err) {
      console.error(`[bot:${resellerId}] SERVER handler error:`, err.message);
      await ctx.replyWithHTML(SERVER_SWITCH_ERROR).catch(() => {});
    }
  });

  // ── Callback: server selected from picker ──────────────────────────────────
  //
  // Trial order + premium server → show upgrade prompt (no switch).
  // Already on this server       → toast only.
  // Valid switch                  → call switchOrderServer, confirm with success.

  bot.action(/^srv:sel:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    try {
      const serverId = ctx.match[1];
      const tgId = ctx.from.id;

      // Re-resolve customer + order so stale inline keyboards don't do harm
      const customer = await resolveCustomerByTelegram(tgId, resellerId);
      if (!customer) {
        return ctx.editMessageText(SERVER_NO_ACCOUNT, { parse_mode: "HTML" }).catch(() =>
          ctx.replyWithHTML(SERVER_NO_ACCOUNT)
        );
      }

      const order = await getFullActiveOrder(customer.customerId, resellerId);
      if (!order) {
        return ctx.editMessageText(SERVER_NO_ACTIVE, { parse_mode: "HTML" }).catch(() =>
          ctx.replyWithHTML(SERVER_NO_ACTIVE)
        );
      }

      // Only SS orders should reach here (VLESS handler never shows the picker),
      // but guard defensively.
      const activeKey = await resolveActiveKey(customer.customerId, resellerId, order.id);
      const protocol = activeKey?.protocol || customer.protocolPreference || "shadowsocks";
      if (protocol !== "shadowsocks") {
        const isTrialVless = order.order_type === "trial";
        const vlessMsg = isTrialVless ? SERVER_VLESS_TRIAL : SERVER_VLESS_EXPLAIN;
        return ctx.editMessageText(vlessMsg, { parse_mode: "HTML" }).catch(() =>
          ctx.replyWithHTML(vlessMsg)
        );
      }

      // Key must exist to perform a switch
      if (!activeKey) {
        return ctx.editMessageText(SERVER_NO_KEY, { parse_mode: "HTML" }).catch(() =>
          ctx.replyWithHTML(SERVER_NO_KEY)
        );
      }

      // Already on this server?
      if (activeKey.server_id === serverId) {
        await ctx.answerCbQuery(SERVER_ALREADY_LINKED, { show_alert: true }).catch(() => {});
        return;
      }

      // Fetch full server record (with credentials) needed by switchOrderServer
      const newServer = await getFullServerById(serverId);
      if (!newServer || newServer.status !== "active") {
        await ctx.answerCbQuery("Server မရရှိနိုင်ပါ", { show_alert: true }).catch(() => {});
        return;
      }

      // Trial order → premium server: blocked
      const isTrial = order.order_type === "trial";
      const isNewSrvPremium = (newServer.server_tier || "premium") !== "trial";
      if (isTrial && isNewSrvPremium) {
        return ctx.editMessageText(SERVER_TRIAL_LOCKED, { parse_mode: "HTML" }).catch(() =>
          ctx.replyWithHTML(SERVER_TRIAL_LOCKED)
        );
      }

      // Capacity check
      const remaining =
        Number(newServer.max_active_keys || 0) - Number(newServer.current_active_keys || 0);
      if (remaining <= 0) {
        await ctx.answerCbQuery("Server ၏ ပြည့်သွားပြီ", { show_alert: true }).catch(() => {});
        return;
      }

      // Show in-progress indicator before the async provisioning call
      await ctx.editMessageText(SERVER_SWITCHING, { parse_mode: "HTML" }).catch(() => {});

      // Perform the switch
      await switchOrderServer({ order, newServer, oldKey: activeKey });

      // Success — resolve display name for the new server
      const loc = getRegionLocation(newServer.region);
      const flag = newServer.flag_emoji || loc?.flag || "🌐";
      const city = newServer.display_city || loc?.city || newServer.name;

      await ctx.editMessageText(serverSwitchSuccess(flag, city), {
        parse_mode: "HTML",
      }).catch(() =>
        ctx.replyWithHTML(serverSwitchSuccess(flag, city))
      );

      console.info(
        `[bot:${resellerId}] Server switched: customer=${customer.customerId} ` +
          `order=${order.id} → server=${newServer.id} (${city})`
      );
    } catch (err) {
      console.error(`[bot:${resellerId}] srv:sel callback error:`, err.message);
      await ctx.editMessageText(SERVER_SWITCH_ERROR, { parse_mode: "HTML" }).catch(() =>
        ctx.replyWithHTML(SERVER_SWITCH_ERROR)
      );
    }
  });

  // ── Callback: cancel server picker ────────────────────────────────────────
  bot.action("srv:cancel", async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await ctx.deleteMessage().catch(() => {});
  });

  // ── Download App — 3-level flow ───────────────────────────────────────────────
  // Level 1: Protocol picker (SS / VLESS)
  // Level 2: OS picker       (iOS / Android / macOS / Windows)
  // Level 3: App URL buttons (one per app)
  // All levels edit the same message in place.

  /** Level 1 — protocol picker keyboard */
  function dlProtoKeyboard() {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback(DL_PROTO_BTNS.SS,    DL_CB.SS),
        Markup.button.callback(DL_PROTO_BTNS.VLESS, DL_CB.VLESS),
      ],
    ]);
  }

  /** Level 2 — OS picker keyboard; backCb goes back to level 1 */
  function dlOsKeyboard(ios, android, macos, windows) {
    return Markup.inlineKeyboard([
      [Markup.button.callback(DL_OS_BTNS.IOS,     ios    ),
       Markup.button.callback(DL_OS_BTNS.ANDROID, android)],
      [Markup.button.callback(DL_OS_BTNS.MACOS,   macos  ),
       Markup.button.callback(DL_OS_BTNS.WINDOWS, windows)],
      [Markup.button.callback(DL_OS_BTNS.BACK, DL_CB.PROTO)],
    ]);
  }

  /** Level 3 — app download links + Back button (backCb = OS picker callback) */
  function dlAppKeyboard(platform, backCb) {
    const appBtns = platform.apps.map(a => Markup.button.url(a.label, a.url));
    const rows = [];
    for (let i = 0; i < appBtns.length; i += 2) rows.push(appBtns.slice(i, i + 2));
    rows.push([Markup.button.callback(DL_OS_BTNS.BACK, backCb)]);
    return Markup.inlineKeyboard(rows);
  }

  async function dlEdit(ctx, text, keyboard) {
    await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: keyboard.reply_markup });
  }

  // Entry point
  bot.hears(BTN.DOWNLOAD, async (ctx) => {
    try {
      await ctx.replyWithHTML(DOWNLOAD_PICKER_TEXT, dlProtoKeyboard());
    } catch (err) {
      console.error(`[bot:${resellerId}] DOWNLOAD handler error:`, err.message);
    }
  });

  // Level 1 → Level 1 (back from any OS picker)
  bot.action(DL_CB.PROTO, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      await dlEdit(ctx, DOWNLOAD_PICKER_TEXT, dlProtoKeyboard());
    } catch (err) { console.error(`[bot:${resellerId}] DL proto back:`, err.message); }
  });

  // Level 1 → Level 2: SS OS picker
  bot.action(DL_CB.SS, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      await dlEdit(ctx, DL_SS_TEXT,
        dlOsKeyboard(DL_CB.SS_IOS, DL_CB.SS_AND, DL_CB.SS_MAC, DL_CB.SS_WIN));
    } catch (err) { console.error(`[bot:${resellerId}] DL ss:`, err.message); }
  });

  // Level 1 → Level 2: VLESS OS picker
  bot.action(DL_CB.VLESS, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      await dlEdit(ctx, DL_VLESS_TEXT,
        dlOsKeyboard(DL_CB.VL_IOS, DL_CB.VL_AND, DL_CB.VL_MAC, DL_CB.VL_WIN));
    } catch (err) { console.error(`[bot:${resellerId}] DL vless:`, err.message); }
  });

  // Level 2 → Level 3: SS platforms (Outline only)
  for (const [key, platform] of Object.entries(DL_SS_PLATFORMS)) {
    const cb = DL_CB[`SS_${key.toUpperCase().slice(0, 3)}`]
            ?? DL_CB[`SS_${key.toUpperCase()}`];
    bot.action(cb, async (ctx) => {
      try {
        await ctx.answerCbQuery();
        await dlEdit(ctx, platform.text, dlAppKeyboard(platform, DL_CB.SS));
      } catch (err) { console.error(`[bot:${resellerId}] DL ss:${key}:`, err.message); }
    });
  }

  // Level 2 → Level 3: VLESS platforms
  for (const [key, platform] of Object.entries(DL_VLESS_PLATFORMS)) {
    const cb = DL_CB[`VL_${key.toUpperCase().slice(0, 3)}`]
            ?? DL_CB[`VL_${key.toUpperCase()}`];
    bot.action(cb, async (ctx) => {
      try {
        await ctx.answerCbQuery();
        await dlEdit(ctx, platform.text, dlAppKeyboard(platform, DL_CB.VLESS));
      } catch (err) { console.error(`[bot:${resellerId}] DL vl:${key}:`, err.message); }
    });
  }

  // ── How to Use ───────────────────────────────────────────────────────────────
  // Shows protocol-specific instructions if the customer's preference is known;
  // falls back to the full two-section guide for unregistered users.

  bot.hears(BTN.HOWTO, async (ctx) => {
    try {
      const telegramUserId = ctx.from?.id;
      let text = howToUse(); // default: combined guide (both protocols)

      if (telegramUserId) {
        const customer = await resolveCustomerByTelegram(telegramUserId, resellerId)
          .catch(() => null);

        if (customer?.customerId) {
          // Only show a protocol-specific guide once the customer has an active key.
          // Before their first trial they haven't chosen a protocol yet, so always
          // show the combined guide so they can read about both.
          const order = await getBestActiveOrder(customer.customerId, resellerId)
            .catch(() => null);

          if (order) {
            if (customer.protocolPreference === "shadowsocks") {
              text = howToUseSS();
            } else if (customer.protocolPreference === "vless") {
              text = howToUseVless();
            }
          }
        }
      }

      const howtoMarkup = supportUsername
        ? Markup.inlineKeyboard([[Markup.button.url(START_BTN_ADMIN, `https://t.me/${supportUsername}`)]])
        : undefined;
      await ctx.replyWithHTML(text, howtoMarkup);
    } catch (err) {
      console.error(`[bot:${resellerId}] HOWTO handler error:`, err.message);
      await ctx.replyWithHTML(howToUse()).catch(() => {});
    }
  });

  // ── Trial Key (🎁) ───────────────────────────────────────────────────────────
  // Flow:
  //   1. Customer taps BTN_TRIAL → protocol picker (SS or VLESS)
  //   2. Customer picks protocol → trial order created + key provisioned
  //   3. Key delivered immediately via sendActiveKey (reuses SS/VLESS branches)
  // Trial is one-time per customer (gated by telegram_links.trial_used_at).

  async function showTrialMenu(ctx) {
    const telegramUserId = ctx.from?.id;
    if (!telegramUserId) return;
    try {
      const trialInfo = await getCustomerTrialInfo(telegramUserId, resellerId);
      if (!trialInfo) {
        await ctx.replyWithHTML(TRIAL_NO_ACCOUNT);
        return;
      }
      if (trialInfo.trial_used_at) {
        await ctx.replyWithHTML(TRIAL_ALREADY_USED);
        return;
      }
      if (!trialEnabled) {
        await ctx.replyWithHTML(TRIAL_ALREADY_USED); // same "not available" message
        return;
      }
      await ctx.replyWithHTML(
        TRIAL_SELECT_PROTOCOL,
        Markup.inlineKeyboard([
          [Markup.button.callback(BUY_PROTO_SS_BTN,    "trial:proto:ss"   )],
          [Markup.button.callback(BUY_PROTO_VLESS_BTN, "trial:proto:vless")],
          [Markup.button.callback("❌ မလုပ်တော့ပါ",     "trial:cancel"     )],
        ])
      );
    } catch (err) {
      console.error(`[bot:${resellerId}] trial menu error:`, err.message);
    }
  }

  bot.hears(BTN_TRIAL, showTrialMenu);

  // Shared handler: create + provision trial for the chosen protocol, then deliver
  async function handleTrialProto(ctx, protocol) {
    await ctx.answerCbQuery().catch(() => {});
    const telegramUserId = ctx.from?.id;
    if (!telegramUserId) return;
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
    try {
      // Show how-to for the chosen protocol before provisioning begins
      const howToText = protocol === "shadowsocks" ? howToUseSS() : howToUseVless();
      const howtoMarkup = supportUsername
        ? Markup.inlineKeyboard([[Markup.button.url(START_BTN_ADMIN, `https://t.me/${supportUsername}`)]])
        : undefined;
      await ctx.replyWithHTML(howToText, howtoMarkup);

      await ctx.replyWithHTML(TRIAL_PROCESSING);

      // Re-check eligibility (race-safe: createTrialOrder uses atomic claim)
      const trialInfo = await getCustomerTrialInfo(telegramUserId, resellerId);
      if (!trialInfo) {
        await ctx.replyWithHTML(TRIAL_NO_ACCOUNT);
        return;
      }

      // Set protocol preference before provisioning so provisionTrialKey uses
      // the correct Marzneshin service (VLESS trial node vs SS trial service).
      await setCustomerProtocolPreference(trialInfo.customer_id, protocol);

      const telegramUsername = ctx.from?.username || null;
      const fullName =
        [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ") ||
        `User ${telegramUserId}`;

      const { order, plan, created } = await createTrialOrder({
        customerId: trialInfo.customer_id,
        resellerId,
        telegramLinkId: trialInfo.id,
        telegramUsername,
        source: "bot",
      });

      if (!created && !order) {
        await ctx.replyWithHTML(TRIAL_ALREADY_USED);
        return;
      }

      if (order) {
        const label = [brandName, telegramUsername].filter(Boolean).join("-");
        try {
          await provisionTrialKey({
            customerId: trialInfo.customer_id,
            resellerId,
            orderId: order.id,
            plan: plan || order.vpn_plans,
            customerFullName: fullName,
            keyName: label,
            protocol,
          });
        } catch (provErr) {
          console.warn(`[bot:${resellerId}] trial key provision failed (non-fatal):`, provErr.message);
        }
      }

      // Deliver key using the existing protocol-aware sendActiveKey
      await sendActiveKey(ctx);
    } catch (err) {
      console.error(`[bot:${resellerId}] trial:proto:${protocol} error:`, err.message);
      await ctx.replyWithHTML(TRIAL_ERROR).catch(() => {});
    }
  }

  bot.action("trial:proto:ss",    (ctx) => handleTrialProto(ctx, "shadowsocks"));
  bot.action("trial:proto:vless", (ctx) => handleTrialProto(ctx, "vless"));

  bot.action("trial:cancel", async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
  });

  // ── Buy Package (🛒) ─────────────────────────────────────────────────────────
  // Flow:
  //   1. Customer taps BTN_BUY (or /buy) → list of purchasable plans as inline keyboard
  //   2. Customer picks a plan → session saved, payment instructions sent
  //   3. Customer sends a payment screenshot → key provisioned, reseller notified
  //   4. Reseller taps ✅/❌ in notification → order confirmed/rejected, customer DMed

  // Step 1: show protocol picker
  async function showBuyMenu(ctx) {
    try {
      await ctx.replyWithHTML(
        BUY_SELECT_PROTOCOL,
        Markup.inlineKeyboard([
          [Markup.button.callback(BUY_PROTO_SS_BTN,    "buy:proto:ss")],
          [Markup.button.callback(BUY_PROTO_VLESS_BTN, "buy:proto:vless")],
          [Markup.button.callback("❌ မဝယ်တော့ပါ",      "buy:cancel")],
        ])
      );
    } catch (err) {
      console.error(`[bot:${resellerId}] BUY menu error:`, err.message);
    }
  }

  bot.hears(BTN_BUY, showBuyMenu);
  bot.command("buy", showBuyMenu);

  // Step 1b: helper — render plan list after protocol is chosen
  async function showPlanList(ctx) {
    try {
      const plans = await getPurchasablePlans();
      if (!plans.length) {
        await ctx.replyWithHTML(BUY_NO_PLANS);
        return;
      }
      // Label: price / data / duration — no plan name
      const buttons = plans.map((plan) => [
        Markup.button.callback(
          `💰 ${plan.price_mmk.toLocaleString()} MMK  |  📊 ${plan.data_limit_gb} GB  |  ⏰ ${plan.duration_days} ရက်`,
          `buy:plan:${plan.id}`
        ),
      ]);
      buttons.push([Markup.button.callback("❌ မဝယ်တော့ပါ", "buy:cancel")]);
      await ctx.replyWithHTML(BUY_SELECT_PLAN, Markup.inlineKeyboard(buttons));
    } catch (err) {
      console.error(`[bot:${resellerId}] showPlanList error:`, err.message);
      await ctx.replyWithHTML(BUY_ERROR).catch(() => {});
    }
  }

  // Step 2a: customer picks Shadowsocks
  bot.action("buy:proto:ss", async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const telegramUserId = ctx.from?.id;
    if (!telegramUserId) return;
    await setSession(resellerId, telegramUserId, { step: "selecting_plan", protocol: "shadowsocks" });
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
    await showPlanList(ctx);
  });

  // Step 2b: customer picks VLESS
  bot.action("buy:proto:vless", async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const telegramUserId = ctx.from?.id;
    if (!telegramUserId) return;
    await setSession(resellerId, telegramUserId, { step: "selecting_plan", protocol: "vless" });
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
    await showPlanList(ctx);
  });

  // Step 3: plan selected — update session + send payment instructions
  bot.action(/^buy:plan:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const planId = ctx.match[1];
    const telegramUserId = ctx.from?.id;
    if (!telegramUserId) return;
    try {
      // Read protocol from previous step
      const existingSession = await getSession(resellerId, telegramUserId);
      const protocol = existingSession?.protocol || "shadowsocks";

      const plans = await getPurchasablePlans();
      const plan = plans.find((p) => p.id === planId);
      if (!plan) {
        await ctx.replyWithHTML(BUY_ERROR);
        return;
      }
      const paymentMethods = await getResellerPaymentInfo(resellerId);
      await setSession(resellerId, telegramUserId, {
        step: "awaiting_screenshot",
        protocol,
        planId: plan.id,
        planName: plan.name,
        priceMmk: plan.price_mmk,
        durationDays: plan.duration_days,
        dataLimitGb: plan.data_limit_gb,
      });
      // Collapse the plan-list keyboard
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
      await ctx.replyWithHTML(buyPaymentInstructions(plan, paymentMethods));
    } catch (err) {
      console.error(`[bot:${resellerId}] buy:plan callback error:`, err.message);
      await ctx.replyWithHTML(BUY_ERROR).catch(() => {});
    }
  });

  // Cancelled before sending screenshot
  bot.action("buy:cancel", async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const telegramUserId = ctx.from?.id;
    if (telegramUserId) await clearSession(resellerId, telegramUserId).catch(() => {});
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
    await ctx.replyWithHTML(BUY_CANCELLED).catch(() => {});
  });

  // Step 3: customer sends the payment screenshot
  bot.on("photo", async (ctx) => {
    const telegramUserId = ctx.from?.id;
    if (!telegramUserId) return;
    try {
      const session = await getSession(resellerId, telegramUserId);
      if (!session || session.step !== "awaiting_screenshot") {
        await ctx.replyWithHTML(BUY_NO_SESSION);
        return;
      }

      await ctx.replyWithHTML(BUY_PROCESSING);

      // Largest photo = last item in the array (highest resolution)
      const photo = ctx.message.photo;
      const fileId = photo[photo.length - 1].file_id;

      // Resolve customer row (must exist — they went through /start)
      const customer = await resolveCustomerByTelegram(telegramUserId, resellerId);
      if (!customer?.customerId) {
        await ctx.replyWithHTML(BUY_ERROR);
        return;
      }

      // Persist protocol preference so provisionOrderAccess picks it up automatically
      if (session.protocol) {
        await setCustomerProtocolPreference(customer.customerId, session.protocol);
      }

      // Upload screenshot + create order + provision key (instant-access)
      const screenshotPath = await uploadScreenshot(bot, fileId, resellerId);
      const { order, plan } = await createBotPurchaseOrder({
        resellerId,
        customerId: customer.customerId,
        planId: session.planId,
        screenshotPath,
      });

      // Clear session — order is now created regardless of subsequent errors
      await clearSession(resellerId, telegramUserId).catch(() => {});

      // Send the active key to the customer (reuses the full lookup chain)
      await sendActiveKey(ctx);

      // Notify reseller with the screenshot + Confirm/Reject buttons (non-fatal)
      if (adminTelegramUserId) {
        try {
          const caption = resellerNotifyCaption({
            customerName: customer.fullName || `User ${telegramUserId}`,
            planName: plan.name,
            priceMmk: plan.price_mmk,
            durationDays: plan.duration_days,
            dataLimitGb: plan.data_limit_gb,
            orderId: order.id,
          });
          await bot.telegram.sendPhoto(String(adminTelegramUserId), fileId, {
            caption,
            parse_mode: "HTML",
            reply_markup: Markup.inlineKeyboard([
              [
                Markup.button.callback(NOTIFY_CONFIRM_BTN, `pay_ok:${order.id}`),
                Markup.button.callback(NOTIFY_REJECT_BTN, `pay_no:${order.id}`),
              ],
            ]).reply_markup,
          });
        } catch (notifyErr) {
          console.warn(`[bot:${resellerId}] reseller notify failed (non-fatal):`, notifyErr.message);
        }
      }
    } catch (err) {
      console.error(`[bot:${resellerId}] photo handler error:`, err.message);
      await clearSession(resellerId, telegramUserId).catch(() => {});
      if (err.code === "CUSTOMER_ALREADY_ACTIVE") {
        await ctx.replyWithHTML(BUY_ALREADY_ACTIVE).catch(() => {});
      } else {
        await ctx.replyWithHTML(BUY_ERROR).catch(() => {});
      }
    }
  });

  // Step 4a: reseller confirms payment
  bot.action(/^pay_ok:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery("✅ အတည်ပြုပါပြီ").catch(() => {});
    const orderId = ctx.match[1];
    try {
      await confirmPayment({ orderId, resellerId });
      const originalCaption = ctx.callbackQuery?.message?.caption || "";
      await ctx.editMessageCaption(originalCaption + NOTIFY_CONFIRMED, {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [] },
      }).catch(() => {});
      const customerTgId = await getOrderCustomerTelegramId(orderId);
      if (customerTgId) {
        await bot.telegram.sendMessage(String(customerTgId), CUSTOMER_PAYMENT_CONFIRMED, {
          parse_mode: "HTML",
        }).catch((e) => console.warn(`[bot:${resellerId}] customer DM (confirm) failed:`, e.message));
      }
    } catch (err) {
      console.error(`[bot:${resellerId}] pay_ok callback error:`, err.message);
      await ctx.answerCbQuery(`⚠️ ${err.message.slice(0, 50)}`).catch(() => {});
    }
  });

  // Step 4b: reseller rejects payment
  bot.action(/^pay_no:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery("❌ ငြင်းပယ်ပါပြီ").catch(() => {});
    const orderId = ctx.match[1];
    try {
      await rejectPayment({ orderId, resellerId });
      const originalCaption = ctx.callbackQuery?.message?.caption || "";
      await ctx.editMessageCaption(originalCaption + NOTIFY_REJECTED, {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [] },
      }).catch(() => {});
      const customerTgId = await getOrderCustomerTelegramId(orderId);
      if (customerTgId) {
        const rejectMarkup = supportUsername
          ? Markup.inlineKeyboard([[Markup.button.url(START_BTN_ADMIN, `https://t.me/${supportUsername}`)]])
          : undefined;
        await bot.telegram.sendMessage(String(customerTgId), CUSTOMER_PAYMENT_REJECTED, {
          parse_mode: "HTML",
          ...(rejectMarkup || {}),
        }).catch((e) => console.warn(`[bot:${resellerId}] customer DM (reject) failed:`, e.message));
      }
    } catch (err) {
      console.error(`[bot:${resellerId}] pay_no callback error:`, err.message);
      await ctx.answerCbQuery(`⚠️ ${err.message.slice(0, 50)}`).catch(() => {});
    }
  });

  // /register_admin removed — configure admin Telegram ID through the
  // reseller dashboard (Settings → Notifications). The value is loaded from
  // reseller_miniapps.admin_telegram_user_id when the bot starts.
}
