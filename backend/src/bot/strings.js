/**
 * strings.js — All Burmese UI text for the NovaNet MM bot.
 *
 * REPLACE STUB TEXT with final Burmese copy before launch.
 * Functions accept dynamic values (brandName, etc.) and return the full string.
 * All message strings are for HTML parse_mode — use <b>, <i>, <code> tags.
 */

// ── Persistent reply keyboard button labels ────────────────────────────────────
// These strings must match exactly what bot.hears() registers in handlers.js.
// Do not change one without changing the other.

export const BTN = {
  KEY:      "🔑 VPN Key ရယူရန်",
  BALANCE:  "📊 လက်ကျန်စစ်ရန်",
  SERVER:   "🌐 Server ပြောင်းရန်",
  DOWNLOAD: "📥 App ဒေါင်းလုပ်",
  HOWTO:    "📖 အသုံးပြုနည်း",
};

/** Persistent keyboard button label for one-time trial — must match bot.hears(). */
export const BTN_TRIAL = "🎁 Trial Key ရယူရန်";

// ── /start ─────────────────────────────────────────────────────────────────────

/**
 * Welcome message sent on /start.
 * @param {string} brandName  Reseller's brand_name from reseller_miniapps.
 */
export function startWelcome(brandName) {
  const b = (t) => `<b>${t}</b>`;
  return [
    `🌐 ${b(brandName)} မှ ကြိုဆိုပါသည်! 🎉`,
    "",
    `${b(brandName)} မှ VPN ဝန်ဆောင်မှုဖြင့် လုံခြုံ၊ မြန်ဆန်စွာ internet ကို ကမ္ဘာ့မည်သည့်နေရာမှမဆို ချိတ်ဆက်နိုင်ပါပြီ။`,
    "",
    `🎁 User အသစ်များ <b>Trial Key ရယူရန်</b> ကို နှိပ်၍ အခမဲ့ trial ရယူနိုင်ပါသည်။`,
    "",
    `📌 Menu ကို အသုံးပြု၍ —`,
    `   • 🎁 Trial Key ရယူနိုင်သည် (တစ်ကြိမ်သာ)`,
    `   • 🛒 Package ဝယ်ယူနိုင်သည်`,
    `   • 🔑 VPN Key ရယူနိုင်သည်`,
    `   • 📊 လက်ကျန်ဒေတာ စစ်ဆေးနိုင်သည်`,
    "",
    `အောက်ပါ menu မှ ရွေးချယ်ပါ 👇`,
  ].join("\n");
}

/** Short prompt sent alongside the Buy/Admin inline buttons (second message on /start). */
export const START_CTA_TEXT = "📲 ဘာများ ကူညီပေးရမလဲ?";

/** Inline button labels on /start */
export const START_BTN_ADMIN        = "👤 Admin / Support";
export const START_BTN_TRIAL_KEY    = "🎁 အစမ်းသုံး 5GB ရယူရန်";
export const START_BTN_GET_KEY      = "🎁 Trial Key ရယူရန်";
export const START_BTN_BUY_PACKAGE  = "🛒 Package ဝယ်ရန်";

/** Callback data for the /start inline buttons. */
export const START_CB_GET_KEY   = "start:get_key";
export const START_CB_GET_TRIAL = "start:get_trial";

export function appOpenText(brandName) {
  const name = brandName || "VPN";
  return [
    `Open ${name} Mini App`,
    "",
    "Use the app to check your package, server, VPN key, and payments.",
  ].join("\n");
}

export const APP_BTN_OPEN = "Open Mini App";

// ── Get Key (🔑) handler ──────────────────────────────────────────────────────

/**
 * Header line shown above the key when a customer has an active key.
 * @param {string} customerName  vpn_customers.full_name
 */
export function keyFoundHeader(customerName) {
  return `🔑 ယခု <b>${customerName}</b> အကောင့်အတွက် VPN Key မှာ:`;
}

/**
 * Server line shown below the key.
 * @param {string} flag        Real flag emoji (falls back to 🌐 — see
 *                              resolveServerDisplay() in handlers.js)
 * @param {string} serverName  Real city/country name, not the raw internal
 *                              server slug — same fallback the dashboards use
 */
export function keyServerLine(flag, serverName) {
  return `🌐 Linked Server: ${flag} ${serverName}`;
}

/**
 * Copy instructions shown below the subscription URL on the key message.
 * The URL is wrapped in <code> by the caller (tap-to-copy on all Telegram clients).
 */
/** Shown under the Outline ssconf:// key */
export const KEY_COPY_INSTRUCTIONS_SS =
  "📋 URL ကို tap/copy ကူး၍ <b>Outline</b> app တွင် ထည့်ပါ။\n" +
  "   App မရှိသေးပါက 📥 <b>App ဒေါင်းလုပ်</b> ကို နှိပ်ပါ။";

/** Shown under the VLESS subscription URL + QR */
export const KEY_COPY_INSTRUCTIONS =
  "📋 QR scan (သို့) URL ကို copy ကူး၍ <b>Hiddify</b> / Xray app တွင်\n" +
  "   Subscription URL အဖြစ် ထည့်ပါ။ App မရှိသေးပါက 📥 <b>App ဒေါင်းလုပ်</b> ကို နှိပ်ပါ။";

/** Inline button label — opens the app download picker */
export const KEY_BTN_DOWNLOAD = "📥 App ဒေါင်းလုပ်";

/** Shown when the customer has no active order or no provisioned key */
export const KEY_NO_ACTIVE =
  "❌ လက်ရှိ active package မရှိပါ။\n\n" +
  "• Trial စမ်းသုံးရန် 🎁 <b>Trial Key ရယူရန်</b> ကို နှိပ်ပါ\n" +
  "• Package ဝယ်ယူရန် 🛒 <b>ပက်ကေ့ဂျ် ဝယ်ရန်</b> ကို နှိပ်ပါ";

/** Generic error shown when the DB/network lookup fails */
export const KEY_ERROR =
  "⚠️ Key ရယူရာတွင် အမှားဖြစ်သွားသည်။ ခဏကြာပြီးနောက် ထပ်ကြိုးစားပါ။";

// ── Check Balance (📊) handler ─────────────────────────────────────────────────

export const BALANCE_TEXT =
  "📊 <b>လက်ကျန် GB စစ်ဆေးရန်:</b>\n\n" +
  "လက်ကျန် data နှင့် သက်တမ်း အချက်အလက်များကို VPN app တွင် ကြည့်ရှုနိုင်ပါသည်။\n\n" +
  "အောက်ပါ <b>Open VPN</b> ကို နှိပ်ပါ 👇";

/**
 * Balance text with real usage numbers — shown when the customer has an
 * active order with a resolvable quota snapshot (buildOrderQuotaSnapshot()).
 * Falls back to the generic BALANCE_TEXT above when there's no active order.
 *
 * @param {object} params
 * @param {number} params.usedGb          total lifetime usage across all keys on this order
 * @param {number|null} params.remainingGb  null when unlimited or no data limit set
 * @param {boolean} params.isUnlimited
 * @param {string|null} params.expiryDate  vpn_orders.expiry_date (YYYY-MM-DD)
 */
export function balanceText({ usedGb, remainingGb, isUnlimited, expiryDate, formatBurmeseDate }) {
  const remainingLine = isUnlimited
    ? "🔓 အကန့်အသတ်မရှိ (Unlimited)"
    : remainingGb != null
      ? `${remainingGb} GB`
      : "-";

  return (
    "📊 <b>လက်ကျန် GB စစ်ဆေးရန်:</b>\n\n" +
    `📈 အသုံးပြုပြီး: <b>${usedGb} GB</b>\n` +
    `📉 လက်ကျန်: <b>${remainingLine}</b>\n` +
    (expiryDate ? `📅 သက်တမ်းကုန်ရက်: ${formatBurmeseDate(expiryDate)}\n` : "") +
    "\nအသေးစိတ်ကို VPN app တွင် ဆက်လက်ကြည့်ရှုနိုင်ပါသည်။ အောက်ပါ <b>Open VPN</b> ကို နှိပ်ပါ 👇"
  );
}

export const BALANCE_BTN_OPEN = "📊 Open VPN";

// ── Change Server (🌐) handler ─────────────────────────────────────────────────

export const SERVER_BTN_OPEN = "🌐 Change Server";

/** Shown when the customer has never done /start. */
export const SERVER_NO_ACCOUNT =
  "⚠️ အကောင့် မရှိပါ။ /start ကို ဦးစွာ နှိပ်ပါ။";

/** Shown when the customer has no active order. */
export const SERVER_NO_ACTIVE =
  "❌ လက်ရှိ active package မရှိပါ။\n\n" +
  "• Trial စမ်းသုံးရန် 🎁 <b>Trial Key ရယူရန်</b> ကို နှိပ်ပါ\n" +
  "• Package ဝယ်ယူရန် 🛒 <b>ပက်ကေ့ဂျ် ဝယ်ရန်</b> ကို နှိပ်ပါ";

/** Shown when a PREMIUM customer's active key uses VLESS — subscription covers all nodes. */
export const SERVER_VLESS_EXPLAIN =
  "🌐 <b>VLESS Subscription</b>\n\n" +
  "သင့် VLESS subscription သည် <b>server အားလုံးကို အလိုအလျောက် ပေါင်းစပ်</b>ပေးသည်။\n\n" +
  "Hiddify / Xray app က <b>အကောင်းဆုံး server</b> ကို အလိုအလျောက် ရွေးချယ်ပေးမည်ဖြစ်သောကြောင့် " +
  "manual switch လုပ်ရန် မလိုပါ။\n\n" +
  "Server ကို manual ပြောင်းလိုပါက app ထဲ၌ node list မှ ပြောင်းနိုင်ပါသည်";

/** Shown when a TRIAL customer's active key uses VLESS — trial node only. */
export const SERVER_VLESS_TRIAL =
  "⚡ <b>VLESS Trial · Trial Server သာ</b>\n\n" +
  "Trial VLEOutline key သည် <b>Trial server တစ်ခုသာ</b> ချိတ်ဆက်နိုင်သည်။\n\n" +
  "🔓 <b>Server အားလုံးသို့ ချိတ်ဆက်ရန်</b> Premium package ဝယ်ယူပါ —\n" +
  "Premium VLESS subscription ဖြင့် မြန်နှုန်းမြင့် server များ အားလုံးကို Hiddify / Xray app " +
  "ထဲတွင် တစ်ချက်နှိပ်၍ ရွေးချယ်နိုင်မည်ဖြစ်သည်။";

/**
 * Header for the server picker inline keyboard.
 * @param {boolean} isTrial  True when the customer is on a trial order.
 */
export function serverChooseText(isTrial) {
  const trialNote = isTrial
    ? "\n\n🔒 Premium server များသည် paid package လိုအပ်သည်။ ဝယ်ယူပါက ဤ server များကို ရရှိနိုင်သည်။"
    : "";
  return (
    "🌐 <b>Server ရွေးချယ်ပါ</b>\n\n" +
    "ချိတ်ဆက်လိုသော server ကို နှိပ်ပါ 👇" +
    trialNote
  );
}

/** Shown while the bot performs the server switch. */
export const SERVER_SWITCHING =
  "⏳ Server ပြောင်းနေသည်... ခဏစောင့်ပါ 🙏";

/**
 * Shown on successful server switch.
 * @param {string} flag   Flag emoji for the new server.
 * @param {string} name   Display name for the new server.
 */
export function serverSwitchSuccess(flag, name) {
  return (
    `✅ <b>${flag} ${name}</b> သို့ ပြောင်းပြီးပါပြီ!\n\n` +
    "🔑 <b>VPN Key ရယူရန်</b> ကို နှိပ်ပါ"
  );
}

/** Shown when a trial customer taps a premium server. */
export const SERVER_TRIAL_LOCKED =
  "🔒 <b>Premium Server — paid package လိုအပ်သည်</b>\n\n" +
  "Trial package သည် Trial server သာ သုံးနိုင်သည်။\n" +
  "Premium server များ ရရှိရန် 🛒 <b>ပက်ကေ့ဂျ် ဝယ်ရန်</b> ကို နှိပ်ပါ။";

/** Shown when the customer taps the server they are already connected to. */
export const SERVER_ALREADY_LINKED =
  "✅ ဤ server နှင့် ချိတ်ဆက်ပြီးဖြစ်သည်";

/** Shown when the customer has no provisioned key yet. */
export const SERVER_NO_KEY =
  "⚠️ VPN Key မရှိသေးပါ။\n\n" +
  "🔑 <b>VPN Key ရယူရန်</b> ကို ဦးစွာနှိပ်ပြီး key ရယူပါ၊ ထို့နောက် server ပြောင်းနိုင်ပါသည်။";

/** Generic error during the server switch. */
export const SERVER_SWITCH_ERROR =
  "⚠️ Server ပြောင်းရာတွင် အမှားဖြစ်သွားသည်။ ခဏကြာပြီးနောက် ထပ်ကြိုးစားပါ။";

// ── Download App (📥) — 3-level flow ──────────────────────────────────────────
// Level 1: Protocol picker  (SS  or  VLESS/Xray)
// Level 2: OS picker        (iOS / Android / macOS / Windows)
// Level 3: App links        (one per app, URL buttons)

export const DL_CB = {
  // Level 1
  PROTO:   "dl:proto",
  SS:      "dl:ss",
  VLESS:   "dl:vl",
  // Level 2 — Outline
  SS_IOS:  "dl:ss:ios",
  SS_AND:  "dl:ss:and",
  SS_MAC:  "dl:ss:mac",
  SS_WIN:  "dl:ss:win",
  // Level 2 — VLESS / Xray
  VL_IOS:  "dl:vl:ios",
  VL_AND:  "dl:vl:and",
  VL_MAC:  "dl:vl:mac",
  VL_WIN:  "dl:vl:win",
};

/** Level 1 — protocol picker */
export const DOWNLOAD_PICKER_TEXT =
  "📥 <b>VPN App Download</b>\n\n" +
  "Protocol ပေါ်မူတည်ပြီး App မတူပါ —\n\n" +
  "📱 <b>Outline</b> — Outline app\n" +
  "🌐 <b>VLESS / Xray</b> — Hiddify · V2Box · V2rayTun · V2rayNG\n\n" +
  "သင်အသုံးပြုသော protocol ကို ရွေးချယ်ပါ 👇";

export const DL_PROTO_BTNS = {
  SS:    "📱 Outline",
  VLESS: "🌐 VLESS / Xray",
};

/** Level 2 — OS picker labels (shared for both SS and VLESS) */
export const DL_OS_BTNS = {
  IOS:     "🍎 iPhone / iPad",
  ANDROID: "🤖 Android",
  MACOS:   "💻 macOS",
  WINDOWS: "🪟 Windows",
  BACK:    "⬅️ ပြန်သွားရန်",
};

// ── Custom emoji IDs (VPNPack6 — t.me/addemoji/VPNPack6) ─────────────────────
const EMO = {
  HIDDIFY:  `<tg-emoji emoji-id="6118150126826431713">🌐</tg-emoji>`,
  OUTLINE:  `<tg-emoji emoji-id="6118251264716317433">📱</tg-emoji>`,
  V2RAYTUN: `<tg-emoji emoji-id="6120927368644140757">📱</tg-emoji>`,
  V2RAYNG:  `<tg-emoji emoji-id="6118303491518635890">📱</tg-emoji>`,
  V2BOX:    `<tg-emoji emoji-id="6120480571786272759">📦</tg-emoji>`,
};

export const DL_SS_TEXT =
  `${EMO.OUTLINE} <b>Outline — Platform ရွေးချယ်ပါ</b>\n\n` +
  "<b>Outline</b> app သည် Outline key ကို တိုက်ရိုက် ထည့်သွင်းနိုင်သည်။\n" +
  "Device ကို ရွေးချယ်ပါ 👇";

export const DL_VLESS_TEXT =
  `${EMO.HIDDIFY} <b>VLESS / Xray — Platform ရွေးချယ်ပါ</b>\n\n` +
  "Xray-core client app များသည် VLESS + Outline + Hysteria2 ကို\n" +
  "Subscription URL တစ်ခုဖြင့် support လုပ်သည်။\n" +
  "Device ကို ရွေးချယ်ပါ 👇";

// Level 3 — Outline: Outline only, per OS
export const DL_SS_PLATFORMS = {
  ios: {
    text:
      `🍎 <b>iPhone / iPad — Outline</b>\n\n` +
      `${EMO.OUTLINE} <b>Outline</b> — App Store မှ download ဆွဲပြီး\n` +
      "VPN key ကို app ထဲ ထည့်သွင်းပါ 👇",
    apps: [
      { label: "📲 Outline — App Store", url: "https://apps.apple.com/app/id1356177741" },
    ],
  },
  android: {
    text:
      `🤖 <b>Android — Outline</b>\n\n` +
      `${EMO.OUTLINE} <b>Outline</b> — Google Play မှ download ဆွဲပြီး\n` +
      "VPN key ကို app ထဲ ထည့်သွင်းပါ 👇",
    apps: [
      { label: "📲 Outline — Google Play", url: "https://play.google.com/store/apps/details?id=org.outline.android.client" },
    ],
  },
  macos: {
    text:
      `💻 <b>macOS — Outline</b>\n\n` +
      `${EMO.OUTLINE} <b>Outline</b> — Mac App Store မှ download ဆွဲပြီး\n` +
      "VPN key ကို app ထဲ ထည့်သွင်းပါ 👇",
    apps: [
      { label: "📲 Outline — Mac App Store", url: "https://apps.apple.com/app/id1356177741" },
    ],
  },
  windows: {
    text:
      `🪟 <b>Windows — Outline</b>\n\n` +
      `${EMO.OUTLINE} <b>Outline</b> — download ဆွဲပြီး install လုပ်ကာ\n` +
      "VPN key ကို app ထဲ ထည့်သွင်းပါ 👇",
    apps: [
      { label: "📲 Outline — Windows", url: "https://getoutline.org/get-started/#step-3" },
    ],
  },
};

// Level 3 — VLESS / Xray: Xray-core clients per OS
export const DL_VLESS_PLATFORMS = {
  ios: {
    text:
      "🍎 <b>iPhone / iPad — VLESS App ရွေးချယ်ပါ</b>\n\n" +
      `• ${EMO.HIDDIFY} <b>Hiddify</b> — VLESS + Outline + Hysteria2 (အကြံပြု)\n` +
      `• ${EMO.V2BOX} <b>V2Box</b> — VLESS + Outline\n` +
      `• ${EMO.V2RAYTUN} <b>V2rayTun</b> — VLESS\n\n` +
      "App download ဆွဲပြီး Subscription URL ကို paste လုပ်ပါ 👇",
    apps: [
      { label: "📲 Hiddify",  url: "https://apps.apple.com/app/id6596777532" },
      { label: "📲 V2Box",    url: "https://apps.apple.com/app/id6446814690" },
      { label: "📲 V2rayTun", url: "https://apps.apple.com/app/id6476628951" },
    ],
  },
  android: {
    text:
      "🤖 <b>Android — VLESS App ရွေးချယ်ပါ</b>\n\n" +
      `• ${EMO.HIDDIFY} <b>Hiddify</b> — VLESS + Outline + Hysteria2 (အကြံပြု)\n` +
      `• ${EMO.V2RAYNG} <b>V2rayNG</b> — VLESS + Outline\n\n` +
      "App download ဆွဲပြီး Subscription URL ကို paste လုပ်ပါ 👇",
    apps: [
      { label: "📲 Hiddify",  url: "https://play.google.com/store/apps/details?id=app.hiddify.com" },
      { label: "📲 V2rayNG",  url: "https://play.google.com/store/apps/details?id=com.v2ray.ang" },
    ],
  },
  macos: {
    text:
      "💻 <b>macOS — VLESS App ရွေးချယ်ပါ</b>\n\n" +
      `• ${EMO.HIDDIFY} <b>Hiddify</b> — VLESS + Outline + Hysteria2 (အကြံပြု)\n` +
      `• ${EMO.V2BOX} <b>V2Box</b> — VLESS + Outline\n\n` +
      "App download ဆွဲပြီး Subscription URL ကို paste လုပ်ပါ 👇",
    apps: [
      { label: "📲 Hiddify", url: "https://apps.apple.com/app/id6596777532" },
      { label: "📲 V2Box",   url: "https://apps.apple.com/app/id6446814690" },
    ],
  },
  windows: {
    text:
      "🪟 <b>Windows — VLESS App</b>\n\n" +
      `• ${EMO.HIDDIFY} <b>Hiddify</b> — VLESS + Outline + Hysteria2\n\n` +
      "Download ဆွဲပြီး install လုပ်ကာ Subscription URL ကို paste လုပ်ပါ 👇",
    apps: [
      { label: "📲 Hiddify — Windows", url: "https://github.com/hiddify/hiddify-app/releases/latest" },
    ],
  },
};

// ── Buy Package (🛒) flow ─────────────────────────────────────────────────────

/** Persistent keyboard button label — must match bot.hears() registration. */
export const BTN_BUY = "🛒 ပက်ကေ့ဂျ် ဝယ်ရန်";

/** First step: ask customer which protocol they want. */
export const BUY_SELECT_PROTOCOL =
  "📶 <b>Protocol ရွေးချယ်ပါ</b>\n\n" +
  "   📱 <b>Outline</b>\n" +
  "      └ Outline app ဖြင့် တစ်ဆင့်ထည့်သွင်းပြီး အသုံးပြုနိုင်သည်\n\n" +
  "   🌐 <b>VLESS</b>\n" +
  "      └ Hiddify / V2Box / V2rayTun / V2rayNG ဖြင့် အသုံးပြုနိုင်သည်";

export const BUY_PROTO_SS_BTN   = "📱 Outline";
export const BUY_PROTO_VLESS_BTN = "🌐 VLESS";

/** Prompt shown with the plan selection inline keyboard. */
export const BUY_SELECT_PLAN =
  "🛒 <b>ပက်ကေ့ဂျ် ရွေးချယ်ပါ</b>\n\n" +
  "အောက်ပါ package များမှ သင်နှစ်သက်ရာတစ်ခုကို ရွေးချယ်ပေးပါ 👇";

/** Shown when the plan list is empty or can't be loaded. */
export const BUY_NO_PLANS =
  "⚠️ ယခုအချိန်တွင် ဝယ်ယူ၍ရသော package မရှိပါ။\n" +
  "ခဏကြာပြီးနောက် ထပ်ကြိုးစားပါ သို့မဟုတ် Admin ကို ဆက်သွယ်ပါ။";

/**
 * Payment instructions sent after the customer picks a plan.
 * @param {object} plan  { name, price_mmk, data_limit_gb, duration_days }
 * @param {object} paymentInfo  { method, account, name } from reseller_miniapps
 */
export function buyPaymentInstructions(plan, paymentMethods) {
  const methodLines = (paymentMethods || [])
    .map((m) => `   • <b>${m.method}</b>: ${m.account_number}${m.account_name ? ` (${m.account_name})` : ""}`)
    .join("\n");

  return [
    `📦 <b>${plan.name}</b>`,
    `💰 ${plan.price_mmk.toLocaleString()} MMK`,
    `📊 ${plan.data_limit_gb} GB  |  ⏰ ${plan.duration_days} ရက်`,
    "",
    "💳 <b>ငွေပေးချေနည်း</b>",
    methodLines || "   ➡️ Admin ကို တိုက်ရိုက် ဆက်သွယ်ပါ",
    "",
    "📸 ငွေလွှဲပြီးပါက <b>ငွေပေးချေမှု screenshot</b> ကို ဤ chat တွင် ပေးပို့ပါ 👇",
    "",
    "⏱ <i>မိနစ် ၁၀ အတွင်း screenshot မပေးပို့ပါက အော်ဒါ ဆက်မလုပ်ဆောင်ပဲ ဖျက်သွားမည်ဖြစ်သည်။</i>",
  ].join("\n");
}

/** Shown while the bot processes the screenshot (downloading + provisioning). */
export const BUY_PROCESSING =
  "⏳ စစ်ဆေးနေပါသည်... ခဏစောင့်ပါ 🙏";

/**
 * Success message sent to the customer after the key is provisioned.
 * @param {string} planName
 * @param {string} dynamicUrl   subscription URL for the key
 * @param {string} expiryDate   YYYY-MM-DD
 */
export function buySuccessText(planName, dynamicUrl, expiryDate, formatBurmeseDate) {
  return [
    `✅ <b>${planName}</b> ပက်ကေ့ဂျ် စတင်ပါပြီ!`,
    "",
    "🔑 သင်၏ VPN Key (Subscription URL):",
    `<pre>${dynamicUrl}</pre>`,
    "",
    "အထက်ပါ URL ကို copy ကူး၍ <b>Hiddify</b> app တွင် ထည့်သွင်းပါ။",
    "",
    `📅 သက်တမ်းကုန်ရက်: ${expiryDate ? formatBurmeseDate(expiryDate) : "—"}`,
    "",
    "⚠️ ငွေပေးချေမှုကို Reseller မှ စစ်ဆေးနေပါသည်။ မမှန်ကန်ပါက ဝန်ဆောင်မှု ရပ်နားမည်ဖြစ်သည်။",
  ].join("\n");
}

/** Shown when the customer already has an active purchase order. */
export const BUY_ALREADY_ACTIVE =
  "ℹ️ သင့်တွင် လက်ရှိ active package ရှိနေပြီဖြစ်သည်။\n\n" +
  "Package သက်တမ်းကုန်မှ ဝယ်ယူ၍ ရပါမည်။\n" +
  "📊 လက်ကျန် GB စစ်ဆေးရန် — <b>📊 လက်ကျန်စစ်ရန်</b> ကို နှိပ်ပါ။";

/** Shown when the customer cancels the buy flow. */
export const BUY_CANCELLED =
  "❌ ပက်ကေ့ဂျ် ဝယ်ယူမှု ဖျက်သိမ်းပါပြီ။\n" +
  "ပြန်လည် ဝယ်ယူလိုပါက 🛒 ကိုနှိပ်ပါ။";

/** Generic error during purchase. */
export const BUY_ERROR =
  "⚠️ ဝယ်ယူမှုတွင် အမှားဖြစ်သွားသည်။ ထပ်ကြိုးစားပါ သို့မဟုတ် Admin ကို ဆက်သွယ်ပါ။";

/** Shown when customer sends a photo but there's no active buy session. */
export const BUY_NO_SESSION =
  "📸 Screenshot ရရှိပါပြီ — သို့သော် ဝယ်ယူမှု session မရှိပါ။\n" +
  "ဝယ်ယူရန် 🛒 <b>ပက်ကေ့ဂျ် ဝယ်ရန်</b> ကိုနှိပ်ပြီး package ရွေးပါ။";

// ── Reseller notification strings ─────────────────────────────────────────────

/**
 * Caption for the photo notification sent to the reseller.
 * @param {object} p  { customerName, planName, priceMmk, durationDays, dataLimitGb, orderId }
 */
export function resellerNotifyCaption({ customerName, planName, priceMmk, durationDays, dataLimitGb, orderId }) {
  return [
    "💰 <b>ငွေပေးချေမှု ရောက်ရှိလာပါပြီ</b>",
    "",
    `👤 Customer: <b>${customerName}</b>`,
    `📦 Package: <b>${planName}</b>`,
    `💵 ${priceMmk.toLocaleString()} MMK  |  📊 ${dataLimitGb} GB  |  ⏰ ${durationDays} ရက်`,
    "",
    `🆔 Order: <code>${orderId}</code>`,
    "",
    "✅ မှန်ကန်ပါက <b>အတည်ပြုမည်</b> ကို နှိပ်ပါ\n❌ မမှန်ကန်ပါက <b>ငြင်းပယ်မည်</b> ကို နှိပ်ပါ",
  ].join("\n");
}

/** Inline button labels for the reseller notification. */
export const NOTIFY_CONFIRM_BTN = "✅ အတည်ပြုမည်";
export const NOTIFY_REJECT_BTN  = "❌ ငြင်းပယ်မည်";

/** Caption suffix appended when the reseller takes action. */
export const NOTIFY_CONFIRMED = "\n\n✅ <b>ငွေပေးချေမှု အတည်ပြုပြီး</b>";
export const NOTIFY_REJECTED  = "\n\n❌ <b>ငြင်းပယ်ပြီး — ဝန်ဆောင်မှု ရပ်နားသွားမည်</b>";

/** DM sent to the customer after the reseller confirms. */
export const CUSTOMER_PAYMENT_CONFIRMED =
  "✅ <b>ငွေပေးချေမှု အတည်ပြုပါပြီ</b> 🎉\n\n" +
  "🔑 VPN Key ရယူရန် — <b>🔑 VPN Key ရယူရန်</b> ကို နှိပ်ပါ";

/** DM sent to the customer after the reseller rejects. */
export const CUSTOMER_PAYMENT_REJECTED =
  "❌ <b>ငွေပေးချေမှု အတည်မပြုနိုင်ပါ</b>\n\n" +
  "ငွေပေးချေမှု မမှန်ကန်သောကြောင့် ဝန်ဆောင်မှု ရပ်နားသွားပါပြီ။\n\n" +
  "အသေးစိတ် မေးမြန်းရန် Admin ကို ဆက်သွယ်ပါ 👇";

// ── Trial Key (🎁) flow ───────────────────────────────────────────────────────

/** Protocol picker shown when customer taps BTN_TRIAL. */
export const TRIAL_SELECT_PROTOCOL =
  "🎁 <b>Trial Key ရယူမည်</b>\n\n" +
  "Protocol တစ်ခု ရွေးချယ်ပါ —\n\n" +
  "   📱 <b>Outline</b>\n" +
  "      └ Outline app ဖြင့် အသုံးပြုနိုင်သည်\n\n" +
  "   🌐 <b>VLESS</b>\n" +
  "      └ Hiddify / V2Box / V2rayTun / V2rayNG ဖြင့် အသုံးပြုနိုင်သည်";

/** Shown while creating the trial order + provisioning the key. */
export const TRIAL_PROCESSING =
  "⏳ Trial Key ဖန်တီးနေသည်... ခဏစောင့်ပါ 🙏";

/** Shown when the customer has already used their one-time trial. */
export const TRIAL_ALREADY_USED =
  "ℹ️ Trial Key ကို တစ်ကြိမ်သာ ရယူခွင့်ရှိသည်။\n\n" +
  "• Package ဝယ်ယူရန် 🛒 <b>ပက်ကေ့ဂျ် ဝယ်ရန်</b> ကို နှိပ်ပါ။";

/** Shown when customer taps trial button but has never done /start. */
export const TRIAL_NO_ACCOUNT =
  "⚠️ အကောင့် မရှိပါ။ /start ကို ဦးစွာ နှိပ်ပါ။";

/** Generic error during trial creation/provisioning. */
export const TRIAL_ERROR =
  "⚠️ Trial Key ဖန်တီးရာတွင် အမှားဖြစ်သွားသည်။\n" +
  "ခဏကြာပြီးနောက် ထပ်ကြိုးစားပါ သို့မဟုတ် Admin ကို ဆက်သွယ်ပါ။";

// ── VLEOutline key display ─────────────────────────────────────────────────────────

/**
 * Instructions shown alongside the VLESS QR code image.
 * The URL is also included in the caption as <code> for tap-to-copy.
 */

// ── How to Use (📖) handler ────────────────────────────────────────────────────

/**
 * Static Burmese how-to instructions.
 * @param {string} supportUsername  reseller_miniapps.support_username (no @), or "".
 */
/** How-to for Outline customers (Outline app). */
export function howToUseSS() {
  return [
    "📖 <b>VPN အသုံးပြုနည်း — Outline</b>",
    "",
    "1️⃣ <b>Outline</b> app ကို download ဆွဲပါ",
    "   📥 <b>App ဒေါင်းလုပ်</b> → <b>Outline</b> → device ရွေးချယ်ပါ",
    "",
    "2️⃣ Bot မှ 🔑 <b>VPN Key ရယူရန်</b> ကို နှိပ်ပါ",
    "   (Outline key / QR code ရပါမည်)",
    "",
    "3️⃣ Outline app ကိုဖွင့်ပြီး key ထည့်ပါ",
    "   • QR scan — camera icon ကို နှိပ်ပြီး QR scan လုပ်ပါ",
    "   • Manual — key ကို copy ကူး၍ app ထဲ paste ပါ",
    "",
    "4️⃣ <b>Connect</b> ကို နှိပ်လိုက်ပါ ✅",
    "",
    "⚠️ အကူညီလိုအပ်ပါက အောက်ပါ Admin ကို ဆက်သွယ်ပါ 👇",
  ].join("\n");
}

/** How-to for VLESS customers (Hiddify / Xray-core clients). */
export function howToUseVless() {
  return [
    "📖 <b>VPN အသုံးပြုနည်း — VLESS / Xray</b>",
    "",
    "1️⃣ <b>Hiddify</b> (သို့) Xray-core app တစ်ခု download ဆွဲပါ",
    "   📥 <b>App ဒေါင်းလုပ်</b> → <b>VLESS / Xray</b> → device ရွေးချယ်ပါ",
    "",
    "2️⃣ Bot မှ 🔑 <b>VPN Key ရယူရန်</b> ကို နှိပ်ပါ",
    "   (Subscription URL + QR code ရပါမည်)",
    "",
    "3️⃣ App ထဲ Subscription URL ထည့်ပါ",
    "   • QR scan — app ၏ QR / scan button ကို နှိပ်ပြီး scan လုပ်ပါ",
    "   • URL copy — URL ကို copy ကူး၍ app ထဲ paste ပါ",
    "",
    "4️⃣ Server ရွေးပြီး <b>Connect</b> ကို နှိပ်လိုက်ပါ ✅",
    "",
    "💡 Subscription URL တစ်ခုတည်းဖြင့် server အားလုံး ရရှိနိုင်သည်",
    "",
    "⚠️ အကူညီလိုအပ်ပါက အောက်ပါ Admin ကို ဆက်သွယ်ပါ 👇",
  ].join("\n");
}

/** Full guide shown when the customer's protocol is unknown. */
export function howToUse() {
  return [
    "📖 <b>VPN အသုံးပြုနည်း</b>",
    "",
    "━━━━ 📱 Outline ━━━━",
    "",
    "1️⃣ <b>Outline</b> app ကို download ဆွဲပါ",
    "   📥 <b>App ဒေါင်းလုပ်</b> → <b>Outline</b> → device ရွေးပါ",
    "",
    "2️⃣ Bot မှ 🔑 <b>VPN Key ရယူရန်</b> ကို နှိပ်ပါ",
    "",
    "3️⃣ Outline ထဲ key ထည့်ပြီး <b>Connect</b> ✅",
    "",
    "━━━━ 🌐 VLESS / Xray ━━━━",
    "",
    "1️⃣ <b>Hiddify</b> (သို့) Xray client app download ဆွဲပါ",
    "   📥 <b>App ဒေါင်းလုပ်</b> → <b>VLESS / Xray</b> → device ရွေးပါ",
    "",
    "2️⃣ Bot မှ 🔑 <b>VPN Key ရယူရန်</b> ကို နှိပ်ပါ",
    "   (Subscription URL + QR code ရပါမည်)",
    "",
    "3️⃣ App ထဲ URL paste (သို့) QR scan ပြီး <b>Connect</b> ✅",
    "",
    "⚠️ အကူညီလိုအပ်ပါက အောက်ပါ Admin ကို ဆက်သွယ်ပါ 👇",
  ].join("\n");
}
