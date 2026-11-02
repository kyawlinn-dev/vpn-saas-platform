import { describe, expect, it, vi } from "vitest";
import { createAdminPurchaseNotifier } from "../services/adminPurchaseNotificationService.js";

const record = { order: { id: "order", reseller_id: "tenant", source: "messenger", customer_id: "customer", order_type: "purchase" }, customer: { full_name: "Alice <Admin>" }, plan: { name: "Monthly", price_mmk: 4000, duration_days: 30, data_limit_gb: 50 }, config: { admin_telegram_user_id: 123, bot_token_encrypted: "cipher" }, payment: { payment_screenshot_url: "tenant/receipt.png" } };
function fixture(overrides = {}) {
  const deps = { lookup: vi.fn(async () => record), decrypt: vi.fn(() => "token"), signReceipt: vi.fn(async () => "https://storage.example/signed"),
    deliver: vi.fn(async (_, send) => ({ sent: true, ...(await send()) })), sendTelegram: vi.fn(async () => ({ messageId: "12" })), ...overrides };
  return { deps, notify: createAdminPurchaseNotifier(deps) };
}
describe("admin purchase notifications", () => {
  it("sends a signed Messenger receipt with existing review callbacks", async () => {
    const f = fixture();
    await f.notify({ resellerId: "tenant", orderId: "order" });
    const [, method, body] = f.deps.sendTelegram.mock.calls[0];
    expect(method).toBe("sendPhoto");
    expect(body.photo).toBe("https://storage.example/signed");
    expect(body.caption).toContain("Alice &lt;Admin&gt;");
    expect(body.caption).toContain("messenger");
    expect(body.reply_markup.inline_keyboard[0].map(x => x.callback_data)).toEqual(["pay_ok:order", "pay_no:order"]);
  });
  it("uses Telegram file IDs without signing them", async () => {
    const f = fixture();
    await f.notify({ resellerId: "tenant", orderId: "order", receipt: { kind: "telegram_file", fileId: "file" } });
    expect(f.deps.sendTelegram.mock.calls[0][2].photo).toBe("file");
    expect(f.deps.signReceipt).not.toHaveBeenCalled();
  });
  it("falls back to text if storage signing fails", async () => {
    const f = fixture({ signReceipt: vi.fn(async () => { throw new Error("storage down"); }) });
    await f.notify({ resellerId: "tenant", orderId: "order" });
    expect(f.deps.sendTelegram.mock.calls[0][1]).toBe("sendMessage");
  });
  it("does not disclose another tenant's order", async () => {
    const f = fixture();
    expect(await f.notify({ resellerId: "other", orderId: "order" })).toMatchObject({ sent: false, reason: "invalid_scope" });
    expect(f.deps.sendTelegram).not.toHaveBeenCalled();
  });
  it("reports missing configuration and never throws into checkout", async () => {
    const f = fixture({ lookup: vi.fn(async () => ({ ...record, config: {} })) });
    expect(await f.notify({ resellerId: "tenant", orderId: "order" })).toMatchObject({ sent: false, reason: "unconfigured" });
    f.deps.lookup.mockRejectedValue(new Error("database down"));
    expect(await f.notify({ resellerId: "tenant", orderId: "order" })).toMatchObject({ sent: false, reason: "notification_failed" });
  });
});
