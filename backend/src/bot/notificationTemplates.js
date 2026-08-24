// Burmese customer-notification templates.
//
// Every template is rendered with HTML parse_mode. Templates are plain
// strings with {placeholder} tokens — this is the SAME format resellers see
// and edit in the dashboard (reseller-dashboard NotificationsPage), so
// DEFAULT_TEMPLATES below is the single source of truth for both the
// platform default and the "what does {plan_name} mean" reference shown to
// resellers.
//
// If a reseller has no support_username set, the "Admin/Support" line is
// omitted entirely rather than rendering a dangling "@" or a generic
// fallback (per user 1A decision, 2026-08-14). This only applies to the two
// events whose default template includes an optional support line
// (trial_expired, subscription_expired, payment_rejected) — see
// OPTIONAL_SUPPORT_LINE_EVENTS below. Reseller-customized text does not get
// this conditional-line behavior; if a reseller writes {support_username}
// into their custom text with no username configured, it renders empty.

const BURMESE_DIGITS = ["၀","၁","၂","၃","၄","၅","၆","၇","၈","၉"];
const BURMESE_MONTHS = [
  "ဇန်နဝါရီ", "ဖေဖော်ဝါရီ", "မတ်", "ဧပြီ", "မေ", "ဇွန်",
  "ဇူလိုင်", "ဩဂုတ်", "စက်တင်ဘာ", "အောက်တိုဘာ", "နိုဝင်ဘာ", "ဒီဇင်ဘာ",
];

function toBurmeseNumber(n) {
  return String(n)
    .split("")
    .map((c) => (c >= "0" && c <= "9" ? BURMESE_DIGITS[Number(c)] : c))
    .join("");
}

/**
 * Format a `expiry_date` (YYYY-MM-DD or Date) in Myanmar-local, Burmese style.
 *   e.g. "၂၀၂၆ ခုနှစ်၊ ဩဂုတ်လ ၁၅ ရက်"
 *
 * The `expiry_date` column is a plain DATE (no timezone), so we treat the
 * calendar date as-is — no conversion needed. Per user 2A decision:
 * customers see the date they expect.
 */
export function formatBurmeseDate(value) {
  if (!value) return "";
  const s = String(value).slice(0, 10);
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return s;
  return `${toBurmeseNumber(y)} ခုနှစ်၊ ${BURMESE_MONTHS[m - 1]}လ ${toBurmeseNumber(d)} ရက်`;
}

// ── Event catalog ────────────────────────────────────────────────────────────

export const NOTIFICATION_EVENT_TYPES = [
  "trial_ending_24h",
  "trial_expired",
  "subscription_expiring_3d",
  "subscription_expired",
  "payment_confirmed",
  "payment_rejected",
  "data_limit_reached",
  "data_limit_warning",
];

// Human labels + which placeholders each event's data object provides. Used
// by both the reseller-dashboard UI (to show a legend / validate saves) and
// as documentation for anyone editing this file.
export const EVENT_META = {
  trial_ending_24h: {
    label: "Trial ကုန်ဆုံးရန် ၂၄ နာရီ ကျန်",
    description: "Trial package expires in exactly 1 day.",
    // deep_link_url isn't in the default text — it drives the "Package
    // ဝယ်ရန်" inline button instead (see DEEP_LINK_BUTTON_EVENTS in
    // notificationService.js). Still listed here since it's available data.
    placeholders: ["brand_name", "expiry_date", "price_from_mmk", "deep_link_url"],
  },
  trial_expired: {
    label: "Trial ကုန်ဆုံးပြီး",
    description: "Trial package expired today.",
    // deep_link_url drives the "Package ဝယ်ရန်" inline button, not raw text
    // in the body — see DEEP_LINK_BUTTON_EVENTS in notificationService.js.
    placeholders: ["brand_name", "price_from_mmk", "deep_link_url", "support_username"],
  },
  subscription_expiring_3d: {
    label: "Package ကုန်ဆုံးရန် ၃ ရက် ကျန်",
    description: "Paid subscription expires in 3 days.",
    // deep_link_url drives the "Package ဝယ်ရန်" inline button, not raw text
    // in the body — see DEEP_LINK_BUTTON_EVENTS in notificationService.js.
    placeholders: ["brand_name", "plan_name", "expiry_date", "deep_link_url"],
  },
  subscription_expired: {
    label: "Package ကုန်ဆုံးပြီး",
    description: "Paid subscription expired today.",
    placeholders: ["brand_name", "plan_name", "deep_link_url", "support_username"],
  },
  payment_confirmed: {
    label: "ငွေပေးချေမှု အတည်ပြုပြီး",
    description: "order_payments.review_status flipped to confirmed.",
    placeholders: ["brand_name", "plan_name", "expiry_date"],
  },
  payment_rejected: {
    label: "ငွေပေးချေမှု လက်မခံ",
    description: "order_payments.review_status flipped to rejected.",
    placeholders: ["brand_name", "plan_name", "reject_reason", "support_username"],
  },
  data_limit_reached: {
    label: "Data limit ကုန်ဆုံးပြီး",
    description:
      "Fires the moment syncUsageJob auto-stops an order for exceeding its plan's " +
      "data limit — trial or paid, whichever hits first. Independent of the " +
      "date-based trial_expired/subscription_expired events, which wouldn't " +
      "fire until the order's original calendar expiry date even though " +
      "access was already cut off earlier for running out of data.",
    placeholders: ["brand_name", "plan_name", "deep_link_url"],
  },
  data_limit_warning: {
    label: "Data limit ကုန်ခါနီးပြီ (80%)",
    description:
      "Advance warning at 80% of the plan's data limit, checked on the same " +
      "hourly syncUsageJob tick as data_limit_reached — the data-limit side's " +
      "equivalent of trial_ending_24h / subscription_expiring_3d, so customers " +
      "get a heads-up before hitting a hard cutoff either way (by date or by " +
      "data), not just for the date-based one.",
    placeholders: ["brand_name", "plan_name", "percent_used", "remaining_gb", "deep_link_url"],
  },
};

// ── Default templates (placeholder-string format) ───────────────────────────
// {support_username} lines are handled specially in renderDefault() below —
// they're omitted entirely when support_username is empty, rather than
// leaving a dangling "@" (see file header). Custom reseller text does not
// get this treatment; it's a straight token substitution.

export const DEFAULT_TEMPLATES = {
  // No raw {deep_link_url} in the body — it's attached as a "Package ဝယ်ရန်"
  // inline WebApp button instead (see DEEP_LINK_BUTTON_EVENTS in
  // notificationService.js). The {price_from_mmk} placeholder is populated
  // per-reseller from their cheapest active plan.
  trial_ending_24h: [
    "<b>⏰ trial ending soon!</b>",
    "",
    "သင့် အစမ်းသုံးပက်ကေ့ချ်သည် နောက် ၂၄ နာရီ အတွင်း ကုန်ဆုံးမည်ဖြစ်ပါသည်။",
    "📅 ကုန်ဆုံးရက်: {expiry_date}",
    "ပက်ကေ့ချ်အသစ်ဝယ်ယူရန် အောက်ပါ “Package ဝယ်ရန်” ခလုတ်ကိုနှိပ်ပြီး {price_from_mmk} ကျပ်မှစ၍ဝယ်ယူအားပေးနိုင်ပါတယ် 👇",
  ].join("\n"),

  trial_expired: [
    "<b>❌ trial expired!</b>",
    "",
    "သင့်အစမ်းသုံးပက်ကေ့ချ်သည် ကုန်ဆုံးသွားပါပြီ။",
    "ပက်ကေ့ချ်အသစ်ဝယ်ယူရန် အောက်ပါ \"Package ဝယ်ရန်\" ခလုတ်ကိုနှိပ်ပြီး {price_from_mmk} ကျပ်မှစ၍ဝယ်ယူအားပေးနိုင်ပါတယ် 👇",
    "",
    "အကူအညီ လိုပါက: @{support_username}",
  ].join("\n"),

  subscription_expiring_3d: [
    "<b>⏰ package ending soon!</b>",
    "",
    "သင့် {plan_name} Package သည် နောက် ၃ ရက် အတွင်း ကုန်ဆုံးမည်။",
    "📅 ကုန်ဆုံးရက်: {expiry_date}",
    "သက်တမ်းတိုးရန် အောက်ပါ \"Package ဝယ်ရန်\" ခလုတ်ကိုနှိပ်ပြီး ဆက်လက်အသုံးပြုနိုင်ပါတယ် 👇",
  ].join("\n"),

  subscription_expired: [
    "<b>❌ package expired!</b>",
    "",
    "သင့် {plan_name} Package သည် ကုန်ဆုံးသွားပါပြီ။",
    "သက်တမ်းတိုးရန် အောက်ပါ \"Package ဝယ်ရန်\" ခလုတ်ကိုနှိပ်ပါ 👇",
    "",
    "အကူအညီ လိုပါက: @{support_username}",
  ].join("\n"),

  payment_confirmed: [
    "<b>✅ payment confirmed!</b>",
    "",
    "ကျေးဇူးတင်ပါတယ်! သင့်ငွေပေးချေမှုကို အတည်ပြုပြီးပါပြီ 🎉",
    "",
    "📦 Package: {plan_name}",
    "📅 သက်တမ်း: {expiry_date} အထိ",
    "",
    "Key ရယူဖို့ အောက်က 🔑 Outline Key ရယူရန် ခလုတ်ကို နှိပ်ပါ 👇",
  ].join("\n"),

  payment_rejected: [
    "<b>❌ payment rejected!</b>",
    "",
    "သင့်ငွေပေးချေမှုအား အတည်မပြုနိုင်ပါ",
    "",
    "📦 Package: {plan_name}",
    "📝 အကြောင်းရင်း: {reject_reason}",
    "",
    "ပြန်လည် ငွေပေးချေရန်၊ သို့မဟုတ် အကူအညီ လိုပါက Admin ကို ဆက်သွယ်ပါ 👇",
    "👤 @{support_username}",
  ].join("\n"),

  data_limit_reached: [
    "<b>⚠️ data limit reached!</b>",
    "",
    "သင့် {plan_name} ၏ data limit ကို အသုံးပြုပြီးပါပြီ။ VPN ချိတ်ဆက်မှု ရပ်တန့်သွားပါပြီ။",
    "ဆက်လက်အသုံးပြုလိုပါက အောက်ပါ \"Package ဝယ်ရန်\" ခလုတ်ကိုနှိပ်ပါ 👇",
  ].join("\n"),

  data_limit_warning: [
    "<b>⚠️ data limit ကုန်ခါနီးပြီ!</b>",
    "",
    "သင့် {plan_name} ၏ data ကို {percent_used}% အသုံးပြုပြီးပါပြီ — လက်ကျန် {remaining_gb} GB သာ ရှိပါတော့သည်။",
    "Data ကုန်သွားပါက VPN ချိတ်ဆက်မှု ချက်ချင်း ရပ်တန့်သွားပါလိမ့်မည်။",
    "ကြိုတင်ဝယ်ယူထားလိုပါက အောက်ပါ \"Package ဝယ်ရန်\" ခလုတ်ကိုနှိပ်ပါ 👇",
  ].join("\n"),
};

// Events whose DEFAULT template has a conditional "contact support" line
// that should disappear entirely (not just leave a blank @) when the
// reseller has no support_username configured.
const OPTIONAL_SUPPORT_LINE_EVENTS = new Set([
  "trial_expired",
  "subscription_expired",
  "payment_rejected",
]);

/**
 * Substitute {key} tokens in `text` with values from `data`. Unknown/missing
 * keys are replaced with an empty string rather than left as literal
 * "{key}" — safer for customer-facing output than leaking template syntax.
 */
export function renderTemplate(text, data = {}) {
  return String(text || "").replace(/\{(\w+)\}/g, (_, key) =>
    data[key] != null ? String(data[key]) : ""
  );
}

/**
 * Render the PLATFORM DEFAULT for an event type, with the optional-support-
 * line behavior applied. Falls back to plain renderTemplate() for events
 * without that special case.
 */
function renderDefault(eventType, data) {
  const template = DEFAULT_TEMPLATES[eventType];
  if (!template) return null;

  if (OPTIONAL_SUPPORT_LINE_EVENTS.has(eventType) && !data.support_username) {
    // Strip the trailing "contact support" block. All three templates put
    // it as the last one or two non-empty lines preceded by a blank line —
    // safe to trim by dropping everything from the last blank-line onward
    // when there's no username to show.
    const lines = template.split("\n");
    const lastBlankIdx = lines.lastIndexOf("");
    const trimmed = lastBlankIdx > 0 ? lines.slice(0, lastBlankIdx) : lines;
    return renderTemplate(trimmed.join("\n"), data);
  }

  return renderTemplate(template, data);
}

/**
 * Public API: render a template for a given event type, using a reseller's
 * custom text if provided, otherwise the platform default. Returns a
 * ready-to-send HTML string, or null if the event type is unknown (defensive
 * — the scheduler shouldn't ever call this with a bad type).
 *
 * @param {string} eventType
 * @param {object} data — placeholder values (brand_name, plan_name, etc.)
 * @param {string|null} [customText] — reseller override text, if any
 */
export function renderNotification(eventType, data, customText = null) {
  if (!NOTIFICATION_EVENT_TYPES.includes(eventType)) return null;
  if (customText) return renderTemplate(customText, data);
  return renderDefault(eventType, data);
}
