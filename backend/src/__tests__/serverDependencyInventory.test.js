import { describe, expect, it, vi } from "vitest";
import { inventoryDependencies, assertCompatibleDestination } from "../services/infrastructure/dependencyInventory.js";
import { infrastructureFixture } from "./fixtures/infrastructure.js";

async function fixture() {
  const f = await infrastructureFixture();
  const source = f.own("server", "source", { panel_node_id: 51, provider_resource_id: "vm", supported_protocols: ["shadowsocks", "vless"], addresses: ["198.51.100.10"] });
  const destination = f.own("server", "destination", { panel_node_id: 52, supported_protocols: ["shadowsocks", "vless"], status: "active", is_active: true, current_active_keys: 1, max_active_keys: 10, server_health_status: { outline_api_status: "healthy" } });
  f.own("user", "user"); f.own("service", "ss-service"); f.own("host", "host");
  const tables = { keys: [{ id: "key", order_id: "order", customer_id: "customer", reseller_id: "reseller", server_id: "source", outline_key_id: "user", protocol: "shadowsocks", status: "active" }],
    orders: [{ id: "order", customer_id: "customer", reseller_id: "reseller", status: "active" }], customers: [{ id: "customer", reseller_id: "reseller" }], assignments: [], serverAliases: [source, destination], destinationKeys: [] };
  const panelRows = { users: [{ id: "user", service_ids: ["ss-service"] }], services: [{ id: "ss-service", node_ids: [51] }], hosts: [{ id: "host", node_id: 51 }] };
  const page = rows => async ({ kind }) => ({ items: rows[kind], nextCursor: null, complete: true });
  const repository = { listInventoryPage: vi.fn(page(tables)) }, panel = { listInventoryPage: vi.fn(page(panelRows)) };
  const provider = { inspect: vi.fn(async () => f.resource), inspectBillableAttachments: vi.fn(async () => ({ complete: true, items: [] })) };
  return { ...f, source, destination, tables, panelRows, repository, panel, provider };
}
describe("retirement dependency inventory", () => {
  it("matches numeric panel membership against string registry service IDs", async () => {
    const f = await fixture(); f.own("service", "501");
    f.panelRows.services[0].id = "501";
    f.panelRows.users[0].service_ids = [501];
    expect((await inventoryDependencies(f)).movable).toHaveLength(1);
  });
  it("reconciles scoped rows and panel ownership before marking access movable", async () => {
    const f = await fixture(); const result = await inventoryDependencies(f);
    expect(result.blockers).toEqual([]);
    expect(result.movable).toHaveLength(1);
    expect(result.movable[0]).toMatchObject({ kind: "access", keyId: "key", resellerId: "reseller" });
    expect(result.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
  it.each([
    ["manual panel user", f => f.panelRows.users.push({ id: "manual", service_ids: ["ss-service"] }), "UNMANAGED_PANEL_USER"],
    ["shared IP alias", f => f.tables.serverAliases.push({ id: "alias", addresses: f.source.addresses }), "SHARED_PROVIDER_IDENTITY"],
    ["pending key", f => { f.tables.keys[0].status = "pending"; }, "PENDING_RESERVATION"],
    ["foreign service", f => f.records.delete("service:ss-service"), "FOREIGN_PANEL_SERVICE"],
    ["destination key conflict", f => f.tables.destinationKeys.push({ order_id: "order", status: "active" }), "DESTINATION_KEY_CONFLICT"],
    ["customer tenant mismatch", f => { f.tables.customers[0].reseller_id = "other"; }, "TENANT_BINDING_MISMATCH"],
  ])("blocks %s without modifying any resources", async (_label, change, code) => {
    const f = await fixture(); change(f);
    expect((await inventoryDependencies(f)).blockers).toContainEqual(expect.objectContaining({ code }));
  });
  it("classifies active assignments to deleted keys as explicit cleanup, not active access", async () => {
    const f = await fixture(); f.tables.keys[0].status = "deleted"; f.tables.keys[0].deleted_at = "2026-10-20";
    f.tables.assignments.push({ id: "assignment", server_id: "source", vpn_key_id: "key", is_active: true });
    f.panelRows.users = [];
    const result = await inventoryDependencies(f);
    expect(result.movable).toEqual([expect.objectContaining({ kind: "assignment_cleanup", assignmentId: "assignment" })]);
  });
  it("refuses dual-to-VLESS-only destination and protected controller host", async () => {
    const f = await fixture(); f.destination.supported_protocols = ["vless"];
    expect(() => assertCompatibleDestination({ ...f, inventory: { movable: [] } })).toThrow("DESTINATION_PROTOCOL_MISMATCH");
    f.source.addresses = ["192.0.2.1"];
    expect((await inventoryDependencies(f)).blockers).toContainEqual(expect.objectContaining({ code: "PROTECTED_RESOURCE" }));
  });
  it("requires complete pagination and rejects repeated cursors", async () => {
    const f = await fixture(); f.repository.listInventoryPage.mockResolvedValue({ items: [], nextCursor: "same", complete: false });
    expect((await inventoryDependencies(f)).blockers).toContainEqual(expect.objectContaining({ code: "INVENTORY_INCOMPLETE" }));
  });
  it("blocks a managed service that also references an unowned node", async () => {
    const f = await fixture(); f.panelRows.services[0].node_ids.push(999);
    expect((await inventoryDependencies(f)).blockers).toContainEqual(expect.objectContaining({ code: "FOREIGN_PANEL_SERVICE" }));
  });
  it.each([true, false])("preserves shared global nodes only after read-only verification (%s)", async verified => {
    const f = await fixture();
    const id = f.context.publicServiceId;
    f.own("service", id);
    f.panelRows.services.push({ id, node_ids: [51, 999] });
    f.panel.verifySharedNode = vi.fn(async () => verified);
    const result = await inventoryDependencies(f);
    expect(f.panel.verifySharedNode).toHaveBeenCalledWith({ serviceId: id, nodeId: 999 });
    expect(result.blockers.some(row => row.code === "FOREIGN_PANEL_SERVICE")).toBe(!verified);
    expect(f.records.has("node:999")).toBe(false);
  });
});
