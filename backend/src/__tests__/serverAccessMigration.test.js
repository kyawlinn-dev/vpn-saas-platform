import { beforeEach, describe, expect, it, vi } from "vitest";
import { inspectAccessAdoption, applyAccessAdoption, migrateActiveTrialServices } from "../services/serverAccessMigrationService.js";

describe("public access adoption", () => {
  let context, manifest, adapters, user, order, evidence;
  beforeEach(() => {
    context = { environment: "development", databaseIdentity: "dev-db", poolId: "dev-pool", panelIdentity: "shared-panel", vlessServiceId: 502 };
    manifest = { version: 1, ...context, nodes: [{ serverId: "server", nodeId: 51, providerResourceId: "vm", supportedProtocols: ["shadowsocks", "vless"], ssServiceIds: [501] }],
      services: [{ id: 501, protocol: "shadowsocks", nodeIds: [51] }, { id: 502, protocol: "vless", nodeIds: [51] }],
      users: [{ id: "trial-user", orderId: "trial", legacyServiceIds: [498] }],
      protected: { nodeIds: [2], serviceIds: [5], providerResourceIds: ["controller"], userIds: ["live-user"] } };
    evidence = { verified: true, environment: "development", databaseIdentity: "dev-db", panelIdentity: "shared-panel", poolId: "dev-pool" };
    user = { id: "trial-user", service_ids: [498], key: "unchanged", used_traffic: 123, data_limit: 1000, expire: "2099-01-01", enabled: true, ownership: evidence };
    order = { id: "trial", status: "active", order_type: "trial", expiry_date: "2099-01-01", protocol: "vless", panel_user_id: "trial-user", trial_claim_used: true, ownership: evidence };
    adapters = { executionMode: "mock",
      readRuntimeIdentity: vi.fn(async () => context),
      readServer: vi.fn(async () => ({ id: "server", panel_node_id: 51, provider_resource_id: "vm", ownership: evidence })),
      readNode: vi.fn(async () => ({ id: 51, supportedProtocols: ["shadowsocks", "vless"], ownership: evidence })),
      readProviderResource: vi.fn(async () => ({ id: "vm", protected: false, ownership: evidence })),
      readService: vi.fn(async id => ({ ...(manifest.services.find(s => s.id === id) || { id: 498, protocol: "vless", nodeIds: [51] }), ownership: evidence })),
      readUser: vi.fn(async () => structuredClone(user)), readOrder: vi.fn(async () => structuredClone(order)),
      updateUserServices: vi.fn(async ({ serviceIds }) => { user.service_ids = serviceIds; }),
      writeAdoptionMetadata: vi.fn(), readCheckpoint: vi.fn(async () => null), saveCheckpoint: vi.fn(),
      withMutationGuard: vi.fn(async (_scope, action) => action()) };
  });
  it("inspect is read-only and has a stable canonical approval hash", async () => {
    const report = await inspectAccessAdoption({ context, manifest, adapters });
    expect(report.blockers).toEqual([]);
    expect(report.manifestHash).toMatch(/^[a-f0-9]{64}$/);
    expect((await inspectAccessAdoption({ context, manifest: { ...manifest }, adapters })).manifestHash).toBe(report.manifestHash);
    expect(adapters.writeAdoptionMetadata).not.toHaveBeenCalled();
    expect(adapters.updateUserServices).not.toHaveBeenCalled();
  });
  it("persists the verified provider ID in both adoption identity fields", async () => {
    const { manifestHash } = await inspectAccessAdoption({ context, manifest, adapters });
    await applyAccessAdoption({ context, manifest, adapters, approvedManifestHash: manifestHash });
    const { patch } = adapters.writeAdoptionMetadata.mock.calls[0][0];
    expect(patch.ownership_provenance.provider_resource_id).toBe(patch.provider_resource_id);
  });
  it.each(["readNode", "readService", "readProviderResource", "readUser"])("blocks borrowed production ownership from %s on a shared panel", async name => {
    const original = adapters[name].getMockImplementation();
    adapters[name].mockImplementation(async (...args) => ({ ...await original(...args), ownership: { ...evidence, environment: "production" } }));
    const report = await inspectAccessAdoption({ context, manifest, adapters });
    expect(report.blockers.length).toBeGreaterThan(0);
    await expect(applyAccessAdoption({ context, manifest, adapters, approvedManifestHash: report.manifestHash })).rejects.toMatchObject({ code: "ADOPTION_BLOCKED" });
    expect(adapters.writeAdoptionMetadata).not.toHaveBeenCalled();
  });
  it("blocks missing capabilities, mixed-node service membership and protected resources", async () => {
    delete manifest.nodes[0].supportedProtocols;
    manifest.services[1].nodeIds.push(2);
    manifest.nodes[0].providerResourceId = "controller";
    const report = await inspectAccessAdoption({ context, manifest, adapters });
    expect(report.blockers).toEqual(expect.arrayContaining([expect.objectContaining({ code: "CAPABILITIES_INVALID" }), expect.objectContaining({ code: "PROTECTED_RESOURCE" })]));
  });
  it("requires exact approval and refuses unavailable live mutation adapters", async () => {
    await expect(applyAccessAdoption({ context, manifest, adapters, approvedManifestHash: "wrong" })).rejects.toMatchObject({ code: "MANIFEST_APPROVAL_MISMATCH" });
    adapters.executionMode = "live";
    const report = await inspectAccessAdoption({ context, manifest, adapters });
    await expect(applyAccessAdoption({ context, manifest, adapters, approvedManifestHash: report.manifestHash })).rejects.toMatchObject({ code: "LIVE_ADOPTION_UNAVAILABLE" });
  });
  it("writes metadata only behind a mutation guard with expected state", async () => {
    const { manifestHash } = await inspectAccessAdoption({ context, manifest, adapters });
    await applyAccessAdoption({ context, manifest, adapters, approvedManifestHash: manifestHash });
    expect(adapters.withMutationGuard).toHaveBeenCalled();
    expect(adapters.writeAdoptionMetadata).toHaveBeenCalledWith(expect.objectContaining({ expected: expect.objectContaining({ id: "server" }), patch: expect.objectContaining({ environment: "development", lifecycle_protected: true }) }));
  });
  async function migrate(now = new Date("2026-10-21T00:00:00Z")) {
    const { manifestHash } = await inspectAccessAdoption({ context, manifest, adapters });
    return migrateActiveTrialServices({ context, poolId: context.poolId, manifest, approvedManifestHash: manifestHash, adapters, now });
  }
  it.each([
    ["2026-10-28T21:29:59.999Z", true],
    ["2026-10-28T21:30:00Z", false],
  ])("respects the trial access cutoff at %s", async (now, active) => {
    order.expiry_date = "2026-10-28";
    const result = await migrate(new Date(now));
    expect(result.migrated).toEqual(active ? ["trial-user"] : []);
    expect(result.skipped).toEqual(active ? [] : ["trial-user"]);
  });
  it("migrates active used trials in place without resetting key, traffic, quota, expiry or history", async () => {
    const before = structuredClone(user);
    expect((await migrate()).migrated).toEqual(["trial-user"]);
    expect(user).toEqual({ ...before, service_ids: [502] });
    expect(order.trial_claim_used).toBe(true);
    expect(adapters.updateUserServices).toHaveBeenCalledWith(expect.objectContaining({ expectedServiceIds: [498], serviceIds: [502] }));
    expect(adapters.saveCheckpoint).toHaveBeenCalledWith(expect.objectContaining({ phase: "verified", userId: "trial-user" }));
  });
  it.each(["expired", "used"])("does not reactivate %s trial history", async status => {
    order.status = status;
    expect((await migrate()).skipped).toEqual(["trial-user"]);
    expect(adapters.updateUserServices).not.toHaveBeenCalled();
  });
  it("rejects changed memberships instead of replacing unknown services", async () => {
    user.service_ids = [498, 5];
    await expect(migrate()).rejects.toMatchObject({ code: "USER_SERVICES_CHANGED" });
    expect(adapters.updateUserServices).not.toHaveBeenCalled();
  });
  it("recovers a successful external write before checkpoint without repeating it", async () => {
    user.service_ids = [502];
    expect((await migrate()).migrated).toEqual(["trial-user"]);
    expect(adapters.updateUserServices).not.toHaveBeenCalled();
  });
  it("blocks a borrowed production legacy service even when the user is DEV-owned", async () => {
    const original = adapters.readService.getMockImplementation();
    adapters.readService.mockImplementation(async id => id === 498 ? { id, ownership: { ...evidence, environment: "production" } } : original(id));
    expect((await inspectAccessAdoption({ context, manifest, adapters })).ready).toBe(false);
  });
  it("rejects a node whose actual listeners differ from the manifest", async () => {
    adapters.readNode.mockResolvedValue({ id: 51, supportedProtocols: ["vless"], ownership: evidence });
    expect((await inspectAccessAdoption({ context, manifest, adapters })).ready).toBe(false);
  });
  it("compares readback with the durable prepared snapshot after crash recovery", async () => {
    const prepared = structuredClone(user);
    user.service_ids = [502]; user.data_limit = 2000;
    const { manifestHash } = await inspectAccessAdoption({ context, manifest, adapters });
    adapters.readCheckpoint.mockResolvedValue({ manifestHash, userId: "trial-user", phase: "prepared", snapshot: prepared });
    await expect(migrate()).rejects.toMatchObject({ code: "USER_READBACK_FAILED" });
  });
});
