import { AsyncLocalStorage } from 'node:async_hooks';
import { readFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { createInfrastructureContext } from './context.js';
import { verifyLiveRuntime } from './liveRuntimeVerification.js';
import { createInfrastructureStore } from './liveStore.js';
import { createLiveRuntimeRepository } from './liveRuntimeRepository.js';
import { createLiveInventoryRepository } from './liveInventoryRepository.js';
import { createLiveOperationAdapters } from './liveOperationAdapters.js';
import { createLivePanelAdapter } from './livePanelAdapter.js';
import { createLiveNodeAdapter } from './liveNodeAdapter.js';
import { createLiveProbes } from './liveProbes.js';
import { connectPanelTransport } from './livePanelTransport.js';
import { connectProviderTransport } from './providers/liveTransport.js';
import { createLiveProviderCatalog } from './providers/liveCatalog.js';
import { createDigitalOceanProvider } from './providers/digitalOcean.js';
import { createVultrProvider } from './providers/vultr.js';
import { createLightNodeProvider } from './providers/lightnode.js';
import { connectLightNodeTransport } from './providers/lightnodeTransport.js';
import { createLightNodeCatalog } from './providers/lightnodeCatalog.js';
import { observeLightNodeHostKey, hardenLightNodeSsh } from './lightnodeBootstrap.js';
import { verifyProviderFirewall } from './liveFirewall.js';
import { assertResourceRegistration, assertResourceOwnership, assertOperationAuthority } from './ownership.js';
import { infrastructureError, payloadHash } from './repository.js';
import { encrypt } from '../../lib/tokenEncryption.js';
import { readExistingCandidate as loadExistingCandidate } from './liveExistingCandidate.js';
import { createLiveLinkVerifier } from './liveLinkVerifier.js';
import { privateSshPublicKey, matchesSshPublicKey } from './liveSsh.js';
import { selectServiceIds } from '../serverAccessPolicy.js';
import { createProviderCatalogService } from './providers/catalogService.js';
import { createProviderSetup } from './providers/providerSetup.js';
import { provisioningLocation } from '../serverDisplay.js';

const fail = code => { throw infrastructureError(code); };
const profileFor = operation => operation.payload.supported_protocols.includes('shadowsocks') ? 'dual' : 'vless_only';
export async function createLiveInfrastructureRuntime({env=process.env,client,operatorConfig,fetchImpl=globalThis.fetch,privateKey,sessionFactory,observeHostKey=observeLightNodeHostKey}={}) {
  if(env.SERVER_OPERATIONS_EXECUTION_MODE==='remote')return null;
  if(env.SERVER_OPERATIONS_WORKER_ENABLED!=='true') return null;
  if(!operatorConfig) {
    try {operatorConfig=JSON.parse(await readFile(env.SERVER_INFRASTRUCTURE_CONFIG_PATH,'utf8'));}
    catch {fail('INFRASTRUCTURE_CONFIGURATION_REQUIRED');}
  }
  const settings=operatorConfig;
  if(env.PUBLIC_SERVER_ACCESS_ENABLED!=='true' || env.SERVER_LIFECYCLE_COORDINATION_ENABLED!=='true' ||
    !['development','production'].includes(env.SERVER_ACCESS_ENVIRONMENT) || !env.SERVER_ACCESS_DATABASE_IDENTITY || !env.SERVER_ACCESS_PANEL_IDENTITY || !env.SERVER_ACCESS_POOL_ID ||
    !env.MARZNESHIN_PANEL_USERNAME || !env.MARZNESHIN_PANEL_PASSWORD || !env.MARZNESHIN_PANEL_URL ||
    !settings.providers || !Object.keys(settings.providers).length || Object.keys(settings.providers).some(name=>!['digitalocean','vultr','lightnode'].includes(name)) ||
    !Array.isArray(settings.managementSources) || !settings.managementSources.length || settings.managementSources.some(ip=>!isIP(ip)) ||
    !Array.isArray(settings.protectedResourceIds) || !Array.isArray(settings.protectedAddresses) || !settings.protectedAddresses.length || settings.protectedAddresses.some(ip=>!isIP(ip)) ||
    !Number.isSafeInteger(settings.maxActiveKeys) || settings.maxActiveKeys<1 || settings.maxActiveKeys>100000 ||
    !/^(?=.{1,253}$)[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(settings.realityServerName||'')) fail('INFRASTRUCTURE_CONFIGURATION_REQUIRED');
  if(!client) client=(await import('../../lib/supabase.js')).supabase;
  if(!privateKey) {try{privateKey=await readFile(env.SERVER_BOOTSTRAP_PRIVATE_KEY_PATH,'utf8');}catch{fail('INFRASTRUCTURE_SSH_KEY_UNAVAILABLE');}}
  const publicKey=privateSshPublicKey(privateKey);
  const panelTransport=await connectPanelTransport({baseUrl:env.MARZNESHIN_PANEL_URL,username:env.MARZNESHIN_PANEL_USERNAME,password:env.MARZNESHIN_PANEL_PASSWORD,fetchImpl});
  if(panelTransport.identity!==env.SERVER_ACCESS_PANEL_IDENTITY) fail('RESOURCE_SCOPE_MISMATCH');
  const {data:pool,error:poolError}=await client.from('server_access_pools').select('*').eq('id',env.SERVER_ACCESS_POOL_ID).eq('environment',env.SERVER_ACCESS_ENVIRONMENT).maybeSingle();
  if(poolError || !pool || pool.panel_identity!==panelTransport.identity || !Number.isSafeInteger(pool.vless_service_id) || pool.vless_service_id<=0) fail('RESOURCE_SCOPE_MISMATCH');
  const {data:binding,error:bindingError}=await client.from('server_operation_runtime_bindings').select('*')
    .eq('environment',env.SERVER_ACCESS_ENVIRONMENT).eq('access_pool_id',pool.id).maybeSingle();
  if(bindingError || !binding?.provider_accounts) fail('RESOURCE_SCOPE_MISMATCH');
  const providerAccounts={...binding.provider_accounts},transports={},catalogs={},catalogServices={},setups={},providerReadiness=[];
  for(const name of ['digitalocean','vultr',...(settings.providers.lightnode||providerAccounts.lightnode?['lightnode']:[])]) {
    const providerConfig=settings.providers[name];
    const status={id:name,ready:false,reason:null,profiles:[]};providerReadiness.push(status);
    if(!providerAccounts[name]) {status.reason='PROVIDER_ACCOUNT_NOT_REGISTERED';continue;}
    if(!providerConfig?.accountId || providerConfig.accountId!==providerAccounts[name]) {status.reason='PROVIDER_CONFIGURATION_REQUIRED';continue;}
    try {
      if(name==='lightnode') {
        transports[name]=await connectLightNodeTransport({token:env.LIGHTNODE_API_KEY,expectedAccountId:providerConfig.accountId,connection:providerConfig.connection,fetchImpl});
        catalogs[name]=createLightNodeCatalog({transport:transports[name],config:providerConfig});
        catalogServices[name]=setups[name]=catalogs[name];
        Object.assign(status,await setups[name].inspect());
        continue;
      }
      transports[name]=await connectProviderTransport({provider:name,expectedAccountId:providerConfig.accountId,
        token:name==='digitalocean'?env.DIGITALOCEAN_TOKEN:env.VULTR_API_KEY,fetchImpl});
      catalogs[name]=createLiveProviderCatalog({provider:name,transport:transports[name]});
      catalogServices[name]=createProviderCatalogService({provider:name,catalog:catalogs[name],policy:providerConfig.policy||{}});
      setups[name]=createProviderSetup({provider:name,catalog:catalogs[name],transport:transports[name],config:providerConfig,
        managementSources:settings.managementSources,publicKey});
      Object.assign(status,await setups[name].inspect());
    } catch(error) {
      status.reason=['PROVIDER_ACCOUNT_UNVERIFIED','PROVIDER_ACCOUNT_MISMATCH','PROVIDER_TRANSPORT_CONFIGURATION_REQUIRED'].includes(error.code)?error.code:'PROVIDER_UNAVAILABLE';
    }
  }
  const config={environment:env.SERVER_ACCESS_ENVIRONMENT,databaseIdentity:env.SERVER_ACCESS_DATABASE_IDENTITY,panelIdentity:panelTransport.identity,
    poolId:pool.id,executionMode:'live',providerAccounts,publicServiceId:String(pool.vless_service_id),
    protectedResourceIds:settings.protectedResourceIds,protectedAddresses:settings.protectedAddresses};
  const liveVerification=await verifyLiveRuntime({config,client,supabaseUrl:env.SUPABASE_URL,panel:panelTransport,transports});
  const activeLease=new AsyncLocalStorage();
  const getLease=()=>activeLease.getStore();
  let context,store,repository;
  const currentOperation=async lease=>repository.readOperation({context,operationId:lease.id});
  const assertLease=async({operation})=>{
    const row=await currentOperation(operation);
    return row?.id===operation.id && row.status==='running' && row.lease_owner===operation.owner && Number(row.fence)===operation.fence && Date.parse(row.lease_until)>Date.now();
  };
  const assertCancellationScope=async({operation})=>{
    const row=await currentOperation(operation);
    return row?.id===operation.id&&row.status==='running'&&row.lease_owner===operation.owner&&Number(row.fence)===operation.fence&&
      Date.parse(row.lease_until)>Date.now()&&row.control_requested==='cancel'&&['add','replace'].includes(row.kind)&&!row.checkpoint?.published&&
      ['provisioning','configuring','registering','verifying','inventory','publishing'].includes(row.stage);
  };
  const registry={
    getResource:input=>store.getResource(input),getCreateAttempt:input=>store.getCreateAttempt(input),claimCreateAttempt:input=>store.claimCreateAttempt(input),
    async recordCreatedResource(value,options){
      if(value.kind==='provider') {
        const saved=await store.readState('bootstrap');let bootstrap=saved.value;
        if(value.provider==='lightnode') {
          const attempt=options?.expectedAttempt,receipt=(await store.readState('lightnode-create')).value;
          const lease=getLease();
          if(bootstrap?.mode!=='password-tofu'||!lease||value.operationId!==lease.id||attempt?.operationId!==lease.id||
            !['environment','databaseIdentity','panelIdentity','poolId'].every(key=>value[key]===context[key]&&attempt[key]===context[key])||
            value.accountId!==context.providerAccounts.lightnode||attempt.accountId!==value.accountId||receipt?.resourceId!==value.id||
            value.protected!==false||context.protectedResourceIds.includes(value.id)||value.addresses?.some(ip=>context.protectedAddresses.includes(ip)))fail('RESOURCE_SCOPE_MISMATCH');
          // Verified provider identity is sufficient to stop billing on a failed
          // candidate. Cancellation must never depend on that VM accepting SSH.
          // This receipt has no enrollment pin and cannot pass configuration.
          if(!bootstrap.fingerprint&&await assertCancellationScope({operation:lease})){
            await assertOperationAuthority(context,lease);
            return store.recordCreatedResource({...value,sshEnrollment:'cancelled_before_enrollment'},options);
          }
          if(bootstrap.fingerprint) {
            if(bootstrap.resourceId!==value.id||payloadHash(bootstrap.addresses)!==payloadHash(value.addresses))fail('RESOURCE_SCOPE_MISMATCH');
          } else {
            await assertOperationAuthority(context,lease);
            const address=value.addresses?.find(ip=>isIP(ip)===4);if(!address)fail('NODE_ADDRESS_UNAVAILABLE');
            const fingerprint=await observeHostKey({host:address});
            await assertOperationAuthority(context,lease);
            bootstrap={...bootstrap,fingerprint,resourceId:value.id,addresses:value.addresses,assurance:'operator_enabled_tofu_then_pinned'};
            await store.saveState('bootstrap',bootstrap,saved.version);
          }
        }
        if(!bootstrap?.fingerprint) fail('NODE_SECURITY_CONFIGURATION_REQUIRED');
        value={...value,sshHostKeySha256:bootstrap.fingerprint};
      }
      return store.recordCreatedResource(value,options);
    },
  };
  context=await createInfrastructureContext({config,registry,adapters:{liveVerification,
    inspectRuntime:async()=>({...config,verified:true}),assertOperationLease:assertLease,assertCancellationScope,
    assertDrainScope:async({lease,source})=>{
      const row=await currentOperation(lease);
      return row.payload.source_server_id===source.id && ['replace','move_retire'].includes(row.kind) && row.payload.confirmations.delete_source===true;
    },
    assertPurchaseScope:async({operation,quote,profile,machine})=>{
      const row=await currentOperation(operation);
      const bootstrap=(await store.readState('bootstrap')).value;
      if(row.control_requested==='cancel' || row.payload.confirmations.cost!==true || !['add','replace'].includes(row.kind) ||
        row.payload.provider!==quote.provider || row.payload.region!==quote.region || row.payload.plan_id!==quote.planId || profile!==profileFor(row) ||
        !setups[quote.provider]) return false;
      await catalogServices[quote.provider].assertSelection({region:quote.region,planId:quote.planId});
      const expectedMachine=await setups[quote.provider].resolveMachine({region:quote.region,profile});
      if(quote.provider==='lightnode')return payloadHash(machine)===payloadHash(expectedMachine)&&bootstrap?.mode==='password-tofu';
      if(payloadHash(machine)!==payloadHash({...expectedMachine,userData:bootstrap?.userData})) return false;
      const path=quote.provider==='digitalocean'?'/v2/account/keys':'/v2/ssh-keys';
      const keys=await catalogs[quote.provider].list(path,quote.provider==='digitalocean'?'ssh_keys':'ssh_keys');
      const selected=keys.filter(key=>machine.sshKeyIds.some(id=>String(key.id)===String(id)||key.fingerprint===id));
      return machine.sshKeyIds.every(id=>selected.some(key=>String(key.id)===String(id)||key.fingerprint===id)) && selected.some(key=>matchesSshPublicKey(quote.provider==='vultr'?key.ssh_key:key.public_key,publicKey));
    },
    assertFirewallPolicy:async({provider,machine,operation})=>provider==='lightnode'
      ? machine?.bootstrapMode==='password-tofu'&&settings.providers.lightnode.connection.firstContactPolicy==='tofu'
      : verifyProviderFirewall({provider,transport:transports[provider],machine,managementSources:settings.managementSources,profile:profileFor(await currentOperation(operation))}),
    assertDeletionScope:async({resource,operation,attachments})=>{
      const row=await currentOperation(operation), scope=row.payload.delete_scope;
      if(attachments?.complete!==true || !Array.isArray(attachments.items)) return false;
      for(const item of attachments.items) {
        if(item.shared || item.protected) return false;
        const receipt=await store.getResource({kind:item.type,id:item.id,provider:resource.provider});
        if(!receipt || receipt.id!==item.id || receipt.kind!==item.type || receipt.provider!==resource.provider || receipt.protected!==false ||
          receipt.environment!==context.environment || receipt.poolId!==context.poolId || receipt.databaseIdentity!==context.databaseIdentity || receipt.panelIdentity!==context.panelIdentity) return false;
      }
      if(scope?.approved===true && row.payload.confirmations.delete_source===true && scope.resourceId===resource.id && scope.provider===resource.provider &&
        scope.accountId===resource.accountId && scope.createdAt===resource.createdAt && payloadHash([...scope.addresses].sort())===payloadHash([...resource.addresses].sort())) return true;
      const cancel=(await store.readState('cancellation-delete')).value;
      const receipt=await store.getResource({kind:'provider',id:resource.id,provider:resource.provider});
      return row.control_requested==='cancel' && receipt?.operationId===operation.id && cancel?.resourceId===resource.id && cancel.operationId===operation.id;
    },
  }});
  store=createInfrastructureStore({context,client,getLease});
  repository={...createLiveRuntimeRepository({client,store}),...createLiveInventoryRepository({client})};
  const renewLease=lease=>repository.renewLease({context,lease,ttlSeconds:120});
  const panel=createLivePanelAdapter({context,transport:panelTransport,store,getLease,renewLease,verifySharedInbound});
  const providers={};
  for(const name of Object.keys(transports).filter(name=>catalogs[name])) {
    const providerConfig=settings.providers[name];
    const factory=name==='lightnode'?createLightNodeProvider:name==='digitalocean'?createDigitalOceanProvider:createVultrProvider;
    const base={context,transport:transports[name],catalog:catalogs[name],...(name==='lightnode'?{store}:{})};
    const adapter=factory({...base,machine:providerConfig.machines?.vless_only});
    providers[name]={...adapter,quote:async input=>{if(!catalogServices[name])fail('PROVIDER_UNAVAILABLE');await catalogServices[name].assertSelection(input);return adapter.quote(input);},create:async input=>{
      const state=await store.readState('provider-machine');
      let machine=state.value;
      if(!machine) {
        if(!setups[name])fail('PROVIDER_CONFIGURATION_REQUIRED');
        machine=await setups[name].resolveMachine({region:input.quote.region,profile:input.profile});
        await store.saveState('provider-machine',machine,state.version);
      }
      return factory({...base,machine:name==='lightnode'?machine:{...machine,userData:input.bootstrap.userData}}).create(input);
    }};
  }
  const probes=createLiveProbes({context,store,transport:panelTransport,privateKey,renewLease,fetchImpl,sessionFactory});
  async function readExistingCandidate(server,lease) {
    return loadExistingCandidate({context,store,providers,panelTransport,server,lease});
  }
  const adapters=createLiveOperationAdapters({context,store,repository,providers,panel,panelTransport,probes,readExistingCandidate,
    resolveLocation:async({provider,region})=>{
      if(provider==='lightnode') {
        const metadata=(await catalogs[provider].listRegions()).regions.find(row=>row.id===region);
        if(!metadata)fail('INVALID_PROVIDER_REGION');
        return provisioningLocation({provider,region,metadata});
      }
      const rows=await catalogs[provider].list('/v2/regions','regions');
      const metadata=rows.find(row=>(provider==='digitalocean'?row.slug:row.id)===region);
      if(!metadata)fail('INVALID_PROVIDER_REGION');
      return provisioningLocation({provider,region,metadata});
    },
    checkPermanentLinks:createLiveLinkVerifier({context,client,store,repository,panelTransport,panel,fetchImpl,env}),
    createNodeAdapter:()=>{
      const adapter=createLiveNodeAdapter({context,store,panel:panelTransport,privateKey,renewLease,sessionFactory,
        policy:{managementSources:settings.managementSources,realityServerName:settings.realityServerName}});
      return {...adapter,installBundle:async input=>{
        if(input.resource.provider==='lightnode')await hardenLightNodeSsh({context,operation:input.operation,resource:input.resource,
          bootstrap:(await store.readState('bootstrap')).value,store,privateKey,renewLease,sessionFactory});
        return adapter.installBundle(input);
      }};
    },
    serverCredentials:{panel_url:panelTransport.identity,panel_public_url:panelTransport.identity,panel_username:env.MARZNESHIN_PANEL_USERNAME,
      panel_password_encrypted:encrypt(env.MARZNESHIN_PANEL_PASSWORD),max_active_keys:settings.maxActiveKeys}});
  async function verifySharedInbound({id}) {
    // Scoped access adoption never grants ownership of a shared node or inbound.
    if(!['development','production'].includes(context.environment)) fail('RESOURCE_SCOPE_MISMATCH');
    const actualInbound=await panelTransport.request({path:`/api/inbounds/${id}`});
    const nodeId=actualInbound.data?.node?.id??actualInbound.data?.node_id;
    if(actualInbound.status!==200 || actualInbound.data?.id!==id || actualInbound.data.protocol!=='vless' ||
      !Number.isSafeInteger(nodeId) || nodeId<=0) fail('RESOURCE_SCOPE_MISMATCH');
    const {data:shared,error:sharedError}=await client.from('vpn_servers')
      .select('id,environment,access_pool_id,panel_node_id,panel_type,host_ip,provider_resource_id,lifecycle_protected,supported_protocols,ownership_provenance')
      .eq('environment',context.environment).eq('access_pool_id',context.poolId).eq('panel_node_id',nodeId).maybeSingle();
    const owner=shared?.ownership_provenance;
    if(sharedError || !shared || shared.panel_type!=='marzneshin' || shared.panel_node_id!==nodeId || shared.lifecycle_protected!==true ||
      shared.provider_resource_id!==null || owner?.method!=='adopted' ||
      owner.purpose!=='owner_authorized_shared_node_customer_access' || !owner.manifest_hash) fail('RESOURCE_SCOPE_MISMATCH');
    selectServiceIds({server:shared,protocol:'vless',pool});
    const registered=await store.getResource({kind:'server',id:shared.id});
    if(!registered || registered.protected!==true || registered.kind!=='server' || registered.id!==shared.id ||
      !['environment','databaseIdentity','panelIdentity','poolId'].every(key=>registered[key]===context[key]) ||
      registered.method!=='owner_authorized_access_adoption' || registered.panel_node_id!==nodeId || registered.provider_resource_id!==null ||
      registered.manifestHash!==owner.manifest_hash || payloadHash(registered.addresses)!==payloadHash([shared.host_ip]) ||
      payloadHash([...(registered.supported_protocols||[])].sort())!==payloadHash([...shared.supported_protocols].sort())) fail('RESOURCE_SCOPE_MISMATCH');
    const actualNode=await panelTransport.request({path:`/api/nodes/${nodeId}`});
    if(actualNode.status!==200 || actualNode.data?.id!==nodeId || actualNode.data.address!==shared.host_ip) fail('RESOURCE_SCOPE_MISMATCH');
  }
  const service=await store.getResource({kind:'service',id:context.publicServiceId});await assertResourceRegistration({context,resource:service});
  const actualService=await panelTransport.request({method:'GET',path:`/api/services/${pool.vless_service_id}`});
  if(actualService.status!==200 || !Array.isArray(actualService.data?.inbound_ids)) fail('RESOURCE_SCOPE_MISMATCH');
  for(const id of actualService.data.inbound_ids) {
    const inbound=await store.getResource({kind:'inbound',id:String(id)});
    if(inbound) await assertResourceRegistration({context,resource:inbound});
    else await verifySharedInbound({id});
  }
  return {context,repository,providers,adapters,executionReady:providerReadiness.some(row=>row.ready),recoveryReady:Object.keys(providers).length>0,currency:'USD',providerReadiness,
    options:providerReadiness.filter(row=>row.ready).map(row=>({id:row.id,regions:[]})),
    getCatalog:async({provider,region,refresh=false})=>{
      if(!catalogServices[provider])fail('PROVIDER_UNAVAILABLE');
      return region?catalogServices[provider].listPlans({region,refresh}):catalogServices[provider].listRegions({refresh});
    },
    assertProvisionable:async({provider,region,planId,profile})=>{
      if(!providerReadiness.find(row=>row.id===provider)?.profiles.includes(profile))fail('PROVIDER_UNAVAILABLE');
      await catalogServices[provider].assertSelection({region,planId});
      await setups[provider].resolveMachine({region,profile});
    },
    canRunOperation:async operation=>{
      if(operation.control_requested==='cancel') {
        if(operation.stage==='queued' || operation.checkpoint?.published ||
          ['draining','migrating','endpoints','links','retiring','cleanup_pending','finalizing'].includes(operation.stage))return true;
        return operation.kind==='move_retire' || Boolean(providers[operation.payload?.provider]);
      }
      const needed=new Set(operation.payload?.provider?[operation.payload.provider]:[]);
      for(const id of [operation.payload?.source_server_id,operation.payload?.destination_server_id].filter(Boolean)) {
        const server=await repository.getServer({context,serverId:id});
        if(id===operation.payload?.destination_server_id && server.lifecycle_protected===true)continue;
        needed.add(server.provider);
      }
      return [...needed].every(provider=>Boolean(providers[provider]));
    },
    withLease:(lease,action)=>activeLease.run(lease,action)};
}
