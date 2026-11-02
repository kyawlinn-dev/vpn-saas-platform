import { vi } from "vitest";
import { createInfrastructureContext } from "../../services/infrastructure/context.js";

export async function infrastructureFixture() {
  const scope = { environment: "development", databaseIdentity: "db", panelIdentity: "panel", poolId: "pool" };
  const config = { ...scope, publicServiceId: "502", executionMode: "mock", providerAccounts: { digitalocean: "account" }, protectedResourceIds: ["controller"], protectedAddresses: ["192.0.2.1"] };
  const records = new Map();
  const registry = { getResource: vi.fn(async ({ kind, id }) => records.get(`${kind}:${id}`)) };
  const adapters = { inspectRuntime: vi.fn(async () => ({ ...config, verified: true })), assertOperationLease: vi.fn(async () => true) };
  const context = await createInfrastructureContext({ config, registry, adapters });
  const resource = { ...scope, id: "vm", kind: "provider", provider: "digitalocean", accountId: "account", createdAt: "2026-10-21T00:00:00Z", addresses: ["198.51.100.10"], sshHostKeySha256: `SHA256:${"a".repeat(43)}` };
  records.set("provider:vm", resource);
  const own = (kind, id, rest = {}) => { const r = { ...scope, kind, id, ...rest }; records.set(`${kind}:${id}`, r); return r; };
  const operation = { id: "op", owner: "worker", fence: 1 };
  return { context, records, registry, adapters, resource, operation, own };
}
