/**
 * strings.js — All Burmese UI text for the NovaNet MM bot.
 *
 * REPLACE STUB TEXT with final Burmese copy before launch.
 * Functions accept dynamic values (brandName, etc.) and return the full string.
 * All message strings are for HTML parse_mode — use <b>, <i>, <code> tags.
 */

// Legacy reply-keyboard labels remain recognized for chats opened before the
// inline-menu release. New navigation uses callback buttons with these labels.

export const BTN = {
  KEY:      "🔑 ကျွန်ုပ်၏ VPN Key",
  BALANCE:  "📊 ဒေတာနှင့် သက်တမ်းစစ်ရန်",
  SERVER:   "🌐 ဆာဗာ ပြောင်းရန်",
  DOWNLOAD: "📥 VPN App ရယူရန်",
  HOWTO:    "📖 အသုံးပြုနည်း လမ်းညွှန်",
};

export const LEGACY_BTN = {
  KEY: "🔑 VPN Key ရယူရန်",
  BALANCE: "📊 လက်ကျန်စစ်ရန်",
  SERVER: "🌐 Server ပြောင်းရန်",
  DOWNLOAD: "📥 App ဒေါင်းလုပ်",
  HOWTO: "📖 အသုံးပြုနည်း",
  TRIAL: "🎁 အစမ်းသုံး ရယူရန်",
  BUY: "🛒 ပက်ကေ့ဂျ် ဝယ်ရန်",
};

/** One-time trial label. Older reply keyboards use LEGACY_BTN.TRIAL. */
export const BTN_TRIAL = "🎁 အခမဲ့ စမ်းသုံးမည်";

// ── /start ─────────────────────────────────────────────────────────────────────

/**
 * Welcome message sent on /start.
 * @param {string} brandName  Reseller's brand_name from reseller_miniapps.
 */
export function startWelcome(brandName) {
  return `🌐 <b>${brandName}</b> မှ နွေးထွေးစွာ ကြိုဆိုပါသည်! 🎉\n\nလိုင်းပိတ်ပင်မှုမရှိဘဲ လုံခြုံစွာ အင်တာနက် အသုံးပြုနိုင်ရန် VPN ဝန်ဆောင်မှု ပေးနေပါသည်။`;
}

export const START_CTA_TEXT = "အောက်ပါခလုတ်များမှ မိမိအသုံးပြုလိုရာကို ရွေးချယ်ပါ 👇";
export const MENU_MY_VPN = "🛡️ ကျွန်ုပ်၏ VPN";
export const MENU_HELP = "💬 အကူအညီနှင့် လမ်းညွှန်";
export const MENU_BACK = "⬅️ နောက်သို့";
export const MENU_HOME = "🏠 ပင်မသို့";
export const MENU_MY_VPN_TEXT = "<b>ကျွန်ုပ်၏ VPN</b>\nအသုံးပြုလိုသည့်အရာကို ရွေးချယ်ပါ။";
export const MENU_HELP_TEXT = "<b>အကူအညီနှင့် လမ်းညွှန်</b>\nသိလိုသည့်အရာကို ရွေးချယ်ပါ။";

/** Inline button labels on /start */
export const START_BTN_ADMIN        = "👤 Admin / Support";
export const START_BTN_TRIAL_KEY    = BTN_TRIAL;
export const START_BTN_GET_KEY      = BTN.KEY;
export const START_BTN_BUY_PACKAGE  = "🛒 ပက်ကေ့ဂျ် ဝယ်ယူမည်";

/** Callback data for the /start inline buttons. */
export const START_CB_GET_KEY   = "start:get_key";
export const START_CB_GET_TRIAL = "start:get_trial";

export function appOpenText(brandName) {
  const name = brandName || "VPN";
  return `📱 <b>${name} Mini App</b> တွင် ဆာဗာများ၊ ပက်ကေ့ဂျ်များနှင့် အကောင့်အချက်အလက်များကို စီမံခန့်ခွဲနိုင်ပါသည် 👇`;
}

export const APP_BTN_OPEN = "📱 Mini App ဖွင့်ရန်";
export const APP_UNAVAILABLE = "⚠️ Mini App ကို ယခု ဖွင့်၍ မရသေးပါ။ ခဏအကြာတွင် ထပ်မံကြိုးစားပါ။";
export const COMMAND_START_REQUIRED = "ပထမဆုံး /start ကို နှိပ်ပြီး အကောင့်ဖွင့်ပါ။ ထို့နောက် ဤလုပ်ဆောင်ချက်ကို ပြန်ရွေးနိုင်ပါသည်။";

// ── Get Key (🔑) handler ──────────────────────────────────────────────────────

/**
 * Header line shown above the key when a customer has an active key.
 * @param {string} customerName  vpn_customers.full_name
 */
export function keyFoundHeader(customerName) {
  return `🔑 <b>${customerName}</b> အတွက် VPN ချိတ်ဆက်ရန် Key:`;
}

/**
 * Server line shown below the key.
 * @param {string} flag        Real flag emoji (falls back to 🌐 — see
 *                              resolveServerDisplay() in handlers.js)
 * @param {string} serverName  Real city/country name, not the raw internal
 *                              server slug — same fallback the dashboards use
 */
export function keyServerLine(flag, serverName) {
  return `🌐 ချိတ်ဆက်ထားသော ဆာဗာ: ${flag} <b>${serverName}</b>`;
}

/**
 * Copy instructions shown below the subscription URL on the key message.
 * The URL is wrapped in <code> by the caller (tap-to-copy on all Telegram clients).
 */
/** Shown under the Outline ssconf:// key */
export const KEY_COPY_INSTRUCTIONS_SS =
  "📋 <b>အသုံးပြုနည်း:</b>\n၁။ အထက်ပါ Key ကို နှိပ်ပြီး Copy ယူပါ\n" +
  "၂။ <b>Outline App</b> ကိုဖွင့်ပြီး ထည့်သွင်းပါ\n၃။ <b>Connect</b> ကိုနှိပ်ပါ ✅\n\n" +
  "App မရှိသေးပါက အောက်ပါ 📥 VPN App ရယူရန် ကို နှိပ်ပါ။";

/** Shown under the VLESS subscription URL + QR */
export const KEY_COPY_INSTRUCTIONS =
  "📋 <b>အသုံးပြုနည်း:</b>\n၁။ အထက်ပါ QR ကို Scan ဖတ်ပါ (သို့) Key ကို Copy ယူပါ\n" +
  "၂။ <b>Happ / Hiddify / V2Box</b> ထဲတွင် ထည့်သွင်းပါ\n" +
  "၃။ ဆာဗာရွေးချယ်ပြီး <b>Connect</b> ကို နှိပ်ပါ ✅\n\n" +
  "App မရှိသေးပါက အောက်ပါ 📥 VPN App ရယူရန် ကို နှိပ်ပါ။";

/** Inline button label — opens the app download picker */
export const KEY_BTN_DOWNLOAD = BTN.DOWNLOAD;

/** Shown when the customer has no active order or no provisioned key */
export const KEY_NO_ACTIVE =
  "လက်ရှိ အသုံးပြုနိုင်သော VPN Key မရှိပါ။\n\nအောက်ပါခလုတ်မှ ပက်ကေ့ဂျ် ဝယ်ယူနိုင်ပါသည် 👇";

/** Generic error shown when the DB/network lookup fails */
export const KEY_ERROR =
  "⚠️ Key ရယူရာတွင် အမှားဖြစ်သွားသည်။ ခဏကြာပြီးနောက် ထပ်ကြိုးစားပါ။";

// ── Check Balance (📊) handler ─────────────────────────────────────────────────

export const BALANCE_TEXT =
  "📊 <b>သင်၏ VPN ဒေတာနှင့် သက်တမ်း အခြေအနေ</b>\n\n" +
  "အသေးစိတ်အချက်အလက်များကို Mini App တွင် ကြည့်ရှုနိုင်ပါသည်။";

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
export function balanceText({
  usedGb,
  remainingGb,
  isUnlimited,
  expiryDate,
  formatBurmeseDate,
  queuedPlan = null,
}) {
  const remainingLine = isUnlimited
    ? "🔓 အကန့်အသတ်မရှိ (Unlimited)"
    : remainingGb != null
      ? `${remainingGb} GB`
      : "-";

  let queuedSection = "";
  if (queuedPlan) {
    const qData = queuedPlan.dataLimitGb ? `${queuedPlan.dataLimitGb} GB` : "Unlimited";
    const qDays = queuedPlan.durationDays ? `${queuedPlan.durationDays} ရက်` : "";
    queuedSection =
      "\n\n⏳ <b>ကြိုတင်ဝယ်ယူထားသော နောက်ပက်ကေ့ဂျ်:</b>\n" +
      `📦 <b>${queuedPlan.planName}</b>\n` +
      `📊 ဒေတာ: <b>${qData}</b>  |  ⏰ သက်တမ်း: <b>${qDays}</b>\n` +
      "ℹ️ <i>လက်ရှိပက်ကေ့ဂျ် ကုန်ဆုံးပြီးမှ အလိုအလျောက် စတင်ပါမည်။</i>";
  }

  const expiryLine = expiryDate ? `\n📅 သက်တမ်းကုန်ဆုံးမည့်ရက်: ${formatBurmeseDate(expiryDate)}` : "";

  return (
    "📊 <b>သင်၏ VPN ဒေတာနှင့် သက်တမ်း အခြေအနေ:</b>\n\n" +
    `📈 အသုံးပြုထားသော ဒေတာ: <b>${usedGb} GB</b>\n` +
    `📉 ကျန်ရှိသော ဒေတာ: <b>${remainingLine}</b>` +
    expiryLine +
    queuedSection +
    "\n\nအသေးစိတ်အချက်အလက်များကို Mini App တွင်လည်း ကြည့်ရှုနိုင်ပါသည် 👇"
  );
}

/**
 * Shown when the customer has no active order but has a queued package waiting.
 * @param {object} params
 * @param {object} params.queuedPlan
 */
export function balanceQueuedOnlyText({ queuedPlan }) {
  const qData = queuedPlan.dataLimitGb ? `${queuedPlan.dataLimitGb} GB` : "Unlimited";
  const qDays = queuedPlan.durationDays ? `${queuedPlan.durationDays} ရက်` : "";
  return (
    "📊 <b>သင်၏ VPN အကောင့် အခြေအနေ:</b>\n\n" +
    "ℹ️ လက်ရှိ အသုံးပြုနိုင်သော ပက်ကေ့ဂျ် မရှိပါ။\n\n" +
    "⏳ <b>ကြိုတင်ဝယ်ယူထားသော နောက်ပက်ကေ့ဂျ်:</b>\n" +
    `📦 <b>${queuedPlan.planName}</b>\n` +
    `📊 ဒေတာ: <b>${qData}</b>  |  ⏰ သက်တမ်း: <b>${qDays}</b>\n\n` +
    "အသေးစိတ်အချက်အလက်များကို Mini App တွင် ကြည့်ရှုနိုင်ပါသည်။"
  );
}

export const BALANCE_BTN_OPEN = "📱 Mini App ဖွင့်ရန်";

// ── Change Server (🌐) handler ─────────────────────────────────────────────────

export const SERVER_BTN_OPEN = "🌐 Change Server";

/** Shown when the customer has never done /start. */
export const SERVER_NO_ACCOUNT =
  "⚠️ အကောင့် မရှိပါ။ /start ကို ဦးစွာ နှိပ်ပါ။";

/** Shown when the customer has no active order. */
export const SERVER_NO_ACTIVE =
  "ဆာဗာ ပြောင်းလဲရန် လက်ရှိအသုံးပြုနိုင်သော ပက်ကေ့ဂျ် လိုအပ်ပါသည်။ အောက်ပါခလုတ်မှ ဝယ်ယူနိုင်ပါသည် 👇";

/** Shown when a PREMIUM customer's active key uses VLESS — subscription covers all nodes. */
export const SERVER_VLESS_EXPLAIN =
  "🌐 <b>ဆာဗာ ရွေးချယ်မှု လမ်းညွှန်</b>\n\n" +
  "အသုံးပြုနိုင်သော ဆာဗာများကို <b>Happ / Hiddify / V2Box</b> App ထဲတွင် ကြည့်ရှုနိုင်ပါသည်။\n\n" +
  "ဆာဗာ ပြောင်းလဲလိုပါက App ထဲရှိ ဆာဗာစာရင်းမှ ရွေးချယ်ပါ။";

/** Shown when a TRIAL customer's active key uses VLESS — trial node only. */
export const SERVER_VLESS_TRIAL =
  "⚡ <b>အစမ်းသုံး ဆာဗာ သီးသန့် ချိတ်ဆက်မှု</b>\n\n" +
  "အစမ်းသုံး Key ဖြင့် သတ်မှတ်ထားသော အစမ်းသုံး ဆာဗာကိုသာ ချိတ်ဆက်နိုင်ပါသည်။\n\n" +
  "အခြားဆာဗာများ အသုံးပြုလိုပါက ပက်ကေ့ဂျ် ဝယ်ယူနိုင်ပါသည်။";

/**
 * Header for the server picker inline keyboard.
 * @param {boolean} isTrial  True when the customer is on a trial order.
 */
export function serverChooseText(isTrial) {
  const trialNote = isTrial
    ? "\n\n🔒 Premium ဆာဗာများ အသုံးပြုရန် ဝယ်ယူထားသော ပက်ကေ့ဂျ် လိုအပ်ပါသည်။"
    : "";
  return (
    "🌐 <b>ချိတ်ဆက်လိုသည့် ဆာဗာကို ရွေးချယ်ပါ</b>\n\n" +
    "အသုံးပြုလိုသော ဆာဗာတစ်ခုကို နှိပ်ပါ 👇" +
    trialNote
  );
}

/** Shown while the bot performs the server switch. */
export const SERVER_SWITCHING =
  "⏳ ဆာဗာ ပြောင်းလဲပေးနေပါသည်... ခဏစောင့်ဆိုင်းပေးပါ 🙏";

/**
 * Shown on successful server switch.
 * @param {string} flag   Flag emoji for the new server.
 * @param {string} name   Display name for the new server.
 */
export function serverSwitchSuccess(flag, name) {
  return (
    `✅ <b>${flag} ${name}</b> သို့ ပြောင်းလဲပြီးပါပြီ!\n\n` +
    "Key အသစ်ကို ရယူရန် ပင်မသို့ ပြန်သွားပြီး ကျွန်ုပ်၏ VPN ကို ဖွင့်ပါ။"
  );
}

/** Shown when a trial customer taps a premium server. */
export const SERVER_TRIAL_LOCKED =
  "🔒 <b>Premium ဆာဗာ ဖြစ်ပါသည်</b>\n\n" +
  "အစမ်းသုံး ပက်ကေ့ဂျ်ဖြင့် အစမ်းသုံး ဆာဗာကိုသာ ချိတ်ဆက်နိုင်ပါသည်။\n" +
  "Premium ဆာဗာ အသုံးပြုရန် ပင်မသို့ ပြန်သွားပြီး ပက်ကေ့ဂျ် ဝယ်ယူပါ။";

/** Shown when the customer taps the server they are already connected to. */
export const SERVER_ALREADY_LINKED =
  "✅ လက်ရှိတွင် ဤဆာဗာနှင့် ချိတ်ဆက်ထားပြီး ဖြစ်ပါသည်";

/** Shown when the customer has no provisioned key yet. */
export const SERVER_NO_KEY =
  "⚠️ VPN Key မရှိသေးပါ။\n\n" +
  "ပင်မသို့ ပြန်သွားပြီး ကျွန်ုပ်၏ VPN မှ Key ကို စစ်ဆေးပါ။ ထို့နောက် ဆာဗာ ပြောင်းနိုင်ပါသည်။";

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
  "<b>App ဒေါင်းလုဒ်</b>\n\nဘယ် App ကို သုံးမလဲ?";

export const DL_PROTO_BTNS = {
  SS:    "📱 Outline",
  VLESS: "Hiddify / Happ / V2Box",
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
  `${EMO.HIDDIFY} <b>Hiddify / Happ / V2Box</b>\n\nသုံးမည့်စက်ကို ရွေးပါ။`;

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
      "🍎 <b>iPhone / iPad</b>\n\nApp ကို ရွေးပြီး VPN လင့်ခ် ထည့်ပါ။",
    apps: [
      { label: "📲 Hiddify",  url: "https://apps.apple.com/app/id6596777532" },
      { label: "📲 Happ",     url: "https://apps.apple.com/app/id6504287215" },
      { label: "📲 V2Box",    url: "https://apps.apple.com/app/id6446814690" },
      { label: "📲 V2rayTun", url: "https://apps.apple.com/app/id6476628951" },
    ],
  },
  android: {
    text:
      "🤖 <b>Android</b>\n\nApp ကို ရွေးပြီး VPN လင့်ခ် ထည့်ပါ။",
    apps: [
      { label: "📲 Hiddify",  url: "https://play.google.com/store/apps/details?id=app.hiddify.com" },
      { label: "📲 Happ",     url: "https://play.google.com/store/apps/details?id=com.happproxy" },
      { label: "📲 V2rayNG",  url: "https://play.google.com/store/apps/details?id=com.v2ray.ang" },
    ],
  },
  macos: {
    text:
      "💻 <b>macOS</b>\n\nApp ကို ရွေးပြီး VPN လင့်ခ် ထည့်ပါ။",
    apps: [
      { label: "📲 Hiddify", url: "https://apps.apple.com/app/id6596777532" },
      { label: "📲 Happ",    url: "https://apps.apple.com/app/id6504287215" },
      { label: "📲 V2Box",   url: "https://apps.apple.com/app/id6446814690" },
    ],
  },
  windows: {
    text:
      "🪟 <b>Windows</b>\n\nApp ကို ဒေါင်းလုဒ်လုပ်ပြီး VPN လင့်ခ် ထည့်ပါ။",
    apps: [
      { label: "📲 Hiddify — Windows", url: "https://github.com/hiddify/hiddify-app/releases/latest" },
    ],
  },
};

// ── Buy Package (🛒) flow ─────────────────────────────────────────────────────

/** Buy label, also recognized from older reply keyboards. */
export const BTN_BUY = "🛒 ပက်ကေ့ဂျ် ဝယ်ယူမည်";

/** First step: ask customer which protocol they want. */
export const BUY_SELECT_PROTOCOL =
  "<b>အသုံးပြုလိုသည့် App ရွေးချယ်ပါ</b>\n\n" +
  "📱 <b>Outline App</b>\n🌐 <b>Happ / Hiddify / V2Box</b>";

export const BUY_PROTO_SS_BTN   = "📱 Outline";
export const BUY_PROTO_VLESS_BTN = "Hiddify / Happ / V2Box";

/** Prompt shown with the plan selection inline keyboard. */
export const BUY_SELECT_PLAN =
  "🛒 <b>ပက်ကေ့ဂျ် ရွေးချယ်ရန်</b>\n\n" +
  "အသုံးပြုလိုသည့် ဒေတာပမာဏနှင့် သက်တမ်းကို ရွေးချယ်ပါ 👇";

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
    `💰 ကျသင့်ငွေ: <b>${plan.price_mmk.toLocaleString()} MMK</b>`,
    `📊 ဒေတာ: <b>${plan.data_limit_gb} GB</b>  |  ⏰ သက်တမ်း: <b>${plan.duration_days} ရက်</b>`,
    "",
    "💳 <b>ငွေပေးချေရမည့် အကောင့်များ</b>",
    methodLines || "   ➡️ Admin ကို တိုက်ရိုက် ဆက်သွယ်ပါ",
    "",
    "📸 ငွေလွှဲပြီးပါက <b>ငွေလွှဲပြေစာ (Screenshot)</b> ကို ဤ chat တွင် ပေးပို့ပါ 👇",
    "",
    "⏱ <i>ဤဝယ်ယူမှုအဆင့်သည် ၁၀ မိနစ်သာ အကျုံးဝင်ပါသည်။ ထိုအချိန်အတွင်း ပြေစာ ပေးပို့ပါ။</i>",
  ].join("\n");
}

/** Shown while the bot processes the screenshot (downloading + provisioning). */
export const BUY_PROCESSING =
  "⏳ ပြေစာကို လက်ခံရရှိပြီး ဆောင်ရွက်နေပါသည်... ခဏစောင့်ဆိုင်းပေးပါ 🙏";

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

/** Shown when the customer already has an active purchase order and a queued order. */
export const BUY_ALREADY_QUEUED =
  "ℹ️ လက်ရှိပက်ကေ့ဂျ်အပြင် ကြိုတင်ဝယ်ယူထားသော နောက်ပက်ကေ့ဂျ်တစ်ခု ရှိပြီးဖြစ်ပါသည်။\n\n" +
  "နောက်ထပ် ဝယ်ယူနိုင်မည့်အချိန်တွင် ပြန်လည်ကြိုးစားပါ။\n" +
  "အသေးစိတ်ကြည့်ရန် ပင်မသို့ ပြန်သွားပြီး ဒေတာနှင့် သက်တမ်းကို စစ်ဆေးပါ။";

export const BUY_PAYMENT_UNDER_REVIEW =
  "⏳ လက်ရှိဝယ်ယူမှု၏ ငွေပေးချေမှုကို စစ်ဆေးနေပါသည်။ အတည်ပြုပြီးမှ နောက်ပက်ကေ့ဂျ်ကို ဝယ်ယူနိုင်ပါမည်။";

/** Shown when the customer already has an active purchase order. */
export const BUY_ALREADY_ACTIVE =
  "ℹ️ လက်ရှိ ပက်ကေ့ဂျ် ရှိနေပါသည်။ ဤဝယ်ယူမှုကို ဆက်မလုပ်ဆောင်နိုင်ခဲ့ပါ။\n\n" +
  "ပင်မသို့ ပြန်သွားပြီး ထပ်မံကြိုးစားပါ။ အဆင်မပြေပါက သင့်ရောင်းချသူထံ ဆက်သွယ်ပါ။";

/** Shown when customer purchases an extension/queued plan. */
export function buyExtendSuccessText(planName, durationDays, dataLimitGb) {
  return [
    `✅ <b>${planName}</b> ကို နောက်အသုံးပြုမည့် ပက်ကေ့ဂျ်အဖြစ် မှတ်တမ်းတင်ပြီးပါပြီ။`,
    "",
    `📊 ဒေတာ: <b>${dataLimitGb} GB</b>  |  ⏰ သက်တမ်း: <b>${durationDays} ရက်</b>`,
    "",
    "ℹ️ လက်ရှိပက်ကေ့ဂျ် ကုန်ဆုံးပြီးမှ နောက်ပက်ကေ့ဂျ် စတင်ပါမည်။ ယခု Key အသစ် ထုတ်ပေးမည်မဟုတ်ပါ။",
    "",
    "⚠️ ငွေပေးချေမှုကို Reseller မှ စစ်ဆေးနေပါသည်။",
  ].join("\n");
}

/** Shown when the customer cancels the buy flow. */
export const BUY_CANCELLED =
  "ပက်ကေ့ဂျ် ဝယ်ယူမှုကို ပယ်ဖျက်လိုက်ပါပြီ။\n\n" +
  "ပြန်လည်ဝယ်ယူလိုပါက ပင်မမှ ပက်ကေ့ဂျ် ဝယ်ယူမည်ကို ရွေးချယ်နိုင်ပါသည်။";

/** Generic error during purchase. */
export const BUY_ERROR =
  "⚠️ ဝယ်ယူမှုတွင် အမှားဖြစ်သွားသည်။ ထပ်ကြိုးစားပါ သို့မဟုတ် Admin ကို ဆက်သွယ်ပါ။";

/** Shown when customer sends a photo but there's no active buy session. */
export const BUY_NO_SESSION =
  "📸 ပြေစာကို ရရှိပါသည်။ သို့သော် ၎င်းကို ချိတ်ဆက်ရန် ဝယ်ယူမှုအဆင့် မရှိပါ။\n\n" +
  "/start ဖြင့် ပင်မသို့ ပြန်သွားပါ။ ပက်ကေ့ဂျ်ကို ရွေးပြီး ငွေပေးချေမှုအဆင့်တွင် ပြေစာကို ထပ်မံပေးပို့ပါ။";

// ── Reseller notification strings ─────────────────────────────────────────────

/**
 * Caption for the photo notification sent to the reseller.
 * @param {object} p  { customerName, planName, priceMmk, durationDays, dataLimitGb, orderId, isExtend }
 */
export function resellerNotifyCaption({ customerName, planName, priceMmk, durationDays, dataLimitGb, orderId, isExtend = false }) {
  const header = isExtend
    ? "💰 <b>ကြိုတင်ဝယ်ယူမှု ငွေလွှဲပြေစာ ရောက်ရှိလာပါပြီ</b>"
    : "💰 <b>ငွေလွှဲပြေစာ အသစ် ရောက်ရှိလာပါပြီ</b>";
  return [
    header,
    "",
    `👤 ဝယ်ယူသူ: <b>${customerName}</b>`,
    `📦 ပက်ကေ့ဂျ်: <b>${planName}</b>`,
    `💵 ကျသင့်ငွေ: <b>${priceMmk.toLocaleString()} MMK</b>`,
    `📊 ဒေတာ: <b>${dataLimitGb} GB</b>  |  ⏰ သက်တမ်း: <b>${durationDays} ရက်</b>`,
    "",
    `🆔 အော်ဒါအမှတ်: <code>${orderId}</code>`,
    "",
    "✅ မှန်ကန်ပါက <b>အတည်ပြုမည်</b> ကို နှိပ်ပါ\n❌ မမှန်ကန်ပါက <b>ငြင်းပယ်မည်</b> ကို နှိပ်ပါ",
  ].join("\n");
}

/** Inline button labels for the reseller notification. */
export const NOTIFY_CONFIRM_BTN = "✅ ပြေစာ အတည်ပြုမည်";
export const NOTIFY_REJECT_BTN  = "❌ ပြေစာ ငြင်းပယ်မည်";

/** Caption suffix appended when the reseller takes action. */
export const NOTIFY_CONFIRMED = "\n\n✅ <b>ငွေပေးချေမှု အတည်ပြုပြီး</b>";
export const NOTIFY_REJECTED  = "\n\n❌ <b>ငြင်းပယ်ပြီး — ဝန်ဆောင်မှု ရပ်နားသွားမည်</b>";

/** DM sent to the customer after the reseller confirms. */
export const CUSTOMER_PAYMENT_CONFIRMED =
  "✅ <b>ငွေပေးချေမှု အတည်ပြုပြီးပါပြီ</b>\n\n" +
  "လက်ရှိ Key ကို ကြည့်ရန် /start ကို နှိပ်ပြီး ကျွန်ုပ်၏ VPN ကို ဖွင့်ပါ။ " +
  "ကြိုတင်ဝယ်ယူထားသော ပက်ကေ့ဂျ်ဖြစ်ပါက လက်ရှိပက်ကေ့ဂျ် ကုန်ဆုံးပြီးမှ စတင်ပါမည်။";

/** DM sent to the customer after the reseller rejects. */
export const CUSTOMER_PAYMENT_REJECTED =
  "⚠️ <b>ငွေပေးချေမှု အတည်မပြုနိုင်ပါ</b>\n\n" +
  "ပေးပို့ထားသော ငွေလွှဲပြေစာကို အတည်မပြုနိုင်သဖြင့် ဤဝယ်ယူမှု၏ အသုံးပြုခွင့်ကို ရပ်နားထားပါသည်။\n\n" +
  "အသေးစိတ် သိရှိလိုပါက သင့်ရောင်းချသူထံ ဆက်သွယ်ပါ။";

// ── Trial Key (🎁) flow ───────────────────────────────────────────────────────

/** Protocol picker shown when customer taps BTN_TRIAL. */
export const TRIAL_SELECT_PROTOCOL =
  "🎁 <b>အခမဲ့ စမ်းသုံးမည့် App ရွေးချယ်ပါ</b>\n\n" +
  "📱 <b>Outline App</b>\n🌐 <b>Happ / Hiddify / V2Box</b>";

/** Shown while creating the trial order + provisioning the key. */
export const TRIAL_PROCESSING =
  "⏳ အစမ်းသုံး VPN Key ဖန်တီးပေးနေပါသည်... ခဏစောင့်ဆိုင်းပေးပါ 🙏";

/** Shown when the customer has already used their one-time trial. */
export const TRIAL_ALREADY_USED =
  "ℹ️ အခမဲ့စမ်းသုံးခွင့်ကို ရယူပြီးဖြစ်ပါသည်။\n\n" +
  "ဆက်လက်အသုံးပြုလိုပါက အောက်ပါ ပက်ကေ့ဂျ် ဝယ်ယူမည် ကို နှိပ်ပါ။";

/** Shown when customer taps trial button but has never done /start. */
export const TRIAL_NO_ACCOUNT =
  "⚠️ အကောင့် မရှိပါ။ /start ကို ဦးစွာ နှိပ်ပါ။";

/** Generic error during trial creation/provisioning. */
export const TRIAL_ERROR =
  "⚠️ အစမ်းသုံး Key ဖန်တီး၍ မရသေးပါ။\n" +
  "ခဏအကြာတွင် ထပ်မံကြိုးစားပါ။ အကူအညီလိုအပ်ပါက သင့်ရောင်းချသူထံ ဆက်သွယ်ပါ။";

// ── VLESS key display ─────────────────────────────────────────────────────────

/**
 * Instructions shown alongside the VLESS QR code image.
 * The URL is also included in the caption as <code> for tap-to-copy.
 */

// ── How to Use (📖) handler ────────────────────────────────────────────────────

/**
 * Static Burmese how-to instructions.
 * @param {string} supportUsername  reseller_miniapps.support_username (no @), or "".
 */
export const HOWTO_BTN_SS = "📱 Outline အသုံးပြုနည်း";
export const HOWTO_BTN_VLESS = "Hiddify / Happ / V2Box အသုံးပြုနည်း";

export const HOWTO_CB = {
  SS: "howto:ss",
  VLESS: "howto:vless",
};

/**
 * Notice appended when active protocol differs from queued protocol.
 * @param {"shadowsocks"|"vless"} queuedProtocol
 */
export function howtoQueuedNotice(queuedProtocol) {
  const isQueuedSs = queuedProtocol === "shadowsocks";
  const appName = isQueuedSs ? "Outline" : "Hiddify / Happ / V2Box";
  return (
    "<b>နောက်အသုံးပြုမည့် package</b>\n" +
    `လက်ရှိ package ကုန်သွားလျှင် <b>${appName}</b> နဲ့ သုံးပါ။`
  );
}

/** How-to for Outline customers (Outline app). */
export function howToUseSS(queuedNotice = "") {
  return [
    "<b>Outline အသုံးပြုနည်း</b>",
    "",
    "1. Outline ကို ဒေါင်းလုဒ်လုပ်ပါ။",
    "2. ကျွန်ုပ်၏ VPN မှ Key ကို ရယူပါ။",
    "3. Key ကို Outline ထဲ ထည့်ပါ။",
    "4. Connect နှိပ်ပါ။",
    ...(queuedNotice ? ["", queuedNotice] : []),
  ].join("\n");
}

/** How-to for VLESS customers (Hiddify / Xray-core clients). */
export function howToUseVless(queuedNotice = "") {
  return [
    "<b>Hiddify / Happ / V2Box အသုံးပြုနည်း</b>",
    "",
    "1. သုံးမည့် App ကို ဒေါင်းလုဒ်လုပ်ပါ။",
    "2. ကျွန်ုပ်၏ VPN မှ Key ကို ရယူပါ။",
    "3. လင့်ခ်ကို App ထဲ ထည့်ပါ (သို့) QR ဖတ်ပါ။",
    "4. Server ရွေးပြီး Connect နှိပ်ပါ။",
    ...(queuedNotice ? ["", queuedNotice] : []),
  ].join("\n");
}

/** Full guide shown when the customer's protocol is unknown. */
export function howToUse() {
  return [
    "<b>VPN အသုံးပြုနည်း</b>",
    "",
    "သုံးမည့် App ကို ရွေးပြီး အသုံးပြုနည်းကို ကြည့်ပါ။",
  ].join("\n");
}
