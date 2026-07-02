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
