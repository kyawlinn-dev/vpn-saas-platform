import { makeHostBootstrap } from './liveSsh.js';
import { makeLightNodeBootstrap } from './lightnodeBootstrap.js';
import { normalizeBillingAssurance } from './billingAssurance.js';
import { configureCandidate } from './nodeConfigurator.js';
import { registerCandidate, publishCandidate } from './panelAdapter.js';
import { verifyCandidate } from './verification.js';
import { inventoryDependencies } from './dependencyInventory.js';
import { drainSource, migrateAccessItem, replaceManagedEndpoints } from './migration.js';
import { verifyRetirementReady, retireSource } from './retirement.js';
import { assertResourceOwnership, assertDestinationOwnership } from './ownership.js';
import { assertCompatibleDestination } from './dependencyInventory.js';
import { readDestinationAccess } from './sharedDestinationAccess.js';
import { infrastructureError } from './repository.js';
import { provisioningLocation } from '../serverDisplay.js';

const fail = code => { throw infrastructureError(code); };
export function createLiveOperationAdapters({context,store,repository,providers,panel,panelTransport,createNodeAdapter,probes,
  serverCredentials,readExistingCandidate,checkPermanentLinks,readExistingDestination = readDestinationAccess,resolveLocation = async value => provisioningLocation(value)}) {
  const save = async (key,value) => { const old=await store.readState(key); await store.saveState(key,value,old.version); return value; };
  const read = async key => (await store.readState(key)).value;
  const server = serverId => repository.getServer({context,serverId});
  async function destination(input) {
    const id=input.operation.payload.destination_server_id || (await read('candidate'))?.serverId;
    if (!id) fail('CANDIDATE_REGISTRATION_INVALID');
    return server(id);
  }
  async function pair(input) { return {source:await server(input.operation.payload.source_server_id),destination:await destination(input)}; }
  async function candidate(input) {
    if (input.operation.kind==='move_retire') return {serverId:(await destination(input)).id};
    const value=await read('candidate');
    if (!value) fail('CANDIDATE_REGISTRATION_INVALID');
    return {...value,operation:input.lease};
  }
  async function resource(input) {
    const saved=await read('provider-resource');
    if (!saved) fail('RESOURCE_SCOPE_MISMATCH');
    const owned=await context.registry.getResource({kind:'provider',id:saved.id,provider:saved.provider});
    await assertResourceOwnership({context,resource:owned,operation:input.lease}); return owned;
  }
  async function inventory(input, {retirement=false}={}) {
    const nodes=await pair(input), cp=await read('retirement'), original=providers[nodes.source.provider];
    if(!retirement && input.operation.kind==='replace' && nodes.destination.status==='provisioning') {
      const fresh=await candidate(input);
      if(fresh.serverId!==nodes.destination.id || (await verifyCandidate({context,candidate:fresh,probes})).verified!==true) fail('CANDIDATE_VERIFICATION_FAILED');
      // Pre-publication inventory uses fresh tunnel evidence only for readiness;
      // customer eligibility remains false in the persisted server row.
      nodes.destination={...nodes.destination,status:'active',is_active:true,server_health_status:{outline_api_status:'healthy'}};
    }
    const provider={...original,
      inspect:async params=>{
        const value=await original.inspect(params);
        if (value || !retirement || cp?.phase!=='delete_issued' || cp.operationId!==input.lease.id || cp.sourceId!==nodes.source.id || !cp.panelRemoved) return value;
        return cp.providerIdentity;
      },
      inspectBillableAttachments:async params=>{
        const result=await original.inspectBillableAttachments({...params,knownAttachments:(await read('billing-attachments'))||[]});
        const items=[];
        for(const item of result.items) {
          const receipt=await context.registry.getResource({kind:item.type,id:item.id,provider:nodes.source.provider});
          items.push({...item,...(receipt||{})});
        }
        if (!retirement) await save('billing-attachments',result.items);
        return {...result,items};
      }};
    return inventoryDependencies({context,lease:input.lease,...nodes,panel,repository,provider});
  }
  async function verifyLinks(input) {
    const nodes=await pair(input);
    return checkPermanentLinks({...input,...nodes});
  }
  async function verifyExistingDestination(input){
    const nodes=await pair(input);
    await assertDestinationOwnership({context,resource:nodes.destination,operation:input.lease});
    assertCompatibleDestination({...nodes,inventory:{movable:[]}});
    // Old-version in-flight probes must be cleaned, but no new probe is created for a move.
    const prior=await read('probe-run');
    if(prior && prior.cleaned!==true)fail('PROBE_CLEANUP_REQUIRED');
    const binding=await readExistingDestination({context,server:nodes.destination,panelTransport});
    if(binding.server?.id!==nodes.destination.id || Number(binding.node?.id)!==Number(nodes.destination.panel_node_id) ||
      binding.node?.address!==nodes.destination.host_ip || binding.node?.status!=='healthy')fail('SHARED_DESTINATION_UNVERIFIED');
    return {verified:true,healthy:true,servicesVerified:true,verifiedAt:new Date().toISOString()};
  }
  async function retirementAdapters(input) {
    const nodes=await pair(input), original=providers[nodes.source.provider];
    return {...nodes,operationKind:input.operation.kind,adapters:{
      provider:original,
      readSource:async()=>{
        const fresh=await server(nodes.source.id);
        const response=await panelTransport.request({method:'GET',path:`/api/nodes/${Number(fresh.panel_node_id)}`});
        if (response.status!==200 && response.status!==404) fail('RETIREMENT_BLOCKED');
        const owner=response.status===200?await context.registry.getResource({kind:'node',id:String(fresh.panel_node_id)}):null;
        if (owner && owner.address!==response.data.address) fail('RESOURCE_SCOPE_MISMATCH');
        return {server:fresh,node:owner};
      },
      readDeletionAuthorization:async()=>input.operation.payload.delete_scope,
      readRetirementCheckpoint:()=>read('retirement'),
      checkpointRetirement:value=>save('retirement',Object.fromEntries(Object.entries(value).filter(([key])=>!['context','lease'].includes(key)))),
      inventory:()=>inventory(input,{retirement:true}),
      verifyDestination:async()=>{
        if(input.operation.kind==='move_retire'){
          const proof=await verifyExistingDestination(input);
          const links=await verifyLinks(input);
          return {...proof,permanentLinksVerified:links.verified,verifiedAt:new Date().toISOString()};
        }
        const target=await readExistingCandidate(await server(nodes.destination.id),input.lease);
        const proof=await verifyCandidate({context,candidate:target,probes});
        const links=await verifyLinks(input);
        return {healthy:proof.verified,tunnelsVerified:proof.verified,permanentLinksVerified:links.verified,verifiedAt:new Date().toISOString()};
      },
      removeOwnedPanelResources:()=>panel.deleteOwnedNode({server:nodes.source}),
      billingInventory:async()=>{
        const billing=await original.inspectBillableAttachments({resourceId:nodes.source.provider_resource_id,knownAttachments:(await read('billing-attachments'))||[]});
        const billingAssurance=normalizeBillingAssurance(billing);
        return {complete:billing.complete,ongoingCharges:billing.items,...(billingAssurance?{billingAssurance}:{})};
      },
    }};
  }
  const adapters={
    async provision(input) {
      const bootstrap=(await read('bootstrap'))||await save('bootstrap',input.operation.payload.provider==='lightnode'?makeLightNodeBootstrap():makeHostBootstrap());
      const value=await providers[input.operation.payload.provider].create({operationId:input.lease.id,operation:input.lease,
        quote:input.operation.payload.quote,profile:input.operation.payload.supported_protocols.includes('shadowsocks')?'dual':'vless_only',bootstrap});
      await save('provider-resource',value); return value;
    },
    async configure(input) {
      const value=await resource(input);
      const configuration=await configureCandidate({context,operation:input.lease,resource:value,supportedProtocols:input.operation.payload.supported_protocols,nodeAdapter:createNodeAdapter()});
      await save('configuration',configuration); return configuration;
    },
    async register(input) {
      const value=await resource(input);
      const result=await registerCandidate({context,operation:input.lease,resource:value,supportedProtocols:input.operation.payload.supported_protocols,
        configuration:await read('configuration'),panel});
      const row=await repository.ensureCandidate({context,lease:input.lease,server:{...serverCredentials,name:`NovaNet ${value.region} ${value.id}`,provider:value.provider,
        region:value.region,provider_resource_id:value.id,panel_node_id:Number(result.node.id),host_ip:result.address,
        marzneshin_service_ids:result.privateServices.filter(row=>row.protocol==='shadowsocks').map(row=>Number(row.id))}});
      const location=(await read('display-location'))||await save('display-location',await resolveLocation({provider:value.provider,region:value.region}));
      const named=await repository.assignCandidateDisplay({context,lease:input.lease,serverId:row.id,location});
      await panel.finalizeCandidateLabels({candidate:result,server:named});
      await save('candidate',{...result,serverId:row.id}); return result;
    },
    resolveCandidate:candidate, loadExistingCandidate:candidate,
    verify:input=>input.operation?.kind==='move_retire'?verifyExistingDestination(input):verifyCandidate({context,candidate:input.candidate,probes}),
    async publish(input) {
      return publishCandidate({context,lease:input.lease,candidate:input.candidate,proof:input.proof,panel,repository:{...repository,
        checkpointPublication:value=>save('publication-intent',{serverId:value.candidate.serverId,expectedMembership:value.expectedMembership}),
        publishCandidate:async value=>{
          await panel.cleanupPrivateVlessServices({candidate:value.candidate});
          return repository.publishCandidate(value);
        }}});
    },
    inventory,
    async stageMigrationItems(input) {return repository.stageMigrationItems({context,lease:input.lease,...await pair(input),inventory:input.inventory});},
    async drain(input) {return drainSource({context,lease:input.lease,source:(await pair(input)).source,repository});},
    nextMigrationItem:input=>repository.nextMigrationItem({context,lease:input.lease}),
    async migrate(input) {
      const nodes=await pair(input);
      if(input.item.kind==='assignment_cleanup') {
        await repository.cleanupAssignment({context,lease:input.lease,...nodes,item:input.item});return {status:'verified'};
      }
      return migrateAccessItem({context,lease:input.lease,item:input.item,...nodes,panel,repository});
    },
    async replaceEndpoints(input) {
      const nodes=await pair(input), current=await inventory(input);
      if(current.movable.length) fail('INVENTORY_BLOCKED');
      return replaceManagedEndpoints({context,lease:input.lease,inventory:current,...nodes,panel});
    },
    verifyPermanentLinks:verifyLinks,
    async verifyRetirementReady(input) {return verifyRetirementReady({context,lease:input.lease,...await retirementAdapters(input)});},
    async retire(input) {
      const result=await retireSource({context,lease:input.lease,proof:input.proof,...await retirementAdapters(input)});
      if(result.resourceAbsent) await repository.retireServer({context,lease:input.lease,server:(await pair(input)).source});
      return result;
    },
    async cleanup(input) {const proof=await adapters.verifyRetirementReady(input);return adapters.retire({...input,proof});},
    async cancelUnpublished(input) {
      // A move reuses an existing destination; cancellation owns no candidate to delete.
      if(input.operation.kind==='move_retire') return {published:false,resourcesAbsent:true,billingClear:true};
      let saved=await read('provider-resource');
      const savedCandidate=await read('candidate');
      if(savedCandidate) {
        const current=await panel.readService({serviceId:context.publicServiceId});
        if(current.endpoints.some(row=>String(row.nodeId)===String(savedCandidate.node.id))) return {published:true};
        const target=await server(savedCandidate.serverId);
        if(target.is_active) return {published:true};
        await probes.cleanup({candidate:{...savedCandidate,operation:input.lease},operationId:input.lease.id});
        await panel.deleteOwnedNode({server:target});
      } else if((await read('panel-node'))?.stage==='bound') fail('DELETE_RECONCILIATION_REQUIRED');
      if(!saved) {
        const provider=providers[input.operation.payload.provider];
        if(typeof provider?.reconcileCreate!=='function') fail('OPERATION_ADAPTER_UNAVAILABLE');
        saved=await provider.reconcileCreate({operationId:input.lease.id,operation:input.lease});
        if(!saved) return {published:false,resourcesAbsent:true,billingClear:true};
        await save('provider-resource',saved);
      }
      const owned=await resource(input);
      await save('cancellation-delete',{resourceId:owned.id,operationId:input.lease.id});
      await providers[owned.provider].delete({resourceId:owned.id,expectedIdentity:owned,operation:input.lease});
      const billing=await providers[owned.provider].inspectBillableAttachments({resourceId:owned.id});
      if(savedCandidate) await repository.retireServer({context,lease:input.lease,server:await server(savedCandidate.serverId)});
      const billingAssurance=normalizeBillingAssurance(billing);
      return {published:false,resourcesAbsent:await providers[owned.provider].inspect({resourceId:owned.id})===null,billingClear:billing.complete && !billing.items.length,
        ...(billingAssurance?{billingAssurance}:{})};
    },
  };
  return adapters;
}
