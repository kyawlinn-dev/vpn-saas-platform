import {createHash} from 'node:crypto';
import ssh2 from 'ssh2';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {createLiveInfrastructureRuntime} from '../services/infrastructure/liveRuntime.js';
import {isRunnerPath} from '../services/infrastructure/runnerProtocol.js';
import {createInfrastructureStore} from '../services/infrastructure/liveStore.js';
import {provisioningLocation} from '../services/serverDisplay.js';

const region='jp-tokyo-1',zone='jp-tokyo-1-a',planId='intel-c1m2-bgp-t1000-s50-d0';
function fixture(){
  let pair;
  do{pair=ssh2.utils.generateKeyPairSync('ed25519');}while(ssh2.utils.parseKey(pair.private) instanceof Error);
  const token='fixture-token',accountId='9c86ece0-1500-4000-8000-000000000001';
  const identity={environment:'development',databaseIdentity:'dev.supabase.co',panelIdentity:'https://panel.example',poolId:'pool'};
  const anchor={ecsResourceUUID:'ecs-anchor',regionCode:region,zoneCode:zone,createTime:'2026-11-01 00:00:00',publicIpAddress:'192.0.2.15'};
  const connection={id:accountId,credentialSha256:createHash('sha256').update(token).digest('hex'),attestedAt:new Date().toISOString(),firstContactPolicy:'tofu',
    anchor:{resourceId:anchor.ecsResourceUUID,region,zone,createdAt:anchor.createTime,address:anchor.publicIpAddress}};
  const machine={zone,imageResourceUUID:'img-ubuntu'};
  const provider={accountId,connection,regionalMachines:{[region]:{dual:machine,vless_only:machine}},prices:[{region,zone,packageCode:planId,currency:'USD',hourly:.012,monthlyEstimate:7.71,referenceHours:730,verifiedAt:new Date(Date.now()-1000).toISOString(),source:'Owner console',includedTrafficGb:1000}]};
  const operatorConfig={managementSources:['192.0.2.2'],protectedResourceIds:['ecs-anchor'],protectedAddresses:['192.0.2.15'],maxActiveKeys:100,realityServerName:'example.com',providers:{lightnode:provider}};
  const env={SERVER_OPERATIONS_WORKER_ENABLED:'true',PUBLIC_SERVER_ACCESS_ENABLED:'true',SERVER_LIFECYCLE_COORDINATION_ENABLED:'true',SERVER_ACCESS_ENVIRONMENT:'development',
    SERVER_ACCESS_DATABASE_IDENTITY:identity.databaseIdentity,SERVER_ACCESS_PANEL_IDENTITY:identity.panelIdentity,SERVER_ACCESS_POOL_ID:'pool',SUPABASE_URL:'https://dev.supabase.co',
    MARZNESHIN_PANEL_URL:identity.panelIdentity,MARZNESHIN_PANEL_USERNAME:'fixture',MARZNESHIN_PANEL_PASSWORD:'fixture',LIGHTNODE_API_KEY:token};
  const binding={database_identity:identity.databaseIdentity,panel_identity:identity.panelIdentity,provider_accounts:{lightnode:accountId}};
  const client={from:table=>{const chain={select:()=>chain,eq:()=>chain,maybeSingle:async()=>({data:table==='server_access_pools'?{id:'pool',panel_identity:identity.panelIdentity,vless_service_id:14}:binding})};return chain;},
    rpc:vi.fn(async(name,args)=>({data:name==='read_server_infrastructure_resource'?{...identity,id:'14',kind:'service',protected:false}:null}))};
  const fetchImpl=vi.fn(async(url,options)=>{
    const path=new URL(url).pathname;
    const data=path==='/api/admins/token'?{access_token:'fixture'}:path==='/api/services/14'?{id:14,inbound_ids:[]}:
      path==='/instance/detail'?{instance:anchor}:path==='/region/list'?{regions:[{regionCode:region,regionName:'Tokyo',zones:[{zoneCode:zone,zoneName:'Tokyo A'}]}],rowCount:1}:
      path==='/image/list'?{images:[{imageResourceUUID:'img-ubuntu',imageType:'System',imageAccount:'root',osVersion:'linux',osDistroVersion:'Ubuntu',osVersionDetail:'Ubuntu 22.04'}],rowCount:1}:
      path==='/package/list'?{packages:[{regionCode:region,zoneCode:zone,packageCode:planId,cpu:1,memory:2,systemDiskSize:50,dataDiskSize:0,freeFlow:1000,publicIpChargeMode:'PayByTraffic'}],rowCount:1}:{};
    return new Response(JSON.stringify(data),{status:200});
  });
  const sessionFactory=vi.fn();
  return {identity,provider,anchor,env,client,fetchImpl,sessionFactory,input:{env,client,fetchImpl,sessionFactory,operatorConfig,privateKey:pair.private}};
}
describe('LightNode common lifecycle composition',()=>{
  it('cancels an allocated VPS with verified API ownership when SSH never becomes ready',async()=>{
    vi.stubEnv('BOT_TOKEN_ENCRYPTION_KEY','a'.repeat(64));const f=fixture(),states=new Map(),records=new Map();
    let intent=null,deleted=false;
    const lease={id:'11111111-1111-4111-8111-111111111111',owner:'worker',fence:1};
    const operation={id:lease.id,kind:'add',status:'running',stage:'provisioning',lease_owner:lease.owner,fence:1,lease_until:new Date(Date.now()+3600000).toISOString(),checkpoint:{},control_requested:null,
      payload:{provider:'lightnode',region,plan_id:planId,supported_protocols:['vless'],confirmations:{cost:true}}};
    const raw={ecsResourceUUID:'ecs-new',regionCode:region,zoneCode:zone,createTime:'2026-11-01 16:00:00',publicIpAddress:'198.51.100.50',imageResourceUUID:'img-ubuntu',
      ecsStatus:'STARTED',ecsPendingStatus:'NONE',internetChargeType:'PAY_BY_TRAFFIC',cpu:1,memory:2,systemDiskSize:50,dataDiskSize:0,freeFlow:1000,snapshotNum:0,systemDiskResourceUUID:'disk-new',publicIpResourceUUID:'eip-new',secondaryPublicIpInfoList:[]};
    const fallback=f.fetchImpl.getMockImplementation();
    f.fetchImpl.mockImplementation(async(url,options)=>{
      const u=new URL(url),p=u.pathname;
      if(p==='/instance/create')return new Response(JSON.stringify({asyncTaskInfo:{ecsResourceUUID:'ecs-new',asyncTaskUUID:'task-create'}}),{status:202});
      if(p==='/instance/release'){deleted=true;return new Response(JSON.stringify({asyncTaskInfo:{ecsResourceUUID:'ecs-new',asyncTaskUUID:'task-delete'}}),{status:202});}
      if(p==='/asynctask/getResult')return new Response(JSON.stringify({asyncTaskInfo:{taskStatus:'FINISHED',processResult:'SUCCESS'}}),{status:202});
      if(p==='/instance/detail'&&u.searchParams.get('ecsResourceUUID')==='ecs-new')return new Response(JSON.stringify(deleted?{code:'NotFound'}:{instance:raw}),{status:deleted?404:202});
      return fallback(url,options);
    });
    f.client.rpc.mockImplementation(async(name,args)=>{
      if(name==='read_server_operation_summary')return{data:operation};
      if(name==='read_server_provider_intent')return{data:intent};
      if(name==='claim_server_provider_intent'){intent=args.p_body;return{data:true};}
      if(name==='read_server_infrastructure_resource')return{data:args.p_kind==='service'?{...f.identity,id:'14',kind:'service',protected:false}:records.get(args.p_resource_id)||null};
      if(name==='register_server_infrastructure_resource'){records.set(args.p_resource_id,args.p_body);return{data:args.p_body};}
      if(name==='read_server_infrastructure_state')return{data:states.get(args.p_state_key)||null};
      if(name==='write_server_infrastructure_state'){
        const previous=states.get(args.p_state_key);expect(previous?.version??null).toBe(args.p_expected_version);
        states.set(args.p_state_key,{ciphertext:args.p_ciphertext,version:(previous?.version||0)+1});return{data:true};
      }
      if(name==='renew_server_operation_lease')return{data:true};
      throw Error('Unexpected RPC '+name);
    });
    const observeHostKey=vi.fn(async()=>{throw Object.assign(Error('pending'),{code:'NODE_BOOTSTRAP_PENDING'});});
    const runtime=await createLiveInfrastructureRuntime({...f.input,observeHostKey});
    operation.payload.quote=await runtime.providers.lightnode.quote({region,planId});
    const input={lease,operation};
    await expect(runtime.withLease(lease,()=>runtime.adapters.provision(input))).rejects.toMatchObject({code:'NODE_BOOTSTRAP_PENDING'});
    operation.control_requested='cancel';
    const result=await runtime.withLease(lease,()=>runtime.adapters.cancelUnpublished(input));
    expect(result).toMatchObject({published:false,resourcesAbsent:true,billingClear:true,billingAssurance:{scope:'instance-package',externalAttachmentsVerified:false}});
    expect(f.fetchImpl.mock.calls.filter(([url])=>new URL(url).pathname==='/instance/create')).toHaveLength(1);
    expect(f.fetchImpl.mock.calls.filter(([url])=>new URL(url).pathname==='/instance/release')).toHaveLength(1);
    expect(observeHostKey).toHaveBeenCalledTimes(1);expect(f.sessionFactory).not.toHaveBeenCalled();
    expect(records.get('ecs-new')).toMatchObject({sshEnrollment:'cancelled_before_enrollment'});
    expect(records.get('ecs-new').sshHostKeySha256).toBeUndefined();
  });
  afterEach(()=>vi.unstubAllEnvs());
  it('composes read-only, reuses global VLESS 14, and exposes both configured profiles',async()=>{
    vi.stubEnv('BOT_TOKEN_ENCRYPTION_KEY','a'.repeat(64));const f=fixture();
    const runtime=await createLiveInfrastructureRuntime(f.input);
    expect(runtime.providerReadiness).toContainEqual(expect.objectContaining({id:'lightnode',ready:true,profiles:['dual','vless_only']}));
    expect(runtime.context.publicServiceId).toBe('14');expect(runtime.executionReady).toBe(true);
    expect((await runtime.getCatalog({provider:'lightnode',region})).plans[0]).toMatchObject({id:planId,compatible:true,price:{hourly:null,monthly:null}});
    expect(await runtime.providers.lightnode.quote({region,planId})).toMatchObject({provider:'lightnode',recurringAmount:null,trafficTerms:{billing:{kind:'provider_pricing'}}});
    await runtime.assertProvisionable({provider:'lightnode',region,planId,profile:'vless_only'});
    expect(f.sessionFactory).not.toHaveBeenCalled();
    expect(f.fetchImpl.mock.calls.filter(([,o])=>o.method!=='GET').map(([url])=>new URL(url).pathname)).toEqual(['/api/admins/token']);
    expect(f.client.rpc.mock.calls.every(([name])=>name==='read_server_infrastructure_resource')).toBe(true);
  });
  it('keeps history readable but purchases unavailable after token identity changes',async()=>{
    const f=fixture();f.env.LIGHTNODE_API_KEY='different-token';
    const runtime=await createLiveInfrastructureRuntime(f.input);
    expect(runtime.executionReady).toBe(false);expect(runtime.recoveryReady).toBe(false);
    expect(runtime.providerReadiness).toContainEqual(expect.objectContaining({id:'lightnode',ready:false,reason:'PROVIDER_ACCOUNT_MISMATCH'}));
    expect(f.sessionFactory).not.toHaveBeenCalled();
  });
  it('allows only the existing scoped catalogue route for LightNode through the runner',()=>{
    expect(isRunnerPath('GET',`/operations/catalog?provider=lightnode&region=${region}`)).toBe(true);
    expect(isRunnerPath('GET','/operations/catalog?provider=lightnode&region=../production')).toBe(false);
  });
  it('permits a LightNode registry key without changing the fence or protected receipt',async()=>{
    const client={rpc:vi.fn(async()=>({data:{protected:true}}))};
    const store=createInfrastructureStore({context:{environment:'development',poolId:'pool',databaseIdentity:'db',panelIdentity:'panel'},client,getLease:()=>({id:'op',owner:'worker',fence:2})});
    expect(await store.getResource({kind:'provider',id:'ecs-anchor',provider:'lightnode'})).toEqual({protected:true});
    expect(client.rpc.mock.calls[0][1]).toMatchObject({p_provider:'lightnode',p_environment:'development'});
  });
  it('derives Tokyo country flag from LightNode region metadata',()=>{
    expect(provisioningLocation({provider:'lightnode',region,metadata:{city:'Tokyo',country:'JP'}})).toMatchObject({city:'Tokyo',country:'Japan',countryCode:'JP',flag:'🇯🇵'});
  });
});
