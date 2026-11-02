import { panelDisplayNames, subscriptionServerName } from '../serverDisplay.js';
import { infrastructureError, payloadHash } from './repository.js';

/** Cosmetic updates use bound IDs; credentials and membership never enter a name. */
export async function synchronizePanelLabels({ server, nodeId, hostIds, ssServiceIds = [], verificationServiceIds = [], request, assertAuthorized }) {
  const names = panelDisplayNames(server), entries = [];
  const add = (kind, id, field, value, path, optional = false) => entries.push({ kind, id: String(id), field, value, path, optional });
  if (nodeId != null) add('node', nodeId, 'name', names.node, `/api/nodes/${nodeId}`);
  for (const id of ssServiceIds) add('service', id, 'name', names.ss, `/api/services/${id}`);
  for (const id of verificationServiceIds) add('service', id, 'name', names.verification, `/api/services/${id}`, true);
  for (const id of hostIds) add('host', id, 'remark', subscriptionServerName(server), `/api/inbounds/hosts/${id}`);
  const fail = () => { throw infrastructureError('SERVER_DISPLAY_SYNC_REQUIRED'); };
  for (const entry of entries) {
    if (!/^[1-9][0-9]*$/.test(entry.id)) fail();
    await assertAuthorized(entry.kind, entry.id);
    entry.before = await request('GET', entry.path);
    if (!entry.before && entry.optional) continue;
    if (String(entry.before?.id) !== entry.id) fail();
  }
  for (const entry of entries) {
    const { before } = entry;
    if (!before || before[entry.field] === entry.value) continue;
    const current = await request('GET', entry.path);
    if (payloadHash(current) !== payloadHash(before)) fail();
    const fields = entry.kind === 'node' ? ['name', 'address', 'port', 'connection_backend', 'usage_coefficient'] :
      entry.kind === 'service' ? ['name', 'inbound_ids'] : Object.keys(before).filter(key => !['id', 'inbound'].includes(key));
    const body = Object.fromEntries(fields.filter(key => before[key] !== undefined).map(key => [key, before[key]]));
    body[entry.field] = entry.value;
    await request('PUT', entry.path, body);
    const after = await request('GET', entry.path);
    if (!after || Object.keys(body).some(key => JSON.stringify(after[key]) !== JSON.stringify(body[key]))) fail();
  }
}
