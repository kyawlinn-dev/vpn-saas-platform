import { assertResourceOwnership } from './ownership.js';
import { infrastructureError } from './repository.js';
import { CORE_VERSION } from './nodeConfigurator.js';

export async function readExistingCandidate({ context, store, providers, panelTransport, server, lease }) {
  const own = async resource => { await assertResourceOwnership({ context, resource, operation: lease }); return resource; };
  const fail = () => { throw infrastructureError('CANDIDATE_REGISTRATION_INVALID'); };
  await own(server);
  const raw = await providers[server.provider].inspect({ resourceId: server.provider_resource_id });
  const receipt = await store.getResource({ kind: 'provider', id: server.provider_resource_id, provider: server.provider });
  if (!raw || !receipt?.sshHostKeySha256) throw infrastructureError('RESOURCE_SCOPE_MISMATCH');
  await own(raw);
  const resource = { ...raw, sshHostKeySha256: receipt.sshHostKeySha256 };
  const node = await own(await store.getResource({ kind: 'node', id: String(server.panel_node_id) }));
  const inbounds = (await panelTransport.list('/api/inbounds')).filter(row => Number(row.node?.id ?? row.node_id) === server.panel_node_id);
  const rawServices = await panelTransport.list('/api/services'), privateServices = [], hosts = [], ownedInbounds = [];
  const global = rawServices.find(row => String(row.id) === context.publicServiceId);
  const publicService = await own(await store.getResource({ kind: 'service', id: context.publicServiceId }));
  let vlessHost;
  for (const inbound of inbounds) {
    const owner = await own(await store.getResource({ kind: 'inbound', id: String(inbound.id) }));
    if (owner.protocol !== inbound.protocol) fail();
    ownedInbounds.push(owner);
    const services = rawServices.filter(row => String(row.id) !== context.publicServiceId && row.inbound_ids?.length === 1 && row.inbound_ids[0] === inbound.id);
    if (inbound.protocol === 'vless') {
      if (services.length > 1 || !global?.inbound_ids?.includes(inbound.id)) fail();
    } else if (inbound.protocol !== 'shadowsocks' || services.length !== 1) fail();
    for (const row of services) {
      const service = await own(await store.getResource({ kind: 'service', id: String(row.id) }));
      if (service.protocol !== inbound.protocol) fail();
      privateServices.push(service);
    }
    const rows = (await panelTransport.list(`/api/inbounds/${inbound.id}/hosts`)).filter(row => !row.is_disabled);
    if (rows.length !== 1) fail();
    const host = await own(await store.getResource({ kind: 'host', id: String(rows[0].id) }));
    hosts.push(host);
    if (inbound.protocol === 'vless') vlessHost = rows[0];
  }
  if (!vlessHost || inbounds.length !== server.supported_protocols.length ||
      !server.supported_protocols.every(protocol => inbounds.some(row => row.protocol === protocol))) fail();
  return { serverId: server.id, resource, node, inbounds: ownedInbounds, hosts, privateServices, publicService,
    operation: lease, public: false, supportedProtocols: server.supported_protocols, address: server.host_ip, coreVersion: CORE_VERSION,
    vlessPort: Number(vlessHost.port), ssPort: server.supported_protocols.includes('shadowsocks') ? 8388 : null,
    realityPublicKey: vlessHost.reality_public_key, shortId: vlessHost.reality_short_ids?.[0] };
}
