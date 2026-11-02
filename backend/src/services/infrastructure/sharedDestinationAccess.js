import { assertDestinationRegistration, assertResourceRegistration } from './ownership.js';
import { infrastructureError } from './repository.js';
import { selectServiceIds } from '../serverAccessPolicy.js';
const fail = () => { throw infrastructureError('SHARED_DESTINATION_UNVERIFIED'); };

export async function readSharedDestination({context,server,panelTransport}) {
  if(server.lifecycle_protected !== true) fail();
  return readDestinationAccess({context,server,panelTransport});
}

export async function readDestinationAccess({context,server,panelTransport}) {
  await assertDestinationRegistration({context,resource:server});
  const owned=async(kind,id)=>assertResourceRegistration({context,resource:await context.registry.getResource({kind,id:String(id)})});
  const shared=server.lifecycle_protected===true;
  const pool={id:context.poolId,environment:context.environment,panel_identity:context.panelIdentity,vless_service_id:Number(context.publicServiceId)};
  const serviceIds=[...new Set(server.supported_protocols.flatMap(protocol=>selectServiceIds({server,protocol,pool})))];
  const node=await panelTransport.request({path:`/api/nodes/${server.panel_node_id}`});
  if(node.status!==200 || node.data?.id!==server.panel_node_id || node.data.address!==server.host_ip || node.data.status!=='healthy') fail();
  if(!shared)await owned('node',server.panel_node_id);
  const allInbounds=await panelTransport.list('/api/inbounds');
  const inbounds=[],hosts=[],connections={};
  let endpoint;
  for(const protocol of server.supported_protocols){
    const serviceId=selectServiceIds({server,protocol,pool})[0];
    if(!shared || protocol==='vless')await owned('service',serviceId);
    const service=await panelTransport.request({path:`/api/services/${serviceId}`});
    if(service.status!==200 || !Array.isArray(service.data?.inbound_ids)) fail();
    const matching=allInbounds.filter(row=>service.data.inbound_ids.includes(row.id) &&
      Number(row.node?.id??row.node_id)===server.panel_node_id && row.protocol===protocol);
    if(matching.length!==1 || (protocol==='shadowsocks' && service.data.inbound_ids.length!==1)) fail();
    const inbound=matching[0];
    if(!shared)await owned('inbound',inbound.id);
    const visible=(await panelTransport.list(`/api/inbounds/${inbound.id}/hosts`)).filter(host=>!host.is_disabled &&
      Array.isArray(host.service_ids) && (!host.service_ids.length || host.service_ids.includes(serviceId)));
    if(visible.length!==1 || visible[0].address!==server.host_ip) fail();
    const host=visible[0];
    if(!shared)await owned('host',host.id);
    let config;
    try{config=typeof inbound.config==='string'?JSON.parse(inbound.config):(inbound.config||{});}catch{fail();}
    const port=Number(host.port??config.port);
    if(!Number.isSafeInteger(port) || port<1 || port>65535) fail();
    const publicKey=host.reality_public_key||config.pbk;
    const shortIds=host.reality_short_ids??(typeof config.sid==='string'?config.sid.split(','):[]);
    connections[protocol]={port,publicKey,shortIds};
    inbounds.push(inbound);hosts.push(host);
    if(protocol==='vless') endpoint={id:String(host.id),nodeId:String(server.panel_node_id),inboundId:inbound.id,address:host.address,
      port:Number(host.port),protocol,realityPublicKey:host.reality_public_key||null,shortIds:host.reality_short_ids||[],sni:host.sni||null};
  }
  if(!endpoint) fail();
  return {server,node:node.data,inbounds,hosts,serviceIds,endpoint,connections};
}
