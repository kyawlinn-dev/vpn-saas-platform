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
  KEY:      "🔑 Outline Key ရယူရန်",
  BALANCE:  "📊 လက်ကျန်စစ်ရန်",
  SERVER:   "🌐 Server ပြောင်းရန်",
  DOWNLOAD: "📥 Download Outline",
  HOWTO:    "📖 အသုံးပြုနည်း",
};

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
    `${b(brandName)} မှ Outline VPN ဖြင့် လုံခြုံ၊မြန်ဆန်စွာ internet ကို ကမ္ဘာ့မည်သည့်နေရာမှမဆို ချိတ်ဆက်နိုင်ပါပြီ။`,
    "",
    `✅ User အသစ်များ /start နှိပ်ပြီးပါက <b>5GB trial</b> ကို အလိုအလျောက် ရရှိမည်ဖြစ်သည်။`,
    "",
    `📌 Menu ကို အသုံးပြု၍ —`,
    `   • 🔑 Outline Key ရယူနိုင်သည်`,
    `   • 📊 လက်ကျန်ဒေတာ စစ်ဆေးနိုင်သည်`,
    `   • 🌐 Server ပြောင်းလဲနိုင်သည်`,
    "",
    `အောက်ပါ menu မှ ရွေးချယ်ပါ 👇`,
  ].join("\n");
}

/** Short prompt sent alongside the Buy/Admin inline buttons (second message on /start). */
export const START_CTA_TEXT = "📲 ဘာများ ကူညီပေးရမလဲ?";

/** Inline button labels on /start */
export const START_BTN_ADMIN        = "👤 Admin / Support";
export const START_BTN_TRIAL_KEY    = "🎁 အစမ်းသုံး 5GB ရယူရန်";
export const START_BTN_GET_KEY      = "🔑 Outline Key ရယူရန်";
export const START_BTN_BUY_PACKAGE  = "🛒 Package ဝယ်ရန်";

/** Callback data for the /start inline "get key" button. Shared with KEY handler. */
export const START_CB_GET_KEY = "start:get_key";

export function appOpenText(brandName) {
  const name = brandName || "VPN";
  return [
    `Open ${name} Mini App`,
    "",
    "Use the app to check your package, server, Outline key, and payments.",
  ].join("\n");
}

export const APP_BTN_OPEN = "Open Mini App";

// ── Get Key (🔑) handler ──────────────────────────────────────────────────────

/**
 * Header line shown above the key when a customer has an active key.
 * @param {string} customerName  vpn_customers.full_name
 */
export function keyFoundHeader(customerName) {
  return `🔑 ယခု <b>${customerName}</b> အကောင့်အတွက် Outline Key မှာ:`;
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
 * Copy/download instructions shown between the key and the server line.
 * The key itself is already wrapped in <code> tags by the caller, which
 * Telegram renders as tap-to-copy on every client — no separate "Copy"
 * button needed for that part.
 */
export const KEY_COPY_INSTRUCTIONS = [
  "အထက်ပါ Key အား copyကူး၍ Outline app တွင်ထည့်သုံးရန်။",
  "App မရှိသေးပါက Play Store သို့မဟုတ် အောက်ပါ \"Download Outline\" ခလုတ်ကိုနှိပ်၍ download ဆွဲနိုင်သည်။",
].join("\n");

/** Inline button labels on the key message */
export const KEY_BTN_ADD = "➕ Add Key To Outline";
export const KEY_BTN_DOWNLOAD = "📥 Download Outline";

/** Shown when the customer has no active order or no provisioned key */
export const KEY_NO_ACTIVE =
  "❌ လက်ရှိ active package မရှိပါ။\n\n" +
  "• Trial စမ်းသုံးရန် /start နှိပ်ပါ\n" +
  "• Package ဝယ်ယူရန် 🛒 Package ဝယ်ရန် ကို နှိပ်ပါ";

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

export const SERVER_TEXT =
  "🌐 <b>Server ပြောင်းရန်:</b>\n\n" +
  "သင်၏ Outline Key သည် server အားလုံးအတွက် တူညီသော key တစ်ခုကိုသာ အသုံးပြုသည်။ " +
  "Server ပြောင်းလဲသောအခါ key ကို ပြန်လည် ထည့်သွင်းရန် မလိုပါ — အလိုအလျောက် ချိတ်ဆက်မည်ဖြစ်သည်။\n" +
  "မှတ်ချက် - VPN ချိတ်ထားစဉ် server ပြောင်းလျှင် VPN ကိုဖြုတ်ပြီးပြန်ချိတ်ပေးရန်လိုအပ်\n\n" +
  "App ဖွင့်ပြီး <b>Servers</b> tab ကို နှိပ်ကာ နိုင်ငံ ရွေးချယ်ပါ 👇";

export const SERVER_BTN_OPEN = "🌐 Change Server";

// ── Download Outline (📥) handler ─────────────────────────────────────────────

/** Callback data keys for the device-picker inline keyboard. */
export const DL_CB = {
  IOS:     "dl:ios",
  ANDROID: "dl:android",
  MACOS:   "dl:macos",
  WINDOWS: "dl:windows",
  BACK:    "dl:back",
};

export const DOWNLOAD_PICKER_TEXT =
  "📥 <b>Outline VPN Download</b>\n\n" +
  "သင်၏ device ကို ရွေးချယ်ပေးပါ 👇";

export const DOWNLOAD_BTNS = {
  IOS:     "🍎 iOS",
  ANDROID: "🤖 Android",
  MACOS:   "💻 macOS",
  WINDOWS: "🪟 Windows",
  BACK:    "⬅️ Back",
};

// Official Outline download URLs.
// Verify at https://getoutline.org before launch — store IDs may change.
export const DOWNLOAD_PLATFORMS = {
  ios: {
    text:     "🍎 <b>iOS (iPhone / iPad)</b>\n\nApp Store မှ Outline ကို download ဆွဲပါ:",
    url:      "https://apps.apple.com/app/id1356177741",
    urlLabel: "📲 App Store မှ Download",
  },
  android: {
    text:     "🤖 <b>Android</b>\n\nGoogle Play မှ Outline ကို download ဆွဲပါ:",
    url:      "https://play.google.com/store/apps/details?id=org.outline.android.client",
    urlLabel: "📲 Google Play မှ Download",
  },
  macos: {
    text:     "💻 <b>macOS</b>\n\nMac App Store မှ Outline ကို download ဆွဲပါ:",
    url:      "https://apps.apple.com/app/id1356178125",
    urlLabel: "📲 Mac App Store မှ Download",
  },
  windows: {
    text:     "🪟 <b>Windows</b>\n\nMicrosoft Store မှ Outline ကို download ဆွဲပါ:",
    url:      "https://apps.microsoft.com/store/detail/outline/9NQMQLKNTQX6",
    urlLabel: "📲 Microsoft Store မှ Download",
  },
};

// ── How to Use (📖) handler ────────────────────────────────────────────────────

/**
 * Static Burmese how-to instructions.
 * @param {string} supportUsername  reseller_miniapps.support_username (no @), or "".
 */
export function howToUse(supportUsername) {
  const support = supportUsername ? `@${supportUsername}` : "Admin";
  return [
    "📖 <b>Outline VPN အသုံးပြုနည်း</b>",
    "",
    "1️⃣ Outline VPN app ကို download ဆွဲပါ",
    "   (📥 <b>Download Outline</b> → device ရွေးချယ်ပါ သို့မဟုတ် သက်ဆိုင်ရာ App Store မှ ဒေါင်းပါ)",
    "",
    "2️⃣ Bot မှ 🔑 <b>Outline Key ရယူရန်</b> ကို နှိပ်ပါ",
    "",
    "3️⃣ Key ကို <b>copy ကူး</b>ပြီး Outline app ထဲ ထည့်ပါ",
    "   (သို့မဟုတ်) <b>Add Key To Outline</b> ကိုနှိပ်၍ Outline app ထဲကို key ထည့်ပါ",
    "",
    "4️⃣ Outline app မှ <b>Connect</b> ကို နှိပ်ပြီး VPN စတင်အသုံးပြုနိုင်ပါပြီ",
    "",
    `⚠️ အကူညီလိုအပ်ပါက ${support} ကို ဆက်သွယ်ပါ`,
  ].join("\n");
}
