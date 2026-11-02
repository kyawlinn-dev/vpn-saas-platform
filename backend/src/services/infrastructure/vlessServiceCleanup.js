import { infrastructureError, payloadHash } from './repository.js';

const fail = () => { throw infrastructureError('SERVICE_MEMBERSHIP_CHANGED'); };
const sameIds = (a, b) => payloadHash([...(a || [])].map(Number).sort()) === payloadHash([...(b || [])].map(Number).sort());

/** Callers supply fenced requests or an explicitly authorized maintenance scope. */
export async function removePrivateVlessService({ service, globalServiceId, request, list, assertOwned, archiveDeleted = async () => {} }) {
  if (service.protocol !== 'vless' || !/^[1-9][0-9]*$/.test(String(service.id)) ||
      !/^[1-9][0-9]*$/.test(String(globalServiceId)) || String(service.id) === String(globalServiceId) ||
      service.inbound_ids?.length !== 1 || service.node_ids?.length !== 1) fail();
  const id = Number(service.id), globalId = Number(globalServiceId), inboundId = Number(service.inbound_ids[0]);
  await assertOwned('service', String(id));
  await assertOwned('service', String(globalId));
  await assertOwned('inbound', String(inboundId));
  await assertOwned('node', String(service.node_ids[0]));
  const servicePath = `/api/services/${id}`;
  const current = await request('GET', servicePath);
  if (!current) { await archiveDeleted(service); return; }
  const assertEmpty = row => {
    if (!row || !sameIds(row.inbound_ids, [inboundId]) || !Array.isArray(row.user_ids) || row.user_ids.length) fail();
  };
  assertEmpty(current);
  const inbound = await request('GET', `/api/inbounds/${inboundId}`);
  const assertGlobal = async () => {
    const global = await request('GET', `/api/services/${globalId}`);
    if (!global?.inbound_ids?.includes(inboundId)) fail();
  };
  if (inbound?.protocol !== 'vless' || Number(inbound.node?.id ?? inbound.node_id) !== Number(service.node_ids[0])) fail();
  await assertGlobal();
  const hosts = await list(`/api/inbounds/${inboundId}/hosts`);
  if (!hosts.length) fail();
  // Preflight every host before the first write; an empty filter means all services.
  for (const host of hosts) {
    await assertOwned('host', String(host.id));
    if (Number(host.inbound_id ?? host.inbound?.id) !== inboundId || !Array.isArray(host.service_ids) ||
        !host.service_ids.includes(globalId) || host.service_ids.some(value => ![id, globalId].includes(value))) fail();
  }
  for (const host of hosts) {
    const path = `/api/inbounds/hosts/${host.id}`;
    const fresh = await request('GET', path);
    if (payloadHash(fresh) !== payloadHash(host)) fail();
    if (host.service_ids.includes(id)) {
      const body = { ...host, inbound_id: inboundId, service_ids: [globalId] };
      delete body.id; delete body.inbound;
      await request('PUT', path, body);
    }
    const after = await request('GET', path);
    if (!sameIds(after?.service_ids, [globalId]) ||
        payloadHash({ ...after, service_ids: [] }) !== payloadHash({ ...host, service_ids: [] })) fail();
  }
  await assertGlobal();
  assertEmpty(await request('GET', servicePath));
  try { await request('DELETE', servicePath); }
  catch (error) {
    if (await request('GET', servicePath)) throw error;
  }
  if (await request('GET', servicePath)) fail();
  await archiveDeleted(service);
}
