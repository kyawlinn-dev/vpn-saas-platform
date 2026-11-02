import { afterEach, beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ tables: {}, telegram: vi.fn() }));
vi.mock("../lib/supabase.js", () => ({ supabase: { from(table) {
  let rows = fixture.tables[table] || [];
  const q = { select: () => q, eq: (key, value) => { rows = rows.filter(row => row[key] === value); return q; },
    maybeSingle: async () => ({ data: rows[0] || null, error: null }) };
  return q;
} } }));
vi.mock("../services/notificationDeliveryService.js", () => ({ deliverOnce: async (_, send) => { await send(); return { sent: true }; } }));
vi.mock("../services/adminPurchaseNotificationService.js", () => ({ sendTelegramNotification: fixture.telegram }));
vi.mock("../lib/tokenEncryption.js", () => ({ decrypt: () => "test-token" }));
vi.mock("../lib/logger.js", () => ({ logger: { warn() {} } }));

import { notifyCustomerEvent } from "../services/customerNotificationService.js";
import { formatBurmeseDate, formatExpiryDeadline } from "../bot/notificationTemplates.js";

function telegramText() { return fixture.telegram.mock.calls[0]?.[2].text || ""; }

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-29T01:30:00Z"));
  fixture.telegram.mockReset().mockResolvedValue({ message_id: "message" });
  fixture.tables = {
    vpn_orders: [{ id: "order", reseller_id: "tenant", customer_id: "customer", source: "bot", expiry_date: "2026-10-28", status: "expired", plan: { name: "Plan" }, customer: { reseller_id: "tenant" }, reseller: { notifications_paused: false } }],
    reseller_miniapps: [{ reseller_id: "tenant", brand_name: "Brand", bot_token_encrypted: "cipher" }],
    telegram_links: [{ reseller_id: "tenant", customer_id: "customer", telegram_user_id: 123 }],
    notifications_sent: [], reseller_notification_templates: [],
  };
});
afterEach(() => vi.useRealTimers());

it.each(["bot", "miniapp"])("fresh %s rendering supplies deadline without caller data or custom template", async channel => {
  fixture.tables.vpn_orders[0].source = channel;
  const result = await notifyCustomerEvent({ resellerId: "tenant", orderId: "order", eventType: "subscription_expired" });
  expect(result.sent).toBe(true);
  const text = telegramText();
  expect(text).toContain(formatExpiryDeadline("2026-10-28"));
  expect(text).toContain("04:00 (Myanmar)");
});

it("keeps the old date and new deadline available to fresh custom rendering", async () => {
  fixture.tables.reseller_notification_templates = [{ reseller_id: "tenant", event_type: "subscription_expired", custom_text: "{expiry_date} | {expiry_deadline} | {expiry_cutoff_at} | {expiry_timezone}" }];
  await notifyCustomerEvent({ resellerId: "tenant", orderId: "order", eventType: "subscription_expired" });
  expect(telegramText()).toBe(`${formatBurmeseDate("2026-10-28")} | ${formatExpiryDeadline("2026-10-28")} | 2026-10-28T21:30:00.000Z | Asia/Yangon`);
});
