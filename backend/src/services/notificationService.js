// Customer notification service — Phase 1a of bot v2.
//
// Runs from customerNotificationsJob (every 10 min). One pass per tick:
// for each of the 6 event types, find eligible customers, filter for anti-spam
// (quiet hours, daily cap, dedup, reseller kill-switch), then send.
//
// Design principles:
//  - Missed > duplicate. Failed sends are logged and dropped, never retried.
//    The unique constraint on (customer_id, event_type, order_id) is the
//    hard dedup floor even if the JS-side dedup check races.
//  - Per-reseller kill-switch: `resellers.notifications_paused = true` skips
//    ALL customer notifications for that reseller's customers.
//  - Quiet hours 22:00–08:00 Myanmar time (Asia/Yangon). During quiet hours
//    the whole pass no-ops for customer events.
//  - Daily cap: at most 2 sends per customer in the last 24h. Simpler and
//    close enough to "current calendar day Yangon" without TZ math.
//  - No retroactive spam: on first run against production, run the seed
//    script (backend/scripts/seed-notifications-sent.mjs) BEFORE the job
//    ticks, so already-eligible triggers get marked "sent" and skipped.

import { Markup } from "telegraf";
import { supabase } from "../lib/supabase.js";
import { logger } from "../lib/logger.js";
import { sendMessageAsReseller } from "../bot/manager.js";
import { renderNotification, formatBurmeseDate } from "../bot/notificationTemplates.js";
import { buildWebAppUrl } from "../bot/webAppUrl.js";

const log = logger.child({ service: "notifications" });

const DAILY_CAP = 2;

// ── Time helpers ─────────────────────────────────────────────────────────────
// All customer-facing scheduling uses Asia/Yangon (Myanmar), UTC+06:30.
// We use Intl.DateTimeFormat rather than manual offset math so DST bugs
// (none in Myanmar today but defensive) can't surprise us.

/** YYYY-MM-DD string for the current calendar date in Yangon. */
export function yangonDate(now = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Yangon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(now); // en-CA => "YYYY-MM-DD"
}

/** Add `days` to a YYYY-MM-DD string, return YYYY-MM-DD. */
function shiftDate(ymd, days) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

// ── Send + record ────────────────────────────────────────────────────────────

/**
 * Try to send + record one notification. Returns:
 *   { sent: true }   — Telegram accepted the message and DB row inserted
 *   { sent: false, reason } — skipped for any reason (paused, capped,
 *                             already-sent, no bot, telegram error, ...).
 * Never throws.
 */
// Event types whose default template drives customers to the Mini App via
// an inline WebApp button instead of a raw {deep_link_url} pasted in the
// message text. Extend this as more templates get redesigned the same way
// (see trial_ending_24h's DEFAULT_TEMPLATES entry / 2026-08-23 polish pass).
const DEEP_LINK_BUTTON_EVENTS = new Map([
  ["trial_ending_24h", "Package ဝယ်ရန်"],
  ["trial_expired", "Package ဝယ်ရန်"],
  ["subscription_expiring_3d", "Package ဝယ်ရန်"],
  ["subscription_expired", "Package ဝယ်ရန်"],
  ["data_limit_reached", "Package ဝယ်ရန်"],
  ["data_limit_warning", "Package ဝယ်ရန်"],
]);

function buildDeepLinkButtonMarkup(eventType, deepLinkUrl) {
  const label = DEEP_LINK_BUTTON_EVENTS.get(eventType);
  if (!label || !deepLinkUrl) return null;
  // web_app buttons require an https URL — buildDeepLink always returns one
  // when TELEGRAM_MINIAPP_URL is configured; skip the button rather than
  // let Telegram reject the whole send if it somehow isn't.
  if (!/^https:\/\//i.test(deepLinkUrl)) return null;
  return Markup.inlineKeyboard([[Markup.button.webApp(label, deepLinkUrl)]]);
}

async function sendAndRecord({
  resellerId,
  customerId,
  telegramUserId,
  eventType,
  orderId,
  text,
  replyMarkup,
}) {
  // Dedup pre-check — cheaper than round-tripping to Telegram then hitting a
  // unique-violation. Race-safe because the DB constraint is the ultimate
  // guard.
  const { data: existing } = await supabase
    .from("notifications_sent")
    .select("id")
    .eq("customer_id", customerId)
    .eq("event_type", eventType)
    .eq("order_id", orderId)
    .maybeSingle();
  if (existing) return { sent: false, reason: "already_sent" };

  // Daily cap — count in last 24h. Approximate to "calendar day Yangon" for
  // the customer, but avoids TZ math around midnight.
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: todaysCount } = await supabase
    .from("notifications_sent")
    .select("*", { count: "exact", head: true })
    .eq("customer_id", customerId)
    .gte("sent_at", dayAgo);
  if ((todaysCount || 0) >= DAILY_CAP) {
    return { sent: false, reason: "daily_cap_hit" };
  }

  // Send via the reseller's bot.
  const result = await sendMessageAsReseller(resellerId, telegramUserId, text, {
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(replyMarkup || {}),
  });
  if (!result.ok) {
    log.warn(
      { event_type: eventType, customer_id: customerId, code: result.code, err: result.message },
      "notification send failed"
    );
    return { sent: false, reason: `send_failed:${result.code}` };
  }

  // Record. Ignore unique-violation (23505) silently — a parallel job tick
  // beat us to the insert; the send already went out so no harm done.
  const { error: insertErr } = await supabase.from("notifications_sent").insert({
    customer_id: customerId,
    event_type: eventType,
    order_id: orderId,
    channel: "telegram",
  });
  if (insertErr && insertErr.code !== "23505") {
    log.warn(
      { event_type: eventType, customer_id: customerId, err: insertErr.message },
      "notifications_sent insert failed AFTER successful send"
    );
  }

  return { sent: true };
}

// ── Deep link helper ─────────────────────────────────────────────────────────

function buildDeepLink(resellerRow) {
  const baseUrl = String(process.env.TELEGRAM_MINIAPP_URL || "").replace(/\/$/, "");
  const slug = resellerRow?.miniapp_slug || "";
  return buildWebAppUrl(baseUrl, slug) || baseUrl;
}

// ── Event queries ────────────────────────────────────────────────────────────
// Each fetch returns an array of { customer_id, telegram_user_id, order_id,
// data{...template placeholders...} } rows ready to hand to sendAndRecord.
//
// Excludes:
//  - customers with no telegram_links (can't DM them)
//  - resellers with notifications_paused = true (kill switch)
//  - orders whose notification for this event has already been recorded
//    (JS-side skip; the unique constraint is the safety net)

// reseller_miniapps has no direct FK to vpn_orders/order_payments — both
// only link via resellers.id. So we can't embed it in a single PostgREST
// select; fetch it separately keyed by reseller_id and join in JS.
async function fetchResellerMiniappsById(resellerIds) {
  const uniqueIds = [...new Set(resellerIds)].filter(Boolean);
  if (uniqueIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("reseller_miniapps")
    .select("reseller_id, brand_name, support_username, miniapp_slug")
    .in("reseller_id", uniqueIds);
  if (error) throw error;
  return new Map((data || []).map((r) => [r.reseller_id, r]));
}

async function fetchOrderBasedEvent({ eventType, orderFilter }) {
  // Base: pending orders matching the trigger + reseller not paused +
  //       customer has a telegram_user_id via telegram_links.
  let q = supabase
    .from("vpn_orders")
    .select(`
      id,
      customer_id,
      reseller_id,
      expiry_date,
      order_type,
      status,
      plan:vpn_plans(id, name),
      customer:vpn_customers!vpn_orders_customer_id_fkey(id, full_name, telegram_links(telegram_user_id)),
      reseller_row:resellers!inner(id, notifications_paused)
    `)
    .eq("reseller_row.notifications_paused", false);

  q = orderFilter(q);
  const { data, error } = await q;
  if (error) {
    log.error({ err: error, event_type: eventType }, "fetchOrderBasedEvent failed");
    return [];
  }

  const miniappsById = await fetchResellerMiniappsById((data || []).map((o) => o.reseller_id));

  const rows = [];
  for (const o of data || []) {
    const tgUserId = o.customer?.telegram_links?.[0]?.telegram_user_id;
    if (!tgUserId) continue;

    const miniapp = miniappsById.get(o.reseller_id);
    const brand = miniapp?.brand_name || "";
    const plan = o.plan?.name || "";
    const support = miniapp?.support_username || "";
    const deepLink = buildDeepLink(miniapp);
    const expiry = formatBurmeseDate(o.expiry_date);

    rows.push({
      customerId: o.customer_id,
      telegramUserId: Number(tgUserId),
      orderId: o.id,
      resellerId: o.reseller_id,
      data: {
        brand_name: brand,
        plan_name: plan,
        expiry_date: expiry,
        support_username: support,
        deep_link_url: deepLink,
      },
    });
  }
  return rows;
}

// Plans are a single shared catalogue, not per-reseller (see SCHEMA.md —
// vpn_plans has one price_mmk for every reseller, no per-reseller override
// table exists), so "cheapest paid plan" is one platform-wide number. Fetched
// live rather than hardcoded into the template so the notification text
// never goes stale if pricing changes.
async function getCheapestPaidPlanPriceMmk() {
  const { data, error } = await supabase
    .from("vpn_plans")
    .select("price_mmk")
    .eq("is_trial", false)
    .eq("is_active", true)
    .order("price_mmk", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    log.warn({ err: error }, "failed to load cheapest plan price for trial_ending_24h");
    return null;
  }
  return data?.price_mmk ?? null;
}

// Trial orders never get their status touched when a customer buys a paid
// plan — the purchase route only blocks a SECOND purchase while one is
// active, it doesn't look at or stop the customer's existing trial order at
// all (confirmed against resellerMiniappRoutes.js POST /:slug/orders). So a
// trial order can sit at status='active' with its original expiry_date
// indefinitely even after the customer has already converted to paid,
// which would otherwise make both trial_ending_24h and trial_expired keep
// firing "your trial is ending!" at someone who already paid. Exclude any
// trial row whose customer already has an active purchase order.
async function excludeCustomersWithActivePurchase(rows) {
  if (rows.length === 0) return rows;
  const customerIds = [...new Set(rows.map((r) => r.customerId))];
  const { data: activePurchases, error } = await supabase
    .from("vpn_orders")
    .select("customer_id")
    .in("customer_id", customerIds)
    .eq("order_type", "purchase")
    .eq("status", "active");
  if (error) {
    log.warn({ err: error }, "failed to check active-purchase exclusion for trial events");
    return rows;
  }
  const excluded = new Set((activePurchases || []).map((p) => p.customer_id));
  return rows.filter((r) => !excluded.has(r.customerId));
}

async function findTrialEndingIn24h() {
  const target = shiftDate(yangonDate(), 1);
  let rows = await fetchOrderBasedEvent({
    eventType: "trial_ending_24h",
    orderFilter: (q) => q.eq("order_type", "trial").eq("status", "active").eq("expiry_date", target),
  });
  rows = await excludeCustomersWithActivePurchase(rows);
  return attachCheapestPlanPrice(rows);
}

// Shared by both trial events — each one's default template prompts the
// customer to buy, quoting the platform's cheapest active paid plan.
async function attachCheapestPlanPrice(rows) {
  if (rows.length === 0) return rows;
  const cheapestPrice = await getCheapestPaidPlanPriceMmk();
  for (const row of rows) {
    row.data.price_from_mmk = cheapestPrice != null ? cheapestPrice.toLocaleString("en-US") : "";
  }
  return rows;
}

// trial_expired and subscription_expired both used to match purely on
// expiry_date, with no status check — so an order that already stopped
// EARLY for any other reason (data_limit_reached, a manual stop, ...) would
// still fire this a second, redundant/stale time once its original
// calendar expiry date rolled around, even though the customer already
// found out (or should have) days earlier. Restricting to status='active'
// fixes that without breaking the normal case: autoStopJob only stops
// orders once expiry_date is strictly in the PAST (`< today`), so on the
// actual expiry day itself a normally-expiring order is still 'active' when
// this check runs — this filter only excludes the early-stopped edge cases,
// not the everyday one.
async function findTrialExpired() {
  const today = yangonDate();
  let rows = await fetchOrderBasedEvent({
    eventType: "trial_expired",
    orderFilter: (q) => q.eq("order_type", "trial").eq("status", "active").eq("expiry_date", today),
  });
  rows = await excludeCustomersWithActivePurchase(rows);
  return attachCheapestPlanPrice(rows);
}

async function findSubscriptionExpiringIn3d() {
  const target = shiftDate(yangonDate(), 3);
  return fetchOrderBasedEvent({
    eventType: "subscription_expiring_3d",
    orderFilter: (q) => q.neq("order_type", "trial").eq("status", "active").eq("expiry_date", target),
  });
}

async function findSubscriptionExpired() {
  const today = yangonDate();
  return fetchOrderBasedEvent({
    eventType: "subscription_expired",
    orderFilter: (q) => q.neq("order_type", "trial").eq("status", "active").eq("expiry_date", today),
  });
}

/**
 * Payment events fire off of `order_payments.review_status` transitions.
 * We use the payment's `updated_at` (approximating the transition time) and
 * look at rows updated in the last 24h — the notifications_sent unique
 * constraint (per customer + event + order) prevents duplicate sends on
 * subsequent ticks even though updated_at doesn't drift back.
 */
async function findPaymentEvent(reviewStatus, eventType) {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("order_payments")
    .select(`
      id,
      order_id,
      customer_id,
      reseller_id,
      payment_note,
      review_status,
      reviewed_at,
      order:vpn_orders(id, expiry_date, plan:vpn_plans(id, name)),
      customer:vpn_customers!order_payments_customer_id_fkey(id, full_name, telegram_links(telegram_user_id)),
      reseller_row:resellers!order_payments_reseller_id_fkey!inner(id, notifications_paused)
    `)
    .eq("review_status", reviewStatus)
    .gte("reviewed_at", dayAgo)
    .eq("reseller_row.notifications_paused", false);

  if (error) {
    log.error({ err: error, event_type: eventType }, "findPaymentEvent failed");
    return [];
  }

  const miniappsById = await fetchResellerMiniappsById((data || []).map((p) => p.reseller_id));

  const rows = [];
  for (const p of data || []) {
    const tgUserId = p.customer?.telegram_links?.[0]?.telegram_user_id;
    if (!tgUserId || !p.order_id) continue;

    const miniapp = miniappsById.get(p.reseller_id);

    rows.push({
      customerId: p.customer_id,
      telegramUserId: Number(tgUserId),
      orderId: p.order_id,
      resellerId: p.reseller_id,
      data: {
        brand_name: miniapp?.brand_name || "",
        plan_name: p.order?.plan?.name || "",
        expiry_date: formatBurmeseDate(p.order?.expiry_date),
        support_username: miniapp?.support_username || "",
        reject_reason: p.payment_note || "",
      },
    });
  }
  return rows;
}

// ── Reseller custom-template overrides ──────────────────────────────────────
// Batched per event type per pass: one query for all resellers who have
// customized THIS event type, keyed by reseller_id for O(1) lookup while
// iterating eligible rows. No row for a reseller = use the platform default.

async function fetchCustomTemplatesForEvent(eventType) {
  const { data, error } = await supabase
    .from("reseller_notification_templates")
    .select("reseller_id, custom_text")
    .eq("event_type", eventType);
  if (error) {
    // Table may not exist yet in an environment mid-migration — degrade to
    // "no overrides" rather than failing the whole pass.
    if (!/relation .* does not exist|schema cache/i.test(error.message || "")) {
      log.warn({ err: error, event_type: eventType }, "failed to load custom templates");
    }
    return new Map();
  }
  return new Map((data || []).map((r) => [r.reseller_id, r.custom_text]));
}

// ── Public: single event-driven send ─────────────────────────────────────────
// Fired immediately by syncUsageJob.js right when it auto-stops an order for
// exceeding its plan's data limit — trial or paid. Not part of the batch
// pass above: the date-based trial_expired/subscription_expired events
// wouldn't fire until the order's ORIGINAL calendar expiry date, which could
// be days after access was actually cut off for running out of data. This
// tells the customer immediately, at the moment it's actually true, instead
// of leaving them with a silently-dead VPN key and no explanation (or a
// stale explanation days later). Self-contained — looks up everything it
// needs from just the orderId, so the caller doesn't have to.
// Shared by both data-limit event senders below — loads everything needed to
// notify about a single order (customer, telegram link, reseller brand,
// kill-switch check) from just the orderId, so each caller only has to
// supply the event-specific extra placeholder data (e.g. percent_used).
async function sendSingleOrderNotification(orderId, eventType, extraData = {}) {
  const { data: order, error } = await supabase
    .from("vpn_orders")
    .select(`
      id,
      customer_id,
      reseller_id,
      plan:vpn_plans(id, name),
      customer:vpn_customers!vpn_orders_customer_id_fkey(id, full_name, telegram_links(telegram_user_id)),
      reseller_row:resellers!inner(id, notifications_paused)
    `)
    .eq("id", orderId)
    .eq("reseller_row.notifications_paused", false)
    .maybeSingle();

  if (error) {
    log.error({ err: error, order_id: orderId, event_type: eventType }, "sendSingleOrderNotification: order lookup failed");
    return { sent: false, reason: "lookup_failed" };
  }
  if (!order) return { sent: false, reason: "not_found_or_reseller_paused" };

  const tgUserId = order.customer?.telegram_links?.[0]?.telegram_user_id;
  if (!tgUserId) return { sent: false, reason: "no_telegram_link" };

  const miniappsById = await fetchResellerMiniappsById([order.reseller_id]);
  const miniapp = miniappsById.get(order.reseller_id);

  const data = {
    brand_name: miniapp?.brand_name || "",
    plan_name: order.plan?.name || "",
    deep_link_url: buildDeepLink(miniapp),
    ...extraData,
  };

  const customTemplates = await fetchCustomTemplatesForEvent(eventType);
  const customText = customTemplates.get(order.reseller_id) || null;
  const text = renderNotification(eventType, data, customText);
  if (!text) return { sent: false, reason: "no_template" };

  return sendAndRecord({
    resellerId: order.reseller_id,
    customerId: order.customer_id,
    telegramUserId: Number(tgUserId),
    eventType,
    orderId: order.id,
    text,
    replyMarkup: buildDeepLinkButtonMarkup(eventType, data.deep_link_url),
  });
}

export async function notifyDataLimitReached(orderId) {
  return sendSingleOrderNotification(orderId, "data_limit_reached");
}

// percentUsed/remainingGb are computed by the caller (syncUsageJob already
// has the usage numbers on hand while checking the limit) rather than
// re-querying key usage here — keeps the usage math in one place.
export async function notifyDataLimitWarning(orderId, { percentUsed, remainingGb }) {
  return sendSingleOrderNotification(orderId, "data_limit_warning", {
    percent_used: percentUsed,
    remaining_gb: remainingGb,
  });
}

// ── Public: run one pass ─────────────────────────────────────────────────────

/**
 * Run one notification pass. Callable from the scheduler OR one-off scripts.
 * Returns { skipped_quiet_hours, per_event: {...counts} } for observability.
 *
 * Quiet-hours gating removed 2026-08-24 per explicit product decision —
 * customer notifications can now fire at any hour. `force` is kept as a
 * no-op parameter for API/caller compatibility (admin "run pass now"
 * endpoint still passes it) rather than ripping it out everywhere at once.
 */
export async function runNotificationPass({ force = false } = {}) {
  void force;

  const events = [
    { type: "trial_ending_24h",         find: findTrialEndingIn24h },
    { type: "trial_expired",            find: findTrialExpired },
    { type: "subscription_expiring_3d", find: findSubscriptionExpiringIn3d },
    { type: "subscription_expired",     find: findSubscriptionExpired },
    { type: "payment_confirmed",        find: () => findPaymentEvent("confirmed", "payment_confirmed") },
    { type: "payment_rejected",         find: () => findPaymentEvent("rejected",  "payment_rejected") },
  ];

  const summary = {};
  for (const { type, find } of events) {
    const eligible = await find();
    const customTemplates = eligible.length > 0
      ? await fetchCustomTemplatesForEvent(type)
      : new Map();
    let sent = 0;
    let skipped = 0;
    for (const row of eligible) {
      const customText = customTemplates.get(row.resellerId) || null;
      const text = renderNotification(type, row.data, customText);
      if (!text) continue;
      const result = await sendAndRecord({
        resellerId: row.resellerId,
        customerId: row.customerId,
        telegramUserId: row.telegramUserId,
        eventType: type,
        orderId: row.orderId,
        text,
        replyMarkup: buildDeepLinkButtonMarkup(type, row.data.deep_link_url),
      });
      if (result.sent) sent += 1;
      else skipped += 1;
    }
    summary[type] = { eligible: eligible.length, sent, skipped };
    if (eligible.length > 0) {
      log.info({ event_type: type, eligible: eligible.length, sent, skipped }, "event processed");
    }
  }

  return { skipped_quiet_hours: false, per_event: summary };
}
