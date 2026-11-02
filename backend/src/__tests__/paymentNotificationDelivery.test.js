import { describe, expect, it, vi } from "vitest";
import { createCustomerEventNotifier } from "../services/customerNotificationService.js";

function fixture(overrides = {}) {
  const record = { order: { id: "order", reseller_id: "tenant", customer_id: "customer", source: "bot" }, paused: false, recipientId: "sender", channel: "telegram", lastInteractionAt: new Date().toISOString(), legacySent: false };
  const deps = { lookup: vi.fn(async () => record), deliver: vi.fn(async (_, send) => { await send(); return { sent: true }; }), send: vi.fn(async () => ({ messageId: "123" })), ...overrides };
  return { record, deps, notify: createCustomerEventNotifier(deps) };
}
describe("shared customer payment notifications", () => {
  it("delivers immediately through the selected channel", async () => {
    const f = fixture();
    expect(await f.notify({ resellerId: "tenant", orderId: "order", eventType: "payment_confirmed" })).toMatchObject({ sent: true });
    expect(f.deps.send).toHaveBeenCalledWith(expect.objectContaining({ channel: "telegram" }), expect.objectContaining({ eventType: "payment_confirmed" }));
  });
  it("keys separate reviewed payments independently even on the same order", async () => {
    const f = fixture();
    f.record.eventKey = "payment-1";
    await f.notify({ resellerId: "tenant", orderId: "order", eventType: "payment_confirmed" });
    f.record.eventKey = "payment-2";
    await f.notify({ resellerId: "tenant", orderId: "order", eventType: "payment_confirmed" });
    expect(f.deps.deliver.mock.calls.map(call => call[0].eventKey)).toEqual(["payment-1", "payment-2"]);
  });
  it("respects customer pause and historic successful delivery", async () => {
    const f = fixture(); f.record.paused = true;
    expect(await f.notify({ resellerId: "tenant", orderId: "order", eventType: "payment_rejected" })).toMatchObject({ reason: "paused" });
    f.record.paused = false; f.record.legacySent = true;
    expect(await f.notify({ resellerId: "tenant", orderId: "order", eventType: "payment_rejected" })).toMatchObject({ reason: "already_sent" });
    expect(f.deps.send).not.toHaveBeenCalled();
  });
  it("rejects a deferred delivery channel before claiming or sending", async () => {
    const f = fixture(); f.record.channel = "messenger";
    expect(await f.notify({ resellerId: "tenant", orderId: "order", eventType: "payment_confirmed" })).toMatchObject({ reason: "unsupported_channel" });
    expect(f.deps.send).not.toHaveBeenCalled();
    expect(f.deps.deliver).not.toHaveBeenCalled();
  });
  it("cannot send another tenant's payment data", async () => {
    const f = fixture();
    expect(await f.notify({ resellerId: "other", orderId: "order", eventType: "payment_confirmed" })).toMatchObject({ reason: "invalid_scope" });
    expect(f.deps.send).not.toHaveBeenCalled();
  });
  it("contains storage or delivery errors after a committed review", async () => {
    const f = fixture({ lookup: vi.fn(async () => { throw new Error("database down"); }) });
    expect(await f.notify({ resellerId: "tenant", orderId: "order", eventType: "payment_confirmed" })).toMatchObject({ sent: false });
  });
});
