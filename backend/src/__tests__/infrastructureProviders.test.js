import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInfrastructureContext } from "../services/infrastructure/context.js";
import { createDigitalOceanProvider } from "../services/infrastructure/providers/digitalOcean.js";
import { createVultrProvider } from "../services/infrastructure/providers/vultr.js";

async function fixture(provider, factory) {
  const resources = new Map(), attempts = new Map();
  const config = { executionMode: "mock", environment: "development", databaseIdentity: "db", panelIdentity: "panel", poolId: "pool", providerAccounts: { [provider]: "account" }, protectedResourceIds: ["controller"], protectedAddresses: ["192.0.2.1"] };
  const registry = { getResource: vi.fn(async ({ id }) => resources.get(id)),
    getCreateAttempt: vi.fn(async ({ operationId }) => attempts.get(operationId)),
    claimCreateAttempt: vi.fn(async attempt => { if (attempts.has(attempt.operationId)) return false; attempts.set(attempt.operationId, attempt); return true; }),
    recordCreatedResource: vi.fn(async resource => { resources.set(resource.id, resource); }) };
  const adapters = { inspectRuntime: async () => ({ ...config, verified: true }), assertOperationLease: vi.fn(async () => true), assertDeletionScope: vi.fn(async () => true), assertPurchaseScope: vi.fn(async () => true), assertFirewallPolicy: vi.fn(async () => true) };
  const context = await createInfrastructureContext({ config, registry, adapters });
  const transport = { accountId: "account", request: vi.fn() };
  const catalog = { getQuote: vi.fn(async () => ({ available: true, recurringAmount: 6, currency: "USD", trafficTerms: { included: 1000, unit: "GB", overageAmount: null, source: "catalog-fixture" } })),
    inspectBillableAttachments: vi.fn(async () => ({ complete: true, items: [] })) };
  const api = factory({ context, transport, catalog, machine: { image: "ubuntu-24-04-x64", osId: 2284, sshKeyIds: ["key"], firewallId: "firewall", firewallTag: "dev-management" } });
  const raw = tags => provider === "digitalocean" ? { id: 123, status: 'active', created_at: "2026-10-21T00:00:00Z", region: { slug: "sg" }, size_slug: "small", tags, networks: { v4: [{ ip_address: "198.51.100.10", type: "public" }] } }
    : { id: "123", status: 'active', power_status: 'running', server_status: 'ok', date_created: "2026-10-21T00:00:00Z", region: "sg", plan: "small", tags, main_ip: "198.51.100.10", default_password: "must-not-leak" };
  const list = items => provider === "digitalocean" ? { status: 200, data: { droplets: items, links: {} } } : { status: 200, data: { instances: items, meta: { links: { next: "" } } } };
  const one = value => ({ status: 200, data: { [provider === "digitalocean" ? "droplet" : "instance"]: value } });
  const quote = await api.quote({ region: "sg", planId: "small" });
  return { api, transport, catalog, resources, attempts, raw, list, one, quote, context, registry };
}

describe.each([["digitalocean", createDigitalOceanProvider], ["vultr", createVultrProvider]])("guarded %s provider", (provider, factory) => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-21T00:00:00Z")); });
  afterEach(() => vi.useRealTimers());
  it("quotes exact cost/traffic terms without assuming overage prices", async () => {
    const f = await fixture(provider, factory);
    expect(f.quote).toMatchObject({ provider, accountId: "account", recurringAmount: 6, currency: "USD", trafficTerms: { overageAmount: null } });
    expect(f.quote.hash).toMatch(/^[a-f0-9]{64}$/);
  });
  it("reconciles a timed-out create with its unique durable attempt, never creating twice", async () => {
    const f = await fixture(provider, factory);
    let tags;
    f.transport.request.mockImplementation(async req => {
      if (req.method === "POST") { tags = req.body.tags; throw new Error("timeout: secret-token"); }
      return f.list(tags ? [f.raw(tags)] : []);
    });
    const input = { operationId: "op", quote: f.quote, profile: "vless_only" };
    expect((await f.api.create(input)).id).toBe("123");
    expect((await f.api.create(input)).id).toBe("123");
    expect(f.transport.request.mock.calls.filter(([r]) => r.method === "POST")).toHaveLength(1);
    expect(f.registry.recordCreatedResource).toHaveBeenCalled();
  });
  it("never blindly retries an uncertain create when lookup has no result", async () => {
    const f = await fixture(provider, factory);
    f.transport.request.mockImplementation(async req => { if (req.method === "POST") throw new Error("token-secret"); return f.list([]); });
    const input = { operationId: "op", quote: f.quote, profile: "dual" };
    await expect(f.api.create(input)).rejects.toMatchObject({ code: "CREATE_RECONCILIATION_REQUIRED", message: "CREATE_RECONCILIATION_REQUIRED" });
    await expect(f.api.create(input)).rejects.toMatchObject({ code: "CREATE_RECONCILIATION_REQUIRED" });
    expect(f.transport.request.mock.calls.filter(([r]) => r.method === "POST")).toHaveLength(1);
  });
  it('waits for a stable active public address before committing immutable resource ownership', async () => {
    const f = await fixture(provider, factory);
    let tags; let ready = false;
    f.transport.request.mockImplementation(async request => {
      if (request.method === 'POST') { tags = request.body.tags; return { status: 202 }; }
      const row = f.raw(tags || []);
      if (!ready) { row.status = 'new'; row.networks = { v4: [] }; row.main_ip = '0.0.0.0'; }
      return f.list(tags ? [row] : []);
    });
    const input = { operationId: 'op', quote: f.quote, profile: 'vless_only' };
    await expect(f.api.create(input)).rejects.toMatchObject({ code: 'PROVIDER_RESOURCE_PENDING' });
    expect(f.registry.recordCreatedResource).not.toHaveBeenCalled();
    ready = true;
    expect((await f.api.create(input)).addresses).toContain('198.51.100.10');
    expect(f.transport.request.mock.calls.filter(([request]) => request.method === 'POST')).toHaveLength(1);
  });
  it("reconciles an existing creation intent after its purchase quote expires", async () => {
    const f = await fixture(provider, factory);
    let tags; let visible = false;
    f.transport.request.mockImplementation(async req => {
      if (req.method === 'POST') { tags = req.body.tags; throw new Error('timeout'); }
      return f.list(visible ? [f.raw(tags)] : []);
    });
    const input = { operationId: 'op', quote: f.quote, profile: 'dual' };
    await expect(f.api.create(input)).rejects.toMatchObject({ code: 'CREATE_RECONCILIATION_REQUIRED' });
    vi.setSystemTime(new Date('2026-10-21T00:20:00Z')); visible = true;
    expect((await f.api.create(input)).id).toBe('123');
    expect(f.transport.request.mock.calls.filter(([r]) => r.method === 'POST')).toHaveLength(1);
  });
  it("does not buy a new VPS using an expired quote", async () => {
    const f = await fixture(provider, factory);
    vi.setSystemTime(new Date('2026-10-21T00:20:00Z'));
    f.transport.request.mockResolvedValue(f.list([]));
    await expect(f.api.create({ operationId: 'op', quote: f.quote, profile: 'dual' })).rejects.toMatchObject({ code: 'QUOTE_INVALID' });
    expect(f.transport.request.mock.calls.some(([r]) => r.method === 'POST')).toBe(false);
  });
  it("blocks multiple lookup matches and DEV labels without a registered creation intent", async () => {
    const f = await fixture(provider, factory);
    f.transport.request.mockResolvedValue(f.list([f.raw(["novanet-op-op"]), f.raw(["novanet-op-op"])]));
    await expect(f.api.find({ operationId: "op" })).rejects.toMatchObject({ code: "AMBIGUOUS_PROVIDER_RESOURCES" });
    f.transport.request.mockResolvedValue(f.one(f.raw(["DEV-node"])));
    await expect(f.api.delete({ resourceId: "123", expectedIdentity: { id: "123" }, operation: { id: "op" } })).rejects.toMatchObject({ code: "RESOURCE_SCOPE_MISMATCH" });
    expect(f.transport.request.mock.calls.some(([r]) => r.method === "DELETE")).toBe(false);
  });
  it("confirms absence after a delete timeout and strips provider passwords", async () => {
    const f = await fixture(provider, factory);
    f.resources.set("123", { ...f.context, kind: "provider", id: "123", provider, accountId: "account", createdAt: "2026-10-21T00:00:00Z" });
    let deleted = false;
    f.transport.request.mockImplementation(async req => {
      if (req.method === "DELETE") { deleted = true; throw new Error("timeout-secret"); }
      return deleted ? { status: 404 } : f.one(f.raw([]));
    });
    const expected = await f.api.inspect({ resourceId: "123" });
    expect(expected.default_password).toBeUndefined();
    expect(await f.api.delete({ resourceId: "123", expectedIdentity: expected, operation: { id: "op" } })).toMatchObject({ absent: true });
  });
  it("never overwrites a foreign registration to reconcile a tagged resource", async () => {
    const f = await fixture(provider, factory);
    f.transport.request.mockImplementation(async req => {
      if (req.method === "POST") {
        f.resources.set("123", { ...f.context, id: "123", kind: "provider", provider, accountId: "account", createdAt: "2026-10-21T00:00:00Z", environment: "production" });
        f.transport.request.mockResolvedValue(f.list([f.raw(req.body.tags)]));
        throw new Error("timeout");
      }
      return f.list([]);
    });
    await expect(f.api.create({ operationId: "op", quote: f.quote, profile: "dual" })).rejects.toMatchObject({ code: "RESOURCE_SCOPE_MISMATCH" });
    expect(f.registry.recordCreatedResource).not.toHaveBeenCalled();
  });
  it("rejects changed prices before sending a paid creation request", async () => {
    const f = await fixture(provider, factory);
    f.catalog.getQuote.mockResolvedValue({ available: true, recurringAmount: 12, currency: "USD", trafficTerms: f.quote.trafficTerms });
    f.transport.request.mockResolvedValue(f.list([]));
    await expect(f.api.create({ operationId: "op", quote: f.quote, profile: "dual" })).rejects.toMatchObject({ code: "QUOTE_CHANGED" });
    expect(f.transport.request.mock.calls.some(([r]) => r.method === "POST")).toBe(false);
  });
});
