import { describe, expect, it, vi } from 'vitest';
import { createLivePanelAdapter } from '../services/infrastructure/livePanelAdapter.js';
import { infrastructureFixture } from './fixtures/infrastructure.js';
describe('connected panel operations', () => {
  async function candidateFixture(protocols = ['vless'], realisticMemberships = false) {
    const f = await infrastructureFixture(); f.own('service', '502');
    const state = new Map(), nodes = [], hosts = [], services = [{ id: 502, name: 'DEV Public', inbound_ids: [] }];
    let sequence = 700;
    const inbounds = () => nodes.length ? protocols.map((protocol, i) => ({ id: 101 + i, node: { id: 51 }, tag: `managed-${protocol}`, protocol,
      ...(realisticMemberships ? {service_ids: services.filter(row => row.inbound_ids.includes(101 + i)).map(row => row.id)} : {}) })) : [];
    const transport = {
      list: vi.fn(async path => path === '/api/nodes' ? nodes : path === '/api/services' ? services : path === '/api/inbounds' ? inbounds() :
        hosts.filter(row => row.inbound_id === Number(path.split('/')[3]))),
      request: vi.fn(async ({ method, path, body }) => {
        if (method === 'POST') {
          const row = { ...body, id: path === '/api/nodes' ? 51 : ++sequence, status: 'healthy' };
          (path === '/api/nodes' ? nodes : path === '/api/services' ? services : hosts).push(row);
          return { status: 200, data: row };
        }
        const id = Number(path.split('/').at(-1));
        const collection = path.startsWith('/api/nodes') ? nodes : path.startsWith('/api/services') ? services : /^\/api\/inbounds\/\d+$/.test(path) ? inbounds() : hosts;
        const row = collection.find(row => row.id === id);
        if (method === 'DELETE') { if (row) collection.splice(collection.indexOf(row), 1); return { status: 204 }; }
        if (method === 'PUT') Object.assign(row, body);
        return { status: row ? 200 : 404, data: row || null };
      }),
    };
    const store = { readState: vi.fn(async key => structuredClone(state.get(key) || { value: null, version: null })),
      saveState: vi.fn(async (key, value) => { state.set(key, { value: structuredClone(value), version: (state.get(key)?.version || 0) + 1 }); }),
      acquireServiceLock: vi.fn(async () => true), releaseServiceLock: vi.fn(async () => true),
      archivePanelResource: vi.fn(async () => true),
      recordCreatedResource: vi.fn(async row => { f.records.set(`${row.kind}:${row.id}`, row); return row; }) };
    const panel = createLivePanelAdapter({ context: f.context, transport, store, getLease: () => f.operation });
    const configuration = { operationId: 'op', resourceId: 'vm', fingerprint: 'fixture', coreVersion: '25.5.16', realityPublicKey: 'fixture-public', shortId: '1234567890abcdef', vlessPort: 443, ssPort: null };
    return { ...f, transport, store, panel, configuration, services, hosts, nodes };
  }
  it('archives each deleted panel incarnation including cascade inbounds after verified absence', async () => {
    const f = await candidateFixture(['vless', 'shadowsocks']);
    await f.panel.ensurePrivateCandidate({ resource: f.resource, supportedProtocols: ['vless', 'shadowsocks'], configuration: { ...f.configuration, ssPort: 8388 } });
    for (const row of f.services) row.user_ids = [];
    await f.panel.deleteOwnedNode({ server: { panel_node_id: 51, provider_resource_id: 'vm' } });
    expect(f.store.archivePanelResource.mock.calls.map(([r]) => r.kind).sort()).toEqual(['host', 'host', 'inbound', 'inbound', 'node', 'service', 'service'].sort());
    expect(f.store.archivePanelResource.mock.calls.at(-1)[0]).toMatchObject({kind: 'node', id: '51', expectedBody: {provider_resource_id: 'vm'}});
    expect(f.store.archivePanelResource.mock.calls.some(([r]) => r.id === '502')).toBe(false);
  });
  it('recovers a node DELETE timeout and a later archive failure using the durable deletion manifest', async () => {
    const f = await candidateFixture();
    await f.panel.ensurePrivateCandidate({ resource: f.resource, supportedProtocols: ['vless'], configuration: f.configuration });
    for (const row of f.services) row.user_ids = [];
    const original = f.transport.request.getMockImplementation();
    f.transport.request.mockImplementation(async request => {
      const response = await original(request);
      if (request.method === 'DELETE' && request.path === '/api/nodes/51') throw Error('Lost DELETE response');
      return response;
    });
    let failed = false;
    f.store.archivePanelResource.mockImplementation(async row => {
      if (row.kind === 'inbound' && !failed) { failed = true; throw Error('Archive unavailable'); }
      return true;
    });
    const input = { server: { panel_node_id: 51, provider_resource_id: 'vm' } };
    await expect(f.panel.deleteOwnedNode(input)).rejects.toThrow('Archive unavailable');
    expect(f.nodes).toEqual([]);
    await expect(f.panel.deleteOwnedNode(input)).resolves.toBe(true);
    expect(f.store.archivePanelResource.mock.calls.at(-1)[0].kind).toBe('node');
    expect(f.transport.request.mock.calls.filter(([r]) => r.method === 'DELETE' && r.path === '/api/nodes/51')).toHaveLength(1);
  });
  it('does not archive a deletion whose absence cannot be verified', async () => {
    const f = await candidateFixture();
    await f.panel.ensurePrivateCandidate({ resource: f.resource, supportedProtocols: ['vless'], configuration: f.configuration });
    for (const row of f.services) row.user_ids = [];
    const original = f.transport.request.getMockImplementation();
    f.transport.request.mockImplementation(async request => request.method === 'DELETE' ? {status: 204} : original(request));
    await expect(f.panel.deleteOwnedNode({server: {panel_node_id: 51, provider_resource_id: 'vm'}})).rejects.toMatchObject({code: 'PANEL_DELETE_RECONCILIATION_REQUIRED'});
    expect(f.store.archivePanelResource).not.toHaveBeenCalled();
  });
  it.each([false, true])('reconciles its deleted inbound membership but rejects unrelated new membership (%s)', async unexpected => {
    const f = await candidateFixture(['vless'], true);
    await f.panel.ensurePrivateCandidate({resource: f.resource, supportedProtocols: ['vless'], configuration: f.configuration});
    for (const row of f.services) row.user_ids = [];
    let failed = false;
    f.store.archivePanelResource.mockImplementation(async row => {
      if (row.kind === 'service' && !failed) { failed = true; throw Error('Archive unavailable'); }
      return true;
    });
    const input = {server: {panel_node_id: 51, provider_resource_id: 'vm'}};
    await expect(f.panel.deleteOwnedNode(input)).rejects.toThrow('Archive unavailable');
    expect(f.nodes).toHaveLength(1);
    if (unexpected) {
      f.services[0].inbound_ids = [101];
      f.transport.request.mockClear();
      await expect(f.panel.deleteOwnedNode(input)).rejects.toMatchObject({code: 'RETIREMENT_BLOCKED'});
      expect(f.transport.request.mock.calls.every(([r]) => r.method === 'GET')).toBe(true);
    } else {
      await expect(f.panel.deleteOwnedNode(input)).resolves.toBe(true);
      expect(f.nodes).toEqual([]);
    }
  });
  it('archives temporary VLESS service deletion and retries without archiving the global service', async () => {
    const f = await candidateFixture();
    const candidate = await f.panel.ensurePrivateCandidate({resource: f.resource, supportedProtocols: ['vless'], configuration: f.configuration});
    for (const row of f.services) row.user_ids = [];
    await f.panel.appendEndpoint({serviceId: '502', expectedVersion: (await f.panel.readService({serviceId: '502'})).version, endpoint: candidate.endpoint});
    await f.panel.cleanupPrivateVlessServices({candidate});
    await f.panel.cleanupPrivateVlessServices({candidate});
    expect(f.store.archivePanelResource).toHaveBeenCalledTimes(2);
    expect(f.store.archivePanelResource).toHaveBeenLastCalledWith({kind: 'service', id: candidate.privateServices[0].id, expectedBody: candidate.privateServices[0]});
  });
  it.each(['service', 'node', 'inbound', 'host'])('rejects a stale candidate %s incarnation before private cleanup mutates anything', async kind => {
    const f = await candidateFixture();
    const candidate = await f.panel.ensurePrivateCandidate({resource: f.resource, supportedProtocols: ['vless'], configuration: f.configuration});
    for (const row of f.services) row.user_ids = [];
    await f.panel.appendEndpoint({serviceId: '502', expectedVersion: (await f.panel.readService({serviceId: '502'})).version, endpoint: candidate.endpoint});
    const receipt = kind === 'service' ? candidate.privateServices[0] : kind === 'node' ? candidate.node : kind === 'inbound' ? candidate.inbounds[0] : candidate.hosts[0];
    f.records.set(`${kind}:${receipt.id}`, {...receipt, operationId: 'new-incarnation'});
    f.transport.request.mockClear();
    await expect(f.panel.cleanupPrivateVlessServices({candidate})).rejects.toMatchObject({code: 'OWNERSHIP_REGISTRATION_CONFLICT'});
    expect(f.transport.request.mock.calls.every(([r]) => r.method === 'GET')).toBe(true);
    expect(f.store.archivePanelResource).not.toHaveBeenCalled();
  });
  it('registers only a private candidate and reconciles repeated registration without another POST', async () => {
    const f = await candidateFixture();
    const input = { operation: f.operation, resource: f.resource, supportedProtocols: ['vless'], configuration: f.configuration };
    const first = await f.panel.ensurePrivateCandidate(input);
    expect(first.public).toBe(false); expect(first.node.id).toBe('51');
    expect(first.privateServices).toHaveLength(1);
    expect(f.services.find(service => service.id === 502).inbound_ids).toEqual([]);
    expect(f.hosts[0].service_ids).not.toContain(502);
    const posts = f.transport.request.mock.calls.filter(([input]) => input.method === 'POST').length;
    expect((await f.panel.ensurePrivateCandidate(input)).node.id).toBe(first.node.id);
    expect(f.transport.request.mock.calls.filter(([input]) => input.method === 'POST')).toHaveLength(posts);
  });
  it('publishes the verified endpoint by appending membership and preserves its private service', async () => {
    const f = await candidateFixture();
    const candidate = await f.panel.ensurePrivateCandidate({ resource: f.resource, supportedProtocols: ['vless'], configuration: f.configuration });
    const before = await f.panel.readService({ serviceId: '502' });
    await f.panel.withServiceLock({ serviceId: '502' }, () => f.panel.appendEndpoint({ serviceId: '502', expectedVersion: before.version, endpoint: candidate.endpoint }));
    const after = await f.panel.readService({ serviceId: '502' });
    expect(after.endpoints).toEqual([candidate.endpoint]);
    expect(f.hosts[0].service_ids).toContain(502);
    expect(f.hosts[0].service_ids).toContain(Number(candidate.privateServices[0].id));
    expect(f.store.releaseServiceLock).toHaveBeenCalledWith('502');
  });
  it('finalizes publication with only global VLESS and can subsequently remove that global-only endpoint', async () => {
    const f = await candidateFixture();
    const candidate = await f.panel.ensurePrivateCandidate({ resource: f.resource, supportedProtocols: ['vless'], configuration: f.configuration });
    f.services.find(row => String(row.id) === candidate.privateServices[0].id).user_ids = [];
    await f.panel.appendEndpoint({ serviceId: '502', expectedVersion: (await f.panel.readService({ serviceId: '502' })).version, endpoint: candidate.endpoint });
    await f.panel.cleanupPrivateVlessServices({ candidate });
    expect(f.services.map(row => row.id)).toEqual([502]);
    expect(f.hosts[0].service_ids).toEqual([502]);
    await f.panel.cleanupPrivateVlessServices({ candidate });
    await f.panel.replaceEndpoints({ serviceId: '502', expectedVersion: (await f.panel.readService({ serviceId: '502' })).version,
      removeEndpointIds: [candidate.endpoint.id], addEndpoints: [] });
    expect(f.services[0].inbound_ids).toEqual([]);
    expect(f.hosts[0].service_ids).toEqual([502]);
    expect((await f.panel.readService({ serviceId: '502' })).endpoints).toEqual([]);
    expect(await f.panel.deleteOwnedNode({ server: { panel_node_id: 51, provider_resource_id: 'vm' } })).toBe(true);
    expect(f.hosts).toEqual([]);
  });
  it('retains the dedicated SS service and host on a dual-protocol node', async () => {
    const f = await candidateFixture(['vless', 'shadowsocks']);
    const candidate = await f.panel.ensurePrivateCandidate({ resource: f.resource, supportedProtocols: ['vless', 'shadowsocks'], configuration: { ...f.configuration, ssPort: 8388 } });
    for (const service of f.services) service.user_ids = [];
    const ss = candidate.privateServices.find(row => row.protocol === 'shadowsocks');
    const ssBefore = structuredClone(f.services.find(row => row.id === Number(ss.id)));
    const ssHostBefore = structuredClone(f.hosts.find(row => row.inbound_id === 102));
    await f.panel.appendEndpoint({ serviceId: '502', expectedVersion: (await f.panel.readService({ serviceId: '502' })).version, endpoint: candidate.endpoint });
    await f.panel.cleanupPrivateVlessServices({ candidate });
    expect(f.services.map(row => row.id)).toEqual([502, Number(ss.id)]);
    expect(f.services.find(row => row.id === Number(ss.id))).toEqual(ssBefore);
    expect(f.hosts.find(row => row.inbound_id === 102)).toEqual(ssHostBefore);
  });
  it('finalizes readable panel labels and reconciles registration by bound IDs after renaming', async () => {
    const f = await candidateFixture(['vless', 'shadowsocks']);
    const input = { resource: f.resource, supportedProtocols: ['vless', 'shadowsocks'], configuration: { ...f.configuration, ssPort: 8388 } };
    const candidate = await f.panel.ensurePrivateCandidate(input);
    const before = f.hosts.map(row => ({ id: row.id, service_ids: [...row.service_ids], address: row.address, port: row.port }));
    const posts = f.transport.request.mock.calls.filter(([r]) => r.method === 'POST').length;
    await f.panel.finalizeCandidateLabels({ candidate, server: { name: 'Singapore #6', region: 'sgp1', environment: 'development' } });
    expect(f.hosts.map(row => row.remark)).toEqual(['🇸🇬 Singapore #6', '🇸🇬 Singapore #6']);
    expect(f.services.find(row => row.id !== 502 && row.inbound_ids.includes(102)).name).toBe('DEV · SS · Singapore #6');
    expect(f.hosts.map(({ id, service_ids, address, port }) => ({ id, service_ids, address, port }))).toEqual(before);
    expect((await f.panel.ensurePrivateCandidate(input)).node.id).toBe(candidate.node.id);
    expect(f.transport.request.mock.calls.filter(([r]) => r.method === 'POST')).toHaveLength(posts);
  });
  it('recovers a lost rename response without creating another panel resource', async () => {
    const f = await candidateFixture();
    const input = { resource: f.resource, supportedProtocols: ['vless'], configuration: f.configuration };
    const candidate = await f.panel.ensurePrivateCandidate(input);
    const original = f.transport.request.getMockImplementation(); let lost = false;
    f.transport.request.mockImplementation(async request => {
      const result = await original(request);
      if (!lost && request.method === 'PUT' && request.path === '/api/nodes/51') { lost = true; throw Error('Lost rename response'); }
      return result;
    });
    const update = { candidate, server: { name: 'Singapore #6', region: 'sgp1', environment: 'development' } };
    const posts = f.transport.request.mock.calls.filter(([r]) => r.method === 'POST').length;
    await expect(f.panel.finalizeCandidateLabels(update)).rejects.toThrow();
    await f.panel.ensurePrivateCandidate(input);
    await f.panel.finalizeCandidateLabels(update);
    expect(f.hosts[0].remark).toBe('🇸🇬 Singapore #6');
    expect(f.transport.request.mock.calls.filter(([r]) => r.method === 'POST')).toHaveLength(posts);
  });
  it('checks every cosmetic target ownership before the first rename', async () => {
    const f = await candidateFixture();
    const candidate = await f.panel.ensurePrivateCandidate({ resource: f.resource, supportedProtocols: ['vless'], configuration: f.configuration });
    f.records.delete(`host:${candidate.hosts[0].id}`); f.transport.request.mockClear();
    await expect(f.panel.finalizeCandidateLabels({ candidate, server: { name: 'Singapore #6', region: 'sgp1' } })).rejects.toThrow();
    expect(f.transport.request.mock.calls.every(([r]) => r.method === 'GET')).toBe(true);
  });
  async function sharedMembershipFixture() {
    const f=await candidateFixture();
    const candidate=await f.panel.ensurePrivateCandidate({resource:f.resource,supportedProtocols:['vless'],configuration:f.configuration});
    const sharedInbound={id:91,node:{id:99},protocol:'vless',tag:'shared-live'};
    const sharedHost={id:901,inbound_id:91,address:'198.51.100.77',port:443,is_disabled:false,service_ids:[502]};
    const original=f.transport.list.getMockImplementation();
    f.transport.list.mockImplementation(async path=>path==='/api/inbounds'?[...await original(path),sharedInbound]:
      path==='/api/inbounds/91/hosts'?[sharedHost]:original(path));
    f.services.find(row=>row.id===502).inbound_ids=[91];
    const verifySharedInbound=vi.fn(async inbound=>{if(inbound.id!==91)throw new Error('Foreign shared inbound');});
    const panel=createLivePanelAdapter({context:f.context,transport:f.transport,store:f.store,getLease:()=>f.operation,verifySharedInbound});
    return {...f,panel,candidate,sharedHost,verifySharedInbound};
  }
  it('verifies shared global exposure without issuing writes or ownership receipts', async () => {
    const f = await sharedMembershipFixture();
    const writes = f.transport.request.mock.calls.filter(([row]) => row.method !== 'GET').length;
    expect(await f.panel.verifySharedNode({ serviceId: '502', nodeId: 99 })).toBe(true);
    expect(await f.panel.verifySharedNode({ serviceId: 'other', nodeId: 99 })).toBe(false);
    expect(await f.panel.verifySharedNode({ serviceId: '502', nodeId: 999 })).toBe(false);
    expect(f.verifySharedInbound).toHaveBeenCalledWith(expect.objectContaining({ id: 91 }));
    expect(f.transport.request.mock.calls.filter(([row]) => row.method !== 'GET')).toHaveLength(writes);
    expect(f.records.has('node:99')).toBe(false);
  });
  it('publishes and removes a DEV endpoint without changing existing shared endpoints',async()=>{
    const f=await sharedMembershipFixture();
    const originalHost=structuredClone(f.sharedHost);
    const before=await f.panel.readService({serviceId:'502'});
    expect(before.endpoints.map(row=>row.id)).toEqual(['901']);
    await f.panel.appendEndpoint({serviceId:'502',expectedVersion:before.version,endpoint:f.candidate.endpoint});
    const after=await f.panel.readService({serviceId:'502'});
    expect(after.endpoints).toEqual(expect.arrayContaining([...before.endpoints,f.candidate.endpoint]));
    expect(f.services.find(row=>row.id===502).inbound_ids).toEqual([91,101]);
    await f.panel.replaceEndpoints({serviceId:'502',expectedVersion:after.version,removeEndpointIds:[f.candidate.endpoint.id],addEndpoints:[]});
    expect((await f.panel.readService({serviceId:'502'})).endpoints).toEqual(before.endpoints);
    expect(f.sharedHost).toEqual(originalHost);
    expect(f.verifySharedInbound).toHaveBeenCalled();
    expect(f.transport.request.mock.calls.some(([row])=>row.path==='/api/inbounds/hosts/901'&&row.method==='PUT')).toBe(false);
  });
  it('does not grant mutation ownership to an inspectable shared endpoint',async()=>{
    const f=await sharedMembershipFixture();
    const before=await f.panel.readService({serviceId:'502'});
    f.transport.request.mockClear();
    await expect(f.panel.replaceEndpoints({serviceId:'502',expectedVersion:before.version,removeEndpointIds:['901'],addEndpoints:[]})).rejects.toMatchObject({code:'RESOURCE_SCOPE_MISMATCH'});
    expect(f.transport.request.mock.calls.every(([row])=>row.method==='GET')).toBe(true);
  });
  it('removes only the requested global endpoint while retaining its private host and service', async () => {
    const f = await candidateFixture();
    const candidate = await f.panel.ensurePrivateCandidate({ resource: f.resource, supportedProtocols: ['vless'], configuration: f.configuration });
    await f.panel.appendEndpoint({ serviceId: '502', expectedVersion: (await f.panel.readService({ serviceId: '502' })).version, endpoint: candidate.endpoint });
    const before = await f.panel.readService({ serviceId: '502' });
    await f.panel.replaceEndpoints({ serviceId: '502', expectedVersion: before.version, removeEndpointIds: [candidate.endpoint.id], addEndpoints: [] });
    expect((await f.panel.readService({ serviceId: '502' })).endpoints).toEqual([]);
    expect(f.hosts).toHaveLength(1);
    expect(f.hosts[0].service_ids).toEqual([Number(candidate.privateServices[0].id)]);
    expect(f.services.find(row => row.id === 502).inbound_ids).toEqual([]);
  });
  it('reconciles hidden source hosts after the final inbound-membership write loses its response',async()=>{
    const f=await candidateFixture();
    const candidate=await f.panel.ensurePrivateCandidate({resource:f.resource,supportedProtocols:['vless'],configuration:f.configuration});
    await f.panel.appendEndpoint({serviceId:'502',expectedVersion:(await f.panel.readService({serviceId:'502'})).version,endpoint:candidate.endpoint});
    const original=f.transport.request.getMockImplementation();let fail=true;
    f.transport.request.mockImplementation(async input=>{
      if(fail && input.method==='PUT' && input.path==='/api/services/502' && input.body.inbound_ids.length===0){fail=false;throw new Error('timeout');}
      return original(input);
    });
    await expect(f.panel.replaceEndpoints({serviceId:'502',expectedVersion:(await f.panel.readService({serviceId:'502'})).version,removeEndpointIds:[candidate.endpoint.id],addEndpoints:[]})).rejects.toThrow();
    expect((await f.panel.readService({serviceId:'502'})).endpoints).toEqual([]);
    await f.panel.reconcileEndpointReplacement({serviceId:'502'});
    expect(f.services.find(row=>row.id===502).inbound_ids).toEqual([]);
  });
  it('rejects a deleted and recreated account with the same username but a different subscription key',async()=>{
    const f=await infrastructureFixture();f.own('user','fixture',{subscriptionKeyHash:'0'.repeat(64)});
    const transport={request:vi.fn(async()=>({status:200,data:{id:9,username:'fixture',key:'replacement-key',service_ids:[501]}}))};
    const panel=createLivePanelAdapter({context:f.context,transport,getLease:()=>f.operation});
    await expect(panel.readUser({userId:'fixture'})).rejects.toMatchObject({code:'USER_IDENTITY_CHANGED'});
    expect(transport.request.mock.calls.every(([row])=>row.method==='GET')).toBe(true);
  });
  it('blocks node removal while an owned private service still has users', async () => {
    const f = await candidateFixture();
    const candidate = await f.panel.ensurePrivateCandidate({ resource: f.resource, supportedProtocols: ['vless'], configuration: f.configuration });
    f.services.find(service => String(service.id) === candidate.privateServices[0].id).user_ids = [9];
    await expect(f.panel.deleteOwnedNode({ server: { panel_node_id: 51, provider_resource_id: 'vm' } })).rejects.toMatchObject({ code: 'RETIREMENT_BLOCKED' });
    expect(f.transport.request.mock.calls.some(([input]) => input.method === 'DELETE')).toBe(false);
  });
  it('updates only service membership using a fresh complete user payload', async () => {
    const f = await infrastructureFixture();
    f.own('user', 'fixture'); f.own('service', '501'); f.own('service', '503');
    const user = { id: 7, username: 'fixture', key: 'same-key', used_traffic: 123, data_limit: 1000, expire_date: '2099-01-01', expire_strategy: 'fixed_date', data_limit_reset_strategy: 'no_reset', enabled: true, note: 'unchanged', service_ids: [501] };
    const transport = { request: vi.fn(async input => { if (input.method === 'PUT') Object.assign(user, input.body); return { status: 200, data: { ...user } }; }) };
    const panel = createLivePanelAdapter({ context: f.context, transport, getLease: () => f.operation });
    const before = await panel.readUser({ userId: 'fixture' });
    await panel.updateUserServices({ userId: 'fixture', expectedVersion: before.version, expectedServiceIds: [501], serviceIds: [503] });
    const body = transport.request.mock.calls.find(([input]) => input.method === 'PUT')[0].body;
    expect(body).toMatchObject({ username: 'fixture', service_ids: [503], data_limit: 1000, expire_date: '2099-01-01', enabled: true, note: 'unchanged' });
    expect(body).not.toHaveProperty('used_traffic'); expect(body).not.toHaveProperty('key');
    expect(user.used_traffic).toBe(123); expect(user.key).toBe('same-key');
  });
  it('refuses a stale membership version without issuing a PUT', async () => {
    const f = await infrastructureFixture(); f.own('user', 'fixture');
    const transport = { request: vi.fn(async () => ({ status: 200, data: { id: 7, username: 'fixture', service_ids: [501] } })) };
    const panel = createLivePanelAdapter({ context: f.context, transport, getLease: () => f.operation });
    await expect(panel.updateUserServices({ userId: 'fixture', expectedVersion: 'stale', expectedServiceIds: [501], serviceIds: [503] })).rejects.toMatchObject({ code: 'USER_SERVICES_CHANGED' });
    expect(transport.request.mock.calls.every(([input]) => input.method === 'GET')).toBe(true);
  });
});
