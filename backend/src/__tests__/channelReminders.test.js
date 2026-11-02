import { describe, expect, it, vi } from "vitest";
import { createCustomerEventNotifier } from "../services/customerNotificationService.js";
const mocks = vi.hoisted(() => ({ count: 0, send: vi.fn(), insert: vi.fn() }));
vi.mock("../services/customerNotificationService.js", async importOriginal => ({ ...(await importOriginal()), notifyCustomerEvent: mocks.send }));
vi.mock("../lib/supabase.js", () => ({ supabase: { from: () => {
  const q = { select: () => q, eq: () => q, gte: () => q, not: () => q, maybeSingle: async () => ({ data: null }),
    insert: async value => { mocks.insert(value); return {}; }, then: (resolve, reject) => Promise.resolve({ count: mocks.count }).then(resolve, reject) };
  return q;
} } }));
import { sendAndRecord } from "../services/notificationService.js";

describe("channel-aware reminders", () => {
  it("uses the shared customer adapter and records its selected channel", async () => {
    mocks.count = 0; mocks.send.mockResolvedValue({ sent: true, channel: "telegram" }); mocks.insert.mockClear();
    await sendAndRecord({ resellerId: "tenant", customerId: "customer", orderId: "order", eventType: "data_limit_warning", text: "Quota warning", data: { percent_used: 85, remaining_gb: 7 } });
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ resellerId: "tenant", orderId: "order", data: { percent_used: 85, remaining_gb: 7 } }));
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ channel: "telegram" }));
  });
  it("does not delay payment results behind the reminder cap", async () => {
    mocks.count = 2; mocks.send.mockClear(); mocks.send.mockResolvedValue({ sent: true, channel: "telegram" });
    await sendAndRecord({ resellerId: "tenant", customerId: "customer", orderId: "order", eventType: "payment_confirmed", text: "Confirmed" });
    expect(mocks.send).toHaveBeenCalledOnce();
    mocks.send.mockClear();
    expect(await sendAndRecord({ resellerId: "tenant", customerId: "customer", orderId: "order", eventType: "trial_expired", text: "Expired" })).toMatchObject({ reason: "daily_cap_hit" });
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it.each(["trial_expired", "subscription_expiring_3d", "data_limit_warning"])("sends %s to a Telegram identity", async eventType => {
    const send = vi.fn();
    const notify = createCustomerEventNotifier({ lookup: async () => ({ order: { id: "order", reseller_id: "tenant" }, channel: "telegram", recipientId: "sender", lastInteractionAt: new Date().toISOString() }),
      deliver: async (_, run) => { await run(); return { sent: true }; }, send });
    await notify({ resellerId: "tenant", orderId: "order", eventType });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ channel: "telegram" }), expect.objectContaining({ eventType }));
  });
});
