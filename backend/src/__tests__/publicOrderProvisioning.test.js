import { describe, expect, it, vi } from "vitest";
import { publicAccessContext } from "./fixtures/publicServerAccess.js";
const mocks = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(async () => []), remove: vi.fn(), token: vi.fn(async () => null) }));
vi.mock("../lib/supabase.js", () => ({ supabase: { from: mocks.from } }));
vi.mock("../services/serverService.js", () => ({ getActiveServers: mocks.select, ServerAvailabilityError: class extends Error {} }));
vi.mock("../services/subscriptionProvisionService.js", () => ({ provisionServersForToken: vi.fn(), deleteProvisionedKeysForOrder: mocks.remove, updateProvisionedKeyLimitsForOrder: vi.fn(), deactivateTokenAssignments: vi.fn(), buildOrderQuotaSnapshot: vi.fn() }));
vi.mock("../services/tokenService.js", () => ({ ensureOrderToken: vi.fn(), getTokenByOrderId: mocks.token, deactivateToken: vi.fn(), activateToken: vi.fn() }));
import { provisionOrderAccess } from "../services/orderLifecycleService.js";

describe("public activation selection", () => {
  it.each(["shadowsocks", "vless"])("selects one public %s anchor before retiring any previous access", async protocol => {
    mocks.remove.mockClear(); mocks.select.mockClear();
    const q = { select: () => q, eq: vi.fn(() => q), maybeSingle: async () => ({ data: { protocol_preference: protocol } }) };
    mocks.from.mockReturnValue(q);
    await expect(provisionOrderAccess({ order: { id: "order", customer_id: "customer", reseller_id: "tenant", order_type: "purchase" },
      reseller: { id: "tenant" }, plan: { duration_days: 30, allowed_regions: ["sgp1", "nrt1"] }, accessContext: publicAccessContext })).rejects.toThrow();
    expect(mocks.select).toHaveBeenCalledWith(expect.objectContaining({ protocol, accessContext: publicAccessContext, limit: 1, regions: [] }));
    expect(q.eq).toHaveBeenCalledWith("reseller_id", "tenant");
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
