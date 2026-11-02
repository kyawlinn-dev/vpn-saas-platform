import { describe, expect, it, vi } from 'vitest';
import { createInfrastructureContext } from '../services/infrastructure/context.js';
import { runOperationStep } from '../services/infrastructure/worker.js';
import { createLiveOperationAdapters } from '../services/infrastructure/liveOperationAdapters.js';
import { createDigitalOceanProvider } from '../services/infrastructure/providers/digitalOcean.js';
import { createVultrProvider } from '../services/infrastructure/providers/vultr.js';

// Only external boundaries are simulated. No lifecycle/ownership/proof module is mocked.
async function lifecycle(provider, kind, retireOnly = false, {expired=false,rollover=false}={}) {
  const config = { executionMode: 'mock', environment: 'development', databaseIdentity: 'db', panelIdentity: 'panel', poolId: 'pool',
    publicServiceId: '502', providerAccounts: { [provider]: 'fixture-account' }, protectedResourceIds: ['shared-node'], protectedAddresses: ['192.0.2.77'] };
  const records = new Map(), attempts = new Map(), states = new Map(), machines = new Map(), servers = new Map();
  const events = [], phases = [];
  const operation = { id: 'op', kind, stage: 'queued', status: 'running', checkpoint: {}, payload: {} };
  let lease = { id: 'op', operationId: 'op', owner: 'worker-1', fence: 1 };
  let visibleNew = false, allowLinks = false;
  const scope = Object.fromEntries(['environment', 'databaseIdentity', 'panelIdentity', 'poolId'].map(key => [key, config[key]]));
  const own = (resourceKind, id, extra = {}) => {
    const row = { ...scope, kind: resourceKind, id, ...extra };
    records.set(`${resourceKind}:${id}`, row); return row;
  };
  const registry = {
    getResource: async ({ kind: resourceKind, id }) => structuredClone(records.get(`${resourceKind}:${id}`)),
    getCreateAttempt: async ({ operationId }) => structuredClone(attempts.get(operationId)),
    claimCreateAttempt: async attempt => {
      if (attempts.has(attempt.operationId)) return false;
      attempts.set(attempt.operationId, structuredClone(attempt)); return true;
    },
    recordCreatedResource: async resource => {
      // Same host-key binding boundary used by liveRuntime's registry wrapper.
      records.set(`provider:${resource.id}`, { ...resource, sshHostKeySha256: states.get('bootstrap').value.fingerprint });
    },
  };
  const context = await createInfrastructureContext({ config, registry, adapters: {
    inspectRuntime: async () => ({ ...config, verified: true }),
    assertOperationLease: async ({ operation: authority }) => authority.id === lease.id && authority.owner === lease.owner && authority.fence === lease.fence,
    assertPurchaseScope: async ({ quote }) => quote.provider === provider,
    assertFirewallPolicy: async () => true,
    assertDrainScope: async ({ source }) => kind !== 'add' && source.id === 'source',
    assertDeletionScope: async ({ resource }) => resource.id === '100' && operation.stage === 'retiring',
  } });
  const createdAt = new Date().toISOString();
  const raw = (id, address, tags = []) => provider === 'digitalocean'
    ? { id: Number(id), created_at: createdAt, status: 'active', region: { slug: 'ams' }, size_slug: 'small', tags, networks: { v4: [{ type: 'public', ip_address: address }] } }
    : { id, date_created: createdAt, status: 'active', power_status: 'running', server_status: 'ok', region: 'ams', plan: 'vc2-1c-0.5gb', tags, main_ip: address };
  const sourceResource = own('provider', '100', { provider, accountId: 'fixture-account', createdAt, addresses: ['198.51.100.10'] });
  machines.set('100', raw('100', sourceResource.addresses[0]));
  const prefix = provider === 'digitalocean' ? '/v2/droplets' : '/v2/instances';
  const transport = { accountId: 'fixture-account', request: async ({ method, path, body }) => {
    events.push({ type: 'provider', method, path, body: structuredClone(body), phase: operation.stage });
    if (method === 'POST' && path === prefix) {
      machines.set('200', raw('200', '198.51.100.20', body.tags));
      throw new Error('response lost after allocation');
    }
    if (method === 'GET' && path === prefix) {
      const rows = [...machines].filter(([id]) => id !== '200' || visibleNew).map(([, row]) => structuredClone(row));
      return { status: 200, data: provider === 'digitalocean' ? { droplets: rows, links: {} } : { instances: rows, meta: { links: {} } } };
    }
    const id = path.slice(prefix.length + 1);
    if (method === 'DELETE') {
      // Independent boundary assertions fail immediately for early/foreign deletion.
      expect(id).toBe('100'); expect(allowLinks).toBe(true);
      expect(key.server_id).toBe('destination'); expect(assignment.server_id).toBe('destination');
      expect(endpoints.some(endpoint => endpoint.nodeId === 51)).toBe(false);
      expect(endpoints).toContainEqual(sharedEndpoint);
      expect(events.some(event => event.type === 'links' && event.verified)).toBe(true);
      machines.delete(id); throw new Error('response lost after deletion');
    }
    if (method === 'GET') return machines.has(id)
      ? { status: 200, data: { [provider === 'digitalocean' ? 'droplet' : 'instance']: structuredClone(machines.get(id)) } }
      : { status: 404 };
    throw new Error(`Unexpected provider request ${method} ${path}`);
  } };
  const catalog = {
    getQuote: async () => ({ available: true, recurringAmount: 6, currency: 'USD', trafficTerms: { included: 1000, unit: 'GB', overageAmount: null, source: 'offline-fixture' } }),
    inspectBillableAttachments: async () => ({ complete: true, items: [] }),
  };
  const factory = provider === 'digitalocean' ? createDigitalOceanProvider : createVultrProvider;
  const makeProvider = () => factory({ context, transport, catalog, machine: { image: 'ubuntu-24-04-x64', osId: 2284, sshKeyIds: ['fixture-key'], firewallId: 'fixture-firewall', firewallTag: 'fixture-management' } });
  const quote = await makeProvider().quote({ region: 'ams', planId: provider === 'digitalocean' ? 'small' : 'vc2-1c-0.5gb' });
  operation.payload = { provider, quote, supported_protocols: ['vless'], ...(kind !== 'add' ? {
    source_server_id: 'source', delete_scope: { approved: true, provider, accountId: 'fixture-account', resourceId: '100', nodeId: 51, createdAt, addresses: sourceResource.addresses },
  } : {}), ...(kind === 'move_retire' ? { destination_server_id: 'destination', ...(retireOnly ? {retire_only:true} : {}) } : {}) };
  const server = (id, resourceId, nodeId, address, active) => {
    const row = own('server', id, { provider, provider_resource_id: resourceId, panel_node_id: nodeId, host_ip:address, addresses: [address], supported_protocols: ['vless'],
      status: active ? 'active' : 'provisioning', is_active: active, lifecycle_protected: false, current_active_keys: 0, max_active_keys: 10, server_health_status: { outline_api_status: 'healthy' } });
    servers.set(id, row); own('node', String(nodeId), { address }); return row;
  };
  server('source', '100', 51, sourceResource.addresses[0], true);
  const publicService = own('service', '502');
  own('host', 'source-host'); own('user', 'customer-user');
  // Shared exposure is deliberately absent from the lifecycle ownership registry.
  const sharedEndpoint = { id: 'shared-host', nodeId: 99, address: '192.0.2.77' };
  let endpoints = [structuredClone(sharedEndpoint), ...(kind === 'add' ? [] : [{ id: 'source-host', nodeId: 51, address: sourceResource.addresses[0] }])];
  let panelRemoved = false, candidate, configurationCheckpoint, migrationState;
  const key = { id: 'key', server_id: 'source', order_id: 'order', customer_id: 'customer', reseller_id: 'reseller', outline_key_id: 'customer-user', protocol: 'vless', status: 'active', access_url: 'fixture-permanent-link', data_limit_bytes: 1000, used_bytes: 123 };
  const expiry=expired?'2020-01-01':rollover?'2026-10-27':'2099-01-01';
  const order = { id: 'order', customer_id: 'customer', reseller_id: 'reseller', status: 'active', expiry_date: expiry, quota_limit_bytes: 1000, usage_baseline_bytes: 20, payment_status: 'paid', review_status: 'confirmed' };
  const customer = { id: 'customer', reseller_id: 'reseller', trial_used_at: '2026-01-01' };
  const assignment = { id: 'assignment', vpn_key_id: 'key', server_id: 'source', is_active: true };
  const user = { id: 'customer-user', username: 'same-username', key: 'fixture-key', subscription_url: 'fixture-subscription', service_ids: [502], used_traffic: 123,
    data_limit: 1000, expire_date: expiry, expire_strategy: 'fixed_date', data_limit_reset_strategy: 'no_reset', enabled: !expired, version: 1 };
  const original = structuredClone({ key, order, customer, user });
  const createCandidate = (resource, configuration) => {
    const node = own('node', '52', { address: resource.addresses[0] });
    const host = own('host', 'destination-host');
    const result = { public: false, resource, node, inbounds: [own('inbound', 'destination-inbound')], hosts: [host], privateServices: [own('service', '503', { protocol: 'vless' })],
      publicService, supportedProtocols: ['vless'], address: resource.addresses[0], coreVersion: '25.5.16', realityPublicKey: configuration.realityPublicKey,
      shortId: configuration.shortId, vlessPort: 443, ssPort: null, endpoint: { id: host.id, nodeId: 52, address: resource.addresses[0] } };
    candidate = result; return result;
  };
  if (kind === 'move_retire') {
    const resource = own('provider', '300', { provider, accountId: 'fixture-account', createdAt, addresses: ['198.51.100.30'] });
    machines.set('300', raw('300', resource.addresses[0]));
    server('destination', '300', 52, resource.addresses[0], true);
    createCandidate(resource, { realityPublicKey: 'fixture-public', shortId: '1234567890abcdef' });
    endpoints.push(candidate.endpoint);
  }
  const store = {
    readState: async name => structuredClone(states.get(name) || { value: null, version: null }),
    saveState: async (name, value, expectedVersion) => {
      expect(states.get(name)?.version ?? null).toBe(expectedVersion);
      states.set(name, { value: structuredClone(value), version: (expectedVersion || 0) + 1 });
    },
  };
  let items = [];
  const repository = {
    readOperation: async () => structuredClone(operation), renewLease: async () => true,
    checkpoint: async ({ stage, status, checkpoint }) => { phases.push(stage); Object.assign(operation, { stage, status, checkpoint: structuredClone(checkpoint) }); },
    releaseOperation: async ({ status }) => { operation.status = status; },
    getServer: async ({ serverId }) => structuredClone(servers.get(serverId)),
    ensureCandidate: async ({ server: row }) => server('destination', row.provider_resource_id, row.panel_node_id, row.host_ip, false),
    assignCandidateDisplay: async ({ serverId, location }) => ({ ...servers.get(serverId), name: `${location.city} #1`, display_city: location.city }),
    publishCandidate: async () => { Object.assign(servers.get('destination'), { status: 'active', is_active: true }); events.push({ type: 'published' }); },
    listInventoryPage: async ({ kind: inventoryKind }) => ({ complete: true, items: structuredClone({
      keys: kind === 'add' ? [] : [key], orders: [order], customers: [customer], assignments: kind === 'add' ? [] : [assignment], serverAliases: [], destinationKeys: [],
    }[inventoryKind]) }),
    stageMigrationItems: async ({ inventory }) => { items = structuredClone(inventory.movable); },
    drainSource: async () => { servers.get('source').is_active = false; events.push({ type: 'drained' }); },
    nextMigrationItem: async () => migrationState?.phase === 'verified' ? null : structuredClone(items[0] || null),
    readMigrationState: async () => structuredClone(migrationState),
    saveMigrationState: async ({ checkpoint }) => { migrationState = structuredClone(checkpoint); },
    readScopedAccess: async () => structuredClone({ key, order }),
    moveKeyAnchor: async ({ patch, expectedKey }) => { expect(key).toEqual(expectedKey); Object.assign(key, patch); events.push({ type: 'anchored' }); },
    repairAssignments: async ({ destinationId }) => { assignment.server_id = destinationId; },
    verifyAssignments: async ({ destinationId }) => assignment.server_id === destinationId,
    retireServer: async () => { Object.assign(servers.get('source'), { status: 'decommissioned', is_active: false }); },
  };
  const panel = {
    finalizeCandidateLabels: async () => { events.push({ type: 'display-labels' }); },
    cleanupPrivateVlessServices: async () => { events.push({ type: 'private-vless-cleanup' }); },
    ensurePrivateCandidate: async ({ resource, configuration, operation: authority }) => ({ ...createCandidate(resource, configuration), operation: authority }),
    withServiceLock: async (_input, action) => action(),
    readService: async () => ({ endpoints: structuredClone(endpoints), version: JSON.stringify(endpoints) }),
    appendEndpoint: async ({ endpoint, expectedVersion }) => {
      expect(JSON.stringify(endpoints)).toBe(expectedVersion); endpoints.push(structuredClone(endpoint));
    },
    readDestinationEndpoint: async () => structuredClone(candidate.endpoint),
    replaceEndpoints: async ({ removeEndpointIds, addEndpoints, expectedVersion }) => {
      expect(JSON.stringify(endpoints)).toBe(expectedVersion);
      endpoints = [...endpoints.filter(endpoint => !removeEndpointIds.includes(endpoint.id)), ...structuredClone(addEndpoints)];
      events.push({ type: 'endpoints' });
    },
    listInventoryPage: async ({ kind: inventoryKind }) => ({ complete: true, items: inventoryKind === 'services'
      ? [{ id: '502', node_ids: endpoints.map(endpoint => endpoint.nodeId) }]
      : inventoryKind === 'users' ? (kind === 'add' ? [] : [structuredClone(user)]) : endpoints.filter(endpoint => endpoint.nodeId === 51).map(endpoint => ({ ...endpoint, node_id: 51 })) }),
    verifySharedNode: async ({ nodeId }) => nodeId === 99 && endpoints.some(endpoint => endpoint.nodeId === 99 && endpoint.address === sharedEndpoint.address),
    readUser: async () => structuredClone(user),
    updateUserServices: async () => { throw new Error('VLESS pool migration must preserve user membership'); },
    deleteOwnedNode: async () => {
      expect(key.server_id).toBe('destination'); expect(allowLinks).toBe(true);
      panelRemoved = true; events.push({ type: 'panel-delete' }); return true;
    },
  };
  const probes = {
    create: async ({ candidate: target, operation: authority }) => ({ resourceId: target.resource.id, operationId: authority.id }),
    health: async ({ candidate: target }) => ({ connected: true, coreVersion: target.coreVersion }),
    subscription: async ({ candidate: target }) => [`vless://00000000-0000-4000-8000-000000000000@${target.address}:443?security=reality&pbk=${target.realityPublicKey}&sid=${target.shortId}&type=tcp`],
    tunnel: async ({ candidate: target, protocol }) => {
      events.push({ type: 'tunnel', fence: lease.fence });
      return { connected: true, protocol, resourceId: target.resource.id, egressAddress: target.address };
    }, cleanup: async () => true,
  };
  const makeAdapters = () => createLiveOperationAdapters({ context, store, repository, panel, probes, providers: { [provider]: makeProvider() },
    panelTransport: { request: async () => panelRemoved ? { status: 404 } : { status: 200, data: { address: sourceResource.addresses[0] } } },
    readExistingCandidate: async (_server, authority) => ({ ...structuredClone(candidate), operation: authority, serverId: 'destination' }),
    readExistingDestination: async ({server:target}) => {
      events.push({type:'destination-services'});
      return {server:target,node:{id:target.panel_node_id,address:target.host_ip,status:'healthy'}};
    },
    checkPermanentLinks: async () => {
      const verified = allowLinks && key.server_id === 'destination' && assignment.server_id === 'destination' && endpoints.some(endpoint => endpoint.nodeId === 52) && !endpoints.some(endpoint => endpoint.nodeId === 51);
      events.push({ type: 'links', verified }); return { verified };
    },
    createNodeAdapter: () => ({ policy: { managementSources: ['192.0.2.2'], realityServerName: 'example.com' }, secretStorageEncrypted: true,
      readConfigurationCheckpoint: async () => structuredClone(configurationCheckpoint),
      saveConfigurationCheckpoint: async value => { configurationCheckpoint = structuredClone(value); },
      installBundle: async () => ({ hostKeyVerified: true, imageDigestsVerified: true, syntaxValid: true, firewallVerified: true, managementTlsVerified: true }), close: async () => {},
    }),
  });
  let adapters = makeAdapters();
  return { operation, events, phases, original, key, order, customer, user, assignment, records, machines, sharedEndpoint,
    endpoints: () => structuredClone(endpoints), states,
    step: () => runOperationStep({ context, lease, adapters, repository }),
    restart: () => { lease = { ...lease, owner: 'worker-2', fence: lease.fence + 1 }; adapters = makeAdapters(); visibleNew = true; },
    allowLinks: () => { allowLinks = true; },
  };
}

describe.each(['digitalocean', 'vultr'])('%s worker lifecycle integration in a mixed shared pool', provider => {
  it.each(['already expired','expires during migration'])('finishes VLESS-only replacement when access is %s without renewal', async timing => {
    const rollover=timing==='expires during migration';
    if(rollover){vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-27T16:59:59Z'));}
    try {
      const f=await lifecycle(provider,'replace',false,{expired:!rollover,rollover});
      await f.step();await f.step();f.restart();f.allowLinks();
      let crossed=false;
      for(let n=0;n<35&&!['completed','blocked'].includes(f.operation.status);n++){
        if(rollover && f.operation.stage==='migrating' && !crossed){vi.setSystemTime(new Date('2026-10-27T17:00:01Z'));crossed=true;}
        await f.step();
      }
      expect(f.operation.status,JSON.stringify(f.operation.checkpoint)).toBe('completed');
      if(rollover)expect(crossed).toBe(true);
      expect(f.user).toEqual(f.original.user);
      expect(f.order).toEqual(f.original.order);
      expect({...f.key,server_id:f.original.key.server_id}).toEqual(f.original.key);
      expect(f.key.server_id).toBe('destination');
      expect(f.assignment.server_id).toBe('destination');
      expect(f.machines.has('100')).toBe(false);
      expect(f.events.filter(row=>row.type==='provider'&&row.method==='DELETE')).toHaveLength(1);
      expect(f.endpoints()).toContainEqual(f.sharedEndpoint);
    }finally {if(rollover)vi.useRealTimers();}
  });
  it.each(['add', 'replace', 'move_retire', 'retire_only'])('finishes %s with reconciled mutations and preserved shared access', async action => {
    const kind = action === 'retire_only' ? 'move_retire' : action;
    const f = await lifecycle(provider, kind, action === 'retire_only');
    if (kind !== 'move_retire') {
      await f.step(); await f.step();
      expect(f.operation.stage).toBe('provisioning');
      expect(f.operation.checkpoint.error_code).toBe('CREATE_RECONCILIATION_REQUIRED');
      expect(f.events.filter(event => event.type === 'provider' && event.method === 'POST')).toHaveLength(1);
      f.restart();
    }
    for (let n = 0; n < 24 && !['completed', 'blocked'].includes(f.operation.status) && f.operation.stage !== 'links'; n++) await f.step();
    if (kind !== 'add') {
      expect(f.operation.stage).toBe('links');
      await f.step(); // Missing permanent-link evidence must stop actual retirement.
      expect(f.operation.stage).toBe('links');
      expect(f.operation.checkpoint.error_code).toBe('PERMANENT_LINK_VERIFICATION_FAILED');
      expect(f.events.some(event => event.type === 'panel-delete' || event.method === 'DELETE')).toBe(false);
      expect(f.machines.has('100')).toBe(true);
      expect(f.key.server_id).toBe('destination');
      f.restart(); f.allowLinks();
      for (let n = 0; n < 8 && !['completed', 'blocked'].includes(f.operation.status); n++) await f.step();
    }
    expect(f.operation.status, JSON.stringify(f.operation.checkpoint)).toBe('completed');
    expect(f.endpoints()).toContainEqual(f.sharedEndpoint);
    expect(f.records.has('node:99')).toBe(false);
    expect(f.records.has('host:shared-host')).toBe(false);
    expect(f.events.filter(event => event.type === 'provider' && event.method === 'POST')).toHaveLength(kind === 'move_retire' ? 0 : 1);
    expect(f.events.filter(event => event.type === 'provider' && event.method === 'DELETE')).toHaveLength(kind === 'add' ? 0 : 1);
    if(kind==='move_retire')expect(f.events.filter(event=>event.type==='tunnel')).toHaveLength(0);
    else expect(f.events.some(event=>event.type==='tunnel')).toBe(true);
    expect(f.user).toEqual(f.original.user); expect(f.order).toEqual(f.original.order); expect(f.customer).toEqual(f.original.customer);
    expect({ ...f.key, server_id: f.original.key.server_id }).toEqual(f.original.key);
    expect(f.phases).toContain('verifying');
    if (kind !== 'add') {
      expect(f.phases).toEqual(expect.arrayContaining(['inventory', 'draining', 'migrating', 'endpoints', 'links', 'retiring', 'finalizing']));
      expect(f.machines.has('100')).toBe(false);
      expect(f.events.findIndex(event => event.type === 'links' && event.verified)).toBeLessThan(f.events.findIndex(event => event.type === 'panel-delete'));
    }
    const mutations = f.events.filter(event => event.method === 'POST' || event.method === 'DELETE').length;
    await f.step();
    expect(f.events.filter(event => event.method === 'POST' || event.method === 'DELETE')).toHaveLength(mutations);
  });
});
