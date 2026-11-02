import { describe, expect, it, vi } from 'vitest';
import { infrastructureFixture } from './fixtures/infrastructure.js';
import { assertDestinationRegistration, assertResourceRegistration } from '../services/infrastructure/ownership.js';
import { readSharedDestination, readDestinationAccess } from '../services/infrastructure/sharedDestinationAccess.js';
import { createLivePanelAdapter } from '../services/infrastructure/livePanelAdapter.js';

describe('shared destination access without lifecycle ownership',()=>{
  async function fixture(){
    const f=await infrastructureFixture();
    const server=f.own('server','shared',{protected:true,method:'owner_authorized_access_adoption',manifestHash:'manifest',
      panel_node_id:6,provider_resource_id:null,addresses:['198.51.100.4'],supported_protocols:['shadowsocks','vless']});
    return {...f,server:{...server,host_ip:'198.51.100.4',lifecycle_protected:true,marzneshin_service_ids:[501],access_pool_id:'pool',
      ownership_provenance:{method:'adopted',environment:'development',access_pool_id:'pool',panel_node_id:6,panel_identity:'panel',verified_at:'2026-10-27T00:00:00Z',
        ss_service_ids:[501],purpose:'owner_authorized_shared_node_customer_access',manifest_hash:'manifest'}}};
  }
  it('allows a registered shared DEV destination but still refuses lifecycle ownership',async()=>{
    const f=await fixture();
    await expect(assertDestinationRegistration({context:f.context,resource:f.server})).resolves.toMatchObject({protected:true});
    await expect(assertResourceRegistration({context:f.context,resource:f.server})).rejects.toMatchObject({code:'PROTECTED_RESOURCE'});
  });
  it.each(['manifest','address','provider','purpose'])('rejects changed shared destination %s',async kind=>{
    const f=await fixture();
    if(kind==='manifest')f.server.ownership_provenance.manifest_hash='changed';
    if(kind==='address')f.server.host_ip='198.51.100.99';
    if(kind==='provider')f.server.provider_resource_id='live-vm';
    if(kind==='purpose')f.server.ownership_provenance.purpose='unknown';
    await expect(assertDestinationRegistration({context:f.context,resource:f.server})).rejects.toThrow();
  });
  async function liveFixture(){
    const f=await fixture();const users=new Map();f.own('service','502');
    const inbounds=[{id:81,protocol:'vless',node:{id:6}},{id:82,protocol:'shadowsocks',node:{id:6}}];
    const hosts=inbounds.map(row=>({id:row.id,inbound_id:row.id,address:f.server.host_ip,port:row.protocol==='vless'?443:8388,
      service_ids:[row.protocol==='vless'?502:501],is_disabled:false,reality_public_key:'public',reality_short_ids:['abcd'],sni:'example.com'}));
    const transport={identity:'https://panel.example',list:vi.fn(async path=>path==='/api/inbounds'?inbounds:hosts.filter(h=>path===`/api/inbounds/${h.inbound_id}/hosts`)),
      request:vi.fn(async({path,method,body})=>{
        if(path==='/api/nodes/6')return {status:200,data:{id:6,address:f.server.host_ip,status:'healthy'}};
        if(path.startsWith('/api/services/'))return {status:200,data:{inbound_ids:[path.endsWith('/502')?81:82]}};
        if(method==='POST'){users.set(body.username,{...body,key:'secret'});return {status:200};}
        const username=path.split('/').at(-1);
        if(method==='DELETE'){users.delete(username);return {status:204};}
        if(method==='PUT' && users.has(username))Object.assign(users.get(username),body);
        return {status:users.has(username)?200:404,data:users.get(username)};
      })};
    return {...f,transport,users};
  }
  it('verifies both shared destination service bindings with GET requests only',async()=>{
    const f=await liveFixture();
    const target=await readSharedDestination({context:f.context,server:f.server,panelTransport:f.transport});
    expect(target.serviceIds).toEqual([501,502]);
    expect(f.users.size).toBe(0);
    const writes=f.transport.request.mock.calls.map(([args])=>args).filter(args=>['POST','PUT','DELETE'].includes(args.method));
    expect(writes).toEqual([]);
  });
  it('updates only the owned customer when assigning the existing shared SS service',async()=>{
    const f=await liveFixture();f.own('user','dev-customer');f.own('service','503');
    f.users.set('dev-customer',{username:'dev-customer',key:'unchanged',service_ids:[503],data_limit:1000,used_traffic:42,enabled:true});
    const panel=createLivePanelAdapter({context:f.context,transport:f.transport,store:{},getLease:()=>f.operation});
    const current=await panel.readUser({userId:'dev-customer'});
    await panel.updateUserServices({userId:'dev-customer',expectedVersion:current.version,expectedServiceIds:[503],serviceIds:[501],destination:f.server});
    expect(f.users.get('dev-customer')).toMatchObject({key:'unchanged',service_ids:[501],data_limit:1000,used_traffic:42});
    const writes=f.transport.request.mock.calls.map(([args])=>args).filter(args=>['POST','PUT','DELETE'].includes(args.method));
    expect(writes.map(args=>[args.method,args.path])).toEqual([['PUT','/api/users/dev-customer']]);
    expect(f.records.has('service:501')).toBe(false);
  });
  it('rejects a shared SS service spanning another node without creating a probe',async()=>{
    const f=await liveFixture();const original=f.transport.request.getMockImplementation();
    f.transport.request.mockImplementation(async args=>args.path==='/api/services/501'?{status:200,data:{inbound_ids:[82,99]}}:original(args));
    await expect(readSharedDestination({context:f.context,server:f.server,panelTransport:f.transport})).rejects.toMatchObject({code:'SHARED_DESTINATION_UNVERIFIED'});
    expect(f.users.size).toBe(0);
  });
  it('requires lifecycle-owned bindings for an ordinary owned destination',async()=>{
    const f=await liveFixture();
    Object.assign(f.server,{protected:false,lifecycle_protected:false,provider_resource_id:f.resource.id});
    f.records.set('server:shared',{...f.server});
    f.own('node','6');f.own('service','501');
    for(const id of ['81','82']){f.own('inbound',id);f.own('host',id);}
    await expect(readDestinationAccess({context:f.context,server:f.server,panelTransport:f.transport})).resolves.toMatchObject({serviceIds:[501,502]});
    f.records.delete('service:501');
    await expect(readDestinationAccess({context:f.context,server:f.server,panelTransport:f.transport})).rejects.toMatchObject({code:'RESOURCE_SCOPE_MISMATCH'});
  });
  it('resolves inherited legacy host ports and Reality settings without rewriting hosts',async()=>{
    const f=await liveFixture();
    const list=f.transport.list.getMockImplementation();
    f.transport.list.mockImplementation(async path=>(await list(path)).map(row=>path==='/api/inbounds'?
      {...row,config:JSON.stringify({port:row.protocol==='vless'?443:1080,pbk:'inherited-public',sid:'1234'})}:
      {...row,port:null,reality_public_key:null,reality_short_ids:null}));
    const target=await readSharedDestination({context:f.context,server:f.server,panelTransport:f.transport});
    expect(target.connections).toMatchObject({vless:{port:443,publicKey:'inherited-public',shortIds:['1234']},shadowsocks:{port:1080}});
    expect(target.endpoint.port).toBe(0);
    expect(f.transport.request.mock.calls.every(([r])=>!r.method || r.method==='GET')).toBe(true);
  });
});
