import { isIP } from 'node:net';
import { readFile } from 'node:fs/promises';
import { infrastructureError, payloadHash, scopeParameters } from './repository.js';
import { connectProviderTransport } from './providers/liveTransport.js';
import { connectLightNodeTransport } from './providers/lightnodeTransport.js';
import { connectPanelTransport } from './livePanelTransport.js';
import { verifyLiveRuntime } from './liveRuntimeVerification.js';
import { createInfrastructureContext } from './context.js';
import { createDigitalOceanProvider } from './providers/digitalOcean.js';
import { createVultrProvider } from './providers/vultr.js';
import { connectStrictInfrastructureSsh } from './liveSsh.js';

const fail = code => { throw infrastructureError(code); };
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value);
const positive = value => Number.isSafeInteger(value) && value > 0;
const same = (a, b) => payloadHash(a) === payloadHash(b);
const sorted = values => [...values].sort((a, b) => a - b);
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const origin = value => { try { return new URL(value).origin; } catch { return null; } };

/** No dotenv, background worker, purchase, panel writes or implicit environment selection. */
export async function createExistingNodeAdoption({ env = process.env, operatorConfig, client, fetchImpl = globalThis.fetch, verifySsh } = {}) {
  env = { ...env };
  const settings = structuredClone(operatorConfig);
  const scope = { environment: env.SERVER_ACCESS_ENVIRONMENT, databaseIdentity: env.SERVER_ACCESS_DATABASE_IDENTITY,
    panelIdentity: env.SERVER_ACCESS_PANEL_IDENTITY, poolId: env.SERVER_ACCESS_POOL_ID };
  scopeParameters(scope);
  if (!uuid(scope.poolId) || !settings?.providers || !Object.keys(settings.providers).length || !client ||
      origin(env.SUPABASE_URL) !== `https://${scope.databaseIdentity}` || origin(env.MARZNESHIN_PANEL_URL) !== scope.panelIdentity ||
      !Array.isArray(settings.protectedResourceIds) || !Array.isArray(settings.protectedAddresses)) fail('ADOPTION_CONFIGURATION_REQUIRED');
  const providerAccounts = {}, transports = {};
  for (const [provider, config] of Object.entries(settings.providers)) {
    if (!['digitalocean', 'vultr', 'lightnode'].includes(provider) || !config.accountId) fail('ADOPTION_CONFIGURATION_REQUIRED');
    providerAccounts[provider] = config.accountId;
    if (provider === 'lightnode') {
      transports[provider] = await connectLightNodeTransport({ token: env.LIGHTNODE_API_KEY,
        expectedAccountId: config.accountId, connection: config.connection, fetchImpl });
      continue;
    }
    transports[provider] = await connectProviderTransport({ provider, expectedAccountId: config.accountId,
      token: provider === 'digitalocean' ? env.DIGITALOCEAN_TOKEN : env.VULTR_API_KEY, fetchImpl });
  }
  const panel = await connectPanelTransport({ baseUrl: env.MARZNESHIN_PANEL_URL,
    username: env.MARZNESHIN_PANEL_USERNAME, password: env.MARZNESHIN_PANEL_PASSWORD, fetchImpl });
  const config = { ...scope, executionMode: 'live', providerAccounts,
    protectedResourceIds: settings.protectedResourceIds, protectedAddresses: settings.protectedAddresses };
  async function readPool() {
    const { data, error } = await client.from('server_access_pools').select('*').eq('id', scope.poolId).eq('environment', scope.environment).maybeSingle();
    if (error || !data || data.panel_identity !== scope.panelIdentity || !positive(data.vless_service_id)) fail('RESOURCE_SCOPE_MISMATCH');
    return data;
  }
  let pool = await readPool();
  config.publicServiceId = String(pool.vless_service_id);
  const attest = () => verifyLiveRuntime({ config, client, supabaseUrl: env.SUPABASE_URL, panel, transports });
  const liveVerification = await attest();
  const context = await createInfrastructureContext({ config, registry: { getResource: async () => null }, adapters: {
    liveVerification, inspectRuntime: async () => ({ ...config, verified: true }), assertOperationLease: async () => false } });
  const providers = Object.fromEntries(Object.entries(transports).map(([name, transport]) => [name,
    name === 'lightnode' ? { inspect: async ({ resourceId }) => {
      const reply = await transport.request({ path: '/instance/detail', query: { ecsResourceUUID: resourceId } });
      const raw = reply.data?.instance;
      if (![200, 202].includes(reply.status) || reply.data?.success === false ||
          (reply.data?.httpStatus !== undefined && ![200, 202].includes(reply.data.httpStatus)) ||
          !raw || raw.ecsResourceUUID !== resourceId || raw.ecsStatus !== 'STARTED' || raw.ecsPendingStatus !== 'NONE' ||
          !raw.regionCode || !raw.zoneCode) fail('ADOPTION_PROVIDER_UNVERIFIED');
      return { id: raw.ecsResourceUUID, provider: name, accountId: transport.accountId, createdAt: raw.createTime,
        addresses: [raw.publicIpAddress], region: raw.regionCode, zone: raw.zoneCode, status: 'active' };
    } } : (name === 'digitalocean' ? createDigitalOceanProvider : createVultrProvider)({ context, transport, catalog: { getQuote: async () => fail('ADOPTION_READ_ONLY') } })]));
  const rpc = async (name, args) => {
    const { data, error } = await client.rpc(name, { ...scopeParameters(scope), ...args });
    if (error) fail(['ADOPTION_STATE_CHANGED', 'ADOPTION_RESOURCE_COLLISION', 'ADOPTION_BUSY', 'RESOURCE_SCOPE_MISMATCH', 'ADOPTION_APPROVAL_REQUIRED']
      .find(code => String(error.message).includes(code)) || 'ADOPTION_STORAGE_UNAVAILABLE');
    return data;
  };
  const get = async path => {
    const result = await panel.request({ path });
    if (result.status !== 200) fail('ADOPTION_PANEL_UNVERIFIED');
    return result.data;
  };
  async function inspect(manifest) {
    // A manifest describes the target, never the backend's authority or credentials.
    if (!manifest || Object.keys(manifest).some(key => !['serverId', 'provider', 'resourceId', 'nodeId', 'mode', 'registration'].includes(key)) ||
        !uuid(manifest.serverId) || !positive(manifest.nodeId) || !providers[manifest.provider] ||
        !/^[A-Za-z0-9-]{1,100}$/.test(manifest.resourceId || '') || !['access', 'lifecycle'].includes(manifest.mode)) fail('ADOPTION_MANIFEST_INVALID');
    if (manifest.provider === 'lightnode' && manifest.mode !== 'access') fail('ADOPTION_LIFECYCLE_SCOPE_REQUIRED');
    await attest(); pool = await readPool();
    if (String(pool.vless_service_id) !== config.publicServiceId) fail('RESOURCE_SCOPE_MISMATCH');
    const snapshot = await rpc('inspect_existing_node_adoption', { p_server_id: manifest.serverId });
    if (!snapshot || !Array.isArray(snapshot.resources)) fail('ADOPTION_STORAGE_UNAVAILABLE');
    if (snapshot.busy) fail('ADOPTION_BUSY');
    const server = snapshot.server;
    const resource = await providers[manifest.provider].inspect({ resourceId: manifest.resourceId });
    if (!resource || resource.id !== manifest.resourceId || !Number.isFinite(Date.parse(resource.createdAt)) ||
        !resource.addresses?.length || resource.addresses.some(ip => !isIP(ip)) || resource.status !== 'active') fail('ADOPTION_PROVIDER_UNVERIFIED');
    if (manifest.provider === 'vultr' && (resource.powerStatus !== 'running' || resource.serverStatus !== 'ok')) fail('ADOPTION_PROVIDER_UNVERIFIED');
    const node = await get(`/api/nodes/${manifest.nodeId}`);
    if (node.id !== manifest.nodeId || !resource.addresses.includes(node.address)) fail('ADOPTION_NODE_UNVERIFIED');
    if (server && (server.panel_type !== 'marzneshin' || server.provider !== manifest.provider ||
        server.panel_url?.replace(/\/$/, '') !== scope.panelIdentity || server.host_ip !== node.address ||
        (server.environment != null && server.environment !== scope.environment) ||
        (server.access_pool_id != null && server.access_pool_id !== scope.poolId) ||
        (server.panel_node_id != null && server.panel_node_id !== node.id) ||
        (server.provider_resource_id != null && server.provider_resource_id !== resource.id) ||
        (server.droplet_id != null && (manifest.provider !== 'digitalocean' || String(server.droplet_id) !== resource.id)))) fail('RESOURCE_SCOPE_MISMATCH');
    let registration = null;
    if (!server) {
      const r = manifest.registration;
      if (!r || Object.keys(r).some(k => !['name', 'region', 'maxActiveKeys', 'serverTier'].includes(k)) ||
          typeof r.name !== 'string' || !r.name.trim() || r.name.length > 100 || r.region !== resource.region ||
          !positive(r.maxActiveKeys) || r.maxActiveKeys > 100000 || !['premium', 'trial'].includes(r.serverTier)) fail('ADOPTION_REGISTRATION_REQUIRED');
      registration = { ...r };
    } else if (manifest.registration) fail('ADOPTION_MANIFEST_INVALID');
    const allInbounds = await panel.list('/api/inbounds');
    const inbounds = allInbounds.filter(row => Number(row.node?.id ?? row.node_id) === node.id);
    if (!inbounds.length || inbounds.length > 2 || inbounds.some(row => !positive(row.id) || !['vless', 'shadowsocks'].includes(row.protocol)) ||
        new Set(inbounds.map(row => row.protocol)).size !== inbounds.length || !inbounds.some(row => row.protocol === 'vless')) fail('ADOPTION_INBOUNDS_UNVERIFIED');
    inbounds.sort((a, b) => a.id - b.id);
    const protocols = inbounds.map(row => row.protocol).sort();
    if (server?.supported_protocols && !same([...server.supported_protocols].sort(), protocols)) fail('RESOURCE_SCOPE_MISMATCH');
    const services = await panel.list('/api/services');
    const publicService = services.find(row => row.id === pool.vless_service_id);
    const validIds = ids => Array.isArray(ids) && ids.every(positive) && new Set(ids).size === ids.length;
    if (!validIds(publicService?.inbound_ids) || !inbounds.filter(row => row.protocol === 'vless').every(row => publicService.inbound_ids.includes(row.id)) ||
        publicService.inbound_ids.some(id => !allInbounds.some(row => row.id === id && row.protocol === 'vless'))) fail('ADOPTION_SERVICES_UNVERIFIED');
    const hosts = [], privateServices = [];
    for (const inbound of inbounds) {
      const rows = await panel.list(`/api/inbounds/${inbound.id}/hosts`);
      let port = rows[0]?.port;
      if (port == null) {
        try {
          const config = typeof inbound.config === 'string' ? JSON.parse(inbound.config) : inbound.config;
          port = Number(config?.port);
        } catch { fail('ADOPTION_HOSTS_UNVERIFIED'); }
      }
      if (rows.length !== 1 || !positive(rows[0].id) || rows[0].is_disabled !== false || rows[0].address !== node.address ||
          !positive(port) || port > 65535) fail('ADOPTION_HOSTS_UNVERIFIED');
      hosts.push({ ...rows[0], inboundId: inbound.id, effectivePort: port });
      const matches = services.filter(row => row.id !== pool.vless_service_id && same(row.inbound_ids, [inbound.id]) &&
        (inbound.protocol !== 'shadowsocks' || !server || (server.marzneshin_service_ids || []).includes(row.id)));
      if (matches.length === 1 && positive(matches[0].id)) privateServices.push({ ...matches[0], inboundId: inbound.id });
      else if (inbound.protocol === 'shadowsocks' || matches.length) fail('ADOPTION_SERVICES_UNVERIFIED');
    }
    const ssIds = privateServices.filter(row => inbounds.find(i => i.id === row.inboundId)?.protocol === 'shadowsocks').map(row => row.id);
    if (server && (!same(sorted(server.marzneshin_service_ids || []), sorted(ssIds)) ||
        !same(server.marzneshin_vless_service_ids || [], [pool.vless_service_id]))) fail('ADOPTION_EXISTING_SERVICES_CHANGED');
    const lifecycle = manifest.mode === 'lifecycle';
    if (!lifecycle && server?.lifecycle_protected === false) fail('ADOPTION_LIFECYCLE_SCOPE_REQUIRED');
    let fingerprint = null;
    if (lifecycle) {
      const permit = settings.existingNodeAdoption?.lifecycleScopes?.find(row => row.serverId === manifest.serverId &&
        row.provider === manifest.provider && row.resourceId === resource.id && row.nodeId === node.id &&
        Object.keys(scope).every(k => row[k] === scope[k]));
      const targetIds = [manifest.serverId, resource.id, node.id, ...inbounds.map(r => r.id), ...hosts.map(r => r.id), ...privateServices.map(r => r.id)].map(String);
      if (!permit || !/^SHA256:[A-Za-z0-9+/]{43}=?$/.test(permit.sshHostKeySha256 || '') ||
          targetIds.some(id => settings.protectedResourceIds.includes(id)) || resource.addresses.some(ip => settings.protectedAddresses.includes(ip)) ||
          server?.ownership_provenance?.purpose === 'owner_authorized_shared_node_customer_access') fail('ADOPTION_LIFECYCLE_SCOPE_REQUIRED');
      const allowedServices = [pool.vless_service_id, ...privateServices.map(row => row.id)];
      if ([...inbounds, ...hosts].some(row => (row.service_ids || []).some(id => !allowedServices.includes(id))) ||
          services.some(row => row.id !== pool.vless_service_id && !privateServices.some(s => s.id === row.id) &&
            row.inbound_ids?.some(id => inbounds.some(i => i.id === id)))) fail('ADOPTION_SHARED_SERVICE_LIFECYCLE_FORBIDDEN');
      // Node approval must not silently grant authority over legacy customer users.
      // Require their existing pool receipts before reporting lifecycle readiness.
      const users = await panel.list('/api/users');
      for (const user of users) {
        if (!Array.isArray(user.service_ids)) fail('ADOPTION_CUSTOMER_OWNERSHIP_REQUIRED');
        if (!user.service_ids.some(id => allowedServices.includes(id))) continue;
        if (!user.username || !user.key) fail('ADOPTION_CUSTOMER_OWNERSHIP_REQUIRED');
        const owner = await rpc('read_server_infrastructure_resource', { p_kind: 'user', p_resource_id: user.username, p_provider: '' });
        if (!owner || owner.kind !== 'user' || owner.id !== user.username || owner.protected !== false ||
            !Object.keys(scope).every(key => owner[key] === scope[key]) || owner.subscriptionKeyHash !== payloadHash(user.key)) {
          fail('ADOPTION_CUSTOMER_OWNERSHIP_REQUIRED');
        }
      }
      fingerprint = permit.sshHostKeySha256;
      let verified = false;
      try {
        if (verifySsh) verified = await verifySsh({ host: node.address, expectedHostKey: fingerprint, scope: { ...scope }, resourceId: resource.id });
        else {
          const privateKey = await readFile(env.SERVER_BOOTSTRAP_PRIVATE_KEY_PATH, 'utf8');
          const ssh = await connectStrictInfrastructureSsh({ host: node.address, expectedHostKey: fingerprint, privateKey });
          ssh.close(); verified = true;
        }
      } catch { /* A successful authenticated pinned handshake is mandatory. */ }
      if (verified !== true) fail('ADOPTION_SSH_UNVERIFIED');
    }
    const provider = { id: resource.id, provider: manifest.provider, accountId: resource.accountId, createdAt: resource.createdAt,
      addresses: [...resource.addresses].sort(), region: resource.region, planId: resource.planId,
      ...(manifest.provider === 'lightnode' ? { zone: resource.zone } : {}) };
    const base = { ...scope, protected: !lifecycle, method: lifecycle ? 'owner_authorized_lifecycle_adoption' : 'owner_authorized_access_adoption' };
    const receipt = (kind, id, extra = {}) => ({ ...base, kind, id: String(id), ...extra });
    const receipts = [receipt('server', manifest.serverId, { panel_node_id: node.id, provider_resource_id: lifecycle ? resource.id : null,
      addresses: [node.address], supported_protocols: protocols, ...(lifecycle ? { provider: manifest.provider } : {}) })];
    if (lifecycle) {
      receipts.push(receipt('provider', resource.id, { ...provider, sshHostKeySha256: fingerprint }),
        receipt('node', node.id, { provider_resource_id: resource.id, address: node.address, addresses: [node.address] }));
      for (const row of inbounds) receipts.push(receipt('inbound', row.id, { panel_node_id: node.id, protocol: row.protocol }));
      for (const row of hosts) receipts.push(receipt('host', row.id, { node_id: node.id, inbound_id: row.inboundId, address: node.address }));
      for (const row of privateServices) receipts.push(receipt('service', row.id, { node_ids: [node.id], inbound_ids: [row.inboundId],
        protocol: inbounds.find(i => i.id === row.inboundId).protocol }));
    }
    // Only allowlisted display fields leave inspection; full panel configs contribute hashes, not secrets.
    const preview = { version: 1, scope, serverId: manifest.serverId, lifecycle, registration, provider,
      node: { id: node.id, address: node.address }, supportedProtocols: protocols, ssServiceIds: ssIds,
      publicServiceId: pool.vless_service_id, sshHostKeySha256: fingerprint,
      inbounds: inbounds.map(row => ({ id: row.id, protocol: row.protocol, hash: payloadHash(row) })),
      hosts: hosts.map(row => ({ id: row.id, inboundId: row.inboundId, address: row.address, port: row.effectivePort, hash: payloadHash(row) })),
      services: [publicService, ...privateServices].map(row => ({ id: row.id, inboundIds: sorted(row.inbound_ids), hash: payloadHash(row) })),
      expected: structuredClone(snapshot), receipts };
    if (Buffer.byteLength(JSON.stringify(preview)) > 65536) fail('ADOPTION_PREVIEW_TOO_LARGE');
    return { mode: 'live-inspect', ready: true, hash: payloadHash(preview), preview };
  }
  async function apply(manifest, approvedHash) {
    if (!/^[a-f0-9]{64}$/.test(approvedHash || '')) fail('ADOPTION_APPROVAL_REQUIRED');
    const saved = await rpc('read_existing_node_adoption_approval', { p_approved_hash: approvedHash });
    let report;
    if (saved) {
      const previous = saved.document;
      if (payloadHash(previous) !== approvedHash || manifest.serverId !== previous.serverId || manifest.provider !== previous.provider.provider ||
          manifest.resourceId !== previous.provider.id || manifest.nodeId !== previous.node.id ||
          manifest.mode !== (previous.lifecycle ? 'lifecycle' : 'access') || !same(manifest.registration || null, previous.registration)) fail('ADOPTION_PREVIEW_CHANGED');
      const { registration: ignored, ...target } = manifest;
      const current = await inspect(target);
      const evidence = ({ expected, registration, ...rest }) => rest;
      if (!same(evidence(current.preview), evidence(previous))) fail('ADOPTION_PREVIEW_CHANGED');
      report = { preview: previous };
    } else {
      report = await inspect(manifest);
      if (report.hash !== approvedHash) fail('ADOPTION_PREVIEW_CHANGED');
    }
    let credentials = null;
    if (report.preview.registration) {
      const { encrypt } = await import('../../lib/tokenEncryption.js');
      credentials = { username: env.MARZNESHIN_PANEL_USERNAME, passwordEncrypted: encrypt(env.MARZNESHIN_PANEL_PASSWORD) };
    }
    return rpc('adopt_existing_node', { p_document: JSON.stringify(canonical(report.preview)), p_approved_hash: approvedHash, p_credentials: credentials });
  }
  return Object.freeze({ inspect, apply });
}
