import { describe, expect, it, vi } from "vitest";
import { createInfrastructureContext } from "../services/infrastructure/context.js";
import { assertResourceOwnership } from "../services/infrastructure/ownership.js";

export function ownershipFixture() {
  const config = { executionMode: "mock", environment: "development", databaseIdentity: "dev-db", panelIdentity: "shared-panel", poolId: "dev-pool", providerAccounts: { digitalocean: "account", vultr: "account" }, protectedResourceIds: ["controller"], protectedAddresses: ["192.0.2.1"] };
  const registered = { kind: "provider", id: "vm", provider: "digitalocean", accountId: "account", environment: "development", poolId: "dev-pool", panelIdentity: "shared-panel", databaseIdentity: "dev-db", createdAt: "2026-10-21T00:00:00Z", protected: false };
  const registry = { getResource: vi.fn(async () => registered) };
  const adapters = { inspectRuntime: vi.fn(async () => ({ ...config, verified: true })), assertOperationLease: vi.fn(async () => true) };
  return { config, registry, adapters, registered };
}
describe("infrastructure runtime and ownership", () => {
  it("rejects live execution before any runtime inspection or resource lookup", async () => {
    const fixture = ownershipFixture();
    fixture.config.executionMode = "live";
    await expect(createInfrastructureContext(fixture)).rejects.toMatchObject({ code: "LIVE_INFRASTRUCTURE_UNAVAILABLE" });
    expect(fixture.adapters.inspectRuntime).not.toHaveBeenCalled();
    expect(fixture.registry.getResource).not.toHaveBeenCalled();
  });
  it("requires independent matching runtime identities, not NODE_ENV or DEV labels", async () => {
    const fixture = ownershipFixture();
    fixture.adapters.inspectRuntime.mockResolvedValue({ ...fixture.config, verified: true, databaseIdentity: "production-db" });
    await expect(createInfrastructureContext(fixture)).rejects.toMatchObject({ code: "RESOURCE_SCOPE_MISMATCH" });
  });
  it.each(["environment", "poolId", "accountId", "createdAt"])("rejects changed immutable resource binding %s", async key => {
    const fixture = ownershipFixture();
    const context = await createInfrastructureContext(fixture);
    const resource = { ...fixture.registered, name: "DEV node", [key]: "foreign" };
    await expect(assertResourceOwnership({ context, resource, operation: { id: "op" } })).rejects.toMatchObject({ code: "RESOURCE_SCOPE_MISMATCH" });
  });
  it("rejects unregistered resources and controller identity/address aliases", async () => {
    const fixture = ownershipFixture();
    const context = await createInfrastructureContext(fixture);
    fixture.registry.getResource.mockResolvedValueOnce(null);
    await expect(assertResourceOwnership({ context, resource: fixture.registered, operation: { id: "op" } })).rejects.toMatchObject({ code: "RESOURCE_SCOPE_MISMATCH" });
    await expect(assertResourceOwnership({ context, resource: { ...fixture.registered, addresses: ["192.0.2.1"] }, operation: { id: "op" } })).rejects.toMatchObject({ code: "PROTECTED_RESOURCE" });
  });
  it("requires a fresh operation lease on every mutation", async () => {
    const fixture = ownershipFixture();
    const context = await createInfrastructureContext(fixture);
    fixture.adapters.assertOperationLease.mockResolvedValue(false);
    await expect(assertResourceOwnership({ context, resource: fixture.registered, operation: { id: "op" } })).rejects.toMatchObject({ code: "STALE_FENCE" });
  });
  it("binds node/provider references and known addresses, not only a row UUID", async () => {
    const f = ownershipFixture(); const context = await createInfrastructureContext(f);
    const server = { ...f.registered, kind: "server", panel_node_id: 51, provider_resource_id: "vm", addresses: ["198.51.100.1"] };
    f.registry.getResource.mockResolvedValue(server);
    await expect(assertResourceOwnership({ context, resource: { ...server, panel_node_id: 2 }, operation: { id: "op" } })).rejects.toMatchObject({ code: "RESOURCE_SCOPE_MISMATCH" });
  });
});
