import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLiveInfrastructureRuntime } from '../services/infrastructure/liveRuntime.js';
import ssh2 from 'ssh2';

function fixtureKeyPair(){
  // ssh2 can occasionally generate a fixture that its OpenSSH parser rejects.
  for(let attempt=0;attempt<8;attempt++){
    const pair=ssh2.utils.generateKeyPairSync('ed25519');
    const parsed=ssh2.utils.parseKey(pair.private);
    if(!(parsed instanceof Error) && !Array.isArray(parsed) && parsed?.isPrivateKey?.())return pair;
  }
  throw Error('Unable to generate a valid SSH fixture');
}

function sharedNodeFixture(environment = 'development') {
  const pair=fixtureKeyPair();
  const identity={environment,databaseIdentity:environment==='production'?'prod.supabase.co':'dev.supabase.co',panelIdentity:'https://panel.example',poolId:'pool'};
  const service={...identity,id:'502',kind:'service',protected:false};
  const server={id:'shared-server',environment,access_pool_id:'pool',panel_node_id:51,panel_type:'marzneshin',
    host_ip:'198.51.100.22',provider_resource_id:null,lifecycle_protected:true,supported_protocols:['vless'],
    ownership_provenance:{method:'adopted',environment,access_pool_id:'pool',panel_identity:identity.panelIdentity,
      panel_node_id:51,verified_at:'2026-10-26T00:00:00Z',manifest_hash:'fixture',purpose:'owner_authorized_shared_node_customer_access'}};
  const receipt={...identity,id:server.id,kind:'server',protected:true,panel_node_id:51,provider_resource_id:null,
    addresses:[server.host_ip],supported_protocols:['vless'],manifestHash:'fixture',method:'owner_authorized_access_adoption'};
  const env={SERVER_OPERATIONS_WORKER_ENABLED:'true',PUBLIC_SERVER_ACCESS_ENABLED:'true',SERVER_LIFECYCLE_COORDINATION_ENABLED:'true',
    SERVER_ACCESS_ENVIRONMENT:identity.environment,SERVER_ACCESS_DATABASE_IDENTITY:identity.databaseIdentity,SERVER_ACCESS_PANEL_IDENTITY:identity.panelIdentity,
    SERVER_ACCESS_POOL_ID:'pool',SUPABASE_URL:'https://'+identity.databaseIdentity,MARZNESHIN_PANEL_URL:identity.panelIdentity,
    MARZNESHIN_PANEL_USERNAME:'fixture',MARZNESHIN_PANEL_PASSWORD:'fixture',DIGITALOCEAN_TOKEN:'fixture'};
  const machine={image:'ubuntu-22-04-x64',sshKeyIds:['fixture'],firewallId:'fixture',firewallTag:'fixture'};
  const operatorConfig={managementSources:['192.0.2.2'],protectedResourceIds:[],protectedAddresses:['192.0.2.1'],maxActiveKeys:100,realityServerName:'example.com',
    providers:{digitalocean:{accountId:'account',machines:{dual:machine,vless_only:machine},regions:[{id:'sgp1',plans:[{id:'s-1vcpu-1gb'}]}]}}};
  const pool={id:'pool',environment,panel_identity:identity.panelIdentity,vless_service_id:502};
  const binding={database_identity:identity.databaseIdentity,panel_identity:identity.panelIdentity,provider_accounts:{digitalocean:'account'}};
  const client={from:table=>{const chain={select:()=>chain,eq:()=>chain,maybeSingle:async()=>({data:table==='server_access_pools'?pool:table==='vpn_servers'?server:binding})};return chain;},
    rpc:vi.fn(async(_name,args)=>({data:args.p_kind==='service'?service:args.p_kind==='server'?receipt:null}))};
  const fetchImpl=vi.fn(async(url)=>{
    const path=new URL(url).pathname;
    const firewall={id:path.split('/').at(-1),tags:['fixture'],inbound_rules:[22,62050,443,...(path.endsWith('fixture-dual')?[8388]:[])].map(port=>({protocol:'tcp',ports:String(port),sources:{addresses:port===22||port===62050?['192.0.2.2/32']:['0.0.0.0/0']}}))};
    if(path.endsWith('fixture-dual'))firewall.inbound_rules.push({protocol:'udp',ports:'8388',sources:{addresses:['0.0.0.0/0']}});
    const body=path==='/api/admins/token'?{access_token:'fixture'}:path==='/v2/account'?{account:{uuid:'account'}}:
      path==='/v2/account/keys'?{ssh_keys:[{id:'fixture',public_key:pair.public}],links:{}}:path.startsWith('/v2/firewalls/')?{firewall}:
      path==='/api/inbounds/8'?{id:8,protocol:'vless',node:{id:51}}:path==='/api/nodes/51'?{id:51,address:'198.51.100.22'}:{id:502,inbound_ids:[8]};
    return new Response(JSON.stringify(body),{status:200});
  });
  const sessionFactory=vi.fn();
  operatorConfig.providers.digitalocean.machines.dual={...machine,firewallId:'fixture-dual'};
  return {server,receipt,client,fetchImpl,sessionFactory,input:{env,client,fetchImpl,sessionFactory,operatorConfig,privateKey:pair.private}};
}
describe('owner-started infrastructure composition',()=>{
  it('accepts hash-adopted protected production nodes with production receipts, without claiming inbounds', async()=>{
    vi.stubEnv('BOT_TOKEN_ENCRYPTION_KEY','a'.repeat(64));
    const f=sharedNodeFixture('production');
    const runtime=await createLiveInfrastructureRuntime(f.input);
    expect(runtime.executionReady).toBe(true);
    expect(f.sessionFactory).not.toHaveBeenCalled();
    expect(f.fetchImpl.mock.calls.filter(([,options])=>options.method!=='GET').map(([url])=>new URL(url).pathname)).toEqual(['/api/admins/token']);
  });
  it('rejects a development receipt presented for a protected production node',async()=>{
    vi.stubEnv('BOT_TOKEN_ENCRYPTION_KEY','a'.repeat(64));
    const f=sharedNodeFixture('production');f.receipt.environment='development';
    await expect(createLiveInfrastructureRuntime(f.input)).rejects.toMatchObject({code:'RESOURCE_SCOPE_MISMATCH'});
  });
  it('remote mode refuses local adapter composition before reading credentials or contacting providers', async () => {
    const fetchImpl = vi.fn();
    expect(await createLiveInfrastructureRuntime({env:{SERVER_OPERATIONS_WORKER_ENABLED:'true',SERVER_OPERATIONS_EXECUTION_MODE:'remote'},fetchImpl})).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  afterEach(()=>vi.unstubAllEnvs());
  it('accepts explicitly adopted protected DEV access nodes without claiming their live inbounds',async()=>{
    vi.stubEnv('BOT_TOKEN_ENCRYPTION_KEY','a'.repeat(64));
    const f=sharedNodeFixture();
    const runtime=await createLiveInfrastructureRuntime(f.input);
    expect(runtime.executionReady).toBe(true);
    expect(f.sessionFactory).not.toHaveBeenCalled();
    expect(f.client.rpc.mock.calls.every(([name])=>name==='read_server_infrastructure_resource')).toBe(true);
    expect(f.fetchImpl.mock.calls.filter(([,options])=>options.method!=='GET').map(([url])=>new URL(url).pathname)).toEqual(['/api/admins/token']);
  });
  it('keeps a configured provider and operation history available when the other vendor is not configured',async()=>{
    vi.stubEnv('BOT_TOKEN_ENCRYPTION_KEY','a'.repeat(64));
    const f=sharedNodeFixture();delete f.input.operatorConfig.providers.digitalocean.regions;
    f.input.operatorConfig.providers.vultr={};
    const runtime=await createLiveInfrastructureRuntime(f.input);
    expect(runtime.providerReadiness).toEqual(expect.arrayContaining([
      expect.objectContaining({id:'digitalocean',ready:true}),
      expect.objectContaining({id:'vultr',ready:false,reason:'PROVIDER_ACCOUNT_NOT_REGISTERED'}),
    ]));
    expect(runtime.executionReady).toBe(true);
  });
  it('keeps recovery available when purchase bootstrap setup is no longer ready', async () => {
    vi.stubEnv('BOT_TOKEN_ENCRYPTION_KEY', 'a'.repeat(64));
    const f = sharedNodeFixture();
    delete f.input.operatorConfig.providers.digitalocean.machines;
    const runtime = await createLiveInfrastructureRuntime(f.input);
    expect(runtime.executionReady).toBe(false);
    expect(runtime.recoveryReady).toBe(true);
    expect(await runtime.canRunOperation({ stage: 'provisioning', control_requested: 'cancel', payload: { provider: 'digitalocean' } })).toBe(true);
    runtime.repository.getServer = vi.fn(async () => { throw new Error('Unavailable source must not block cancellation'); });
    expect(await runtime.canRunOperation({ kind: 'replace', stage: 'configuring', control_requested: 'cancel', payload: { provider: 'digitalocean', source_server_id: 'offline-source' } })).toBe(true);
    expect(runtime.repository.getServer).not.toHaveBeenCalled();
    await expect(runtime.assertProvisionable({ provider: 'digitalocean', region: 'sgp1', planId: 'small', profile: 'vless_only' })).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
  });
  it.each(['wrong_address','missing_receipt','unprotected','foreign_scope','wrong_purpose'])('rejects an unverified shared inbound: %s',async(kind)=>{
    vi.stubEnv('BOT_TOKEN_ENCRYPTION_KEY','a'.repeat(64));
    const f=sharedNodeFixture();
    if(kind==='wrong_address')f.server.host_ip='198.51.100.99';
    if(kind==='missing_receipt')f.client.rpc.mockImplementation(async(_name,args)=>({data:args.p_kind==='service'?{id:'502',kind:'service',environment:'development',databaseIdentity:'dev.supabase.co',panelIdentity:'https://panel.example',poolId:'pool',protected:false}:null}));
    if(kind==='unprotected')f.server.lifecycle_protected=false;
    if(kind==='foreign_scope')f.server.environment='production';
    if(kind==='wrong_purpose')f.server.ownership_provenance.purpose='unverified';
    await expect(createLiveInfrastructureRuntime(f.input)).rejects.toMatchObject({code:'RESOURCE_SCOPE_MISMATCH'});
    expect(f.sessionFactory).not.toHaveBeenCalled();
  });
  it('composes a verified development runtime without provisioning, changing the panel, or opening SSH',async()=>{
    vi.stubEnv('BOT_TOKEN_ENCRYPTION_KEY','a'.repeat(64));
    const env={SERVER_OPERATIONS_WORKER_ENABLED:'true',PUBLIC_SERVER_ACCESS_ENABLED:'true',SERVER_LIFECYCLE_COORDINATION_ENABLED:'true',
      SERVER_ACCESS_ENVIRONMENT:'development',SERVER_ACCESS_DATABASE_IDENTITY:'dev.supabase.co',SERVER_ACCESS_PANEL_IDENTITY:'https://panel.example',SERVER_ACCESS_POOL_ID:'pool',
      SUPABASE_URL:'https://dev.supabase.co',MARZNESHIN_PANEL_URL:'https://panel.example',MARZNESHIN_PANEL_USERNAME:'fixture',MARZNESHIN_PANEL_PASSWORD:'fixture',DIGITALOCEAN_TOKEN:'fixture'};
    const binding={database_identity:'dev.supabase.co',panel_identity:'https://panel.example',provider_accounts:{digitalocean:'account'}};
    const client={from:table=>{const chain={select:()=>chain,eq:()=>chain,maybeSingle:async()=>({data:table==='server_access_pools'?{id:'pool',panel_identity:'https://panel.example',vless_service_id:502}:binding})};return chain;},
      rpc:vi.fn(async()=>({data:{id:'502',kind:'service',environment:'development',databaseIdentity:'dev.supabase.co',panelIdentity:'https://panel.example',poolId:'pool',protected:false}}))};
    const pair=fixtureKeyPair();
    const fetchImpl=vi.fn(async(url,options)=>{
      const path=new URL(url).pathname;
      const firewall={id:'fixture-firewall',tags:['fixture-tag'],inbound_rules:[22,62050,443].map(port=>({protocol:'tcp',ports:String(port),sources:{addresses:port===443?['0.0.0.0/0']:['192.0.2.2/32']}}))};
      return new Response(JSON.stringify(path==='/api/admins/token'?{access_token:'fixture'}:path==='/v2/account'?{account:{uuid:'account'}}:
        path==='/v2/account/keys'?{ssh_keys:[{id:'fixture-key-id',public_key:pair.public}],links:{}}:path.startsWith('/v2/firewalls/')?{firewall}:{id:502,inbound_ids:[]}),{status:200});
    });
    const sessionFactory=vi.fn();
    const machine={image:'ubuntu-22-04-x64',sshKeyIds:['fixture-key-id'],firewallId:'fixture-firewall',firewallTag:'fixture-tag'};
    const operatorConfig={providers:{digitalocean:{accountId:'account',machines:{dual:machine,vless_only:machine},regions:[{id:'sgp1',plans:[{id:'s-1vcpu-1gb'}]}]}},
      managementSources:['192.0.2.2'],protectedResourceIds:[],protectedAddresses:['192.0.2.1'],maxActiveKeys:100,realityServerName:'example.com'};
    const runtime=await createLiveInfrastructureRuntime({env,client,fetchImpl,privateKey:pair.private,sessionFactory,operatorConfig});
    expect(runtime.executionReady).toBe(true);
    expect(runtime.context.executionMode).toBe('live');
    expect(sessionFactory).not.toHaveBeenCalled();
    expect(fetchImpl.mock.calls.filter(([,options])=>options.method!=='GET').map(([url])=>new URL(url).pathname)).toEqual(['/api/admins/token']);
    const resource={id:'vm',provider:'digitalocean',accountId:'account',createdAt:'2026-10-23',addresses:['198.51.100.2']};
    client.rpc.mockResolvedValueOnce({data:{payload:{delete_scope:{...resource,resourceId:'vm',approved:true},confirmations:{delete_source:true}}}});
    expect(await runtime.context.adapters.assertDeletionScope({resource,operation:{id:'op'},attachments:{complete:true,items:[{id:'foreign-volume',type:'volume'}]}})).toBe(false);
    fetchImpl.mockClear();
    await expect(createLiveInfrastructureRuntime({env,client,fetchImpl,privateKey:'invalid-private-key',operatorConfig})).rejects.toMatchObject({code:'INFRASTRUCTURE_SSH_KEY_UNAVAILABLE'});
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('does no network or database work when execution was not explicitly enabled',async()=>{
    const client={from:vi.fn(),rpc:vi.fn()},fetchImpl=vi.fn();
    expect(await createLiveInfrastructureRuntime({env:{},client,fetchImpl})).toBeNull();
    expect(client.from).not.toHaveBeenCalled();expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('rejects incomplete configuration before contacting providers',async()=>{
    const fetchImpl=vi.fn();
    await expect(createLiveInfrastructureRuntime({env:{SERVER_OPERATIONS_WORKER_ENABLED:'true'},client:{},fetchImpl,operatorConfig:{}})).rejects.toMatchObject({code:'INFRASTRUCTURE_CONFIGURATION_REQUIRED'});
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
