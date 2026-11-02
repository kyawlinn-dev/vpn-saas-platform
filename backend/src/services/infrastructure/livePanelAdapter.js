import { infrastructureError, payloadHash } from './repository.js';
import { assertResourceOwnership, assertOperationAuthority } from './ownership.js';
import { randomUUID } from 'node:crypto';
import { validCapabilities } from './nodeConfigurator.js';
import { removePrivateVlessService } from './vlessServiceCleanup.js';
import { synchronizePanelLabels } from './panelDisplaySync.js';
import { readSharedDestination } from './sharedDestinationAccess.js';

const fail = code => { throw infrastructureError(code); };
const apiId = value => {
  const id = String(value ?? '');
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(id)) fail('RESOURCE_SCOPE_MISMATCH');
  return id;
};
const sameIds = (a, b) => payloadHash([...(a || [])].sort()) === payloadHash([...(b || [])].sort());
function userUpdate(current, serviceIds) {
  return { username: current.username, service_ids: serviceIds, expire_strategy: current.expire_strategy || 'never', expire_date: current.expire_date || null,
    data_limit: current.data_limit ?? 0, data_limit_reset_strategy: current.data_limit_reset_strategy || 'no_reset', note: current.note || '', enabled: current.enabled ?? true };
}
export function createLivePanelAdapter({ context, transport, store, getLease, renewLease = async () => {}, verifySharedInbound }) {
  const operation = () => {
    const lease = getLease?.(); if (!lease?.id) fail('STALE_FENCE'); return lease;
  };
  async function owned(kind, id) {
    const resource = await context.registry.getResource({ kind, id: apiId(id) });
    await assertResourceOwnership({ context, resource, operation: operation() });
    return resource;
  }
  async function request(method, path, body) {
    await renewLease(operation()); await assertOperationAuthority(context, operation());
    const response = await transport.request({ method, path, body });
    if (response.status === 404 && method === 'GET') return null;
    if (response.status < 200 || response.status >= 300) fail('PANEL_OPERATION_REJECTED');
    return response.data;
  }
  function normalizeUser(raw) {
    if (!raw?.username) fail('PANEL_RESPONSE_INVALID');
    return { ...raw, id: raw.username, panelId: raw.id, version: payloadHash({ ...userUpdate(raw, raw.service_ids), key: raw.key || null }) };
  }
  async function readUser({ userId }) {
    const receipt=await owned('user', userId);
    const raw=await request('GET', `/api/users/${apiId(userId)}`);
    if((receipt.subscriptionKeyHash || context.executionMode==='live') && (!raw?.key || receipt.subscriptionKeyHash!==payloadHash(raw.key))) fail('USER_IDENTITY_CHANGED');
    return normalizeUser(raw);
  }
  async function updateUserServices({ userId, expectedVersion, expectedServiceIds, serviceIds, destination }) {
    const current = await readUser({ userId });
    if (current.version !== expectedVersion || !sameIds(current.service_ids, expectedServiceIds)) fail('USER_SERVICES_CHANGED');
    if (!Array.isArray(serviceIds) || !serviceIds.length || serviceIds.some(id => !Number.isSafeInteger(id) || id <= 0)) fail('SERVICE_CONFIGURATION_INVALID');
    for (const id of [...new Set([...current.service_ids, ...serviceIds])]) {
      if(destination?.lifecycle_protected===true && destination.marzneshin_service_ids?.includes(id) &&
          (await readSharedDestination({context,server:destination,panelTransport:transport})).serviceIds.includes(id)) continue;
      await owned('service', id);
    }
    await request('PUT', `/api/users/${apiId(userId)}`, userUpdate(current, serviceIds));
  }
  const scope = () => Object.fromEntries(['environment', 'databaseIdentity', 'panelIdentity', 'poolId'].map(key => [key, context[key]]));
  async function record(kind, id, extra = {}) {
    return store.recordCreatedResource({ ...scope(), id: String(id), kind, operationId: operation().id, protected: false, ...extra });
  }
  async function ensureEntity({ key, createPath, readPath, listPath = createPath, baseBody, nameField = 'name', matches, existing }) {
    let state = await store.readState(key);
    if (!state.value) {
      const nonce = randomUUID().replace(/-/g, '').slice(0, 20);
      const body = { ...baseBody, [nameField]: `nn-${context.environment}-${nonce}` };
      await store.saveState(key, { stage: 'prepared', body, fingerprint: payloadHash(baseBody), targetId: existing?.id || null,
        beforeHash: existing ? payloadHash(existing) : null }, state.version);
      state = await store.readState(key);
    }
    const intent = state.value;
    if (intent.fingerprint !== payloadHash(baseBody)) fail('CANDIDATE_REGISTRATION_INVALID');
    const valid = row => row && row[nameField] === intent.body[nameField] && matches(row);
    if (intent.stage === 'bound') {
      const row = await request('GET', `${readPath}/${apiId(intent.id)}`);
      // Once the immutable ID is bound, a cosmetic rename is not a new identity.
      if (String(row?.id) !== String(intent.id) || !matches(row)) fail('CANDIDATE_REGISTRATION_INVALID');
      return row;
    }
    let row;
    if (intent.targetId) {
      row = await request('GET', `${readPath}/${apiId(intent.targetId)}`);
      if (!valid(row) && payloadHash(row) !== intent.beforeHash) fail('CANDIDATE_REGISTRATION_INVALID');
    } else {
      const found = (await transport.list(listPath)).filter(valid);
      if (found.length > 1) fail('CANDIDATE_REGISTRATION_INVALID');
      row = found[0];
    }
    if (!valid(row)) {
      if (intent.stage === 'requested' && !intent.targetId) fail('PANEL_CREATE_RECONCILIATION_REQUIRED');
      await store.saveState(key, { ...intent, stage: 'requested' }, state.version);
      try { row = await request(intent.targetId ? 'PUT' : 'POST', intent.targetId ? `${readPath}/${apiId(intent.targetId)}` : createPath, intent.body); }
      catch {
        const found = intent.targetId ? [await request('GET', `${readPath}/${apiId(intent.targetId)}`)] : (await transport.list(listPath)).filter(valid);
        if (found.length !== 1 || !valid(found[0])) fail('PANEL_CREATE_RECONCILIATION_REQUIRED');
        row = found[0];
      }
    }
    if (!valid(row) || row.id == null) fail('CANDIDATE_REGISTRATION_INVALID');
    state = await store.readState(key);
    await store.saveState(key, { ...intent, stage: 'bound', id: row.id }, state.version);
    return row;
  }
  const endpoint = (host, inbound) => ({ id: String(host.id), nodeId: String(inbound.node?.id ?? inbound.node_id), inboundId: Number(inbound.id),
    address: host.address, port: Number(host.port), protocol: inbound.protocol, realityPublicKey: host.reality_public_key || null,
    shortIds: host.reality_short_ids || [], sni: host.sni || null });
  async function ensurePrivateCandidate({ resource, supportedProtocols, configuration }) {
    await assertResourceOwnership({ context, resource, operation: operation() });
    if (!validCapabilities(supportedProtocols) || configuration.operationId !== operation().id || configuration.resourceId !== resource.id) fail('CANDIDATE_CONFIGURATION_REQUIRED');
    const address = resource.addresses.find(ip => /^\d+\.\d+\.\d+\.\d+$/.test(ip));
    if (!address) fail('NODE_ADDRESS_UNAVAILABLE');
    const rawNode = await ensureEntity({ key: 'panel-node', createPath: '/api/nodes', readPath: '/api/nodes',
      baseBody: { address, port: 62050, connection_backend: 'grpclib', usage_coefficient: 1 }, matches: row => row.address === address && row.port === 62050 });
    const node = await record('node', rawNode.id, { address, addresses: [address], provider_resource_id: resource.id });
    const freshNode = await request('GET', `/api/nodes/${apiId(rawNode.id)}`);
    if (freshNode?.status !== 'healthy') fail('PANEL_NODE_PENDING');
    const rawInbounds = (await transport.list('/api/inbounds')).filter(row => Number(row.node?.id ?? row.node_id) === Number(node.id));
    if (rawInbounds.length !== supportedProtocols.length || rawInbounds.some(row => !supportedProtocols.includes(row.protocol) || row.tag !== `managed-${row.protocol}`)) fail('CANDIDATE_REGISTRATION_INVALID');
    const inbounds = [], hosts = [], privateServices = []; let vlessEndpoint;
    for (const inbound of rawInbounds) {
      const inboundOwner = await record('inbound', inbound.id, { panel_node_id: Number(node.id), protocol: inbound.protocol });
      inbounds.push(inboundOwner);
      const service = await ensureEntity({ key: `panel-${inbound.protocol}-service`, createPath: '/api/services', readPath: '/api/services',
        baseBody: { inbound_ids: [inbound.id] }, matches: row => sameIds(row.inbound_ids, [inbound.id]) });
      privateServices.push(await record('service', service.id, { node_ids: [Number(node.id)], inbound_ids: [inbound.id], protocol: inbound.protocol }));
      const allowedServices = new Set([String(service.id)]);
      if ((inbound.service_ids || []).some(id => !allowedServices.has(String(id)) && String(id) !== context.publicServiceId)) fail('CANDIDATE_REGISTRATION_INVALID');
      const existingHosts = await transport.list(`/api/inbounds/${apiId(inbound.id)}/hosts`);
      const hostState = await store.readState(`panel-${inbound.protocol}-host`);
      if (!hostState.value && existingHosts.length > 1) fail('CANDIDATE_REGISTRATION_INVALID');
      const defaultHost = !hostState.value && existingHosts.length === 1 ? existingHosts[0] : null;
      if (defaultHost && (defaultHost.service_ids || []).length) fail('CANDIDATE_REGISTRATION_INVALID');
      const body = { inbound_id: inbound.id, address, port: inbound.protocol === 'vless' ? configuration.vlessPort : configuration.ssPort,
        service_ids: [service.id], security: 'inbound_default', fingerprint: 'chrome', is_disabled: false, weight: 1, alpn: 'none',
        ...(inbound.protocol === 'vless' ? { sni: configuration.realityServerName || 'www.apple.com', reality_public_key: configuration.realityPublicKey, reality_short_ids: [configuration.shortId] } : {}) };
      const rawHost = await ensureEntity({ key: `panel-${inbound.protocol}-host`, createPath: `/api/inbounds/${apiId(inbound.id)}/hosts`, readPath: '/api/inbounds/hosts',
        baseBody: body, nameField: 'remark', existing: defaultHost,
        matches: row => row.address === address && Number(row.port) === body.port && Number(row.inbound_id ?? row.inbound?.id) === inbound.id });
      const host = await record('host', rawHost.id, { node_id: Number(node.id), inbound_id: inbound.id, address });
      hosts.push(host);
      if (inbound.protocol === 'vless') vlessEndpoint = endpoint(rawHost, inbound);
    }
    const publicService = await owned('service', context.publicServiceId);
    return { resource, node, inbounds, hosts, privateServices, publicService, endpoint: vlessEndpoint, operation: operation(), public: false,
      supportedProtocols: [...supportedProtocols], address, coreVersion: configuration.coreVersion, vlessPort: configuration.vlessPort,
      ssPort: configuration.ssPort, realityPublicKey: configuration.realityPublicKey, shortId: configuration.shortId };
  }
  async function readService({ serviceId }) {
    await owned('service', serviceId);
    const raw = await request('GET', `/api/services/${apiId(serviceId)}`);
    if (!raw || !Array.isArray(raw.inbound_ids)) fail('SERVICE_MEMBERSHIP_CHANGED');
    const inbounds = (await transport.list('/api/inbounds')).filter(inbound => raw.inbound_ids.includes(inbound.id));
    if (inbounds.length !== raw.inbound_ids.length) fail('SERVICE_MEMBERSHIP_CHANGED');
    const endpoints = [];
    for (const inbound of inbounds) {
      const receipt=await context.registry.getResource({kind:'inbound',id:apiId(inbound.id)});
      const shared=!receipt && String(serviceId)===context.publicServiceId && typeof verifySharedInbound==='function';
      if(shared) await verifySharedInbound(inbound);
      else {await owned('inbound', inbound.id); await owned('node', inbound.node?.id ?? inbound.node_id);}
      for (const host of await transport.list(`/api/inbounds/${apiId(inbound.id)}/hosts`)) {
        if(!shared) await owned('host', host.id);
        if (!host.is_disabled && (!(host.service_ids || []).length || host.service_ids.map(String).includes(String(serviceId)))) endpoints.push(endpoint(host, inbound));
      }
    }
    endpoints.sort((a, b) => a.id.localeCompare(b.id));
    return { id: String(serviceId), inbound_ids: raw.inbound_ids, endpoints, version: payloadHash({ inbound_ids: [...raw.inbound_ids].sort(), endpoints }) };
  }
  async function withServiceLock({ serviceId }, action) {
    await owned('service', serviceId);
    await store.acquireServiceLock(String(serviceId));
    let confirmed = false;
    try { const value = await action(); confirmed = true; return value; }
    finally { if (confirmed) await store.releaseServiceLock(String(serviceId)); }
  }
  async function appendEndpoint({ serviceId, expectedVersion, endpoint: next }) {
    const current = await readService({ serviceId });
    if (current.version !== expectedVersion) fail('SERVICE_MEMBERSHIP_CHANGED');
    await owned('host', next.id); await owned('inbound', next.inboundId); await owned('node', next.nodeId);
    const rawHost = await request('GET', `/api/inbounds/hosts/${apiId(next.id)}`);
    const inbound = (await transport.list('/api/inbounds')).find(inbound => Number(inbound.id) === next.inboundId);
    if (!inbound || payloadHash(endpoint(rawHost, inbound)) !== payloadHash(next)) fail('SERVICE_MEMBERSHIP_CHANGED');
    const serviceIds = [...new Set([...(rawHost.service_ids || []), Number(serviceId)])];
    for (const id of serviceIds) await owned('service', id);
    if (!sameIds(serviceIds, rawHost.service_ids)) {
      const body = { ...rawHost, service_ids: serviceIds, inbound_id: next.inboundId };
      delete body.id; delete body.inbound;
      await request('PUT', `/api/inbounds/hosts/${apiId(next.id)}`, body);
    }
    if (!current.inbound_ids.includes(next.inboundId)) await request('PUT', `/api/services/${apiId(serviceId)}`, { inbound_ids: [...current.inbound_ids, next.inboundId] });
  }
  async function cleanupPrivateVlessServices({ candidate }) {
    const expectedReceipts = [candidate.node, candidate.publicService, ...candidate.inbounds, ...candidate.hosts, ...candidate.privateServices];
    const assertCandidateOwned = async (kind, id) => {
      const expected = expectedReceipts.find(row => row?.kind === kind && String(row.id) === String(id));
      const current = await owned(kind, id);
      if (!expected || payloadHash(current) !== payloadHash(expected)) fail('OWNERSHIP_REGISTRATION_CONFLICT');
    };
    for (const service of candidate.privateServices.filter(row => row.protocol === 'vless')) {
      await removePrivateVlessService({ service, globalServiceId: context.publicServiceId, request,
        list: path => transport.list(path), assertOwned: assertCandidateOwned,
        archiveDeleted: expectedBody => store.archivePanelResource({ kind: 'service', id: expectedBody.id, expectedBody }) });
    }
  }
  async function finalizeCandidateLabels({ candidate, server }) {
    await assertResourceOwnership({ context, resource: candidate.node, operation: operation() });
    return synchronizePanelLabels({ server, nodeId: candidate.node.id, hostIds: candidate.hosts.map(row => row.id),
      ssServiceIds: candidate.privateServices.filter(row => row.protocol === 'shadowsocks').map(row => row.id),
      verificationServiceIds: candidate.privateServices.filter(row => row.protocol === 'vless').map(row => row.id),
      request, assertAuthorized: (kind, id) => owned(kind, id) });
  }
  async function deleteOwnedNode({ server }) {
    const key = `panel-removal:${apiId(server.panel_node_id)}`;
    let saved = await store.readState(key);
    if (!saved.value) {
      const node = await owned('node', server.panel_node_id);
      if (node.provider_resource_id !== server.provider_resource_id) fail('RESOURCE_SCOPE_MISMATCH');
      const rawNode = await request('GET', `/api/nodes/${apiId(node.id)}`);
      if (!rawNode || rawNode.address !== node.address) fail('RESOURCE_SCOPE_MISMATCH');
      const inbounds = (await transport.list('/api/inbounds')).filter(row => Number(row.node?.id ?? row.node_id) === Number(node.id));
      const inboundIds = inbounds.map(row => row.id), rows = [];
      const entry = async (kind, raw, path) => ({kind, id: String(raw.id), expectedBody: await owned(kind, raw.id), raw, path});
      for (const inbound of inbounds) {
        for (const host of await transport.list(`/api/inbounds/${apiId(inbound.id)}/hosts`)) {
          rows.push(await entry('host', host, `/api/inbounds/hosts/${apiId(host.id)}`));
        }
      }
      for (const row of await transport.list('/api/services')) {
        if (!(row.inbound_ids || []).some(id => inboundIds.includes(id))) continue;
        if (String(row.id) === context.publicServiceId || row.inbound_ids.some(id => !inboundIds.includes(id))) fail('RETIREMENT_BLOCKED');
        const current = await request('GET', `/api/services/${apiId(row.id)}`);
        if (!Array.isArray(current?.user_ids) || current.user_ids.length) fail('RETIREMENT_BLOCKED');
        rows.push(await entry('service', current, `/api/services/${apiId(row.id)}`));
      }
      for (const inbound of inbounds) rows.push(await entry('inbound', inbound, `/api/inbounds/${apiId(inbound.id)}`));
      rows.push(await entry('node', rawNode, `/api/nodes/${apiId(node.id)}`));
      await store.saveState(key, { operationId: operation().id, providerResourceId: server.provider_resource_id, rows }, saved.version);
      saved = await store.readState(key);
    }
    const manifest = saved.value;
    if (manifest.operationId !== operation().id || manifest.providerResourceId !== server.provider_resource_id ||
        manifest.rows.at(-1)?.id !== String(server.panel_node_id)) fail('RESOURCE_SCOPE_MISMATCH');
    async function sameInbound(row, current) {
      const normalize = value => {
        const {node, node_id, service_ids, ...rest} = value;
        return {...rest, node_id: Number(node?.id ?? node_id)};
      };
      if (payloadHash(normalize(current)) !== payloadHash(normalize(row.raw))) return false;
      const before = row.raw.service_ids || [], after = current.service_ids || [];
      if (!Array.isArray(before) || !Array.isArray(after) || after.some(id => !before.includes(id))) return false;
      // Service deletion updates inbound membership. Only a manifest-owned,
      // confirmed-absent service may disappear from the saved membership.
      for (const id of before.filter(id => !after.includes(id))) {
        const deleted = manifest.rows.find(item => item.kind === 'service' && item.id === String(id));
        if (!deleted || await request('GET', deleted.path)) return false;
      }
      return true;
    }
    async function inspect(row) {
      const receipt = await owned(row.kind, row.id);
      if (payloadHash(receipt) !== payloadHash(row.expectedBody)) fail('OWNERSHIP_REGISTRATION_CONFLICT');
      const current = await request('GET', row.path);
      if (current) {
        const unchanged = row.kind === 'node' ? current.address === row.raw.address && current.port === row.raw.port :
          row.kind === 'service' ? sameIds(current.inbound_ids, row.raw.inbound_ids) && Array.isArray(current.user_ids) && !current.user_ids.length :
          row.kind === 'inbound' ? await sameInbound(row, current) :
          payloadHash(current) === payloadHash(row.raw);
        if (!unchanged) fail('RETIREMENT_BLOCKED');
      }
      return current;
    }
    // Preflight the whole manifest before any deletion; retain it across partial cleanup.
    for (const row of manifest.rows) await inspect(row);
    const remove = async row => {
      if (await inspect(row)) {
        await renewLease(operation()); await assertOperationAuthority(context, operation());
        try { await transport.request({ method: 'DELETE', path: row.path }); }
        catch { /* A fresh 404, not the DELETE response, proves absence. */ }
        if (await request('GET', row.path)) fail('PANEL_DELETE_RECONCILIATION_REQUIRED');
      }
      await store.archivePanelResource({ kind: row.kind, id: row.id, expectedBody: row.expectedBody });
    };
    for (const row of manifest.rows.filter(row => ['host', 'service'].includes(row.kind))) await remove(row);
    const node = manifest.rows.at(-1);
    // Node deletion cascades inbounds. Archive its receipt last for source ancestry checks.
    if (await inspect(node)) {
      await renewLease(operation()); await assertOperationAuthority(context, operation());
      try { await transport.request({method: 'DELETE', path: node.path}); }
      catch { /* Reconcile a lost response with GET. */ }
      if (await request('GET', node.path)) fail('PANEL_DELETE_RECONCILIATION_REQUIRED');
    }
    for (const row of manifest.rows.filter(row => row.kind === 'inbound')) {
      if (await request('GET', row.path)) fail('PANEL_DELETE_RECONCILIATION_REQUIRED');
      await store.archivePanelResource({kind: row.kind, id: row.id, expectedBody: row.expectedBody});
    }
    await store.archivePanelResource({kind: node.kind, id: node.id, expectedBody: node.expectedBody});
    return true;
  }
  async function replaceEndpoints({ serviceId, expectedVersion, removeEndpointIds, addEndpoints }) {
    const key=`endpoint-replacement:${serviceId}`;
    const prior=await store.readState(key);
    if(prior.value) {await reconcileEndpointReplacement({serviceId});return;}
    const current = await readService({ serviceId });
    if (current.version !== expectedVersion || !Array.isArray(removeEndpointIds) || !Array.isArray(addEndpoints) ||
        removeEndpointIds.some(id => !current.endpoints.some(row => row.id === id))) fail('SERVICE_MEMBERSHIP_CHANGED');
    // All ownership checks precede the first write; membership changes never delete hosts.
    const removed=current.endpoints.filter(row=>removeEndpointIds.includes(row.id)), hosts=[];
    for (const row of removed) {
      await owned('host', row.id); await owned('inbound', row.inboundId); await owned('node', row.nodeId);
      const raw=await request('GET',`/api/inbounds/hosts/${apiId(row.id)}`);
      if(!raw)fail('SERVICE_MEMBERSHIP_CHANGED');hosts.push({endpoint:row,serviceIds:raw.service_ids||[]});
    }
    for (const row of addEndpoints) { await owned('host', row.id); await owned('inbound', row.inboundId); await owned('node', row.nodeId); }
    const removedInbounds=removed.filter(row=>current.endpoints.filter(host=>host.inboundId===row.inboundId).every(host=>removeEndpointIds.includes(host.id))).map(row=>row.inboundId);
    const intent={serviceId:String(serviceId),before:current,hosts,addEndpoints,removedInbounds,status:'prepared'};
    await store.saveState(key,intent,prior.version);
    await reconcileEndpointReplacement({serviceId});
  }
  async function reconcileEndpointReplacement({serviceId}) {
    const key=`endpoint-replacement:${serviceId}`,state=await store.readState(key),intent=state.value;
    if(!intent || intent.status==='complete')return;
    if(intent.serviceId!==String(serviceId))fail('RESOURCE_SCOPE_MISMATCH');
    const current=await readService({serviceId});
    const allowedIds=[...new Set([...intent.before.inbound_ids,...intent.addEndpoints.map(row=>row.inboundId)])];
    const desiredIds=allowedIds.filter(id=>!intent.removedInbounds.includes(id));
    if(current.inbound_ids.some(id=>!allowedIds.includes(id)) || desiredIds.some(id=>!current.inbound_ids.includes(id) && !intent.addEndpoints.some(row=>row.inboundId===id)))fail('SERVICE_MEMBERSHIP_CHANGED');
    const preserved=intent.before.endpoints.filter(row=>!intent.hosts.some(host=>host.endpoint.id===row.id));
    if(preserved.some(row=>!current.endpoints.some(next=>payloadHash(row)===payloadHash(next))))fail('SERVICE_MEMBERSHIP_CHANGED');
    for(const row of intent.addEndpoints)await appendEndpoint({serviceId,expectedVersion:(await readService({serviceId})).version,endpoint:row});
    for (const saved of intent.hosts) {
      const row=saved.endpoint;
      await owned('host',row.id);await owned('inbound',row.inboundId);await owned('node',row.nodeId);
      const host = await request('GET', `/api/inbounds/hosts/${apiId(row.id)}`);
      if (!host || payloadHash(endpoint(host, { id: row.inboundId, node_id: row.nodeId, protocol: row.protocol })) !== payloadHash(row)) fail('SERVICE_MEMBERSHIP_CHANGED');
      // A host with no explicit service filter is visible to every linked service;
      // remove the whole inbound only when all its visible hosts were selected.
      const desiredServices=saved.serviceIds.filter(id=>String(id)!==String(serviceId));
      if(!sameIds(host.service_ids,saved.serviceIds) && !sameIds(host.service_ids,desiredServices))fail('SERVICE_MEMBERSHIP_CHANGED');
      // With no other services, keep the explicit filter and detach the inbound below.
      // Writing [] would make the host visible to every service linked to that inbound.
      if (saved.serviceIds.length && desiredServices.length && !sameIds(host.service_ids,desiredServices)) {
        const body = { ...host, inbound_id: row.inboundId, service_ids: desiredServices };
        delete body.id; delete body.inbound;
        await request('PUT', `/api/inbounds/hosts/${apiId(row.id)}`, body);
      } else if (!desiredServices.length && !intent.removedInbounds.includes(row.inboundId)) {
        fail('SERVICE_MEMBERSHIP_CHANGED');
      }
    }
    const latest=await readService({serviceId});
    if(!sameIds(latest.inbound_ids,desiredIds))await request('PUT',`/api/services/${apiId(serviceId)}`,{inbound_ids:desiredIds});
    const after=await readService({serviceId});
    if(!sameIds(after.inbound_ids,desiredIds) || after.endpoints.some(row=>intent.hosts.some(host=>host.endpoint.id===row.id)))fail('SERVICE_MEMBERSHIP_CHANGED');
    await store.saveState(key,{...intent,status:'complete'},state.version);
  }
  async function readDestinationEndpoint({ destination }) {
    if(destination.lifecycle_protected===true) return (await readSharedDestination({context,server:destination,panelTransport:transport})).endpoint;
    await assertResourceOwnership({ context, resource: destination, operation: operation() }); await owned('node', destination.panel_node_id);
    const inbounds = (await transport.list('/api/inbounds')).filter(row => Number(row.node?.id ?? row.node_id) === Number(destination.panel_node_id) && row.protocol === 'vless');
    if (inbounds.length !== 1) fail('SERVICE_MEMBERSHIP_CHANGED');
    const hosts = (await transport.list(`/api/inbounds/${apiId(inbounds[0].id)}/hosts`)).filter(row => !row.is_disabled);
    if (hosts.length !== 1) fail('SERVICE_MEMBERSHIP_CHANGED');
    await owned('inbound', inbounds[0].id); await owned('host', hosts[0].id);
    return endpoint(hosts[0], inbounds[0]);
  }
  async function verifySharedNode({ serviceId, nodeId }) {
    if (String(serviceId) !== context.publicServiceId || typeof verifySharedInbound !== 'function') return false;
    await owned('service', serviceId);
    const service = await request('GET', `/api/services/${apiId(serviceId)}`);
    if (!Array.isArray(service?.inbound_ids)) return false;
    const inbounds = (await transport.list('/api/inbounds')).filter(row =>
      service.inbound_ids.includes(row.id) && Number(row.node?.id ?? row.node_id) === Number(nodeId));
    if (!inbounds.length) return false;
    for (const inbound of inbounds) await verifySharedInbound(inbound);
    return true;
  }
  async function listInventoryPage({ kind, cursor }) {
    if (cursor) fail('INVENTORY_INCOMPLETE');
    let items;
    if (kind === 'users') items = (await transport.list('/api/users')).map(normalizeUser);
    else if (kind === 'services') {
      const inbounds = await transport.list('/api/inbounds');
      items = (await transport.list('/api/services')).map(row => ({ ...row, id: String(row.id),
        node_ids: [...new Set(inbounds.filter(inbound => row.inbound_ids?.includes(inbound.id)).map(inbound => Number(inbound.node?.id ?? inbound.node_id)))] }));
    } else if (kind === 'hosts') {
      items = [];
      for (const inbound of await transport.list('/api/inbounds')) for (const host of await transport.list(`/api/inbounds/${apiId(inbound.id)}/hosts`)) {
        items.push({ ...host, id: String(host.id), node_id: Number(inbound.node?.id ?? inbound.node_id) });
      }
    } else fail('INVENTORY_INCOMPLETE');
    return { items, complete: true, nextCursor: null };
  }
  return { readUser, updateUserServices, ensurePrivateCandidate, readService, withServiceLock, appendEndpoint, cleanupPrivateVlessServices, finalizeCandidateLabels, deleteOwnedNode,
    replaceEndpoints, reconcileEndpointReplacement, readDestinationEndpoint, listInventoryPage, verifySharedNode,
    verifyDestinationService:async({destination,serviceId})=>(await readSharedDestination({context,server:destination,panelTransport:transport})).serviceIds.includes(serviceId),
    verifyUserIdentity:async({userId})=>{await readUser({userId});return true;} };
}
