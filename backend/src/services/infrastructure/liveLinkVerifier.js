import { infrastructureError } from './repository.js';
import { readSharedDestination } from './sharedDestinationAccess.js';
import { payloadHash } from './repository.js';
import { expiryBusinessState } from '../../utils/businessTime.js';
const fail = () => {throw infrastructureError('PERMANENT_LINK_VERIFICATION_FAILED');};
export function createLiveLinkVerifier({context,client,store,repository,panelTransport,panel,fetchImpl,env}) {
  const publicBase=env.PUBLIC_SUBSCRIPTION_BASE_URL || env.WEBHOOK_BASE_URL;
  const allowed=new Set([context.panelIdentity]);
  if(publicBase) {try{allowed.add(new URL(publicBase).origin);}catch{fail();}}
  async function get(value, {allowInactiveDenial=false}={}) {
    let url;try{url=new URL(value);}catch{fail();}
    if(!allowed.has(url.origin) || url.username || url.password || url.hash ||
      (url.protocol!=='https:' && !(url.protocol==='http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname)))) fail();
    let response;try{response=await fetchImpl(url,{redirect:'error',headers:{'User-Agent':'v2ray'},cache:'no-store',signal:AbortSignal.timeout(20000)});}catch{fail();}
    if(response.status===410 && allowInactiveDenial) {await response.body?.cancel().catch(()=>{});return null;}
    if(response.status!==200) fail();
    const reader=response.body?.getReader();if(!reader) fail();
    const chunks=[];let size=0;
    try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>1048576)fail();chunks.push(Buffer.from(value));}}
    finally{await reader.cancel().catch(()=>{});}
    return Buffer.concat(chunks).toString('utf8').trim();
  }
  async function readPanelUser(key) {
    if(!/^[A-Za-z0-9_-]{1,200}$/.test(key.outline_key_id || ''))fail();
    const response=await panelTransport.request({method:'GET',path:`/api/users/${key.outline_key_id}`});
    if(response.status!==200 || response.data?.username!==key.outline_key_id || !Array.isArray(response.data.service_ids))fail();
    return response.data;
  }
  async function verifyInactive(key,user,input) {
    // Disabled subscriptions may contain placeholders; authenticate the same link
    // through /info and verify real membership instead of accepting a dead tunnel.
    if(typeof panel?.readUser!=='function')fail();
    const owned=await panel.readUser({context,lease:input.lease,userId:key.outline_key_id});
    if(owned.username!==user.username || !owned.key || owned.key!==user.key || owned.is_active!==false)fail();
    const infoUrl=new URL(key.access_url);
    if(infoUrl.origin!==context.panelIdentity || infoUrl.search || infoUrl.hash)fail();
    infoUrl.pathname=infoUrl.pathname.replace(/\/+$/,'')+'/info';
    let info;try{info=JSON.parse(await get(infoUrl));}catch{fail();}
    const fields=['username','key','enabled','expire_strategy','expire_date','data_limit','data_limit_reset_strategy'];
    if(!Array.isArray(info.service_ids) || !Array.isArray(owned.service_ids) || info.is_active!==false || fields.some(field=>(info[field]??null)!==(owned[field]??null)) ||
      payloadHash([...(info.service_ids||[])].sort())!==payloadHash([...owned.service_ids].sort()))fail();
    if(!owned.service_ids.length || !owned.service_ids.every(id=>Number.isSafeInteger(id)&&id>0))fail();
    const linked=new Set();
    for(const id of owned.service_ids){
      const service=await panelTransport.request({method:'GET',path:`/api/services/${id}`});
      if(service.status!==200 || !Array.isArray(service.data?.inbound_ids))fail();
      for(const inboundId of service.data.inbound_ids)linked.add(inboundId);
    }
    const inbounds=await panelTransport.list('/api/inbounds');
    if(!Array.isArray(inbounds) || [...linked].some(id=>!inbounds.some(row=>row.id===id)))fail();
    const selected=inbounds.filter(row=>linked.has(row.id));
    if(selected.some(row=>Number(row.node?.id??row.node_id)===Number(input.source.panel_node_id)))fail();
    const needsDestination=key.protocol==='shadowsocks' || owned.service_ids.some(id=>String(id)===String(context.publicServiceId));
    if(needsDestination && !selected.some(row=>row.protocol===key.protocol && Number(row.node?.id??row.node_id)===Number(input.destination.panel_node_id)))fail();
  }
  return async input=>{
    let offset=0;
    for(;;){
      const {data,error}=await client.from('server_operation_items').select('item_key,status').eq('operation_id',input.lease.id).order('item_key').range(offset,offset+499);
      if(error || !Array.isArray(data))fail();
      for(const row of data){
        const item=(await store.readState(`migration-item:${row.item_key}`)).value;if(!item)fail();
        if(item.kind!=='access')continue;
        const {key,order}=await repository.readScopedAccess({context,lease:input.lease,keyId:item.keyId,orderId:item.orderId,resellerId:item.resellerId,customerId:item.customerId});
        if(key.server_id!==input.destination.id || key.access_url!==item.expectedKey.access_url)fail();
        const user=await readPanelUser(key),inactive=user.is_active===false;
        if(inactive)await verifyInactive(key,user,input);
        if(item.protocol==='vless') {if(!inactive)await checkVless(key.access_url,input);}
        else{
          const {data:customer,error:customerError}=await client.from('vpn_customers').select('ssconf_token').eq('id',item.customerId).eq('reseller_id',item.resellerId).maybeSingle();
          if(customerError || !customer?.ssconf_token || !publicBase)fail();
          const raw=await get(`${publicBase.replace(/\/+$/,'')}/k/${encodeURIComponent(customer.ssconf_token)}.json`,{allowInactiveDenial:inactive});
          if(raw===null)continue;
          if(expiryBusinessState(order?.expiry_date).expired===true)fail();
          let config;try{config=JSON.parse(raw);}catch{fail();}
          const port=input.destination.lifecycle_protected===true?
            (await readSharedDestination({context,server:input.destination,panelTransport})).connections.shadowsocks?.port:8388;
          if(config.server!==input.destination.host_ip || Number(config.server_port)!==port || config.method!=='chacha20-ietf-poly1305')fail();
        }
      }
      if(data.length<500)break;offset+=500;if(offset>=500000)fail();
    }
    // Global VLESS links anchored to other pool nodes must also lose the old endpoint.
    if(repository.listInventoryPage){
      const keys=await repository.listInventoryPage({context,source:input.source,destination:input.destination,kind:'keys',cursor:null});
      if(keys.complete!==true || keys.nextCursor)fail();
      for(const key of keys.items.filter(row=>row.status==='active' && !row.deleted_at && row.protocol==='vless')){
        const user=await readPanelUser(key);
        // A DEV database can contain legacy links to another panel service.
        // All links must lose the source; only this global service gains the destination.
        const requireDestination=user.service_ids.some(id=>String(id)===String(context.publicServiceId));
        if(user.is_active===false)await verifyInactive(key,user,input);
        else await checkVless(key.access_url,input,requireDestination);
      }
    }
    return {verified:true};
  };
  async function checkVless(url,input,requireDestination=true){
    const raw=await get(url),text=/^vless:\/\//.test(raw)?raw:Buffer.from(raw,'base64').toString('utf8');
    const addresses=[];
    for(const link of text.split(/\r?\n/).filter(Boolean)){try{const parsed=new URL(link);if(parsed.protocol==='vless:')addresses.push(parsed.hostname);}catch{fail();}}
    if(!addresses.length || (requireDestination && !addresses.includes(input.destination.host_ip)) || addresses.some(ip=>input.source.addresses.includes(ip)))fail();
  }
}
