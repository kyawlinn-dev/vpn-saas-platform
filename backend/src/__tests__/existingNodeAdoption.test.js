import { describe, it, expect, vi } from 'vitest';
import { createExistingNodeAdoption } from '../services/infrastructure/existingNodeAdoption.js';
import { runAdoptionCli } from '../../scripts/adopt-public-server-access.mjs';
import { createHash } from 'node:crypto';

const id = '11111111-1111-4111-8111-111111111111';
const poolId = '22222222-2222-4222-8222-222222222222';
function fixture() {
  const scope = { environment: 'development', databaseIdentity: 'dev.supabase.co', panelIdentity: 'https://panel.example', poolId };
  const env = { SERVER_ACCESS_ENVIRONMENT: scope.environment, SERVER_ACCESS_DATABASE_IDENTITY: scope.databaseIdentity,
    SERVER_ACCESS_PANEL_IDENTITY: scope.panelIdentity, SERVER_ACCESS_POOL_ID: poolId, SUPABASE_URL: 'https://dev.supabase.co',
    MARZNESHIN_PANEL_URL: scope.panelIdentity, MARZNESHIN_PANEL_USERNAME: 'fixture', MARZNESHIN_PANEL_PASSWORD: 'secret-panel', DIGITALOCEAN_TOKEN: 'secret-provider' };
  const binding = { environment: scope.environment, access_pool_id: poolId, database_identity: scope.databaseIdentity,
    panel_identity: scope.panelIdentity, provider_accounts: { digitalocean: 'account' } };
  const pool = { id: poolId, environment: scope.environment, panel_identity: scope.panelIdentity, vless_service_id: 502 };
  const server = { id, host_ip: '198.51.100.5', provider: 'digitalocean', droplet_id: 55, panel_type: 'marzneshin',
    panel_url: scope.panelIdentity, panel_node_id: null, environment: null, access_pool_id: null,
    provider_resource_id: null, supported_protocols: null, marzneshin_service_ids: [], marzneshin_vless_service_ids: [502], lifecycle_protected: true };
  const snapshot = { server, serverToken: 'original', resources: [], busy: false };
  const manifest = { serverId: id, provider: 'digitalocean', resourceId: '55', nodeId: 5, mode: 'access' };
  const bodies = { '/v2/account': { account: { uuid: 'account', email: 'private@example.com' } },
    '/v2/droplets/55': { droplet: { id: 55, created_at: '2026-01-01T00:00:00Z', status: 'active', region: { slug: 'sgp1' }, size_slug: 'small', networks: { v4: [{ type: 'public', ip_address: server.host_ip }] } } },
    '/api/admins/token': { access_token: 'secret-token' }, '/api/nodes/5': { id: 5, address: server.host_ip },
    '/api/inbounds': [{ id: 8, node: { id: 5 }, protocol: 'vless', tag: 'vless', secret: 'never-print' }],
    '/api/inbounds/8/hosts': [{ id: 80, address: server.host_ip, port: 443, is_disabled: false }],
    '/api/services': [{ id: 502, inbound_ids: [8] }, { id: 503, inbound_ids: [8] }], '/api/users': [] };
  const fetchImpl = vi.fn(async (url, options) => {
    const path = new URL(url).pathname;
    if (options.method !== 'GET' && path !== '/api/admins/token') throw Error('MUTATION');
    if (!bodies[path]) throw Error(`Unexpected ${path}`);
    return new Response(JSON.stringify(bodies[path]), { status: 200 });
  });
  const client = { from: table => { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: table === 'server_access_pools' ? pool : binding }) }; return q; },
    rpc: vi.fn(async name => ({ data: name === 'inspect_existing_node_adoption' ? snapshot : name === 'read_existing_node_adoption_approval' ? null : { adopted: true } })) };
  const operatorConfig = { providers: { digitalocean: { accountId: 'account' } }, protectedAddresses: [], protectedResourceIds: [] };
  const verifySsh = vi.fn(async () => true);
  return { scope, env, binding, pool, server, snapshot, manifest, bodies, fetchImpl, client, operatorConfig, verifySsh,
    input: { env, client, operatorConfig, fetchImpl, verifySsh } };
}

describe('existing node adoption', () => {
  it.each([false, true])('resolves an inherited host port from inbound config (JSON string=%s) without changing the host', async stringConfig => {
    const f = fixture(); f.bodies['/api/inbounds/8/hosts'][0].port = null;
    f.bodies['/api/inbounds'][0].config = stringConfig ? JSON.stringify({ port: 443 }) : { port: 443 };
    const service = await createExistingNodeAdoption(f.input), report = await service.inspect(f.manifest);
    expect(report.preview.hosts[0].port).toBe(443);
    expect(f.bodies['/api/inbounds/8/hosts'][0].port).toBeNull();
    f.bodies['/api/inbounds'][0].config = { port: 444 };
    await expect(service.apply(f.manifest, report.hash)).rejects.toMatchObject({ code: 'ADOPTION_PREVIEW_CHANGED' });
  });
  it.each([{}, { port: 0 }, { port: 65536 }, 'invalid json'])('rejects invalid inherited host ports: %s', async config => {
    const f = fixture(); f.bodies['/api/inbounds/8/hosts'][0].port = null;
    f.bodies['/api/inbounds'][0].config = config;
    await expect((await createExistingNodeAdoption(f.input)).inspect(f.manifest)).rejects.toMatchObject({ code: 'ADOPTION_HOSTS_UNVERIFIED' });
  });
  function lightnodeFixture() {
    const f = fixture(), token = 'fixture-lightnode-token', accountId = '99999999-9999-4999-8999-999999999999';
    f.env.LIGHTNODE_API_KEY = token;
    const instance = { ecsResourceUUID: 'ecs-anchor', regionCode: 'jp-tokyo-1', zoneCode: 'jp-tokyo-1-a',
      createTime: '2026-01-01 12:00:00', publicIpAddress: f.server.host_ip, ecsStatus: 'STARTED', ecsPendingStatus: 'NONE' };
    f.bodies['/instance/detail'] = { success: true, instance };
    f.binding.provider_accounts.lightnode = accountId;
    f.operatorConfig.providers.lightnode = { accountId, connection: { id: accountId,
      credentialSha256: createHash('sha256').update(token).digest('hex'), firstContactPolicy: 'tofu',
      attestedAt: '2026-11-02T00:00:00Z', anchor: { resourceId: instance.ecsResourceUUID,
        region: instance.regionCode, zone: instance.zoneCode, createdAt: instance.createTime, address: instance.publicIpAddress } } };
    Object.assign(f.server, { provider: 'lightnode', droplet_id: null });
    Object.assign(f.manifest, { provider: 'lightnode', resourceId: instance.ecsResourceUUID });
    return f;
  }
  it('inspects and hash-applies a protected LightNode node without lifecycle authority or provider writes', async () => {
    const f = lightnodeFixture(), service = await createExistingNodeAdoption(f.input);
    const report = await service.inspect(f.manifest);
    expect(report.ready).toBe(true);
    expect(report.preview.provider).toMatchObject({ provider: 'lightnode', id: 'ecs-anchor', region: 'jp-tokyo-1' });
    expect(report.preview.receipts).toHaveLength(1);
    expect(report.preview.receipts[0]).toMatchObject({ kind: 'server', protected: true, provider_resource_id: null });
    expect(JSON.stringify(report)).not.toMatch(/fixture-lightnode-token|credentialSha256|secret-|never-print/);
    await service.apply(f.manifest, report.hash);
    expect(f.client.rpc.mock.calls.filter(([name]) => name === 'adopt_existing_node')).toHaveLength(1);
    expect(f.verifySsh).not.toHaveBeenCalled();
  });
  it.each(['lifecycle', 'stopped', 'pending', 'anchor', 'binding'])('rejects unsafe LightNode adoption: %s', async kind => {
    const f = lightnodeFixture();
    if (kind === 'lifecycle') f.manifest.mode = 'lifecycle';
    if (kind === 'stopped') f.bodies['/instance/detail'].instance.ecsStatus = 'STOPPED';
    if (kind === 'pending') f.bodies['/instance/detail'].instance.ecsPendingStatus = 'RESIZING';
    if (kind === 'anchor') f.bodies['/instance/detail'].instance.publicIpAddress = '198.51.100.99';
    if (kind === 'binding') f.binding.provider_accounts.lightnode = 'foreign';
    await expect((async () => (await createExistingNodeAdoption(f.input)).inspect(f.manifest))()).rejects.toThrow();
    expect(f.client.rpc.mock.calls.some(([name]) => name === 'adopt_existing_node')).toBe(false);
  });
  it('invalidates LightNode approval when its zone changes after inspection', async () => {
    const f = lightnodeFixture(), service = await createExistingNodeAdoption(f.input);
    const report = await service.inspect(f.manifest);
    f.bodies['/instance/detail'].instance.zoneCode = 'jp-tokyo-1-b';
    await expect(service.apply(f.manifest, report.hash)).rejects.toMatchObject({ code: 'ADOPTION_PREVIEW_CHANGED' });
  });
  it('selects the existing production SS service while preserving a shared DEV SS service', async () => {
    const f = fixture(); f.server.marzneshin_service_ids = [504];
    f.bodies['/api/inbounds'].push({ id: 9, node: { id: 5 }, protocol: 'shadowsocks' });
    f.bodies['/api/inbounds/9/hosts'] = [{ id: 90, address: f.server.host_ip, port: 8388, is_disabled: false }];
    f.bodies['/api/services'].push({ id: 504, inbound_ids: [9] }, { id: 505, inbound_ids: [9] });
    const report = await (await createExistingNodeAdoption(f.input)).inspect(f.manifest);
    expect(report.preview.ssServiceIds).toEqual([504]);
    expect(report.preview.services.map(x => x.id)).not.toContain(505);
    expect(f.bodies['/api/services'].find(x => x.id === 505)).toEqual({ id: 505, inbound_ids: [9] });
  });
  it('inspects authenticated actual inventory and emits a safe deterministic protected preview', async () => {
    const f = fixture(), service = await createExistingNodeAdoption(f.input);
    const a = await service.inspect(f.manifest), b = await service.inspect(f.manifest);
    expect(a.hash).toBe(b.hash);
    expect(a.preview.lifecycle).toBe(false);
    expect(a.preview.provider).toMatchObject({ id: '55', createdAt: '2026-01-01T00:00:00Z', accountId: 'account', addresses: ['198.51.100.5'] });
    expect(a.preview.receipts.map(r => r.kind)).toEqual(['server']);
    expect(a.preview.receipts[0]).toMatchObject({ protected: true, provider_resource_id: null, method: 'owner_authorized_access_adoption' });
    expect(JSON.stringify(a)).not.toMatch(/secret-|never-print|private@example/);
    expect(f.verifySsh).not.toHaveBeenCalled();
    expect(f.client.rpc.mock.calls.every(([name]) => name === 'inspect_existing_node_adoption')).toBe(true);
  });
  it('requires the approval hash and re-inspects before the single atomic write', async () => {
    const f = fixture(), service = await createExistingNodeAdoption(f.input);
    const report = await service.inspect(f.manifest);
    await expect(service.apply(f.manifest, '')).rejects.toMatchObject({ code: 'ADOPTION_APPROVAL_REQUIRED' });
    f.bodies['/api/inbounds/8/hosts'][0].port = 444;
    await expect(service.apply(f.manifest, report.hash)).rejects.toMatchObject({ code: 'ADOPTION_PREVIEW_CHANGED' });
    const fresh = await service.inspect(f.manifest);
    await service.apply(f.manifest, fresh.hash);
    expect(f.client.rpc.mock.calls.filter(([n]) => n === 'adopt_existing_node').length).toBe(1);
  });
  it.each(['provider', 'node', 'service', 'database', 'binding', 'busy', 'foreign', 'panel'])('rejects mismatched %s evidence', async kind => {
    const f = fixture();
    if (kind === 'provider') f.bodies['/v2/droplets/55'].droplet.id = 99;
    if (kind === 'node') f.bodies['/api/nodes/5'].address = '198.51.100.99';
    if (kind === 'service') f.bodies['/api/services'][0].inbound_ids = [];
    if (kind === 'database') f.env.SUPABASE_URL = 'https://other.supabase.co';
    if (kind === 'binding') f.binding.provider_accounts.digitalocean = 'other';
    if (kind === 'busy') f.snapshot.busy = true;
    if (kind === 'foreign') f.server.environment = 'production';
    if (kind === 'panel') f.server.panel_url = 'https://other.example';
    await expect((async () => (await createExistingNodeAdoption(f.input)).inspect(f.manifest))()).rejects.toThrow();
    expect(f.client.rpc.mock.calls.some(([n]) => n === 'adopt_existing_node')).toBe(false);
  });
  it('cannot turn shared DEV nodes into lifecycle ownership through a manifest', async () => {
    const f = fixture(); f.manifest.mode = 'lifecycle'; f.manifest.environment = 'production';
    await expect((await createExistingNodeAdoption(f.input)).inspect(f.manifest)).rejects.toThrow();
    expect(f.verifySsh).not.toHaveBeenCalled();
  });
  it('requires explicit matching backend lifecycle scope plus independent pinned SSH verification', async () => {
    const f = fixture(); f.manifest.mode = 'lifecycle';
    const service = await createExistingNodeAdoption(f.input);
    await expect(service.inspect(f.manifest)).rejects.toMatchObject({ code: 'ADOPTION_LIFECYCLE_SCOPE_REQUIRED' });
    f.operatorConfig.existingNodeAdoption = { lifecycleScopes: [{ ...f.scope, serverId: id, provider: 'digitalocean', resourceId: '55', nodeId: 5, sshHostKeySha256: `SHA256:${'a'.repeat(43)}` }] };
    const ready = await createExistingNodeAdoption(f.input);
    f.verifySsh.mockResolvedValueOnce(false);
    await expect(ready.inspect(f.manifest)).rejects.toMatchObject({ code: 'ADOPTION_SSH_UNVERIFIED' });
    const report = await ready.inspect(f.manifest);
    expect(report.preview.receipts.map(r => r.kind)).toEqual(['server', 'provider', 'node', 'inbound', 'host', 'service']);
    expect(report.preview.receipts.every(r => r.protected === false)).toBe(true);
    expect(report.preview.receipts.find(r => r.kind === 'inbound')).toMatchObject({ panel_node_id: 5, protocol: 'vless' });
    expect(report.preview.receipts.find(r => r.kind === 'host')).toMatchObject({ node_id: 5, inbound_id: 8, address: f.server.host_ip });
    expect(report.preview.receipts.find(r => r.kind === 'service')).toMatchObject({ node_ids: [5], inbound_ids: [8], protocol: 'vless' });
    expect(f.verifySsh).toHaveBeenCalledWith(expect.objectContaining({ host: f.server.host_ip, expectedHostKey: `SHA256:${'a'.repeat(43)}` }));
  });
  it('adopts a global-only VLESS node without requiring a private VLESS service', async () => {
    const f = fixture(); f.manifest.mode = 'lifecycle';
    f.bodies['/api/services'] = [{ id: 502, inbound_ids: [8] }];
    f.bodies['/api/inbounds/8/hosts'][0].service_ids = [502];
    f.operatorConfig.existingNodeAdoption = { lifecycleScopes: [{ ...f.scope, serverId: id, provider: 'digitalocean', resourceId: '55', nodeId: 5, sshHostKeySha256: `SHA256:${'a'.repeat(43)}` }] };
    const report = await (await createExistingNodeAdoption(f.input)).inspect(f.manifest);
    expect(report.ready).toBe(true);
    expect(report.preview.receipts.some(row => row.kind === 'service')).toBe(false);
    expect(report.preview.services.map(row => row.id)).toEqual([502]);
  });
  it('supports registration of a missing SG5 row without a provider purchase', async () => {
    const f = fixture(); f.snapshot.server = null; f.snapshot.serverToken = null;
    f.manifest.registration = { name: 'Singapore #5', region: 'sgp1', maxActiveKeys: 100, serverTier: 'premium' };
    const report = await (await createExistingNodeAdoption(f.input)).inspect(f.manifest);
    expect(report.preview.registration.name).toBe('Singapore #5');
    expect(f.fetchImpl.mock.calls.every(([url, o]) => o.method === 'GET' || new URL(url).pathname === '/api/admins/token')).toBe(true);
  });
  it('blocks lifecycle readiness for existing users without verified pool receipts', async () => {
    const f = fixture(); f.manifest.mode = 'lifecycle';
    f.operatorConfig.existingNodeAdoption = { lifecycleScopes: [{ ...f.scope, serverId: id, provider: 'digitalocean', resourceId: '55', nodeId: 5, sshHostKeySha256: `SHA256:${'a'.repeat(43)}` }] };
    f.bodies['/api/users'] = [{ id: 123, username: 'legacy', key: 'private-subscription', service_ids: [502] }];
    const service = await createExistingNodeAdoption(f.input);
    await expect(service.inspect(f.manifest)).rejects.toMatchObject({ code: 'ADOPTION_CUSTOMER_OWNERSHIP_REQUIRED' });
    expect(f.verifySsh).not.toHaveBeenCalled();
    const { payloadHash } = await import('../services/infrastructure/repository.js');
    const previous = f.client.rpc.getMockImplementation();
    f.client.rpc.mockImplementation(async (name, args) => name === 'read_server_infrastructure_resource' ? { data: {
      ...f.scope, id: 'legacy', kind: 'user', protected: false, subscriptionKeyHash: payloadHash('private-subscription'),
    } } : previous(name, args));
    await expect(service.inspect(f.manifest)).resolves.toMatchObject({ ready: true });
    f.bodies['/api/users'][0].key = 'changed-key';
    await expect(service.inspect(f.manifest)).rejects.toMatchObject({ code: 'ADOPTION_CUSTOMER_OWNERSHIP_REQUIRED' });
  });
  it('resumes an approved DB registration after response loss only with fresh matching external evidence', async () => {
    const f = fixture(), service = await createExistingNodeAdoption(f.input);
    const report = await service.inspect(f.manifest);
    f.snapshot.serverToken = 'after-commit';
    const rpc = f.client.rpc.getMockImplementation();
    f.client.rpc.mockImplementation(async (name, args) => name === 'read_existing_node_adoption_approval'
      ? { data: { document: report.preview } } : rpc(name, args));
    expect(await service.apply(f.manifest, report.hash)).toEqual({ adopted: true });
    f.bodies['/api/inbounds/8/hosts'][0].port = 999;
    await expect(service.apply(f.manifest, report.hash)).rejects.toMatchObject({ code: 'ADOPTION_PREVIEW_CHANGED' });
  });
  it('keeps default CLI inspection offline and rejects apply without live plus approval', async () => {
    const createService = vi.fn(), createClient = vi.fn(), output = vi.fn(), errorOutput = vi.fn();
    const options = { read: async () => JSON.stringify({ environment: 'development', databaseIdentity: 'fixture', poolId: 'pool', panelIdentity: 'panel', vlessServiceId: 1, servers: [] }),
      createService, createClient, output, errorOutput };
    expect(await runAdoptionCli(['--manifest', 'fixture'], options)).toBe(2);
    expect(await runAdoptionCli(['--manifest', 'fixture', '--apply'], options)).toBe(1);
    expect(await runAdoptionCli(['--manifest', 'fixture', '--live', '--apply'], options)).toBe(1);
    expect(createService).not.toHaveBeenCalled(); expect(createClient).not.toHaveBeenCalled();
  });
  it('uses the same authenticated boundary for Vultr without leaking account email', async () => {
    const f = fixture();
    const { providerAccountIdentity } = await import('../services/infrastructure/providers/liveTransport.js');
    const accountId = providerAccountIdentity('vultr', { email: 'private@example.com' });
    f.operatorConfig.providers = { vultr: { accountId } }; f.env.VULTR_API_KEY = 'secret-vultr';
    f.binding.provider_accounts = { vultr: accountId }; f.manifest.provider = 'vultr'; f.manifest.resourceId = 'vm-55';
    f.server.provider = 'vultr'; f.server.droplet_id = null;
    f.bodies['/v2/account'] = { account: { email: 'private@example.com' } };
    f.bodies['/v2/instances/vm-55'] = { instance: { id: 'vm-55', date_created: '2026-01-01T00:00:00Z', region: 'sgp', plan: 'small',
      status: 'active', power_status: 'running', server_status: 'ok', main_ip: f.server.host_ip } };
    const report = await (await createExistingNodeAdoption(f.input)).inspect(f.manifest);
    expect(report.preview.provider).toMatchObject({ id: 'vm-55', provider: 'vultr', accountId });
    expect(JSON.stringify(report)).not.toMatch(/private@example|secret-vultr/);
  });
  it('rejects an authenticated provider account other than the configured exact account', async () => {
    const f = fixture(); f.bodies['/v2/account'].account.uuid = 'other';
    await expect(createExistingNodeAdoption(f.input)).rejects.toMatchObject({ code: 'PROVIDER_ACCOUNT_MISMATCH' });
  });
  it.each(['protected', 'shared-service'])('does not grant lifecycle access to %s resources', async kind => {
    const f = fixture(); f.manifest.mode = 'lifecycle';
    f.operatorConfig.existingNodeAdoption = { lifecycleScopes: [{ ...f.scope, serverId: id, provider: 'digitalocean', resourceId: '55', nodeId: 5, sshHostKeySha256: `SHA256:${'a'.repeat(43)}` }] };
    if (kind === 'protected') f.operatorConfig.protectedResourceIds.push('8');
    else f.bodies['/api/services'].push({ id: 900, inbound_ids: [8, 99] });
    await expect((await createExistingNodeAdoption(f.input)).inspect(f.manifest)).rejects.toThrow();
    expect(f.verifySsh).not.toHaveBeenCalled();
  });
  it('routes explicit live inspection and hash-approved apply through backend-configured clients only', async () => {
    const f = fixture(), inspect = vi.fn(async () => ({ ready: true })), apply = vi.fn(async () => ({ adopted: true }));
    const createService = vi.fn(async () => ({ inspect, apply })), createClient = vi.fn(() => f.client);
    const env = { ...f.env, SERVER_INFRASTRUCTURE_CONFIG_PATH: 'config', SUPABASE_SERVICE_ROLE_KEY: 'fixture' };
    const options = { env, read: async path => JSON.stringify(path === 'config' ? f.operatorConfig : f.manifest),
      output: vi.fn(), errorOutput: vi.fn(), createService, createClient };
    expect(await runAdoptionCli(['--manifest', 'manifest', '--live'], options)).toBe(0);
    expect(inspect).toHaveBeenCalledWith(f.manifest); expect(apply).not.toHaveBeenCalled();
    expect(await runAdoptionCli(['--manifest', 'manifest', '--live', '--apply', '--approved-hash', 'a'.repeat(64)], options)).toBe(0);
    expect(apply).toHaveBeenCalledWith(f.manifest, 'a'.repeat(64));
    expect(await runAdoptionCli(['--manifest', 'manifest', '--env', 'production'], options)).toBe(1);
  });
});
