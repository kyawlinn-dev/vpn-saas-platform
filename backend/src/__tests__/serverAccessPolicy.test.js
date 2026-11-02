import { describe, expect, it } from "vitest";
import { evaluateServerAccess, selectServiceIds } from "../services/serverAccessPolicy.js";

const pool = { id: "dev-public", environment: "development", panel_identity: "shared-panel", vless_service_id: 502 };
function server(overrides = {}) {
  return {
    id: "dev-node", status: "active", is_active: true, panel_type: "marzneshin",
    environment: "development", access_pool_id: pool.id, panel_node_id: 51,
    supported_protocols: ["shadowsocks", "vless"], marzneshin_service_ids: [501],
    current_active_keys: 1, max_active_keys: 10,
    server_health_status: { outline_api_status: "healthy" },
    ownership_provenance: { method: "adopted", environment: "development", access_pool_id: pool.id, panel_identity: "shared-panel", panel_node_id: 51, ss_service_ids: [501], verified_at: "2026-10-21T00:00:00Z" },
    ...overrides,
  };
}
const check = (node, overrides = {}) => evaluateServerAccess({ server: node, protocol: "shadowsocks", orderType: "trial", environment: "development", poolId: pool.id, purpose: "assign", ...overrides });

describe("public server access policy", () => {
  it.each(["assign", "switch", "display"])("maintenance blocks customer %s without disabling the node", purpose => {
    expect(check(server({ under_maintenance: true }), { purpose })).toEqual({ allowed: false, code: "SERVER_UNDER_MAINTENANCE" });
  });
  it.each(["shadowsocks", "vless"])("trial_and_purchase_have_identical_public_eligibility: %s", protocol => {
    for (const server_tier of ["trial", "premium"]) {
      const node = server({ server_tier });
      expect(check(node, { protocol, orderType: "trial" })).toEqual({ allowed: true, code: null });
      expect(check(node, { protocol, orderType: "purchase" })).toEqual({ allowed: true, code: null });
    }
  });
  it("vless_only_rejects_ss", () => {
    const node = server({ supported_protocols: ["vless"], marzneshin_service_ids: [] });
    expect(check(node)).toEqual({ allowed: false, code: "PROTOCOL_UNSUPPORTED" });
    expect(check(node, { protocol: "vless" })).toEqual({ allowed: true, code: null });
  });
  it.each([{ is_active: false }, { status: "provisioning" }, { status: "decommissioned" }, { server_health_status: { outline_api_status: "failed" } }])("draining_and_unready_reject_new_assignments: %j", overrides => {
    expect(check(server(overrides))).toEqual({ allowed: false, code: "SERVER_UNAVAILABLE" });
  });
  it("full_rejects_new_assignments_but_display_does_not_consume_capacity", () => {
    const node = server({ current_active_keys: 10 });
    expect(check(node)).toEqual({ allowed: false, code: "SERVER_FULL" });
    expect(check(node, { purpose: "switch" })).toEqual({ allowed: false, code: "SERVER_FULL" });
    expect(check(node, { purpose: "display" })).toEqual({ allowed: true, code: null });
  });
  it.each([{ environment: "production" }, { access_pool_id: "production-public" }, { ownership_provenance: null }, { panel_node_id: null }])("unowned_or_wrong_pool_fails_closed: %j", overrides => {
    expect(check(server(overrides))).toEqual({ allowed: false, code: "RESOURCE_SCOPE_MISMATCH" });
  });
  it("rejects a DEV name disguising production ownership", () => {
    const node = server();
    node.name = "DEV-production-node";
    node.ownership_provenance.environment = "production";
    expect(check(node).code).toBe("RESOURCE_SCOPE_MISMATCH");
  });
  it.each([{}, { current_active_keys: -1 }, { max_active_keys: NaN }, { max_active_keys: 0 }, { current_active_keys: 1.5 }, { current_active_keys: null }])("rejects invalid capacity values when assigning: %j", overrides => {
    const node = overrides.current_active_keys === undefined && Object.keys(overrides).length === 0 ? server({ max_active_keys: undefined }) : server(overrides);
    expect(check(node)).toEqual({ allowed: false, code: "SERVER_CAPACITY_INVALID" });
  });
  it.each(["hysteria2", "outline", "", null])("rejects unsupported protocol %s", protocol => {
    expect(check(server(), { protocol }).code).toBe("PROTOCOL_UNSUPPORTED");
  });
  it("rejects unknown order types and purposes", () => {
    expect(check(server(), { orderType: "admin" }).code).toBe("ORDER_TYPE_INVALID");
    expect(check(server(), { purpose: "retire" }).code).toBe("ACCESS_PURPOSE_INVALID");
  });
  it("does not treat missing publication or health as ready", () => {
    expect(check(server({ is_active: undefined })).code).toBe("SERVER_UNAVAILABLE");
    expect(check(server({ server_health_status: undefined })).code).toBe("SERVER_UNAVAILABLE");
    expect(check(server({ server_health_status: [{ outline_api_status: "healthy" }] })).allowed).toBe(true);
  });
});

describe("owned service selection", () => {
  it("selects one server's SS service and the shared VLESS pool for either order tier", () => {
    const node = server({ marzneshin_vless_trial_service_ids: [8], marzneshin_vless_service_ids: [5] });
    expect(selectServiceIds({ server: node, protocol: "shadowsocks", pool })).toEqual([501]);
    expect(selectServiceIds({ server: node, protocol: "vless", pool })).toEqual([502]);
  });
  it.each([null, { ...pool, environment: "production" }, { ...pool, id: "other" }, { ...pool, panel_identity: "other-panel" }])("rejects missing or mismatched pool %j", badPool => {
    expect(() => selectServiceIds({ server: server(), protocol: "vless", pool: badPool })).toThrow(expect.objectContaining({ code: "RESOURCE_SCOPE_MISMATCH" }));
  });
  it.each([undefined, 0, -1, "502", 1.5])("rejects malformed VLESS service ID %s", id => {
    expect(() => selectServiceIds({ server: server(), protocol: "vless", pool: { ...pool, vless_service_id: id } })).toThrow(expect.objectContaining({ code: "SERVICE_CONFIGURATION_INVALID" }));
  });
  it.each([[], [501, 501], ["501"], [3], [501, 503]].map(ids => [ids]))("rejects malformed, foreign or ambiguous per-node SS services %j", ids => {
    expect(() => selectServiceIds({ server: server({ marzneshin_service_ids: ids }), protocol: "shadowsocks", pool })).toThrow(expect.objectContaining({ code: "SERVICE_CONFIGURATION_INVALID" }));
  });
  it("never falls back to SS on a VLESS-only node", () => {
    expect(() => selectServiceIds({ server: server({ supported_protocols: ["vless"] }), protocol: "shadowsocks", pool })).toThrow(expect.objectContaining({ code: "PROTOCOL_UNSUPPORTED" }));
  });
  it("rejects malformed capabilities instead of guessing from legacy fields", () => {
    for (const supported_protocols of [null, [], ["vless", "vless"], ["hysteria2"], ["shadowsocks"]]) {
      expect(check(server({ supported_protocols })).allowed).toBe(false);
    }
  });
});
