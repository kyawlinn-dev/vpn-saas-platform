import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), ensure: vi.fn(), activate: vi.fn(), remove: vi.fn(), provision: vi.fn() }));
vi.mock("../lib/supabase.js", () => ({ supabase: { from: mocks.from } }));
vi.mock("../services/infrastructure/customerMutationGuard.js", () => ({ withCustomerInfrastructureMutation: (_scope, action) => action() }));
vi.mock("../services/tokenService.js", () => ({ ensureOrderToken: mocks.ensure, activateToken: mocks.activate, getTokenByOrderId: vi.fn(async () => null), deactivateToken: vi.fn() }));
vi.mock("../services/serverService.js", () => ({ getActiveServers: vi.fn(async () => [{ id: "server" }]), ServerAvailabilityError: class extends Error {} }));
vi.mock("../services/subscriptionProvisionService.js", async importOriginal => ({ ...(await importOriginal()),
  provisionServersForToken: mocks.provision, deleteProvisionedKeysForOrder: mocks.remove, deactivateTokenAssignments: vi.fn() }));

import { processExpiredOrdersAndQueue, provisionOrderAccess } from "../services/orderLifecycleService.js";
import { getBestActiveOrder, getFullActiveOrder } from "../bot/botCustomerService.js";
import ssconfRouter from "../routes/public/ssconfRouter.js";
import statsRouter from "../routes/reseller/resellerStatsRouter.js";

let rows;
function query(table) {
  const filters = [];
  let patch, single = false;
  const q = { select: () => q, eq: (key, value) => { filters.push(row => row[key] === value); return q; },
    gte: (key, value) => { filters.push(row => row[key] >= value); return q; },
    is: () => q, in: (key, values) => { filters.push(row => values.includes(row[key])); return q; }, order: () => q, limit: () => q, gt: () => q, range: () => q,
    update: value => { patch = value; return q; },
    maybeSingle: () => { single = true; return q; },
    single: () => { single = true; return q; },
    then: (resolve, reject) => Promise.resolve().then(() => {
      const found = (rows[table] || []).filter(row => filters.every(filter => filter(row)));
      if (patch) found.forEach(row => Object.assign(row, patch));
      return { data: single ? found[0] || null : found, error: null };
    }).then(resolve, reject) };
  return q;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-28T18:00:00Z"));
  rows = { vpn_orders: [{ id: "current", customer_id: "customer", reseller_id: "tenant", status: "active", order_type: "trial",
    expiry_date: "2026-10-28", quota_limit_bytes: 1000, keys: [] }] };
  mocks.from.mockImplementation(query);
  mocks.ensure.mockResolvedValue({ id: "token" });
  mocks.provision.mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

describe("Myanmar access boundary", () => {
  it("counts grace-period access while revenue stays on the Bangkok calendar day", async () => {
    rows.vpn_orders[0].payments = [
      { amount_mmk: 100, review_status: "confirmed", apply_status: "applied", created_at: "2026-10-28T18:00:00Z" },
      { amount_mmk: 200, review_status: "confirmed", apply_status: "applied", created_at: "2026-10-28T16:00:00Z" },
    ];
    const handle = statsRouter.stack.find(layer => layer.route?.path === "/overview").route.stack[0].handle;
    const res = { status: vi.fn(() => res), json: vi.fn(() => res) };
    await handle({ reseller: { id: "tenant" } }, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ active_orders: 1, today_revenue_mmk: 100, month_revenue_mmk: 300 }));
    vi.setSystemTime(new Date("2026-10-28T21:30:00Z"));
    await handle({ reseller: { id: "tenant" } }, res);
    expect(res.json).toHaveBeenLastCalledWith(expect.objectContaining({ active_orders: 0, today_revenue_mmk: 100, month_revenue_mmk: 300 }));
  });
  it.each(["2026-10-28T17:00:00Z", "2026-10-28T21:29:59.999Z"])("does not end access or promote a paid queue during grace at %s", async now => {
    vi.setSystemTime(new Date(now));
    rows.vpn_orders.push({ id: "queued", customer_id: "customer", reseller_id: "tenant", status: "scheduled", review_status: "confirmed", payment_status: "paid" });
    expect(await processExpiredOrdersAndQueue()).toEqual([]);
    expect(rows.vpn_orders[0].status).toBe("active");
    expect(rows.vpn_orders[1].status).toBe("scheduled");
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.provision).not.toHaveBeenCalled();
  });
  it("promotes a confirmed paid queue only when current access reaches the cutoff", async () => {
    vi.setSystemTime(new Date("2026-10-28T21:30:00Z"));
    rows.resellers = [{ id: "tenant", commission_percent: 0 }];
    rows.vpn_orders.push({ id: "queued", customer_id: "customer", reseller_id: "tenant", source: "miniapp", status: "scheduled",
      review_status: "confirmed", payment_status: "paid", plan: { id: "plan", duration_days: 1, is_active: true },
      customer: { ssconf_token: "opaque" } });
    expect(await processExpiredOrdersAndQueue()).toEqual([{ ended: "current", promoted: "queued", reason: "time" }]);
    expect(rows.vpn_orders[0].status).toBe("expired");
    expect(rows.vpn_orders[1]).toMatchObject({ status: "active", start_date: "2026-10-28", expiry_date: "2026-10-29" });
    expect(mocks.provision).toHaveBeenCalledTimes(1);
  });
  it("ends access at the exact cutoff", async () => {
    vi.setSystemTime(new Date("2026-10-28T21:30:00Z"));
    expect(await processExpiredOrdersAndQueue()).toEqual([{ ended: "current", promoted: null, reason: "time" }]);
    expect(rows.vpn_orders[0].status).toBe("expired");
    expect(mocks.remove).toHaveBeenCalledWith("current");
  });
  it("still ends quota-exhausted access during grace", async () => {
    rows.vpn_orders[0].keys = [{ id: "key", status: "active", data_limit_bytes: 1000, used_bytes: 1000 }];
    expect(await processExpiredOrdersAndQueue()).toEqual([{ ended: "current", promoted: null, reason: "data" }]);
  });
  it.each([getBestActiveOrder, getFullActiveOrder])("keeps bot access visible during grace and tenant scoped: %s", async load => {
    expect(await load("customer", "tenant")).toMatchObject({ id: "current" });
    expect(await load("customer", "other-tenant")).toBeNull();
    vi.setSystemTime(new Date("2026-10-28T21:30:00Z"));
    expect(await load("customer", "tenant")).toBeNull();
  });
  it("keeps ssconf entitlement during grace and rejects at cutoff", async () => {
    rows.vpn_customers = [{ id: "customer", reseller_id: "tenant", ssconf_token: "opaque" }];
    rows.reseller_miniapps = [{ id: "miniapp", reseller_id: "tenant", is_enabled: true }];
    const handle = ssconfRouter.stack.find(layer => layer.route).route.stack[0].handle;
    const response = () => { const res = { status: vi.fn(() => res), json: vi.fn(() => res) }; return res; };
    // Reaching key lookup proves the date guard permitted the subscription.
    const grace = response();
    await handle({ params: { token: "opaque.json" } }, grace);
    expect(grace.json).toHaveBeenCalledWith({ error: "No active VPN key" });
    vi.setSystemTime(new Date("2026-10-28T21:30:00Z"));
    const ended = response();
    await handle({ params: { token: "opaque.json" } }, ended);
    expect(ended.json).toHaveBeenCalledWith({ error: "No active subscription" });
  });
  it.each(["activate", "renew"])("uses the order deadline for token TTL on %s without changing plan-day dates", async mode => {
    const result = await provisionOrderAccess({ mode,
      order: { id: "current", customer_id: "customer", reseller_id: "tenant", customer: { ssconf_token: "opaque" } },
      reseller: { id: "tenant" }, plan: { duration_days: 1 }, accessContext: { publicAccessEnabled: false } });
    expect(result.expiry_date).toBe("2026-10-29");
    expect(result.expires_at).toBe("2026-10-29T21:30:00.000Z");
    expect(mocks.ensure).toHaveBeenCalledWith(expect.objectContaining({ expiresAt: "2026-10-29T21:30:00.000Z" }));
    if (mode === "renew") expect(mocks.activate).toHaveBeenCalledWith("token", "2026-10-29T21:30:00.000Z");
  });
});
