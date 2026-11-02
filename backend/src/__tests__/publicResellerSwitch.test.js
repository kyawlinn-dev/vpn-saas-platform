import { beforeEach, describe, expect, it, vi } from "vitest";
import { publicAccessContext, publicServer } from "./fixtures/publicServerAccess.js";

const mocks = vi.hoisted(() => ({ from: vi.fn(), switchServer: vi.fn(), context: vi.fn() }));
vi.mock("../lib/supabase.js", () => ({ supabase: { from: mocks.from } }));
vi.mock("../services/subscriptionProvisionService.js", () => ({ switchOrderServer: mocks.switchServer }));
vi.mock("../services/serverAccessContext.js", () => ({ resolveServerAccessContext: mocks.context }));
import router from "../routes/reseller/resellerServerSwitchRouter.js";

describe("public reseller switching", () => {
  let rows;
  let filters;
  beforeEach(() => {
    vi.clearAllMocks();
    filters = [];
    rows = {
      vpn_orders: { id: "order", reseller_id: "owner", status: "active", order_type: "trial", expiry_date: "2099-01-01" },
      vpn_keys: { id: "key", server_id: "old", protocol: "shadowsocks" },
      vpn_servers: publicServer(),
    };
    mocks.context.mockResolvedValue(publicAccessContext);
    mocks.switchServer.mockResolvedValue({ id: "new-key" });
    mocks.from.mockImplementation(table => {
      const eqs = [];
      const q = { select: () => q, eq: (column, value) => { eqs.push([column, value]); filters.push([table, column, value]); return q; },
        is: () => q, order: () => q, limit: () => q,
        maybeSingle: async () => ({ data: table === "vpn_orders" && eqs.some(([k, v]) => k === "reseller_id" && v !== rows.vpn_orders.reseller_id) ? null : rows[table] }) };
      return q;
    });
  });
  async function invoke(resellerId = "owner") {
    const handler = router.stack.find(l => l.route?.path === "/:orderId/switch-server").route.stack[0].handle;
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await handler({ reseller: { id: resellerId }, params: { orderId: "order" }, body: { new_server_id: "dev-node" } }, res);
    return res;
  }
  it("active_trial_can_switch_without_reset", async () => {
    expect((await invoke()).statusCode).toBe(200);
    expect(mocks.switchServer).toHaveBeenCalledWith(expect.objectContaining({ order: rows.vpn_orders, oldKey: rows.vpn_keys, accessContext: publicAccessContext }));
    expect(filters).toContainEqual(["vpn_keys", "reseller_id", "owner"]);
  });
  it("cross_reseller_order_is_rejected", async () => {
    expect((await invoke("other")).statusCode).toBe(404);
    expect(mocks.switchServer).not.toHaveBeenCalled();
  });
  it("vless_does_not_offer_single_server_switch", async () => {
    rows.vpn_keys.protocol = "vless";
    expect((await invoke()).body.error).toBe("PROTOCOL_NO_SWITCH");
    expect(mocks.switchServer).not.toHaveBeenCalled();
  });
  it("stale_inline_button_revalidates_destination", async () => {
    rows.vpn_servers.supported_protocols = ["vless"];
    rows.vpn_servers.marzneshin_service_ids = [];
    expect((await invoke()).statusCode).toBe(409);
    expect(mocks.switchServer).not.toHaveBeenCalled();
  });
});
