import { describe, expect, it, vi } from "vitest";
import { createNotificationDelivery } from "../services/notificationDeliveryService.js";

const identity = { resellerId: "tenant", eventType: "purchase_submitted", recordId: "order", channel: "telegram", recipientId: "admin" };
function fixture() {
  let status = "pending";
  let owner;
  const repository = {
    claim: vi.fn(async (_, token) => {
      if (!["pending", "retryable"].includes(status)) return null;
      status = "sending"; owner = token;
      return { id: "delivery", attempt_count: 1 };
    }),
    finish: vi.fn(async (_, token, result) => {
      if (token !== owner) return false;
      status = result.status; return true;
    }),
  };
  return { repository, deliver: createNotificationDelivery(repository), status: () => status };
}
describe("durable notification delivery", () => {
  it("claims one send across concurrent calls and replay", async () => {
    const f = fixture(), send = vi.fn(async () => ({ messageId: "123" }));
    await Promise.all([f.deliver(identity, send), f.deliver(identity, send)]);
    await f.deliver(identity, send);
    expect(send).toHaveBeenCalledOnce();
    expect(f.status()).toBe("sent");
    expect(f.repository.finish.mock.calls[0][2].providerMessageId).toBe("123");
  });
  it("never retries an ambiguous provider failure", async () => {
    const f = fixture(), send = vi.fn(async () => { throw new Error("timeout"); });
    expect(await f.deliver(identity, send)).toMatchObject({ sent: false, reason: "uncertain" });
    await f.deliver(identity, send);
    expect(send).toHaveBeenCalledOnce();
  });
  it("allows bounded retry only for an explicit rejected request", async () => {
    const f = fixture();
    const error = Object.assign(new Error("rate limited"), { deliveryStatus: "retryable", code: "429" });
    await f.deliver(identity, async () => { throw error; });
    expect(f.repository.finish.mock.calls[0][2]).toMatchObject({ status: "retryable", errorCode: "429" });
  });
  it("does not send when persistence fails", async () => {
    const f = fixture(), send = vi.fn();
    f.repository.claim.mockRejectedValue(new Error("database unavailable"));
    expect(await f.deliver(identity, send)).toMatchObject({ sent: false, reason: "storage_failed" });
    expect(send).not.toHaveBeenCalled();
  });
  it("refuses incomplete identities before contacting a provider", async () => {
    const f = fixture(), send = vi.fn();
    expect(await f.deliver({ ...identity, resellerId: null }, send)).toMatchObject({ sent: false, reason: "invalid_identity" });
    expect(send).not.toHaveBeenCalled();
  });
});
