import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../lib/supabase.js", () => ({ supabase: {} }));
vi.mock("../services/orderLifecycleService.js", () => ({ activatePendingReviewPurchase: vi.fn() }));
vi.mock("../services/paymentLedgerService.js", () => ({ syncOrderPaymentSummary: vi.fn() }));
import { createPurchaseService } from "../services/purchaseService.js";

let deps;
let submit;
const command = { actor: { role: "customer", resellerId: "reseller-1" }, channel: "bot", customerId: "customer-1", planId: "plan-1", protocol: "vless", screenshotPath: "bot/reseller-1/receipt.jpg", requestKey: "request-1" };
beforeEach(() => {
  deps = {
    prepare: vi.fn().mockResolvedValue({ operationId: "op-1", replayed: false }),
    load: vi.fn().mockResolvedValue({ order: { id: "order-1", status: "pending", order_type: "purchase", reseller_id: "reseller-1", customer_id: "customer-1" }, payment: { id: "payment-1" }, plan: { id: "plan-1" }, reseller: { id: "reseller-1" }, customer: { id: "customer-1" }, isQueued: false, completed: false }),
    claim: vi.fn().mockResolvedValue(true),
    pendingKeys: vi.fn().mockResolvedValue(false),
    activate: vi.fn().mockResolvedValue({ order: { id: "order-1", status: "active" } }),
    complete: vi.fn().mockResolvedValue(undefined),
    fail: vi.fn().mockResolvedValue(undefined),
  };
  submit = createPurchaseService(deps);
});
describe("shared purchase operation", () => {
  it("provisions initial customer purchases through the existing lifecycle once", async () => {
    const result = await submit(command);
    expect(result.order.status).toBe("active");
    expect(deps.activate).toHaveBeenCalledOnce();
    expect(deps.complete).toHaveBeenCalledOnce();
    expect(deps.prepare.mock.calls[0][0].paymentStatus).toBe("unpaid");
  });
  it("does not allow a customer to become staff or confirm their own payment", async () => {
    await expect(submit({ ...command, actor: { ...command.actor, role: "reseller" } })).rejects.toMatchObject({ code: "INVALID_CALLER" });
    await submit({ ...command, paymentStatus: "paid", priceMmk: 1 });
    expect(deps.prepare.mock.calls[0][0].paymentStatus).toBe("unpaid");
    expect(deps.prepare.mock.calls[0][0]).not.toHaveProperty("priceMmk");
  });
  it("requires a receipt for customer purchases", async () => {
    await expect(submit({ ...command, screenshotPath: null })).rejects.toMatchObject({ code: "SCREENSHOT_REQUIRED" });
    expect(deps.prepare).not.toHaveBeenCalled();
  });
  it("returns a queued package without changing active access", async () => {
    deps.load.mockResolvedValue({ order: { id: "order-1", status: "scheduled" }, isQueued: true });
    expect((await submit(command)).isQueued).toBe(true);
    expect(deps.activate).not.toHaveBeenCalled();
  });
  it("preserves staff pending creation without automatic provisioning", async () => {
    await submit({ ...command, channel: "dashboard", actor: { role: "reseller", resellerId: "reseller-1" }, screenshotPath: null, paymentStatus: "paid" });
    expect(deps.prepare.mock.calls[0][0].paymentStatus).toBe("paid");
    expect(deps.activate).not.toHaveBeenCalled();
  });
  it("replays a completed purchase without provisioning again", async () => {
    deps.load.mockResolvedValue({ order: { id: "order-1", status: "active" }, completed: true });
    expect((await submit(command)).replayed).toBe(true);
    expect(deps.claim).not.toHaveBeenCalled();
  });
  it("refuses concurrent activation while the operation is leased", async () => {
    deps.claim.mockResolvedValue(false);
    await expect(submit(command)).rejects.toMatchObject({ code: "PURCHASE_PROCESSING" });
    expect(deps.activate).not.toHaveBeenCalled();
  });
  it("stops on an ambiguous panel reservation instead of creating another user", async () => {
    deps.pendingKeys.mockResolvedValue(true);
    await expect(submit(command)).rejects.toMatchObject({ code: "PURCHASE_RECOVERY_REQUIRED" });
    expect(deps.activate).not.toHaveBeenCalled();
    expect(deps.fail).toHaveBeenCalled();
  });
  it("retains the operation on activation failure for a retry", async () => {
    deps.activate.mockRejectedValueOnce(new Error("panel unavailable"));
    await expect(submit(command)).rejects.toThrow("panel unavailable");
    expect(deps.fail).toHaveBeenCalled();
    expect(deps.complete).not.toHaveBeenCalled();
    await submit(command);
    expect(deps.activate).toHaveBeenCalledTimes(2);
  });
  it("resumes the recorded purchase when a retry uploads a new receipt path", async () => {
    const stored = { resellerId: "reseller-1", customerId: "customer-1", planId: "plan-1", channel: "bot", policy: "customer", protocol: "vless", screenshotPath: "original.jpg", paymentNote: null, paymentStatus: "unpaid", requestKey: "original-request" };
    deps.resume = vi.fn().mockResolvedValue(stored);
    await submit({ ...command, screenshotPath: "fresh-upload.jpg", requestKey: "new-session" });
    expect(deps.prepare).toHaveBeenCalledWith(stored);
    expect(deps.activate).toHaveBeenCalledOnce();
  });
  it("does not reuse unfinished checkout for a different plan", async () => {
    deps.resume = vi.fn().mockResolvedValue({ resellerId: "reseller-1", customerId: "customer-1",
      planId: "other", channel: "bot", policy: "customer", protocol: "vless",
      screenshotPath: "original.jpg", paymentNote: null, paymentStatus: "unpaid", requestKey: "original-request" });
    await expect(submit(command)).rejects.toMatchObject({ code: "PURCHASE_RECOVERY_REQUIRED" });
    expect(deps.prepare).not.toHaveBeenCalled();
  });
});
