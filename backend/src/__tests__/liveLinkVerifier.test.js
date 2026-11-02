import { describe, expect, it, vi } from 'vitest';
import { createLiveLinkVerifier } from '../services/infrastructure/liveLinkVerifier.js';
describe('stable link verification',()=>{
  function poolFixture(serviceIds, addresses) {
    const fetchImpl=vi.fn(async()=>new Response(addresses.map(ip=>`vless://test@${ip}:443`).join('\n')));
    const chain={select:()=>chain,eq:()=>chain,order:()=>chain,range:async()=>({data:[]})};
    const panelTransport={request:vi.fn(async()=>({status:200,data:{username:'test-user',service_ids:serviceIds}}))};
    const verify=createLiveLinkVerifier({context:{panelIdentity:'https://panel.example',publicServiceId:'14'},
      client:{from:()=>chain},store:{},panelTransport,fetchImpl,env:{},
      repository:{listInventoryPage:async()=>({complete:true,items:[{status:'active',protocol:'vless',outline_key_id:'test-user',access_url:'https://panel.example/sub/private'}]})}});
    const input={lease:{id:'op'},source:{addresses:['198.51.100.1']},destination:{host_ip:'198.51.100.2'}};
    return {verify,input,panelTransport};
  }
  it('does not require a DEV endpoint in an unrelated service subscription',async()=>{
    const {verify,input}=poolFixture([5],['198.51.100.3']);
    await expect(verify(input)).resolves.toEqual({verified:true});
  });
  it('still requires the destination for users of the replaced global service',async()=>{
    const {verify,input}=poolFixture([14],['198.51.100.3']);
    await expect(verify(input)).rejects.toMatchObject({code:'PERMANENT_LINK_VERIFICATION_FAILED'});
  });
  it('accepts a global subscription containing the destination and no source',async()=>{
    const {verify,input}=poolFixture([14],['198.51.100.3','198.51.100.2']);
    await expect(verify(input)).resolves.toEqual({verified:true});
  });
  it('fails closed when service membership cannot be read',async()=>{
    const {verify,input,panelTransport}=poolFixture([5],['198.51.100.3']);
    panelTransport.request.mockResolvedValue({status:404});
    await expect(verify(input)).rejects.toMatchObject({code:'PERMANENT_LINK_VERIFICATION_FAILED'});
  });
  it('still rejects source exposure in an unrelated service subscription',async()=>{
    const {verify,input}=poolFixture([5],['198.51.100.1']);
    await expect(verify(input)).rejects.toMatchObject({code:'PERMANENT_LINK_VERIFICATION_FAILED'});
  });
  it('refuses an unexpected subscription origin before sending a credential',async()=>{
    const item={kind:'access',keyId:'key',orderId:'order',resellerId:'tenant',customerId:'customer',protocol:'vless',expectedKey:{access_url:'https://foreign.example/sub/private'}};
    const chain={select:()=>chain,eq:()=>chain,order:()=>chain,range:async()=>({data:[{item_key:'key:key'}]})};
    const fetchImpl=vi.fn();
    const verify=createLiveLinkVerifier({context:{panelIdentity:'https://panel.example'},client:{from:()=>chain},store:{readState:async()=>({value:item})},
      repository:{readScopedAccess:async()=>({key:{server_id:'destination',access_url:item.expectedKey.access_url}})},fetchImpl,env:{}});
    await expect(verify({lease:{id:'op'},source:{id:'source',addresses:['198.51.100.1']},destination:{id:'destination',host_ip:'198.51.100.2'}})).rejects.toMatchObject({code:'PERMANENT_LINK_VERIFICATION_FAILED'});
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  function inactiveFixture(protocol='vless') {
    const user={id:'test-user',username:'test-user',key:'unchanged-secret',service_ids:[protocol==='vless'?14:17],is_active:false,
      enabled:true,expire_strategy:'fixed_date',expire_date:'2020-01-01T00:00:00Z',data_limit:1000,data_limit_reset_strategy:'no_reset',used_traffic:50};
    const key={id:'key',status:'active',outline_key_id:user.username,protocol,server_id:'destination',access_url:'https://panel.example/sub/test-user/unchanged-secret'};
    const order={id:'order',expiry_date:'2020-01-01'};
    const item={kind:'access',keyId:key.id,orderId:order.id,resellerId:'tenant',customerId:'customer',protocol,expectedKey:{...key}};
    const chain={select:()=>chain,eq:()=>chain,order:()=>chain,range:async()=>({data:[{item_key:'key:key'}]}),maybeSingle:async()=>({data:{ssconf_token:'opaque-token'}})};
    const fetchImpl=vi.fn(async url=>new URL(url).pathname.endsWith('/info')?new Response(JSON.stringify(user)):
      protocol==='shadowsocks'?new Response('{}',{status:410}):new Response('vless://disabled@127.0.0.1:1'));
    const services=[{id:14,inbound_ids:[20]},{id:17,inbound_ids:[21]}];
    const inbounds=[{id:20,node_id:52,protocol:'vless'},{id:21,node_id:52,protocol:'shadowsocks'}];
    const panelTransport={list:vi.fn(async()=>inbounds),request:vi.fn(async({path})=>{
      if(path.startsWith('/api/users/'))return {status:200,data:{...user}};
      const service=services.find(row=>path===`/api/services/${row.id}`);
      return service?{status:200,data:service}:{status:404};
    })};
    const panel={readUser:vi.fn(async()=>({...user}))};
    const verify=createLiveLinkVerifier({context:{panelIdentity:'https://panel.example',publicServiceId:'14'},
      client:{from:()=>chain},store:{readState:async()=>({value:item})},panelTransport,panel,fetchImpl,
      repository:{readScopedAccess:async()=>({key,order})},env:{PUBLIC_SUBSCRIPTION_BASE_URL:'https://public.example'}});
    return {verify,user,key,fetchImpl,services,inbounds,panel,input:{lease:{id:'op'},source:{id:'source',panel_node_id:51,addresses:['198.51.100.1']},destination:{id:'destination',panel_node_id:52,host_ip:'198.51.100.2'}}};
  }
  it.each(['vless','shadowsocks'])('verifies inactive %s identity and remaining membership without reviving expired access',async protocol=>{
    const f=inactiveFixture(protocol);
    await expect(f.verify(f.input)).resolves.toEqual({verified:true});
    expect(f.fetchImpl.mock.calls.some(([url])=>new URL(url).pathname.endsWith('/info'))).toBe(true);
    expect(f.panel.readUser).toHaveBeenCalledWith(expect.objectContaining({userId:'test-user'}));
    expect(f.user).toMatchObject({is_active:false,enabled:true,expire_date:'2020-01-01T00:00:00Z',used_traffic:50});
  });
  it.each(['credentials','membership','expiry','enabled','source','destination','info-unavailable'])('rejects inactive proof with changed %s',async change=>{
    const f=inactiveFixture();
    if(['credentials','membership','expiry','enabled'].includes(change))f.fetchImpl.mockImplementation(async()=>new Response(JSON.stringify({...f.user,
      ...(change==='credentials'?{key:'different'}:change==='membership'?{service_ids:[99]}:change==='expiry'?{expire_date:'2099-01-01T00:00:00Z'}:{enabled:false})})));
    if(change==='source'){f.inbounds.push({id:22,node_id:51,protocol:'vless'});f.services[0].inbound_ids.push(22);}
    if(change==='destination')f.inbounds[0].node_id=99;
    if(change==='info-unavailable')f.fetchImpl.mockResolvedValue(new Response('{}',{status:404}));
    await expect(f.verify(f.input)).rejects.toMatchObject({code:'PERMANENT_LINK_VERIFICATION_FAILED'});
  });
  it.each([404,500])('does not accept HTTP %s as an expired Outline denial',async status=>{
    const f=inactiveFixture('shadowsocks');
    f.fetchImpl.mockImplementation(async url=>new URL(url).pathname.endsWith('/info')?new Response(JSON.stringify(f.user)):new Response('{}',{status}));
    await expect(f.verify(f.input)).rejects.toMatchObject({code:'PERMANENT_LINK_VERIFICATION_FAILED'});
  });
  it('does not accept a usable Outline config for the expired order being relocated',async()=>{
    const f=inactiveFixture('shadowsocks');
    f.fetchImpl.mockImplementation(async url=>new URL(url).pathname.endsWith('/info')?new Response(JSON.stringify(f.user)):
      new Response(JSON.stringify({server:f.input.destination.host_ip,server_port:8388,method:'chacha20-ietf-poly1305'})));
    await expect(f.verify(f.input)).rejects.toMatchObject({code:'PERMANENT_LINK_VERIFICATION_FAILED'});
  });
});
