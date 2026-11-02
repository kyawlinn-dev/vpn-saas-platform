import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ tables: {}, send: vi.fn(), from: vi.fn() }));
vi.mock("../lib/supabase.js", () => ({ supabase: { from: fixture.from } }));
vi.mock("../lib/logger.js", () => ({ logger: { child: () => ({ info() {}, warn() {}, error() {} }) } }));
vi.mock("../services/customerNotificationService.js", () => ({ notifyCustomerEvent: fixture.send }));

import { notifyDataLimitReached, notifyDataLimitWarning, runNotificationPass } from "../services/notificationService.js";
import { EVENT_META, formatBurmeseDate, formatExpiryDeadline, renderNotification } from "../bot/notificationTemplates.js";

// In-memory PostgREST filtering exercises the real selectors, caps and ledger.
// No environment loading, provider transport or database client is imported.
function query(table) {
  let rows = [...(fixture.tables[table] || [])];
  let single = false, count = false, insertion;
  const value = (row, key) => key.split(".").reduce((v, part) => v?.[part], row);
  const q = {
    select: (_, options) => { count = !!options?.count; return q; },
    eq: (key, v) => { rows = rows.filter(r => value(r, key) === v); return q; },
    neq: (key, v) => { rows = rows.filter(r => value(r, key) !== v); return q; },
    in: (key, values) => { rows = rows.filter(r => values.includes(value(r, key))); return q; },
    not: (key, _, list) => { rows = rows.filter(r => !list.slice(1, -1).split(",").includes(value(r, key))); return q; },
    gte: (key, v) => { rows = rows.filter(r => value(r, key) >= v); return q; },
    lte: (key, v) => { rows = rows.filter(r => value(r, key) <= v); return q; },
    order: () => q,
    limit: n => { rows = rows.slice(0, n); return q; },
    maybeSingle: () => { single = true; return q; },
    insert: row => { insertion = row; return q; },
    then(resolve, reject) {
      if (insertion) fixture.tables[table].push({ ...insertion, sent_at: new Date().toISOString() });
      return Promise.resolve({ data: single ? rows[0] || null : rows, count: count ? rows.length : null, error: null }).then(resolve, reject);
    },
  };
  return q;
}

function order(id, expiry_date, overrides = {}) {
  return { id, expiry_date, customer_id: `customer-${id}`, reseller_id: "tenant", order_type: "purchase", status: "active",
    customer: { telegram_links: [{ telegram_user_id: 123 }] }, plan: { name: "Plan" }, reseller_row: { notifications_paused: false }, ...overrides };
}
function at(iso) { vi.setSystemTime(new Date(iso)); }
function sent(type) { return fixture.send.mock.calls.map(([input]) => input).filter(input => input.eventType === type); }

beforeEach(() => {
  vi.useFakeTimers();
  at("2026-10-28T01:30:00Z"); // 08:00 Myanmar
  fixture.tables = { vpn_orders: [], order_payments: [], notifications_sent: [], reseller_notification_templates: [],
    reseller_miniapps: [{ reseller_id: "tenant", brand_name: "Brand", miniapp_slug: "brand" }], vpn_plans: [{ price_mmk: 5000, is_trial: false, is_active: true }] };
  fixture.from.mockReset().mockImplementation(query);
  fixture.send.mockReset().mockResolvedValue({ sent: true, channel: "telegram" });
});
afterEach(() => { vi.useRealTimers(); });

describe("Myanmar deadline scheduling", () => {
  it.each(["2026-10-28T01:30:00Z", "2026-10-28T14:29:59Z", "2026-10-28T21:29:59Z", "2026-10-28T21:30:00Z", "2026-10-29T01:29:59Z"])("never announces expiry before the next morning: %s", async now => {
    at(now);
    fixture.tables.vpn_orders = [order("paid", "2026-10-28"), order("trial", "2026-10-28", { order_type: "trial" })];
    await runNotificationPass({ force: true });
    expect(sent("subscription_expired")).toHaveLength(0);
    expect(sent("trial_expired")).toHaveLength(0);
  });

  it("catches unsent expired orders after auto-stop, but excludes stopped, future and stale rows", async () => {
    fixture.tables.vpn_orders = [order("active", "2026-10-27"), order("expired", "2026-10-27", { status: "expired" }),
      order("trial", "2026-10-27", { order_type: "trial", status: "expired" }),
      order("manual", "2026-10-27", { status: "stopped" }), order("data", "2026-11-01", { status: "stopped" }),
      order("future-expired", "2026-10-29", { status: "expired" }), order("stale", "2026-10-26", { status: "expired" })];
    await runNotificationPass();
    expect(sent("subscription_expired").map(r => r.orderId)).toEqual(["active", "expired"]);
    expect(sent("trial_expired").map(r => r.orderId)).toEqual(["trial"]);
    await runNotificationPass();
    expect(sent("subscription_expired")).toHaveLength(2);
    expect(sent("trial_expired")).toHaveLength(1);
  });

  it.each(["2026-10-28T01:30:00Z", "2026-10-28T14:29:59Z"])("uses remaining hours for daytime reminders: %s", async now => {
    at(now);
    fixture.tables.vpn_orders = [order("trial", "2026-10-28", { order_type: "trial" }), order("trial-too-early", "2026-10-29", { order_type: "trial" }),
      order("paid", "2026-10-30"), order("paid-too-early", "2026-10-31"), order("paid-too-late", "2026-10-29")];
    await runNotificationPass();
    expect(sent("trial_ending_24h").map(r => r.orderId)).toEqual(["trial"]);
    expect(sent("subscription_expiring_3d").map(r => r.orderId)).toEqual(["paid"]);
  });

  it.each(["2026-10-28T01:29:59Z", "2026-10-28T14:30:00Z"])("gates only date events outside 08:00-21:00 even with force: %s", async now => {
    at(now);
    fixture.tables.vpn_orders = [order("trial", "2026-10-28", { order_type: "trial" }), order("paid", "2026-10-30"), order("ended", "2026-10-27")];
    fixture.tables.order_payments = ["confirmed", "rejected"].map(review_status => ({ id: review_status, order_id: review_status, customer_id: review_status, reseller_id: "tenant", review_status, reviewed_at: now,
      order: { status: "active", expiry_date: "2026-10-28" }, reseller_row: { notifications_paused: false } }));
    await runNotificationPass({ force: true });
    expect(fixture.send.mock.calls.map(([r]) => r.eventType)).toEqual(["payment_confirmed", "payment_rejected"]);
    await notifyDataLimitReached("paid");
    await notifyDataLimitWarning("paid", { percentUsed: 80, remainingGb: 2 });
    expect(sent("data_limit_reached")).toHaveLength(1);
    expect(sent("data_limit_warning")).toHaveLength(1);
  });

  it("suppresses converted trials while paid access is in its 04:00 grace", async () => {
    at("2026-10-28T19:30:00Z"); // 02:00 Myanmar, stored paid date already yesterday
    fixture.tables.vpn_orders = [order("trial", "2026-10-28", { order_type: "trial" }), order("paid", "2026-10-28", { customer_id: "customer-trial" })];
    await runNotificationPass();
    expect(sent("trial_ending_24h")).toHaveLength(0);
    // Exercise exclusion in an open window, including an already auto-expired trial.
    at("2026-10-28T01:30:00Z");
    fixture.tables.vpn_orders[0].expiry_date = "2026-10-27";
    fixture.tables.vpn_orders[0].status = "expired";
    await runNotificationPass();
    expect(sent("trial_expired")).toHaveLength(0);
  });

  it("preserves the rolling daily cap for expiry events", async () => {
    fixture.tables.vpn_orders = [order("paid", "2026-10-27")];
    fixture.tables.notifications_sent = ["data_limit_warning", "subscription_expiring_3d"].map(event_type => ({ customer_id: "customer-paid", event_type, order_id: "paid", sent_at: "2026-10-27T12:00:00Z" }));
    const result = await runNotificationPass();
    expect(result.per_event.subscription_expired).toMatchObject({ eligible: 1, sent: 0, skipped: 1 });
    expect(fixture.send).not.toHaveBeenCalled();
  });

  it("catches a delayed evening pass and drops events older than 24 hours", async () => {
    fixture.tables.vpn_orders = [order("paid", "2026-10-27", { status: "expired" })];
    at("2026-10-28T14:29:59Z");
    await runNotificationPass();
    expect(sent("subscription_expired")).toHaveLength(1);
    fixture.tables.notifications_sent = [];
    fixture.send.mockClear();
    at("2026-10-29T01:30:00Z");
    await runNotificationPass();
    expect(sent("subscription_expired")).toHaveLength(0);
  });

  it("suppresses trial reminders for paid customers and keeps tenants isolated", async () => {
    fixture.tables.vpn_orders = [order("converted", "2026-10-28", { order_type: "trial" }),
      order("paid", "2026-10-28", { customer_id: "customer-converted" }),
      order("other-tenant", "2026-10-28", { customer_id: "customer-converted", reseller_id: "other", order_type: "trial" })];
    await runNotificationPass();
    expect(sent("trial_ending_24h").map(r => r.orderId)).toEqual(["other-tenant"]);
  });

  it("ignores paused resellers and invalid dates", async () => {
    fixture.tables.vpn_orders = [order("paused", "2026-10-27", { reseller_row: { notifications_paused: true } }), order("invalid", null)];
    await runNotificationPass();
    expect(fixture.send).not.toHaveBeenCalled();
    expect(formatExpiryDeadline(null)).toBe("");
    expect(formatExpiryDeadline("2026-02-30")).toBe("");
  });

  it("keeps scheduled custom templates and falls back when none is configured", async () => {
    fixture.tables.vpn_orders = [order("custom", "2026-10-27"), order("default", "2026-10-27", { reseller_id: "other" })];
    fixture.tables.reseller_notification_templates = [{ reseller_id: "tenant", event_type: "subscription_expired", custom_text: "{expiry_date} | {expiry_deadline}" }];
    await runNotificationPass();
    const [custom, fallback] = sent("subscription_expired");
    expect(custom.text).toBe(`${formatBurmeseDate("2026-10-27")} | ${formatExpiryDeadline("2026-10-27")}`);
    expect(fallback.text).toContain(formatExpiryDeadline("2026-10-27"));
    expect(fallback.text).not.toContain("{expiry_deadline}");
  });

  it.each([["2026-12-31", "2027-01-01"], ["2028-02-29", "2028-03-01"]])("documents and renders exact next-day deadline for %s", async (date, next) => {
    at(`${next}T01:30:00Z`);
    fixture.tables.vpn_orders = [order("paid", date)];
    await runNotificationPass();
    const input = sent("subscription_expired")[0];
    expect(input).toBeDefined();
    expect(input.data).toMatchObject({ expiry_date: formatBurmeseDate(date), expiry_cutoff_at: `${date}T21:30:00.000Z`, expiry_timezone: "Asia/Yangon" });
    expect(input.data.expiry_deadline).toContain(formatBurmeseDate(next));
    expect(input.data.expiry_deadline).toContain("04:00");
    expect(input.data.expiry_deadline).toContain("Myanmar");
    for (const type of ["trial_ending_24h", "trial_expired", "subscription_expiring_3d", "subscription_expired"]) {
      expect(EVENT_META[type].placeholders).toContain("expiry_deadline");
      expect(renderNotification(type, input.data)).toContain(input.data.expiry_deadline);
      expect(renderNotification(type, input.data, "{expiry_date} | {expiry_deadline}")).toBe(`${formatBurmeseDate(date)} | ${input.data.expiry_deadline}`);
    }
  });
});
