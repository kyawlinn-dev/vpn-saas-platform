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
    `${b(brandName)} VPN ဖြင့် လုံခြုံစွာ၊ မြန်ဆန်စွာ internet ကို ကမ္ဘာ့မည်သည့်နေရာမှမဆို ချိတ်ဆက်နိုင်ပါသည်။`,
    "",
    `✅ Account အသစ် ဖွင့်ပြီးသောအခါ <b>5GB trial</b> ကို အလိုအလျောက် ရရှိမည်ဖြစ်သည်။`,
    "",
    `📌 Menu ကို အသုံးပြု၍ —`,
    `   • 🔑 Outline Key ရယူနိုင်သည်`,
    `   • 📊 လက်ကျန် GB စစ်နိုင်သည်`,
    `   • 🌐 Server နိုင်ငံ ပြောင်းနိုင်သည်`,
    "",
    `အောက်ပါ menu မှ ရွေးချယ်ပါ 👇`,
  ].join("\n");
}

/** Short prompt sent alongside the Buy/Admin inline buttons (second message on /start). */
export const START_CTA_TEXT = "📲 ဘာများ ကူညီပေးရမည်လဲ?";

/** Inline button labels on /start */
export const START_BTN_BUY   = "🛒 ဝယ်ယူရန် / သက်တမ်းတိုးရန်";
export const START_BTN_ADMIN = "👤 Admin / Support";

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
 * @param {string} flag        vpn_servers.flag_emoji
 * @param {string} serverName  vpn_servers.name
 */
export function keyServerLine(flag, serverName) {
  return `🌐 Linked Server: ${flag} ${serverName}`;
}

/** Inline button label on the key message */
export const KEY_BTN_ADD = "➕ Add Key To Outline";

/** Shown when the customer has no active order or no provisioned key */
export const KEY_NO_ACTIVE =
  "❌ လက်ရှိ active package မရှိပါ။\n\n" +
  "• Trial စမ်းသုံးရန် /start နှိပ်ပါ\n" +
  "• Package ဝယ်ယူရန် 🛒 ဝယ်ယူရန် / သက်တမ်းတိုးရန် ကို နှိပ်ပါ";

/** Generic error shown when the DB/network lookup fails */
export const KEY_ERROR =
  "⚠️ Key ရယူရာတွင် အမှားဖြစ်သွားသည်။ ခဏကြာပြီးနောက် ထပ်ကြိုးစားပါ။";

// ── Check Balance (📊) handler ─────────────────────────────────────────────────

export const BALANCE_TEXT =
  "📊 <b>လက်ကျန် GB စစ်ဆေးရန်:</b>\n\n" +
  "လက်ကျန် data နှင့် သက်တမ်း အချက်အလက်များကို VPN app တွင် ကြည့်ရှုနိုင်ပါသည်။\n\n" +
  "အောက်ပါ <b>Open VPN</b> ကို နှိပ်ပါ 👇";

export const BALANCE_BTN_OPEN = "📊 Open VPN";

// ── Change Server (🌐) handler ─────────────────────────────────────────────────

export const SERVER_TEXT =
  "🌐 <b>Server ပြောင်းရန်:</b>\n\n" +
  "သင်၏ Outline Key သည် server အားလုံးအတွက် တူညီသော key တစ်ချောင်းကိုသာ အသုံးပြုသည်။ " +
  "Server ပြောင်းလဲသောအခါ key ကို ပြန်လည် ထည့်သွင်းရန် မလိုပါ — အလိုအလျောက် ချိတ်ဆက်မည်ဖြစ်သည်။\n\n" +
  "App ဖွင့်ပြီး <b>Servers</b> tab ကို နှိပ်ကာ နိုင်ငံ ရွေးချယ်ပါ 👇";

export const SERVER_BTN_OPEN = "🌐 Change Server";

// ── Stage-1 placeholder replies ────────────────────────────────────────────────
// Each will be replaced with real logic in later stages (Stage 2+).

export const PLACEHOLDER = {
  KEY:
    "🔑 Outline Key ရယူနိုင်သော feature ကို မကြာမီ ထည့်သွင်းမည်ဖြစ်သည်။\n\n" +
    "ခဏလေး စောင့်ပါ ✨",
  BALANCE:
    "📊 လက်ကျန် GB စစ်ဆေးနိုင်သော feature ကို မကြာမီ ထည့်သွင်းမည်ဖြစ်သည်။\n\n" +
    "ခဏလေး စောင့်ပါ ✨",
  SERVER:
    "🌐 Server ပြောင်းနိုင်သော feature ကို မကြာမီ ထည့်သွင်းမည်ဖြစ်သည်။\n\n" +
    "ခဏလေး စောင့်ပါ ✨",
  DOWNLOAD:
    "📥 Outline download လင့်များကို မကြာမီ ထည့်သွင်းမည်ဖြစ်သည်။\n\n" +
    "ခဏလေး စောင့်ပါ ✨",
  HOWTO:
    "📖 အသုံးပြုနည်း လမ်းညွှန်ချက်ကို မကြာမီ ထည့်သွင်းမည်ဖြစ်သည်။\n\n" +
    "ခဏလေး စောင့်ပါ ✨",
};
