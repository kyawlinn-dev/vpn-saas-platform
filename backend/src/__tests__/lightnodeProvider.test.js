import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInfrastructureContext } from '../services/infrastructure/context.js';
import { payloadHash } from '../services/infrastructure/repository.js';
import { verifyRetirementReady, retireSource } from '../services/infrastructure/retirement.js';

// Dynamic import makes the first RED an explicit assertion about the missing adapter.
const load = async () => (await import('../services/infrastructure/providers/lightnode.js')).createLightNodeProvider;
const operation = { id: 'op', owner: 'worker', fence: 1 };
const password = 'Temporary7!Password';
const pin = 'SHA256:observed-by-parent';
const machine = { zone: 'jp-tokyo-1-a', imageResourceUUID: 'img-ubuntu', bootstrapMode: 'password-tofu', firstContactPolicy: 'tofu' };
const specs = { id: 'intel-c1m2-bgp-t1000-s50-d0', zone: machine.zone, cpu: 1, memory_mb: 2048, disk_gb: 50, transfer: { included: 1000, unit: 'GB' } };
const detail = () => ({ ecsResourceUUID: 'ecs-new', createTime: '2026-11-01 09:00:00', regionCode: 'jp-tokyo-1', zoneCode: machine.zone,
  imageResourceUUID: machine.imageResourceUUID, cpu: 1, giftCpu: 0, memory: 2, systemDiskSize: 50,
  dataDiskSize: 0, dataDiskInfoList: [], snapshotNum: 0, secondaryPublicIpInfoList: [],
  systemDiskResourceUUID: 'disk-system', publicIpResourceUUID: 'eip-new', freeFlow: 1000,
  publicIpAddress: '198.51.100.20', ecsStatus: 'STARTED', ecsPendingStatus: 'NONE', instanceName: 'untrusted-name', password: 'never-return' });

async function fixture() {
  const factory = await load();
  const resources = new Map(), attempts = new Map(), states = new Map();
  const config = { executionMode: 'mock', environment: 'development', databaseIdentity: 'db', panelIdentity: 'panel', poolId: 'pool',
    providerAccounts: { lightnode: 'attested-account' }, protectedResourceIds: ['ecs-protected'], protectedAddresses: ['192.0.2.1'] };
  const registry = {
    getResource: vi.fn(async ({ id }) => resources.get(id)),
    getCreateAttempt: vi.fn(async ({ operationId }) => attempts.get(operationId)),
    claimCreateAttempt: vi.fn(async attempt => { if (attempts.has(attempt.operationId)) return false; attempts.set(attempt.operationId, structuredClone(attempt)); return true; }),
    recordCreatedResource: vi.fn(async (resource, { expectedAttempt }) => {
      expect(expectedAttempt).toEqual(attempts.get(resource.operationId));
      expect(states.get('lightnode-create').value).toMatchObject({ operationId: resource.operationId, resourceId: resource.id });
      // Parent observes only, checkpoints the fingerprint, then registers independently.
      resources.set(resource.id, { ...structuredClone(resource), sshHostKeySha256: pin });
    }),
  };
  const adapters = { inspectRuntime: async () => ({ ...config, verified: true }), assertOperationLease: vi.fn(async () => true),
    assertPurchaseScope: vi.fn(async () => true), assertDeletionScope: vi.fn(async () => true) };
  const context = await createInfrastructureContext({ config, registry, adapters });
  const store = { readState: vi.fn(async key => structuredClone(states.get(key) || { value: null, version: null })),
    saveState: vi.fn(async (key, value, expectedVersion) => {
      const previous = states.get(key);
      if ((previous?.version ?? null) !== expectedVersion) throw Object.assign(new Error('CAS'), { code: 'STATE_CONFLICT' });
      states.set(key, { value: structuredClone(value), version: (previous?.version || 0) + 1 }); return true;
    }) };
  const price = { available: true, currency: 'USD', recurringAmount: 7.71,
    trafficTerms: { included: 1000, unit: 'GB', source: 'operator-verified', zone: machine.zone,
      specs: { cpu: specs.cpu, memory_mb: specs.memory_mb, disk_gb: specs.disk_gb, transfer: structuredClone(specs.transfer) },
      pricingEvidence: { region: 'jp-tokyo-1', zone: machine.zone, packageCode: specs.id, currency: 'USD', hourly: 0.012,
        monthlyEstimate: 7.71, referenceHours: 642.5, verifiedAt: '2026-11-01T08:00:00Z', source: 'console', includedTrafficGb: 1000 },
      billing: { kind: 'operator_verified_hourly', currency: 'USD', hourly: 0.012, monthlyEstimate: 7.71, verifiedAt: '2026-11-01T08:00:00Z', source: 'console', referenceHours: 642.5 } } };
  const catalog = { getQuote: vi.fn(async () => structuredClone(price)), assertSelection: vi.fn(async () => structuredClone(specs)),
    list: vi.fn(async (_path, _key, query) => {
      if (!query?.regionCode || !query?.zoneCode) throw Object.assign(new Error('Missing parameters'), { code: 'PROVIDER_READ_UNAVAILABLE' });
      return [];
    }) };
  let row = detail(), result = { processResult: 'SUCCESS', taskStatus: 'FINISHED' }, absent = false;
  const transport = { accountId: 'attested-account', request: vi.fn(async request => {
    if (request.path === '/instance/create') return { status: 202, data: { asyncTaskInfo: { asyncTaskUUID: 'task-create', ecsResourceUUID: 'ecs-new' } } };
    if (request.path === '/instance/release') { absent = true; return { status: 200, data: { asyncTaskInfo: { asyncTaskUUID: 'task-delete', ecsResourceUUID: 'ecs-new' } } }; }
    if (request.path === '/asynctask/getResult') return { status: 202, data: { asyncTaskInfo: result } };
    if (request.path === '/instance/detail') return absent ? { status: 404 } : { status: 200, data: { success: true, httpStatus: 202, instance: row } };
    throw new Error('Unexpected API');
  }) };
  const make = () => factory({ context, transport, catalog, machine, store });
  const api = make(), quote = await api.quote({ region: 'jp-tokyo-1', planId: specs.id });
  const input = { operationId: operation.id, operation, quote, profile: 'dual', bootstrap: { password } };
  return { api, make, quote, input, context, registry, adapters, catalog, transport, store, states, attempts, resources, price,
    setRow: value => { row = value; }, setResult: value => { result = value; }, setAbsent: value => { absent = value; } };
}
const posts = f => f.transport.request.mock.calls.map(([r]) => r).filter(r => r.method === 'POST');
const code = value => ({ code: value, message: value });

// Exercise the real common retirement projection rather than duplicating it here.
async function retirementFixture(f) {
  const owned = await f.api.create(f.input);
  const scope = Object.fromEntries(['environment', 'databaseIdentity', 'panelIdentity', 'poolId'].map(key => [key, owned[key]]));
  const own = (kind, id, rest) => {
    const value = { ...scope, kind, id, ...rest }; f.resources.set(id, value); return value;
  };
  const source = own('server', 'source', { panel_node_id: '51', provider_resource_id: owned.id, addresses: owned.addresses, lifecycle_protected: false });
  const destination = own('server', 'destination', {});
  const node = own('node', '51', { address: owned.addresses[0] });
  let checkpoint = null, panelRemoved = false;
  const adapters = {
    provider: f.api,
    readSource: async () => ({ server: source, node: panelRemoved ? null : node }),
    readDeletionAuthorization: async () => ({ approved: true, provider: owned.provider, accountId: owned.accountId,
      resourceId: owned.id, createdAt: owned.createdAt, addresses: owned.addresses, nodeId: '51' }),
    inventory: async () => ({ blockers: [], movable: [], activeSourceAssignments: 0, pendingSourceKeys: 0 }),
    verifyDestination: async () => ({ healthy: true, tunnelsVerified: true, permanentLinksVerified: true, verifiedAt: new Date().toISOString() }),
    readRetirementCheckpoint: async () => checkpoint,
    checkpointRetirement: vi.fn(async value => { checkpoint = value; }),
    removeOwnedPanelResources: vi.fn(async () => { panelRemoved = true; return true; }),
    billingInventory: async () => ({ complete: true, ongoingCharges: [] }),
  };
  const input = { context: f.context, lease: operation, source, destination, adapters };
  return { input, adapters, checkpoint: () => checkpoint,
    retire: async () => retireSource({ ...input, proof: await verifyRetirementReady(input) }) };
}

describe('LightNode durable async lifecycle', () => {
  it('provisions with an explicitly unavailable provider price without treating it as free',async()=>{
    const f=await fixture();f.price.recurringAmount=null;
    f.price.trafficTerms.billing={kind:'provider_pricing',source:'https://doc.lightnode.com/Instance/Billingdescription.html'};
    const quote=await f.api.quote({region:'jp-tokyo-1',planId:specs.id});
    expect(quote.recurringAmount).toBeNull();
    const resource=await f.api.create({...f.input,quote});
    expect(resource.id).toBe('ecs-new');expect(posts(f).filter(p=>p.path==='/instance/create')).toHaveLength(1);
  });
  it('binds bandwidth-billed specifications without inventing a GB quota and retires the same package',async()=>{
    const f=await fixture(),id='intel-c1m2-bgp-b2-s50-d0';
    const selected={...specs,id,transfer:{included:null,unit:null},billing_mode:'PayByBandwidth',bandwidth_mbps:2};
    f.catalog.assertSelection.mockResolvedValue(selected);
    f.price.recurringAmount=null;f.price.trafficTerms={source:'https://doc.lightnode.com/Instance/Billingdescription.html',zone:machine.zone,
      included:null,unit:null,billing:{kind:'provider_pricing',source:'https://doc.lightnode.com/Instance/Billingdescription.html'},
      specs:{cpu:1,memory_mb:2048,disk_gb:50,transfer:selected.transfer,billing_mode:'PayByBandwidth',bandwidth_mbps:2}};
    f.setRow({...detail(),freeFlow:undefined,internetChargeType:'PAY_BY_BANDWIDTH',bandwidth:2});
    const quote=await f.api.quote({region:'jp-tokyo-1',planId:id});
    const resource=await f.api.create({...f.input,quote});
    expect(resource.lightnodeReceipt.specs.transfer).toEqual({included:null,unit:null});
    expect(posts(f).find(p=>p.path==='/instance/create').body.packageConfig.packageCode).toBe(id);
    await expect(f.api.delete({resourceId:resource.id,expectedIdentity:resource,operation})).resolves.toMatchObject({absent:true});
  });
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-01T09:00:00Z')); });
  afterEach(() => vi.useRealTimers());
  it('exports the lifecycle factory', async () => { expect(await load()).toBeTypeOf('function'); });
  it('deletes through the actual common minimal retirement identity using the independent private receipt', async () => {
    const f = await fixture(); const retirement = await retirementFixture(f);
    await expect(retirement.retire()).resolves.toMatchObject({ resourceAbsent: true });
    expect(retirement.checkpoint().providerIdentity).not.toHaveProperty('lightnodeReceipt');
    expect(posts(f).filter(r => r.path === '/instance/release')).toHaveLength(1);
  });
  it('keeps async deletion pending across common retirement polls and resume without repeating panel removal or release', async () => {
    const f = await fixture(); const retirement = await retirementFixture(f);
    const real = f.transport.request.getMockImplementation();
    f.transport.request.mockImplementation(async r => r.path === '/instance/release'
      ? { status: 202, data: { asyncTaskInfo: { asyncTaskUUID: 'task-delete', ecsResourceUUID: 'ecs-new' } } } : real(r));
    f.setResult({ taskStatus: 'PROCESSING', processResult: 'RETRY' });
    for (let poll = 0; poll < 5; poll++) {
      if (poll === 2) retirement.adapters.provider = f.make();
      await expect(retirement.retire()).rejects.toMatchObject(code('PROVIDER_RESOURCE_PENDING'));
      expect(retirement.checkpoint()).toMatchObject({ phase: 'delete_issued', panelRemoved: true });
    }
    expect(retirement.adapters.removeOwnedPanelResources).toHaveBeenCalledTimes(1);
    expect(retirement.adapters.checkpointRetirement).toHaveBeenCalledTimes(2);
    f.setResult({ taskStatus: 'FINISHED', processResult: 'SUCCESS' });
    await expect(retirement.retire()).rejects.toMatchObject(code('DELETE_RECONCILIATION_REQUIRED'));
    f.setAbsent(true);
    await expect(retirement.retire()).resolves.toMatchObject({ resourceAbsent: true });
    expect(posts(f).filter(r => r.path === '/instance/release')).toHaveLength(1);
  });
  it.each(['protected', 'accountId', 'createdAt', 'addresses', 'poolId', 'provider'])('rejects minimal identity deletion for a same-UUID registry with changed %s', async key => {
    const f = await fixture(); const retirement = await retirementFixture(f);
    const remove = retirement.adapters.removeOwnedPanelResources.getMockImplementation();
    retirement.adapters.removeOwnedPanelResources.mockImplementation(async input => {
      await remove(input);
      f.resources.get('ecs-new')[key] = key === 'protected' ? true : key === 'addresses' ? ['203.0.113.1'] : 'foreign';
      return true;
    });
    await expect(retirement.retire()).rejects.toMatchObject(code(key === 'protected' ? 'PROTECTED_RESOURCE' : 'RESOURCE_SCOPE_MISMATCH'));
    expect(posts(f).filter(r => r.path === '/instance/release')).toHaveLength(0);
  });
  it('rejects supplied private proof that disagrees with the independent receipt', async () => {
    const f = await fixture(); const owned = await f.api.create(f.input);
    await expect(f.api.delete({ resourceId: owned.id, expectedIdentity: { ...owned, lightnodeReceipt: { ...owned.lightnodeReceipt, taskId: 'foreign' } }, operation }))
      .rejects.toMatchObject(code('RESOURCE_SCOPE_MISMATCH'));
    expect(posts(f)).toHaveLength(1);
  });
  it('reconciles SSH-pending allocation through a verified parent cancellation receipt and deletes without a pin or second create', async () => {
    const f = await fixture();
    f.registry.recordCreatedResource.mockRejectedValueOnce(Object.assign(Error('SSH pending'), { code: 'NODE_BOOTSTRAP_PENDING' }));
    await expect(f.api.create(f.input)).rejects.toMatchObject(code('NODE_BOOTSTRAP_PENDING'));
    f.adapters.assertCancellationScope = vi.fn(async ({ operation: lease }) => lease === operation);
    f.registry.recordCreatedResource.mockImplementation(async resource => {
      f.resources.set(resource.id, { ...resource, sshEnrollment: 'cancelled_before_enrollment' });
    });
    const owned = await f.make().reconcileCreate({ operationId: operation.id, operation });
    expect(owned).toMatchObject({ sshEnrollment: 'cancelled_before_enrollment' });
    expect(owned).not.toHaveProperty('sshHostKeySha256');
    expect(await f.api.inspect({ resourceId: owned.id })).toMatchObject({ sshEnrollment: 'cancelled_before_enrollment' });
    expect(await f.make().reconcileCreate({ operationId: operation.id, operation })).toEqual(owned);
    await expect(f.api.delete({ resourceId: owned.id, expectedIdentity: owned, operation })).resolves.toMatchObject({ absent: true });
    expect(posts(f).map(r => r.path)).toEqual(['/instance/create', '/instance/release']);
    expect(f.adapters.assertCancellationScope).toHaveBeenCalledWith(expect.objectContaining({ operation }));
  });
  it('rejects a forged cancellation marker even when a host pin is present', async () => {
    const f = await fixture();
    f.registry.recordCreatedResource.mockImplementation(async resource => {
      f.resources.set(resource.id, { ...resource, sshHostKeySha256: pin, sshEnrollment: 'cancelled_before_enrollment' });
    });
    await expect(f.api.create(f.input)).rejects.toMatchObject(code('RESOURCE_SCOPE_MISMATCH'));
  });
  it.each([
    { processResult: 'FAIL', status: 'STARTED' },
    { processResult: 'SUCCESS', status: 'STOPPED' },
    { processResult: 'FAIL', status: 'STOPPED' },
  ])('cancels an exact allocation with task $processResult and VM $status without SSH or another create', async ({ processResult, status }) => {
    const f = await fixture(); f.setResult({ taskStatus: 'FINISHED', processResult });
    f.setRow({ ...detail(), ecsStatus: status });
    await expect(f.api.create(f.input)).rejects.toMatchObject(code(processResult === 'FAIL' ? 'PROVIDER_CREATE_FAILED' : 'PROVIDER_RESOURCE_PENDING'));
    f.adapters.assertCancellationScope = vi.fn(async () => true);
    f.registry.recordCreatedResource.mockImplementation(async resource => {
      f.resources.set(resource.id, { ...resource, sshEnrollment: 'cancelled_before_enrollment' });
    });
    const owned = await f.make().reconcileCreate({ operationId: operation.id, operation });
    expect(owned).toMatchObject({ id: 'ecs-new', status, sshEnrollment: 'cancelled_before_enrollment' });
    expect(owned).not.toHaveProperty('sshHostKeySha256');
    f.setResult({ taskStatus: 'FINISHED', processResult: 'SUCCESS' }); // Release is a distinct task.
    await expect(f.api.delete({ resourceId: owned.id, expectedIdentity: owned, operation })).resolves.toMatchObject({ absent: true });
    expect(posts(f).map(r => r.path)).toEqual(['/instance/create', '/instance/release']);
  });
  it.each(['FAIL', 'STOPPED', 'no-ip'])('keeps ordinary create and public find strict for %s even in cancellation scope', async state => {
    const f = await fixture(); f.setResult({ taskStatus: 'PROCESSING', processResult: 'RETRY' });
    await expect(f.api.create(f.input)).rejects.toMatchObject(code('PROVIDER_RESOURCE_PENDING'));
    f.adapters.assertCancellationScope = async () => true;
    f.setResult({ taskStatus: 'FINISHED', processResult: state === 'FAIL' ? 'FAIL' : 'SUCCESS' });
    if (state === 'STOPPED') f.setRow({ ...detail(), ecsStatus: 'STOPPED' });
    if (state === 'no-ip') f.setRow({ ...detail(), publicIpAddress: '0.0.0.0' });
    const expected = state === 'FAIL' ? 'PROVIDER_CREATE_FAILED' : 'PROVIDER_RESOURCE_PENDING';
    await expect(f.make().create(f.input)).rejects.toMatchObject(code(expected));
    await expect(f.api.find({ operationId: operation.id, cancellation: true, operation })).rejects.toMatchObject(code(expected));
    expect(f.registry.recordCreatedResource).not.toHaveBeenCalled();
    expect(posts(f)).toHaveLength(1);
  });
  it.each(['uuid', 'intent', 'scope', 'specs', 'partial-detail', 'protected', 'absent'])('fails closed on cancellation allocation proof with %s', async change => {
    const f = await fixture(); f.setResult({ taskStatus: 'PROCESSING', processResult: 'RETRY' });
    await expect(f.api.create(f.input)).rejects.toMatchObject(code('PROVIDER_RESOURCE_PENDING'));
    f.adapters.assertCancellationScope = async () => true;
    f.setResult({ taskStatus: 'FINISHED', processResult: 'FAIL' });
    if (change === 'uuid') f.setRow({ ...detail(), ecsResourceUUID: 'foreign' });
    if (change === 'intent') f.attempts.get('op').nonce = 'foreign';
    if (change === 'scope') f.states.get('lightnode-create').value.poolId = 'foreign';
    if (change === 'specs') f.setRow({ ...detail(), cpu: 99 });
    if (change === 'partial-detail') f.setRow({ ...detail(), systemDiskSize: undefined });
    if (change === 'protected') f.setRow({ ...detail(), publicIpAddress: '192.0.2.1' });
    if (change === 'absent') f.setAbsent(true);
    const expected = change === 'absent' ? 'CREATE_RECONCILIATION_REQUIRED' : change === 'protected' ? 'PROTECTED_RESOURCE' : 'RESOURCE_SCOPE_MISMATCH';
    await expect(f.make().reconcileCreate({ operationId: operation.id, operation })).rejects.toMatchObject(code(expected));
    expect(f.registry.recordCreatedResource).not.toHaveBeenCalled();
    expect(posts(f)).toHaveLength(1);
  });
  it.each(['missing-pin', 'unguarded-marker', 'false-guard', 'throwing-guard', 'nonboolean-guard'])('rejects registration with %s', async change => {
    const f = await fixture();
    if (change === 'false-guard') f.adapters.assertCancellationScope = async () => false;
    if (change === 'throwing-guard') f.adapters.assertCancellationScope = async () => { throw Error('private'); };
    if (change === 'nonboolean-guard') f.adapters.assertCancellationScope = async () => 'true';
    if (change === 'missing-pin') f.adapters.assertCancellationScope = async () => true;
    f.registry.recordCreatedResource.mockImplementation(async resource => {
      f.resources.set(resource.id, { ...resource, ...(change === 'missing-pin' ? {} : { sshEnrollment: 'cancelled_before_enrollment' }) });
    });
    await expect(f.api.create(f.input)).rejects.toMatchObject(code('RESOURCE_SCOPE_MISMATCH'));
    expect(posts(f)).toHaveLength(1);
  });
  it('hashes the complete scoped quote including billing proof for 15 minutes', async () => {
    const f = await fixture(); const { hash, ...body } = f.quote;
    expect(hash).toBe(payloadHash(body)); expect(body.expiresAt).toBe('2026-11-01T09:15:00.000Z');
    expect(body).toMatchObject({ environment: 'development', accountId: 'attested-account', trafficTerms: f.price.trafficTerms });
  });
  it('creates exact packageConfig, checkpoints UUIDs before polling and returns the parent pin', async () => {
    const f = await fixture();
    const result = await f.api.create(f.input);
    expect(posts(f)).toEqual([{ method: 'POST', path: '/instance/create', body: { packageConfig: {
      zoneCode: machine.zone, regionCode: f.quote.region, packageCode: specs.id, instanceName: 'novanet-op', imageResourceUUID: machine.imageResourceUUID, password } } }]);
    expect(f.states.get('lightnode-create').value).toMatchObject({ operationId: 'op', resourceId: 'ecs-new', taskId: 'task-create', region: f.quote.region, zone: machine.zone, planId: specs.id });
    expect(f.store.saveState.mock.invocationCallOrder[0]).toBeLessThan(f.transport.request.mock.invocationCallOrder[0]);
    expect(f.store.saveState.mock.invocationCallOrder[1]).toBeLessThan(f.transport.request.mock.invocationCallOrder[1]);
    expect(result).toEqual(f.resources.get('ecs-new')); expect(result.sshHostKeySha256).toBe(pin);
    expect(result.createdAt).toBe(detail().createTime);
    expect(JSON.stringify([...f.attempts.values()])).not.toContain(password);
    expect(JSON.stringify(result)).not.toContain('never-return');
  });
  it('resumes pending create after restart and quote expiry with no second POST', async () => {
    const f = await fixture(); f.setResult({ taskStatus: 'PROCESSING', processResult: 'RETRY' });
    await expect(f.api.create(f.input)).rejects.toMatchObject(code('PROVIDER_RESOURCE_PENDING'));
    expect(f.registry.recordCreatedResource).not.toHaveBeenCalled();
    vi.advanceTimersByTime(20 * 60000); f.setResult({ taskStatus: 'FINISHED', processResult: 'SUCCESS' });
    expect((await f.make().create(f.input)).sshHostKeySha256).toBe(pin); expect(posts(f)).toHaveLength(1);
  });
  it.each(['FAIL', 'CANCEL'])('reports terminal create %s without retrying spend', async processResult => {
    const f = await fixture(); f.setResult({ taskStatus: 'FINISHED', processResult });
    await expect(f.api.create(f.input)).rejects.toMatchObject(code('PROVIDER_CREATE_FAILED'));
    await expect(f.make().reconcileCreate({ operationId: 'op', operation })).rejects.toMatchObject(code('PROVIDER_CREATE_FAILED'));
    expect(posts(f)).toHaveLength(1);
  });
  it('never resubmits lost POST or adopts a matching name without saved UUIDs', async () => {
    const f = await fixture(); f.transport.request.mockRejectedValue(new Error(`timeout ${password}`));
    await expect(f.api.create(f.input)).rejects.toMatchObject(code('CREATE_RECONCILIATION_REQUIRED'));
    await expect(f.make().create(f.input)).rejects.toMatchObject(code('CREATE_RECONCILIATION_REQUIRED'));
    await expect(f.api.find({ operationId: 'op' })).rejects.toMatchObject(code('CREATE_RECONCILIATION_REQUIRED'));
    expect(posts(f)).toHaveLength(1);
  });
  it('cannot poll or repeat spend after the response checkpoint CAS fails', async () => {
    const f = await fixture(); const save = f.store.saveState.getMockImplementation();
    f.store.saveState.mockImplementation(async (...args) => { if (args[1].taskId) throw new Error(`CAS ${password}`); return save(...args); });
    await expect(f.api.create(f.input)).rejects.toMatchObject(code('PROVIDER_CHECKPOINT_UNAVAILABLE'));
    await expect(f.make().create(f.input)).rejects.toMatchObject(code('CREATE_RECONCILIATION_REQUIRED'));
    expect(f.transport.request).toHaveBeenCalledTimes(1);
  });
  it('fails closed before POST when initial checkpoint fails', async () => {
    const f = await fixture(); f.store.saveState.mockRejectedValue(new Error('CAS'));
    await expect(f.api.create(f.input)).rejects.toMatchObject(code('PROVIDER_CHECKPOINT_UNAVAILABLE')); expect(posts(f)).toHaveLength(0);
  });
  it.each(['expiry', 'billing', 'amount', 'scope', 'password', 'lease', 'purchase'])('rejects unsafe initial %s before claiming spend', async change => {
    const f = await fixture(); let expected = 'QUOTE_INVALID';
    if (change === 'expiry') vi.advanceTimersByTime(16 * 60000);
    if (change === 'billing') { f.price.trafficTerms.billing.source = 'changed-console'; expected = 'QUOTE_CHANGED'; }
    if (change === 'amount') { f.price.recurringAmount = 8; expected = 'QUOTE_CHANGED'; }
    if (change === 'scope') f.input.quote = { ...f.quote, poolId: 'other' };
    if (change === 'password') { f.input.bootstrap.password = 'bad'; expected = 'MACHINE_CONFIGURATION_REQUIRED'; }
    if (change === 'lease') { f.adapters.assertOperationLease.mockResolvedValue(false); expected = 'STALE_FENCE'; }
    if (change === 'purchase') { f.adapters.assertPurchaseScope.mockResolvedValue(false); expected = 'PURCHASE_NOT_AUTHORIZED'; }
    await expect(f.api.create(f.input)).rejects.toMatchObject(code(expected)); expect(posts(f)).toHaveLength(0);
  });
  it.each(['ecsResourceUUID', 'regionCode', 'zoneCode', 'imageResourceUUID', 'cpu', 'memory', 'systemDiskSize', 'freeFlow'])('rejects mismatched create detail %s', async key => {
    const f = await fixture(); f.setRow({ ...detail(), [key]: typeof detail()[key] === 'number' ? 99 : 'foreign' });
    await expect(f.api.create(f.input)).rejects.toMatchObject(code('RESOURCE_SCOPE_MISMATCH')); expect(f.registry.recordCreatedResource).not.toHaveBeenCalled();
  });
  it.each([{ publicIpAddress: '192.0.2.1' }, { ecsResourceUUID: 'ecs-protected' }])('blocks protected create detail %j', async patch => {
    const f = await fixture(); f.setRow({ ...detail(), ...patch });
    await expect(f.api.create(f.input)).rejects.toMatchObject({ code: patch.publicIpAddress ? 'PROTECTED_RESOURCE' : 'RESOURCE_SCOPE_MISMATCH' });
    expect(f.registry.recordCreatedResource).not.toHaveBeenCalled();
  });
  it('waits for a ready address after task success', async () => {
    const f = await fixture(); f.setRow({ ...detail(), publicIpAddress: '0.0.0.0' });
    await expect(f.api.create(f.input)).rejects.toMatchObject(code('PROVIDER_RESOURCE_PENDING'));
  });
  it('rejects foreign state, intent, registry and profile replay', async () => {
    const f = await fixture(); await f.api.create(f.input);
    await expect(f.api.create({ ...f.input, profile: 'vless_only' })).rejects.toMatchObject(code('IDEMPOTENCY_CONFLICT'));
    f.states.get('lightnode-create').value.operationId = 'other';
    await expect(f.api.find({ operationId: 'op' })).rejects.toMatchObject(code('RESOURCE_SCOPE_MISMATCH'));
    f.states.get('lightnode-create').value.operationId = 'op'; f.attempts.get('op').accountId = 'foreign';
    await expect(f.api.find({ operationId: 'op' })).rejects.toMatchObject(code('RESOURCE_SCOPE_MISMATCH'));
  });
  it('inspect preserves the stored pin only for exact independent ownership and strips arbitrary fields', async () => {
    const f = await fixture(); await f.api.create(f.input); f.resources.get('ecs-new').password = 'registry-secret';
    expect(await f.api.inspect({ resourceId: 'ecs-new' })).toMatchObject({ sshHostKeySha256: pin, poolId: 'pool', planId: specs.id });
    expect(JSON.stringify(await f.api.inspect({ resourceId: 'ecs-new' }))).not.toContain('registry-secret');
    f.resources.get('ecs-new').poolId = 'foreign';
    const unowned = await f.api.inspect({ resourceId: 'ecs-new' }); expect(unowned.poolId).toBeUndefined(); expect(unowned.sshHostKeySha256).toBeUndefined();
    await expect(f.api.reconcileCreate({ operationId: 'op', operation })).rejects.toMatchObject(code('RESOURCE_SCOPE_MISMATCH'));
  });
  it('returns null without a creation intent instead of searching names', async () => {
    const f = await fixture(); expect(await f.api.find({ operationId: 'op' })).toBeNull(); expect(f.transport.request).not.toHaveBeenCalled();
  });
  it('uses public release contract and checkpoints its task before authoritative absence', async () => {
    const f = await fixture(); const expectedIdentity = await f.api.create(f.input);
    expect(await f.api.delete({ resourceId: 'ecs-new', expectedIdentity, operation })).toEqual({ absent: true, resourceId: 'ecs-new' });
    expect(posts(f)[1]).toEqual({ method: 'POST', path: '/instance/release', body: { ecsResourceUUID: 'ecs-new' } });
    expect(f.states.get('lightnode-delete').value).toMatchObject({ operationId: 'op', resourceId: 'ecs-new', taskId: 'task-delete' });
    expect(f.adapters.assertDeletionScope).toHaveBeenCalledWith(expect.objectContaining({ operation, resource: expect.objectContaining({ id: 'ecs-new' }) }));
  });
  it('completes common retirement and replay after the observed HTTP400 business-not-found with saved task and inventory absence', async () => {
    const f = await fixture(), retirement = await retirementFixture(f), real = f.transport.request.getMockImplementation();
    f.transport.request.mockImplementation(async request => {
      const response = await real(request);
      return request.path === '/instance/detail' && response.status === 404
        ? { status: 400, data: { code: 'AvailableInstance.NotFound', httpStatus: 400,
          message: 'Available instance not found', rowCount: 0 } } : response;
    });
    await expect(retirement.retire()).resolves.toMatchObject({ resourceAbsent: true });
    await expect(retirement.retire()).resolves.toMatchObject({ resourceAbsent: true });
    expect(posts(f).filter(r => r.path === '/instance/release')).toHaveLength(1);
    expect(retirement.adapters.removeOwnedPanelResources).toHaveBeenCalledTimes(1);
    expect(f.catalog.list).toHaveBeenCalledWith('/instance/list', 'instances', { regionCode: 'jp-tokyo-1', zoneCode: machine.zone });
    expect(await f.make().inspectBillableAttachments({ resourceId: 'ecs-new' })).toMatchObject({ complete: true, scope: 'instance-package' });
  });
  it.each(['missing-receipt', 'missing-task', 'scope', 'identity', 'generic400', 'wrong-status', 'contradiction', 'listed', 'incomplete-list', 'pending-task'])('does not infer business-not-found absence from %s', async change => {
    const f = await fixture(), owned = await f.api.create(f.input);
    await f.api.delete({ resourceId: owned.id, expectedIdentity: owned, operation });
    const saved = f.states.get('lightnode-delete').value;
    if (change === 'missing-receipt') f.states.delete('lightnode-delete');
    if (change === 'missing-task') saved.taskId = null;
    if (change === 'scope') saved.poolId = 'other';
    if (change === 'identity') saved.identity.createdAt = 'recycled';
    if (change === 'listed') f.catalog.list.mockResolvedValue([{ ecsResourceUUID: owned.id }]);
    if (change === 'incomplete-list') f.catalog.list.mockRejectedValue(Object.assign(new Error('incomplete'), { code: 'PROVIDER_PAGINATION_INCOMPLETE' }));
    if (change === 'pending-task') f.setResult({ taskStatus: 'PROCESSING', processResult: 'RETRY' });
    const real = f.transport.request.getMockImplementation();
    f.transport.request.mockImplementation(async request => request.path === '/instance/detail'
      ? { status: 400, data: { code: change === 'generic400' ? 'InvalidParameter' : 'AvailableInstance.NotFound',
        httpStatus: change === 'wrong-status' ? 202 : 400, rowCount: 0, ...(change === 'contradiction' ? { instance: detail() } : {}) } }
      : real(request));
    const expected = change === 'incomplete-list' ? 'PROVIDER_PAGINATION_INCOMPLETE'
      : change === 'pending-task' ? 'PROVIDER_RESOURCE_PENDING' : 'PROVIDER_READ_UNAVAILABLE';
    await expect(f.make().inspect({ resourceId: owned.id })).rejects.toMatchObject({ code: expected });
    expect(posts(f).filter(r => r.path === '/instance/release')).toHaveLength(1);
  });
  it('resumes pending deletion with no repeat POST and requires absence after task success', async () => {
    const f = await fixture(); const expectedIdentity = await f.api.create(f.input);
    const real = f.transport.request.getMockImplementation();
    f.transport.request.mockImplementation(async r => r.path === '/instance/release' ? { status: 202, data: { asyncTaskInfo: { asyncTaskUUID: 'task-delete', ecsResourceUUID: 'ecs-new' } } } : real(r));
    f.setResult({ taskStatus: 'PROCESSING', processResult: 'RETRY' });
    await expect(f.api.delete({ resourceId: 'ecs-new', expectedIdentity, operation })).rejects.toMatchObject(code('PROVIDER_RESOURCE_PENDING'));
    f.setResult({ taskStatus: 'FINISHED', processResult: 'SUCCESS' });
    await expect(f.make().delete({ resourceId: 'ecs-new', expectedIdentity, operation })).rejects.toMatchObject(code('DELETE_RECONCILIATION_REQUIRED'));
    f.setAbsent(true);
    expect(await f.make().delete({ resourceId: 'ecs-new', expectedIdentity, operation })).toMatchObject({ absent: true });
    expect(posts(f).filter(r => r.path === '/instance/release')).toHaveLength(1);
  });
  it('does not treat HTTP202 empty detail as absence', async () => {
    const f = await fixture(); f.transport.request.mockResolvedValue({ status: 202, data: {} });
    await expect(f.api.inspect({ resourceId: 'ecs-new' })).rejects.toMatchObject(code('PROVIDER_READ_UNAVAILABLE'));
  });
  it.each(['protected', 'scope', 'identity', 'authorize'])('blocks deletion with invalid %s', async change => {
    const f = await fixture(); const expectedIdentity = await f.api.create(f.input); let expected = 'RESOURCE_SCOPE_MISMATCH';
    if (change === 'protected') { f.resources.get('ecs-new').protected = true; expected = 'PROTECTED_RESOURCE'; }
    if (change === 'scope') f.resources.get('ecs-new').environment = 'production';
    if (change === 'identity') f.setRow({ ...detail(), createTime: 'recycled' });
    if (change === 'authorize') { f.adapters.assertDeletionScope.mockResolvedValue(false); expected = 'DELETION_NOT_AUTHORIZED'; }
    await expect(f.api.delete({ resourceId: 'ecs-new', expectedIdentity, operation })).rejects.toMatchObject(code(expected));
    expect(posts(f)).toHaveLength(1);
  });
  it('allows only documented empty package-local attachment evidence', async () => {
    const f = await fixture(); await f.api.create(f.input);
    expect(await f.api.inspectBillableAttachments({ resourceId: 'ecs-new' })).toMatchObject({ complete: true, scope: 'instance-package', items: [], externalAttachmentsVerified: false });
  });
  it.each([{ dataDiskSize: 1 }, { dataDiskInfoList: [{ snapshotNum: 0 }] }, { snapshotNum: 1 }, { dataDiskInfoList: null }, { secondaryPublicIpInfoList: ['extra'] }])('rejects unverifiable attachment evidence %j', async patch => {
    const f = await fixture(); await f.api.create(f.input); f.setRow({ ...detail(), ...patch });
    await expect(f.api.inspectBillableAttachments({ resourceId: 'ecs-new' })).rejects.toMatchObject(code('ATTACHMENT_INVENTORY_UNAVAILABLE'));
  });
  it('rejects externally supplied known attachments even after authoritative instance absence', async () => {
    const f = await fixture(); await f.api.create(f.input); f.setAbsent(true);
    await expect(f.api.inspectBillableAttachments({ resourceId: 'ecs-new', knownAttachments: [{ id: 'disk-external', type: 'volume' }] })).rejects.toMatchObject(code('ATTACHMENT_INVENTORY_UNAVAILABLE'));
  });
  it('reads attachment evidence during another operation without impersonating the original create lease', async () => {
    const f = await fixture(); await f.api.create(f.input);
    f.adapters.assertOperationLease.mockImplementation(async ({ operation: lease }) => lease.id === 'retire');
    expect(await f.api.inspectBillableAttachments({ resourceId: 'ecs-new' })).toMatchObject({ complete: true });
  });
  it('does not propagate secret or unrelated machine properties into durable registry intents', async () => {
    const f = await fixture(); const factory = await load();
    const api = factory({ context: f.context, transport: f.transport, catalog: f.catalog, store: f.store,
      machine: { ...machine, password, unrelated: { secret: password } } });
    await api.create(f.input);
    expect(JSON.stringify([...f.attempts.values()])).not.toContain(password);
  });
  it.each(['cpu', 'memory', 'freeFlow'])('blocks deletion when current detail %s changed', async key => {
    const f = await fixture(); const expectedIdentity = await f.api.create(f.input); f.setRow({ ...detail(), [key]: 999 });
    await expect(f.api.delete({ resourceId: 'ecs-new', expectedIdentity, operation })).rejects.toMatchObject(code('RESOURCE_SCOPE_MISMATCH'));
    expect(posts(f)).toHaveLength(1);
  });
  it('returns a safe error for an independent registry entry without an async package receipt', async () => {
    const f = await fixture(); const expectedIdentity = await f.api.create(f.input);
    delete expectedIdentity.lightnodeReceipt;
    await expect(f.api.delete({ resourceId: 'ecs-new', expectedIdentity, operation })).rejects.toMatchObject(code('ATTACHMENT_INVENTORY_UNAVAILABLE'));
  });
  it.each(['create', 'delete'])('rejects %s business failure inside HTTP202', async kind => {
    const f = await fixture(); const real = f.transport.request.getMockImplementation();
    const expectedIdentity = kind === 'delete' ? await f.api.create(f.input) : null;
    f.transport.request.mockImplementation(async r => {
      const response = await real(r);
      return r.path === (kind === 'create' ? '/instance/create' : '/instance/release') ? { ...response, data: { ...response.data, httpStatus: 400 } } : response;
    });
    const promise = kind === 'create' ? f.api.create(f.input) : f.api.delete({ resourceId: 'ecs-new', expectedIdentity, operation });
    await expect(promise).rejects.toMatchObject(code(`${kind.toUpperCase()}_RECONCILIATION_REQUIRED`));
  });
  it('sanitizes malformed task statuses instead of registering or retrying', async () => {
    const f = await fixture(); f.setResult({ taskStatus: 'UNKNOWN', processResult: 'SUCCESS' });
    await expect(f.api.create(f.input)).rejects.toMatchObject(code('PROVIDER_RESPONSE_INVALID'));
    expect(f.registry.recordCreatedResource).not.toHaveBeenCalled(); expect(posts(f)).toHaveLength(1);
  });
  it('rejects account changes even on an adapter constructed earlier', async () => {
    const f = await fixture(); f.transport.accountId = 'changed';
    await expect(f.api.create(f.input)).rejects.toMatchObject(code('RESOURCE_SCOPE_MISMATCH')); expect(posts(f)).toHaveLength(0);
  });
  it('does not repeat delete after lost response and accepts only later authoritative absence', async () => {
    const f = await fixture(); const expectedIdentity = await f.api.create(f.input), real = f.transport.request.getMockImplementation();
    f.transport.request.mockImplementation(async r => { if (r.path === '/instance/release') throw new Error(`timeout ${password}`); return real(r); });
    const input = { resourceId: 'ecs-new', expectedIdentity, operation };
    await expect(f.api.delete(input)).rejects.toMatchObject(code('DELETE_RECONCILIATION_REQUIRED'));
    await expect(f.make().delete(input)).rejects.toMatchObject(code('DELETE_RECONCILIATION_REQUIRED'));
    f.setAbsent(true); expect(await f.api.delete(input)).toMatchObject({ absent: true });
    expect(posts(f)).toHaveLength(2);
  });
  it('blocks a deletion response receipt CAS failure before polling and never resubmits', async () => {
    const f = await fixture(); const expectedIdentity = await f.api.create(f.input), save = f.store.saveState.getMockImplementation();
    const input = { resourceId: 'ecs-new', expectedIdentity, operation };
    f.store.saveState.mockImplementation(async (...args) => { if (args[0] === 'lightnode-delete' && args[1].taskId) throw new Error('CAS'); return save(...args); });
    await expect(f.api.delete(input)).rejects.toMatchObject(code('PROVIDER_CHECKPOINT_UNAVAILABLE'));
    f.setAbsent(false);
    await expect(f.make().delete(input)).rejects.toMatchObject(code('DELETE_RECONCILIATION_REQUIRED'));
    expect(posts(f)).toHaveLength(2);
  });
  it('fails closed when a parent callback returns a receipt without independently registering it', async () => {
    const f = await fixture(); f.registry.recordCreatedResource.mockImplementation(async value => ({ ...value, sshHostKeySha256: pin }));
    await expect(f.api.create(f.input)).rejects.toMatchObject(code('RESOURCE_SCOPE_MISMATCH'));
  });
  it('does not spend twice when the parent observation/registration is interrupted', async () => {
    const f = await fixture(); const register = f.registry.recordCreatedResource.getMockImplementation();
    f.registry.recordCreatedResource.mockRejectedValueOnce(new Error('observe interrupted'));
    await expect(f.api.create(f.input)).rejects.toMatchObject(code('OWNERSHIP_REGISTRY_UNAVAILABLE'));
    f.registry.recordCreatedResource.mockImplementation(register);
    expect((await f.make().reconcileCreate({ operationId: 'op', operation })).sshHostKeySha256).toBe(pin);
    expect(posts(f)).toHaveLength(1);
  });
  it('returns only persisted instance-package evidence after exact detail404 following deletion', async () => {
    const f = await fixture(); const expectedIdentity = await f.api.create(f.input);
    const before = await f.api.inspectBillableAttachments({ resourceId: 'ecs-new' });
    await f.api.delete({ resourceId: 'ecs-new', expectedIdentity, operation });
    expect(await f.make().inspectBillableAttachments({ resourceId: 'ecs-new' })).toEqual(before);
    expect(before).toMatchObject({ scope: 'instance-package', externalAttachmentsVerified: false });
  });
  it('recovers post-delete package evidence in a retirement operation independent of the original create checkpoint', async () => {
    const f = await fixture(); const expectedIdentity = await f.api.create(f.input);
    f.states.clear(); // A new operation has its own encrypted state namespace.
    const retirement = { id: 'retire', owner: 'next-worker', fence: 2 };
    f.adapters.assertOperationLease.mockImplementation(async ({ operation: lease }) => lease.id === retirement.id && lease.owner === retirement.owner && lease.fence === retirement.fence);
    await f.make().delete({ resourceId: 'ecs-new', expectedIdentity, operation: retirement });
    expect(f.states.get('lightnode-delete').value.operationId).toBe('retire');
    expect(await f.make().inspectBillableAttachments({ resourceId: 'ecs-new' })).toMatchObject({ complete: true, scope: 'instance-package', externalAttachmentsVerified: false });
    expect(f.states.has('lightnode-create')).toBe(false);
  });
  it('cannot manufacture post-delete billing evidence from absence alone', async () => {
    const f = await fixture(); await f.api.create(f.input); f.setAbsent(true);
    await expect(f.api.inspectBillableAttachments({ resourceId: 'ecs-new' })).rejects.toMatchObject(code('ATTACHMENT_INVENTORY_UNAVAILABLE'));
  });
  it.each(['resourceId', 'scope', 'identity', 'evidence', 'not404'])('rejects mismatching post-delete billing %s', async change => {
    const f = await fixture(); const expectedIdentity = await f.api.create(f.input);
    await f.api.delete({ resourceId: 'ecs-new', expectedIdentity, operation });
    const checkpoint = f.states.get('lightnode-delete').value;
    if (change === 'resourceId') checkpoint.resourceId = 'ecs-other';
    if (change === 'scope') checkpoint.poolId = 'other';
    if (change === 'identity') checkpoint.identity.createdAt = 'recycled';
    if (change === 'evidence') checkpoint.attachments.scope = 'account-wide';
    if (change === 'not404') f.transport.request.mockResolvedValue({ status: 202, data: {} });
    await expect(f.api.inspectBillableAttachments({ resourceId: 'ecs-new' })).rejects.toMatchObject(code(change === 'not404' ? 'PROVIDER_READ_UNAVAILABLE' : 'ATTACHMENT_INVENTORY_UNAVAILABLE'));
  });
  it('accepts observed default-package wire omission of dataDiskInfoList with authoritative zero aggregate disk size', async () => {
    const f = await fixture();
    const raw = { ...detail(), createTime: '2026-11-01 15:57:07', cpu: 1, memory: 2, systemDiskSize: 50, dataDiskSize: 0,
      freeFlow: 1000, snapshotNum: 0, systemDiskResourceUUID: 'disk-3s0001rd866f', publicIpResourceUUID: 'eip-e70001rd85k2', secondaryPublicIpInfoList: [] };
    delete raw.dataDiskInfoList; // Actual read-only API observation supplied by parent.
    f.setRow(raw);
    const expectedIdentity = await f.api.create(f.input);
    expect(await f.api.inspectBillableAttachments({ resourceId: 'ecs-new' })).toMatchObject({ complete: true, scope: 'instance-package', externalAttachmentsVerified: false });
    await f.api.delete({ resourceId: 'ecs-new', expectedIdentity, operation });
    expect(await f.api.inspectBillableAttachments({ resourceId: 'ecs-new' })).toMatchObject({ complete: true, scope: 'instance-package' });
  });
  it.each(['zone', 'cpu'])('binds spending to the approved catalogue %s proof across independent selection reads', async key => {
    const f = await fixture();
    f.catalog.assertSelection.mockResolvedValue({ ...specs, [key]: key === 'zone' ? 'other-zone' : 2 });
    await expect(f.api.create(f.input)).rejects.toMatchObject(code('QUOTE_CHANGED'));
    expect(posts(f)).toHaveLength(0);
  });
  it('never spends for a machine zone different from the signed quote evidence', async () => {
    const f = await fixture(); const factory = await load();
    const api = factory({ context: f.context, transport: f.transport, catalog: f.catalog, store: f.store, machine: { ...machine, zone: 'other-zone' } });
    await expect(api.create(f.input)).rejects.toMatchObject(code('QUOTE_CHANGED')); expect(posts(f)).toHaveLength(0);
  });
  it('resumes the original task after parent host-key observation is pending without another POST', async () => {
    const f = await fixture(); const register = f.registry.recordCreatedResource.getMockImplementation();
    f.registry.recordCreatedResource.mockRejectedValueOnce(Object.assign(new Error(`SSH not ready ${password}`), { code: 'NODE_BOOTSTRAP_PENDING' }));
    await expect(f.api.create(f.input)).rejects.toMatchObject(code('NODE_BOOTSTRAP_PENDING'));
    f.registry.recordCreatedResource.mockImplementation(register);
    expect((await f.make().reconcileCreate({ operationId: 'op', operation })).sshHostKeySha256).toBe(pin);
    expect(posts(f)).toHaveLength(1);
    expect(f.transport.request.mock.calls.filter(([r]) => r.path === '/asynctask/getResult').every(([r]) => r.query.asyncTaskUUID === 'task-create')).toBe(true);
  });
  it.each(['STALE_FENCE', 'LEASE_EXPIRED', 'RESOURCE_SCOPE_MISMATCH', 'PROTECTED_RESOURCE', 'NODE_SECURITY_CONFIGURATION_REQUIRED'])('preserves safe parent registration %s without leaking callback diagnostics', async errorCode => {
    const f = await fixture();
    f.registry.recordCreatedResource.mockRejectedValue(Object.assign(new Error(`private ${password}`), { code: errorCode }));
    await expect(f.api.create(f.input)).rejects.toMatchObject(code(errorCode));
    expect(posts(f)).toHaveLength(1);
  });
});
