import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), submitPurchase: vi.fn() }));

vi.mock("../lib/supabase.js", () => ({ supabase: { from: mocks.from } }));
vi.mock("../services/customerOrderEnrichmentService.js", () => ({ enrichOrderAccess: vi.fn() }));
vi.mock("../middleware/requireMiniapp.js", () => ({ requireMiniapp: vi.fn() }));
vi.mock("../services/purchaseService.js", () => ({
  submitPurchase: mocks.submitPurchase,
  PurchaseError: class PurchaseError extends Error {
    constructor(message, code = "PURCHASE_FAILED", status = 409) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
}));

import router from "../routes/reseller/resellerOrdersRouter.js";
import { PurchaseError } from "../services/purchaseService.js";

const handler = router.stack.find((layer) => layer.route?.path === "/" && layer.route.methods.post)
  .route.stack[0].handle;
const plan = { id: "plan-a", is_active: true, is_trial: false, price_mmk: 10001 };
const customer = {
  id: "customer-a", reseller_id: "reseller-a", full_name: "Alice",
  telegram_username: null, phone: null, notes: null, customer_type: "normal",
  protocol_preference: "shadowsocks",
};
const order = { id: "order-a", status: "pending", customer: { id: customer.id }, plan };
let queries;

function query(table, data, error = null) {
  const entry = { table, calls: [] };
  queries.push(entry);
  const chain = {};
  for (const method of ["select", "eq", "order", "limit", "insert", "update"]) {
    chain[method] = vi.fn((...args) => {
      entry.calls.push([method, ...args]);
      return chain;
    });
  }
  chain.single = chain.maybeSingle = vi.fn(async () => ({ data, error }));
  chain.then = (resolve, reject) => Promise.resolve({ data, error }).then(resolve, reject);
  return chain;
}

function enqueue(table, data, error = null) {
  mocks.from.mockImplementationOnce((actualTable) => {
    expect(actualTable).toBe(table);
    return query(table, data, error);
  });
}

async function invoke(body = {}, key) {
  const req = {
    body: { full_name: "Alice", plan_id: plan.id, customer_id: customer.id, ...body },
    reseller: { id: "reseller-a", commission_percent: 0 },
    get: vi.fn((header) => header === "Idempotency-Key" ? key : undefined),
  };
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  await handler(req, res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockReset();
  mocks.from.mockImplementation((table) => { throw new Error(`Unexpected database access: ${table}`); });
  mocks.submitPurchase.mockReset();
  mocks.submitPurchase.mockResolvedValue({ order, payment: null, isQueued: false, activation: null });
  queries = [];
});

describe("dashboard manual purchase preparation adapter", () => {
  it("passes normalized input and trusted actor, ignoring client accounting/permissions", async () => {
    enqueue("vpn_plans", plan);
    enqueue("vpn_customers", customer);
    const res = await invoke({
      full_name: " Alice ", plan_id: " plan-a ", customer_id: " customer-a ",
      payment_status: " paid ", payment_note: " receipt ", payment_screenshot_url: " tenant/receipt.png ",
      reseller_id: "reseller-b", source: "admin", review_status: "rejected",
      commission_percent: 99, price_mmk: 1, status: "active", server_id: "server-b",
    }, "request-a");

    expect(mocks.submitPurchase).toHaveBeenCalledTimes(1);
    expect(mocks.submitPurchase).toHaveBeenCalledWith({
      actor: { role: "reseller", resellerId: "reseller-a" }, channel: "dashboard",
      customerId: customer.id, planId: plan.id, protocol: "shadowsocks",
      paymentStatus: "paid", screenshotPath: "tenant/receipt.png", paymentNote: "receipt",
      requestKey: "request-a",
    });
    expect(queries[0].calls).toContainEqual(["eq", "is_active", true]);
    expect(queries[1].calls).toContainEqual(["eq", "reseller_id", "reseller-a"]);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(order);
    expect(mocks.from).toHaveBeenCalledTimes(2);
  });

  it.each(["unpaid", "PAID", "refunded", undefined])("forwards %s for service-owned manual policy", async (value) => {
    enqueue("vpn_plans", plan);
    enqueue("vpn_customers", customer);
    await invoke({ payment_status: value });
    expect(mocks.submitPurchase).toHaveBeenCalledWith(expect.objectContaining({
      paymentStatus: value ?? null, screenshotPath: null, paymentNote: null, requestKey: undefined,
    }));
  });

  it("permits an active trial plan without introducing a workspace or trial-history lookup", async () => {
    enqueue("vpn_plans", { ...plan, is_trial: true });
    enqueue("vpn_customers", customer);
    await invoke({ payment_status: "unpaid" });
    expect(mocks.submitPurchase).toHaveBeenCalledWith(expect.objectContaining({ planId: plan.id, paymentStatus: "unpaid" }));
    expect(queries.map((entry) => entry.table)).toEqual(["vpn_plans", "vpn_customers"]);
  });

  it("requires name even when a customer ID is supplied", async () => {
    const res = await invoke({ full_name: " " });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "full_name and plan_id are required" });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.submitPurchase).not.toHaveBeenCalled();
  });

  it("rejects an inactive/missing plan before customer preparation", async () => {
    enqueue("vpn_plans", null);
    const res = await invoke();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Invalid or inactive plan" });
    expect(mocks.submitPurchase).not.toHaveBeenCalled();
  });

  it("does not fall back to contact matching for an explicit foreign customer ID", async () => {
    enqueue("vpn_plans", plan);
    enqueue("vpn_customers", null);
    const res = await invoke({ customer_id: "foreign-id", phone: "123" });
    expect(queries[1].calls).toContainEqual(["eq", "id", "foreign-id"]);
    expect(queries[1].calls).toContainEqual(["eq", "reseller_id", "reseller-a"]);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "Customer not found for this reseller" });
    expect(mocks.from).toHaveBeenCalledTimes(2);
    expect(mocks.submitPurchase).not.toHaveBeenCalled();
  });

  it("prefers the newest phone match over Telegram username", async () => {
    const existing = { ...customer, phone: "123", telegram_username: "old-handle" };
    enqueue("vpn_plans", plan);
    enqueue("vpn_customers", [existing]);
    await invoke({ customer_id: null, phone: "123", telegram_username: "new-handle" });
    expect(queries[1].calls).toContainEqual(["eq", "phone", "123"]);
    expect(queries[1].calls).toContainEqual(["order", "created_at", { ascending: false }]);
    expect(mocks.from).toHaveBeenCalledTimes(2);
    expect(mocks.submitPurchase).toHaveBeenCalledWith(expect.objectContaining({ customerId: customer.id }));
  });

  it("creates a normal tenant-owned customer after unmatched contacts", async () => {
    enqueue("vpn_plans", plan);
    enqueue("vpn_customers", []);
    enqueue("vpn_customers", []);
    enqueue("vpn_customers", { ...customer, protocol_preference: "vless" });
    await invoke({ customer_id: null, phone: "123", telegram_username: "handle", protocol_preference: "vless" });
    expect(queries[2].calls).toContainEqual(["eq", "telegram_username", "handle"]);
    expect(queries[3].calls).toContainEqual(["insert", {
      reseller_id: "reseller-a", full_name: "Alice", phone: "123", telegram_username: "handle",
      notes: null, status: "active", customer_type: "normal", protocol_preference: "vless",
    }]);
    expect(mocks.submitPurchase).toHaveBeenCalledWith(expect.objectContaining({ protocol: "vless" }));
  });

  it("retains customer mutation before conflict and maps the exact legacy 409", async () => {
    enqueue("vpn_plans", plan);
    enqueue("vpn_customers", { ...customer, full_name: "Old name", protocol_preference: "vless" });
    enqueue("vpn_customers", customer);
    mocks.submitPurchase.mockRejectedValue(new PurchaseError("Shared conflict", "ACTIVE_PACKAGE_EXISTS", 409));
    const res = await invoke({ notes: " internal ", protocol_preference: "invalid" });
    expect(queries[2].calls).toContainEqual(["update", {
      full_name: "Alice", notes: "internal", protocol_preference: "shadowsocks",
    }]);
    expect(queries[2].calls).toContainEqual(["eq", "id", customer.id]);
    expect(queries[2].calls).toContainEqual(["eq", "reseller_id", "reseller-a"]);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: "This customer already has an active package. Renewing or adding a top-up isn't supported yet.",
      code: "ACTIVE_PACKAGE_EXISTS",
    });
  });

  it("retains creation permission for Telegram-linked customer labels", async () => {
    enqueue("vpn_plans", plan);
    enqueue("vpn_customers", { ...customer, customer_type: "telegram" });
    await invoke();
    expect(mocks.submitPurchase).toHaveBeenCalledTimes(1);
    expect(mocks.from).toHaveBeenCalledTimes(2);
  });

  it("keeps the 201 bare order response on a replay", async () => {
    enqueue("vpn_plans", plan);
    enqueue("vpn_customers", customer);
    mocks.submitPurchase.mockResolvedValue({ order, replayed: true });
    const res = await invoke({}, "request-a");
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(order);
  });

  it("maps other purchase errors with their status/message/code", async () => {
    enqueue("vpn_plans", plan);
    enqueue("vpn_customers", customer);
    mocks.submitPurchase.mockRejectedValue(new PurchaseError("Customer changed tenant", "CUSTOMER_NOT_FOUND", 404));
    const res = await invoke();
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "Customer changed tenant", code: "CUSTOMER_NOT_FOUND" });
  });

  it("keeps unexpected service failures generic", async () => {
    enqueue("vpn_plans", plan);
    enqueue("vpn_customers", customer);
    mocks.submitPurchase.mockRejectedValue(new Error("Database failure"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await invoke();
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Internal server error" });
    } finally {
      log.mockRestore();
    }
  });
});
