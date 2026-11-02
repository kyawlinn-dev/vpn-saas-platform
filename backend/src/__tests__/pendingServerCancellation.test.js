import { describe, expect, it, vi } from 'vitest';
import { createInfrastructureContext } from '../services/infrastructure/context.js';
import { createDigitalOceanProvider } from '../services/infrastructure/providers/digitalOcean.js';
import { createVultrProvider } from '../services/infrastructure/providers/vultr.js';
import { createLiveOperationAdapters } from '../services/infrastructure/liveOperationAdapters.js';
import { runOperationStep } from '../services/infrastructure/worker.js';

async function fixture(provider) {
  const scope = { environment: 'development', databaseIdentity: 'db', panelIdentity: 'panel', poolId: 'pool' };
  const config = { ...scope, executionMode: 'mock', providerAccounts: { [provider]: 'account' }, protectedResourceIds: [], protectedAddresses: [] };
  const records = new Map(), attempts = new Map(), states = new Map();
  const lease = { id: 'op', operationId: 'op', owner: 'worker', fence: 1 };
  const registry = {
    getResource: async ({ id }) => records.get(id),
    getCreateAttempt: async ({ operationId }) => attempts.get(operationId),
    claimCreateAttempt: async intent => { if (attempts.has(intent.operationId)) return false; attempts.set(intent.operationId, intent); return true; },
    recordCreatedResource: async row => records.set(row.id, row),
  };
  const context = await createInfrastructureContext({ config, registry, adapters: {
    inspectRuntime: async () => ({ ...config, verified: true }), assertOperationLease: async () => true,
    assertPurchaseScope: async () => true, assertFirewallPolicy: async () => true,
    assertDeletionScope: async ({ resource }) => states.get('cancellation-delete')?.value?.resourceId === resource.id && records.get(resource.id)?.operationId === lease.id,
  } });
  let tags, ready = false, deleted = false, visible = true;
  const raw = () => provider === 'digitalocean'
    ? { id: 123, created_at: new Date().toISOString(), status: ready ? 'active' : 'new', region: { slug: 'sgp1' }, size_slug: 'small', tags,
      networks: { v4: ready ? [{ type: 'public', ip_address: '198.51.100.10' }] : [] } }
    : { id: '123', date_created: new Date().toISOString(), status: ready ? 'active' : 'pending', power_status: 'running', server_status: 'ok',
      region: 'sgp1', plan: 'small', tags, main_ip: ready ? '198.51.100.10' : '0.0.0.0' };
  const createdAt = new Date().toISOString();
  const machine = () => ({ ...raw(), ...(provider === 'digitalocean' ? { created_at: createdAt } : { date_created: createdAt }) });
  const path = provider === 'digitalocean' ? '/v2/droplets' : '/v2/instances';
  const transport = { accountId: 'account', request: vi.fn(async request => {
    if (request.method === 'POST') { tags = request.body.tags; throw Error('Creation response lost'); }
    if (request.method === 'DELETE') { deleted = true; throw Error('Deletion response lost'); }
    if (request.path === path) {
      const rows = tags && visible && !deleted ? [machine()] : [];
      return { status: 200, data: provider === 'digitalocean' ? { droplets: rows, links: {} } : { instances: rows, meta: { links: {} } } };
    }
    return deleted ? { status: 404 } : { status: 200, data: { [provider === 'digitalocean' ? 'droplet' : 'instance']: machine() } };
  }) };
  const catalog = { getQuote: async () => ({ available: true, recurringAmount: 6, currency: 'USD', trafficTerms: { source: 'fixture' } }),
    inspectBillableAttachments: vi.fn(async () => ({ complete: true, items: [] })) };
  const factory = provider === 'digitalocean' ? createDigitalOceanProvider : createVultrProvider;
  const api = factory({ context, transport, catalog, machine: { image: 'ubuntu', osId: 2284, sshKeyIds: ['key'], firewallId: 'fw', firewallTag: 'tag' } });
  const quote = await api.quote({ region: 'sgp1', planId: 'small' });
  const operation = { id: lease.id, kind: 'add', status: 'running', stage: 'provisioning', checkpoint: {},
    payload: { provider, quote, supported_protocols: ['shadowsocks', 'vless'] } };
  const store = { readState: async key => structuredClone(states.get(key) || { value: null, version: null }),
    saveState: async (key, value) => states.set(key, { value: structuredClone(value), version: (states.get(key)?.version || 0) + 1 }) };
  const repository = { readOperation: async () => structuredClone(operation), renewLease: async () => true,
    checkpoint: async ({ stage, status, checkpoint }) => Object.assign(operation, { stage, status, checkpoint: structuredClone(checkpoint) }),
    releaseOperation: async ({ status }) => { operation.status = status; } };
  const adapters = createLiveOperationAdapters({ context, store, repository, providers: { [provider]: api } });
  return { api, context, lease, operation, adapters, records, states, attempts, transport, catalog,
    ready: () => { ready = true; }, hide: () => { visible = false; },
    step: () => runOperationStep({ context, lease, adapters, repository }) };
}

describe.each(['digitalocean', 'vultr'])('%s pending creation cancellation', provider => {
  it('cancels the original purchased resource after it becomes ready, without another POST', async () => {
    const f = await fixture(provider);
    await f.step();
    expect(f.operation.stage).toBe('provisioning');
    expect(f.states.has('provider-resource')).toBe(false);
    f.operation.control_requested = 'cancel';
    await f.step();
    expect(f.operation.status).toBe('running');
    expect(f.transport.request.mock.calls.some(([r]) => r.method === 'DELETE')).toBe(false);
    f.ready();
    await f.step();
    expect(f.operation.status).toBe('cancelled');
    expect(f.transport.request.mock.calls.filter(([r]) => r.method === 'POST')).toHaveLength(1);
    expect(f.transport.request.mock.calls.filter(([r]) => r.method === 'DELETE')).toHaveLength(1);
    expect(f.states.get('provider-resource').value.id).toBe('123');
  });
  it('does not purchase when cancellation precedes any provider intent', async () => {
    const f = await fixture(provider);
    f.operation.control_requested = 'cancel';
    await f.step();
    expect(f.operation.status).toBe('cancelled');
    expect(f.transport.request.mock.calls.every(([r]) => r.method === 'GET')).toBe(true);
  });
  it('keeps an invisible uncertain purchase unresolved and never buys or deletes another resource', async () => {
    const f = await fixture(provider);
    await f.step(); f.hide(); f.operation.control_requested = 'cancel';
    for (let i = 0; i < 3; i++) await f.step();
    expect(f.operation.status).toBe('blocked');
    expect(f.transport.request.mock.calls.filter(([r]) => r.method === 'POST')).toHaveLength(1);
    expect(f.transport.request.mock.calls.some(([r]) => r.method === 'DELETE')).toBe(false);
  });
  it('refuses a foreign ownership receipt even when creation tags match', async () => {
    const f = await fixture(provider);
    await f.step(); f.ready();
    f.records.set('123', { id: '123', kind: 'provider', environment: 'production' });
    f.operation.control_requested = 'cancel';
    await f.step();
    expect(f.operation.status).not.toBe('cancelled');
    expect(f.transport.request.mock.calls.some(([r]) => r.method === 'DELETE')).toBe(false);
  });
  it('refuses a same-pool resource bound to another operation', async () => {
    const f = await fixture(provider);
    await f.step(); f.ready();
    await f.api.reconcileCreate({ operationId: f.lease.id, operation: f.lease });
    f.records.set('123', { ...f.records.get('123'), operationId: 'another-operation' });
    f.operation.control_requested = 'cancel';
    await f.step();
    expect(f.operation.status).not.toBe('cancelled');
    expect(f.transport.request.mock.calls.some(([r]) => r.method === 'DELETE')).toBe(false);
  });
  it('never reports completed cancellation while billable attachments remain', async () => {
    const f = await fixture(provider);
    await f.step(); f.ready(); f.operation.control_requested = 'cancel';
    f.catalog.inspectBillableAttachments
      .mockResolvedValueOnce({ complete: true, items: [] })
      .mockResolvedValue({ complete: true, items: [{ type: 'volume', id: 'unresolved-volume' }] });
    await f.step();
    expect(f.operation.status).not.toBe('cancelled');
    f.catalog.inspectBillableAttachments.mockResolvedValue({ complete: true, items: [] });
    await f.step();
    expect(f.operation.status).toBe('cancelled');
    expect(f.transport.request.mock.calls.filter(([r]) => r.method === 'DELETE')).toHaveLength(1);
  });
  it('rejects stale lease authority before provider reconciliation', async () => {
    const f = await fixture(provider);
    await f.step(); f.ready();
    f.transport.request.mockClear();
    f.context.adapters.assertOperationLease = async () => false;
    await expect(f.api.reconcileCreate({ operationId: f.lease.id, operation: f.lease }))
      .rejects.toMatchObject({ code: 'STALE_FENCE' });
    expect(f.transport.request).not.toHaveBeenCalled();
  });
});
