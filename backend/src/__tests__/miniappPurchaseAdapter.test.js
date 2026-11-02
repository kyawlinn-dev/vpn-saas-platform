import crypto from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(), submitPurchase: vi.fn(), decrypt: vi.fn(), trackAppEvent: vi.fn(),
  notifyPurchaseSubmitted: vi.fn(async () => ({ sent: true })),
}));
vi.mock("../services/adminPurchaseNotificationService.js", () => ({ notifyPurchaseSubmitted: mocks.notifyPurchaseSubmitted }));
vi.mock("../lib/supabase.js", () => ({ supabase: { from: mocks.from } }));
vi.mock("../lib/tokenEncryption.js", () => ({ decrypt: mocks.decrypt }));
vi.mock("../services/purchaseService.js", () => ({
  submitPurchase: mocks.submitPurchase,
  PurchaseError: class PurchaseError extends Error {
    constructor(message, code = "PURCHASE_FAILED", status = 409) {
      super(message);
      this.code = code;
      this.status = status;
    }
  },
}));
vi.mock("../services/vpnProviderService.js", () => ({
  createKey: vi.fn(), deleteKey: vi.fn(), getTransferMetrics: vi.fn(), serviceIdsForOrder: vi.fn(),
}));
vi.mock("../services/serverService.js", () => ({
  incrementServerUsage: vi.fn(), decrementServerUsage: vi.fn(), setServerError: vi.fn(), clearServerError: vi.fn(),
}));
vi.mock("../services/orderLifecycleService.js", () => ({ OrderLifecycleError: class extends Error {} }));
vi.mock("../services/miniAppServerState.js", () => ({ isCurrentMiniAppServer: vi.fn() }));
vi.mock("../services/trialService.js", () => ({ createTrialOrder: vi.fn(), provisionTrialKey: vi.fn() }));
vi.mock("../services/publicAccessUrlService.js", () => ({
  buildDynamicAccessUrl: vi.fn(), buildSsconfHttpUrl: vi.fn(), buildAccessUrlForProtocol: vi.fn(),
}));
vi.mock("../services/subscriptionProvisionService.js", () => ({
  getOrderQuotaSnapshot: vi.fn(), resolveRemainingKeyLimitBytes: vi.fn(),
}));
vi.mock("../services/appEventService.js", () => ({
  buildRequestEventContext: vi.fn(() => ({})), trackAppEvent: mocks.trackAppEvent,
}));
vi.mock("../bot/strings.js", () => ({
  resellerNotifyCaption: vi.fn(), NOTIFY_CONFIRM_BTN: "Confirm", NOTIFY_REJECT_BTN: "Reject",
}));

// Force the production auth branch before the route evaluates its IS_DEV flag.
vi.hoisted(() => { vi.stubEnv("NODE_ENV", "test"); });
import router from "../routes/public/resellerMiniappRoutes.js";
import { PurchaseError } from "../services/purchaseService.js";

const route = router.stack.find((layer) => layer.route?.path === "/:slug/orders" && layer.route.methods.post).route;
const handler = route.stack.at(-1).handle;
const botToken = "123456:synthetic-test-token";
const userId = 123456789;
const miniapp = {
  id: "workspace-a", reseller_id: "reseller-a", miniapp_slug: "brand-a",
  brand_name: "Brand A", is_enabled: true, bot_token_encrypted: "fake-ciphertext",
  admin_telegram_user_id: null,
};
const customer = {
  id: "customer-a", full_name: "Alice", telegram_username: "alice", status: "active",
  customer_type: "telegram", protocol_preference: "vless",
};
const link = { id: "link-a", customer_id: customer.id, reseller_id: miniapp.reseller_id, telegram_user_id: userId, vpn_customers: customer };
const plan = { id: "plan-a", name: "Monthly", price_mmk: 10000, duration_days: 30, data_limit_gb: 100 };
const screenshot = "brand-a/reseller-a/receipt.jpg";
const queuedOrder = {
  id: "order-a", status: "scheduled", payment_status: "unpaid", review_status: "pending_review",
  order_type: "purchase", source: "miniapp", price_mmk: 10000, start_date: null, expiry_date: null,
  payment_screenshot_url: screenshot, payment_note: "receipt note", created_at: "2026-10-13T00:00:00.000Z",
  vpn_plans: plan,
};
let queries;

function signedInitData({ id = userId, token = botToken, ageSeconds = 0 } = {}) {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000) - ageSeconds),
    query_id: "synthetic-query", user: JSON.stringify({ id, first_name: "Alice" }),
  });
  const payload = Array.from(params.entries()).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`).join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  params.set("hash", crypto.createHmac("sha256", secret).update(payload).digest("hex"));
  return params.toString();
}

function enqueue(table, data, error = null) {
  mocks.from.mockImplementationOnce((actualTable) => {
    expect(actualTable).toBe(table);
    const entry = { table, calls: [] };
    queries.push(entry);
    const chain = {};
    for (const method of ["select", "eq", "update", "is", "order", "limit"]) {
      chain[method] = vi.fn((...args) => { entry.calls.push([method, ...args]); return chain; });
    }
    chain.single = chain.maybeSingle = vi.fn(async () => ({ data, error }));
    return chain;
  });
}

function prepareCustomer(selectedLink = link) {
  enqueue("telegram_links", selectedLink);
  if (selectedLink?.vpn_customers?.status === "active") {
    enqueue("vpn_customers", { ssconf_token: "existing-test-token" });
  }
}

async function invoke(body = {}, requestKey) {
  const req = {
    params: { slug: miniapp.miniapp_slug },
    body: {
      telegram_user_id: String(userId), plan_id: plan.id, init_data: signedInitData(),
      payment_screenshot_url: screenshot, payment_note: "receipt note", ...body,
    },
    get: vi.fn((header) => header === "Idempotency-Key" ? requestKey : undefined),
  };
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  await handler(req, res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  queries = [];
  mocks.from.mockReset();
  mocks.from.mockImplementation((table) => { throw new Error(`Unexpected database access: ${table}`); });
  mocks.decrypt.mockReset();
  mocks.decrypt.mockReturnValue(botToken);
  mocks.submitPurchase.mockReset();
  mocks.submitPurchase.mockResolvedValue({
    order: queuedOrder, payment: { id: "payment-a", amount_mmk: 10000, review_status: "pending_review", apply_status: "pending" }, plan, reseller: { id: miniapp.reseller_id },
    customer, isQueued: true, activation: null, replayed: false,
  });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network access forbidden in adapter tests"); }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
afterAll(() => { vi.unstubAllEnvs(); });

describe("Mini App purchase adapter", () => {
  it("uses HMAC-authenticated tenant/customer identity and preserves queued HTTP 201 shape", async () => {
    enqueue("reseller_miniapps", miniapp);
    prepareCustomer();
    const res = await invoke({
      init_data: ` ${signedInitData()} `, protocol_preference: "hysteria2",
      actor: { role: "reseller" }, channel: "dashboard", reseller_id: "reseller-b", customer_id: "customer-b",
      payment_status: "paid", review_status: "confirmed", price_mmk: 1,
    }, "request-a");
    expect(mocks.decrypt).toHaveBeenCalledWith("fake-ciphertext");
    expect(mocks.submitPurchase).toHaveBeenCalledTimes(1);
    expect(mocks.submitPurchase).toHaveBeenCalledWith({
      actor: { role: "customer", resellerId: "reseller-a" }, channel: "miniapp",
      customerId: customer.id, planId: plan.id, protocol: "hysteria2", screenshotPath: screenshot,
      paymentNote: "receipt note", requestKey: "request-a",
    });
    expect(queries[0].calls).toContainEqual(["eq", "miniapp_slug", "brand-a"]);
    expect(queries[1].calls).toContainEqual(["eq", "reseller_id", "reseller-a"]);
    expect(queries[1].calls).toContainEqual(["eq", "telegram_user_id", userId]);
    expect(queries[2].calls).toContainEqual(["eq", "id", customer.id]);
    expect(mocks.from).toHaveBeenCalledTimes(3);
    expect(res.status).toHaveBeenCalledWith(201);
    const { vpn_plans, ...publicOrder } = queuedOrder;
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Order submitted to queue. It will activate automatically when your current package ends.",
      data: { order: expect.objectContaining({ ...publicOrder, plan: vpn_plans, amount_mmk: 10000,
        business_summary: expect.objectContaining({ access_status: "queued", payment_review_status: "awaiting_review" }) }), is_queued: true },
    });
    expect(mocks.trackAppEvent).toHaveBeenCalledWith(expect.objectContaining({
      event_name: "order_submitted", reseller_id: "reseller-a", customer_id: customer.id,
      telegram_user_id: userId, payment_id: "payment-a", server_id: null,
      metadata: expect.objectContaining({ is_queued: true }),
    }));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses customer protocol preference and omits absent request key", async () => {
    enqueue("reseller_miniapps", miniapp);
    prepareCustomer();
    await invoke({ protocol_preference: "", payment_note: undefined });
    expect(mocks.submitPurchase).toHaveBeenCalledWith(expect.objectContaining({
      protocol: "vless", paymentNote: undefined, requestKey: undefined,
    }));
  });

  it.each([
    ["missing", () => undefined, "MISSING_INIT_DATA"],
    ["malformed", () => "hash=invalid", "INVALID_INIT_DATA"],
    ["wrong bot", () => signedInitData({ token: "another-synthetic-token" }), "INVALID_INIT_DATA"],
    ["expired", () => signedInitData({ ageSeconds: 86401 }), "INVALID_INIT_DATA"],
    ["tampered user", () => { const p = new URLSearchParams(signedInitData()); p.set("user", JSON.stringify({ id: userId + 1 })); return p.toString(); }, "INVALID_INIT_DATA"],
  ])("rejects %s authentication before receipt/customer lookup", async (_label, initData, code) => {
    enqueue("reseller_miniapps", miniapp);
    const res = await invoke({ init_data: initData() });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, code }));
    expect(mocks.from).toHaveBeenCalledTimes(1);
    expect(mocks.submitPurchase).not.toHaveBeenCalled();
  });

  it("rejects a valid signed user that differs from the requested user", async () => {
    enqueue("reseller_miniapps", miniapp);
    const res = await invoke({ init_data: signedInitData({ id: userId + 1 }) });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ success: false, code: "TELEGRAM_USER_MISMATCH", message: "Telegram user does not match this request" });
    expect(mocks.submitPurchase).not.toHaveBeenCalled();
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });

  it("rejects a disabled workspace before decrypting the bot token", async () => {
    enqueue("reseller_miniapps", { ...miniapp, is_enabled: false });
    const res = await invoke();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mocks.decrypt).not.toHaveBeenCalled();
    expect(mocks.submitPurchase).not.toHaveBeenCalled();
  });

  it("requires a configured bot for HMAC authentication", async () => {
    enqueue("reseller_miniapps", { ...miniapp, bot_token_encrypted: null });
    const res = await invoke();
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "BOT_NOT_CONFIGURED" }));
    expect(mocks.submitPurchase).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "brand-a/reseller-b/receipt.jpg", "brand-b/reseller-a/receipt.jpg", "https://foreign.example/receipt.jpg", "brand-a/reseller-a/receipt.pdf"])
    ("rejects invalid or foreign-tenant receipt %s before customer lookup", async (path) => {
      enqueue("reseller_miniapps", miniapp);
      const res = await invoke({ payment_screenshot_url: path });
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: "Payment screenshot is required" });
      expect(mocks.from).toHaveBeenCalledTimes(1);
      expect(mocks.submitPurchase).not.toHaveBeenCalled();
    });

  it("rejects a missing tenant-scoped Telegram link", async () => {
    enqueue("reseller_miniapps", miniapp);
    prepareCustomer(null);
    const res = await invoke();
    expect(queries[1].calls).toContainEqual(["eq", "reseller_id", miniapp.reseller_id]);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mocks.submitPurchase).not.toHaveBeenCalled();
  });

  it("rejects an inactive linked customer before token lookup or purchase", async () => {
    enqueue("reseller_miniapps", miniapp);
    prepareCustomer({ ...link, vpn_customers: { ...customer, status: "inactive" } });
    const res = await invoke();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: "Customer is inactive" });
    expect(mocks.from).toHaveBeenCalledTimes(2);
    expect(mocks.submitPurchase).not.toHaveBeenCalled();
  });

  it.each([
    ["IDEMPOTENCY_CONFLICT", 409, "Different request", 409, "Different request"],
    ["INVALID_CALLER", 403, "Invalid caller", 403, "Invalid caller"],
    ["INVALID_PLAN", 400, "Invalid plan", 404, "Invalid plan"],
    ["PURCHASE_UNDER_REVIEW", 409, "Shared review conflict", 409, "Your current payment is under review. Please wait before buying another package."],
    ["QUEUED_PACKAGE_EXISTS", 409, "Shared queue conflict", 409, "You already have a queued package waiting."],
  ])("preserves shared error %s with the Mini App's status/message compatibility mapping", async (code, status, message, expectedStatus, expectedMessage) => {
    enqueue("reseller_miniapps", miniapp);
    prepareCustomer();
    mocks.submitPurchase.mockRejectedValue(new PurchaseError(message, code, status));
    const res = await invoke();
    expect(res.status).toHaveBeenCalledWith(expectedStatus);
    expect(res.json).toHaveBeenCalledWith({ success: false, code, message: expectedMessage });
    expect(mocks.trackAppEvent).not.toHaveBeenCalled();
  });
});
