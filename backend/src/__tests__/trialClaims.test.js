import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { publicAccessContext, publicServer } from "./fixtures/publicServerAccess.js";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), createKey: vi.fn(), servers: vi.fn(async () => []) }));
vi.mock("../lib/supabase.js", () => ({ supabase: { rpc: mocks.rpc, from: mocks.from } }));
vi.mock("../services/appEventService.js", () => ({ trackAppEvent: vi.fn() }));
vi.mock("../services/vpnProviderService.js", () => ({ createKey: mocks.createKey, deleteKey: vi.fn(), serviceIdsForOrder: vi.fn() }));
vi.mock("../services/serverService.js", () => ({ getActiveServers: mocks.servers, incrementServerUsage: vi.fn(), decrementServerUsage: vi.fn(), clearServerError: vi.fn(), setServerError: vi.fn() }));
import { createTrialOrder, getTrialEligibility, provisionTrialKey } from "../services/trialService.js";

function query(result) {
  const q = { insert: () => q, select: () => q, eq: () => q, is: () => q, limit: () => q, maybeSingle: async () => result, single: async () => result };
  return q;
}

describe("shared trial claims", () => {
  it("rejects an excluded trial channel before touching storage", async () => {
    mocks.rpc.mockClear();
    await expect(createTrialOrder({ customerId: "customer", resellerId: "tenant", source: "messenger" })).rejects.toMatchObject({ code: "INVALID_CALLER" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("forward-fixes the database alias conflict without rewriting applied migrations", () => {
    const sql = readFileSync(new URL("./fixtures/historical-migrations/0036_trial_claim_alias_fix.sql", import.meta.url), "utf8");
    expect(sql).toContain("declare trial_claim customer_trial_claims%rowtype");
    expect(sql).not.toMatch(/declare c customer_trial_claims/);
    expect(sql).toContain("where id=trial_claim.order_id");
    expect(sql).toContain("vpn_customers c join resellers r on r.id=c.reseller_id");
  });
  it("creates through one scoped atomic RPC without requiring a Telegram identity", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { order: { id: "order" }, plan: { id: "trial" }, created: true } });
    expect(await createTrialOrder({ customerId: "customer", resellerId: "tenant", source: "miniapp" })).toMatchObject({ created: true });
    expect(mocks.rpc).toHaveBeenLastCalledWith("create_customer_trial", expect.objectContaining({ p_customer_id: "customer", p_reseller_id: "tenant", p_source: "miniapp", p_telegram_link_id: null }));
  });
  it("checks scoped eligibility without consuming the trial", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { eligible: false, reason: "already_used" } });
    expect(await getTrialEligibility({ customerId: "customer", resellerId: "tenant" })).toMatchObject({ eligible: false });
    expect(mocks.rpc).toHaveBeenLastCalledWith("customer_trial_eligibility", { p_customer_id: "customer", p_reseller_id: "tenant" });
  });
  it("propagates creation failures without falsely marking a trial successful", async () => {
    mocks.rpc.mockResolvedValueOnce({ error: { message: "TRIAL_DISABLED" } });
    await expect(createTrialOrder({ customerId: "customer", resellerId: "tenant", source: "miniapp" })).rejects.toThrow("TRIAL_DISABLED");
  });
  it("does not create a key after another worker owns the provisioning claim", async () => {
    mocks.createKey.mockClear(); mocks.from.mockReturnValue(query({ data: null }));
    mocks.rpc.mockResolvedValueOnce({ data: false });
    await expect(provisionTrialKey({ customerId: "customer", resellerId: "tenant", orderId: "order" })).rejects.toMatchObject({ code: "TRIAL_RECOVERY_REQUIRED" });
    expect(mocks.createKey).not.toHaveBeenCalled();
  });
  it("keeps a no-capacity trial safely retryable without creating external keys", async () => {
    mocks.createKey.mockClear();
    mocks.from.mockReturnValueOnce(query({ data: null })).mockReturnValueOnce(query({ data: null })).mockReturnValueOnce(query({ data: { expiry_date: "2026-11-01" } }));
    mocks.rpc.mockResolvedValueOnce({ data: true }).mockResolvedValueOnce({ data: true });
    await expect(provisionTrialKey({ customerId: "customer", resellerId: "tenant", orderId: "order" })).rejects.toThrow("No active trial server");
    expect(mocks.rpc).toHaveBeenLastCalledWith("finish_trial_provisioning", expect.objectContaining({ p_status: "ready" }));
    expect(mocks.createKey).not.toHaveBeenCalled();
  });
  it.each(["shadowsocks", "vless"])("provisions a public %s trial on compatible former premium capacity without changing quota or expiry", async protocol => {
    mocks.createKey.mockReset().mockResolvedValueOnce({ outline_key_id: "DEV_trial", key_name: "DEV trial", access_url: "https://panel.example/test-only", _marzneshin_meta: {} });
    mocks.servers.mockReset().mockResolvedValueOnce([publicServer()]);
    mocks.from.mockReset().mockReturnValueOnce(query({ data: null })).mockReturnValueOnce(query({ data: null }))
      .mockReturnValueOnce(query({ data: { expiry_date: "2026-11-01", quota_limit_bytes: 2 * 1024 ** 3 } }))
      .mockReturnValueOnce(query({ data: { id: "trial-key" } }));
    mocks.rpc.mockReset().mockResolvedValueOnce({ data: true }).mockResolvedValueOnce({ data: true });
    const result = await provisionTrialKey({ customerId: "customer", resellerId: "tenant", orderId: "order", protocol,
      plan: { data_limit_gb: 50 }, accessContext: publicAccessContext });
    expect(result.ready).toBe(true);
    expect(mocks.servers).toHaveBeenCalledWith(expect.objectContaining({ protocol, orderType: "trial", accessContext: publicAccessContext }));
    expect(mocks.createKey).toHaveBeenCalledWith(expect.objectContaining({ protocol, dataLimitBytes: 2 * 1024 ** 3, expiryDate: "2026-11-01", accessContext: publicAccessContext }));
    expect(mocks.rpc).toHaveBeenLastCalledWith("finish_trial_provisioning", expect.objectContaining({ p_status: "completed" }));
  });
});
