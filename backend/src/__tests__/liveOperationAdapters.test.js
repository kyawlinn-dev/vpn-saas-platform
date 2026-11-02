import { describe, expect, it, vi } from 'vitest';
import { createLiveOperationAdapters } from '../services/infrastructure/liveOperationAdapters.js';
import { infrastructureFixture } from './fixtures/infrastructure.js';
vi.mock('../services/infrastructure/verification.js',()=>({verifyCandidate:vi.fn(async()=>({verified:true}))}));
vi.mock('../services/infrastructure/panelAdapter.js', async original => ({ ...await original(),
  publishCandidate: vi.fn(async input => input.repository.publishCandidate(input)) }));
describe('connected operation phases',()=>{
  it('persists a LightNode password bootstrap, never a fabricated cloud-init host pin',async()=>{
    const f=await infrastructureFixture(),states=new Map();
    const store={readState:async key=>states.get(key)||{value:null,version:null},saveState:async(key,value)=>states.set(key,{value,version:1})};
    const provider={create:vi.fn(async()=>f.resource)};
    const adapters=createLiveOperationAdapters({context:f.context,store,providers:{lightnode:provider}});
    const input={lease:f.operation,operation:{payload:{provider:'lightnode',supported_protocols:['vless'],quote:{}}}};
    await adapters.provision(input);await adapters.provision(input);
    const first=provider.create.mock.calls[0][0].bootstrap;
    expect(first.mode).toBe('password-tofu');expect(first.password).toMatch(/^[a-f0-9]{22}Aa9!$/);
    expect(first.fingerprint).toBeUndefined();expect(first.userData).toBeUndefined();
    expect(provider.create.mock.calls[1][0].bootstrap).toEqual(first);
  });
  it('verifies a move destination through existing services without loading a tunnel candidate or using a third node',async()=>{
    const f=await infrastructureFixture();
    const source=f.own('server','source',{supported_protocols:['vless']});
    const destination=f.own('server','destination',{panel_node_id:52,host_ip:'198.51.100.52',supported_protocols:['vless'],
      status:'active',is_active:true,current_active_keys:0,max_active_keys:10,server_health_status:{outline_api_status:'healthy'}});
    const readExistingCandidate=vi.fn(()=>{throw Error('SSH candidate must not be loaded');});
    const readExistingDestination=vi.fn(async()=>({server:destination,node:{id:52,address:destination.host_ip,status:'healthy'}}));
    const store={readState:vi.fn(async()=>({value:null}))};
    const repository={getServer:async({serverId})=>serverId==='source'?source:destination};
    const adapters=createLiveOperationAdapters({context:f.context,store,repository,readExistingCandidate,readExistingDestination});
    const input={lease:f.operation,operation:{kind:'move_retire',payload:{source_server_id:'source',destination_server_id:'destination'}}};
    const candidate=await adapters.loadExistingCandidate(input);
    await expect(adapters.verify({...input,candidate})).resolves.toMatchObject({verified:true,servicesVerified:true});
    expect(readExistingCandidate).not.toHaveBeenCalled();
    expect(readExistingDestination).toHaveBeenCalledOnce();
  });
  it('removes temporary VLESS services before database readiness publication and blocks publication if cleanup fails', async () => {
    const f = await infrastructureFixture(); const events = [];
    const panel = { cleanupPrivateVlessServices: vi.fn(async () => { events.push('cleanup'); }) };
    const repository = { publishCandidate: vi.fn(async () => { events.push('publish'); return true; }) };
    const adapters = createLiveOperationAdapters({ context: f.context, panel, repository });
    const input = { lease: f.operation, candidate: { privateServices: [] }, proof: { verified: true } };
    await adapters.publish(input);
    expect(events).toEqual(['cleanup', 'publish']);
    panel.cleanupPrivateVlessServices.mockRejectedValueOnce(Error('Not empty'));
    await expect(adapters.publish(input)).rejects.toThrow('Not empty');
    expect(repository.publishCandidate).toHaveBeenCalledTimes(1);
  });
  it('cancels an unpublished move without inspecting or deleting the existing destination', async () => {
    const f = await infrastructureFixture();
    const store = { readState: vi.fn(async () => ({ value: null })) };
    const adapters = createLiveOperationAdapters({ context: f.context, store, providers: {} });
    await expect(adapters.cancelUnpublished({ lease: f.operation, operation: { kind: 'move_retire', payload: {} } }))
      .resolves.toEqual({ published: false, resourcesAbsent: true, billingClear: true });
    expect(store.readState).not.toHaveBeenCalled();
  });
  it('re-probes an unpublished replacement for capacity inventory without publishing its database row',async()=>{
    const f=await infrastructureFixture();
    const source=f.own('server','source',{panel_node_id:51,provider_resource_id:'vm',provider:'digitalocean',addresses:f.resource.addresses,supported_protocols:['vless']});
    const destination=f.own('server','destination',{panel_node_id:52,status:'provisioning',is_active:false,current_active_keys:0,max_active_keys:10,supported_protocols:['vless']});
    const store={readState:async key=>({value:key==='candidate'?{serverId:'destination',resource:f.resource,node:{id:'52'}}:null}),saveState:async()=>{}};
    const repository={getServer:async({serverId})=>serverId==='source'?source:destination,listInventoryPage:async()=>({items:[],complete:true})};
    const panel={listInventoryPage:async()=>({items:[],complete:true})};
    const provider={inspect:async()=>f.resource,inspectBillableAttachments:async()=>({complete:true,items:[]})};
    const adapters=createLiveOperationAdapters({context:f.context,store,repository,panel,providers:{digitalocean:provider},probes:{}});
    const result=await adapters.inventory({lease:f.operation,operation:{kind:'replace',payload:{source_server_id:'source'}}});
    expect(result.blockers).toEqual([]);
    expect(destination.is_active).toBe(false);
  });
  it('persists host bootstrap before creating a VM and restores that exact bootstrap on retry',async()=>{
    const f=await infrastructureFixture(); const states=new Map(); const seen=[];
    const store={readState:async key=>states.get(key)||{value:null,version:null},saveState:async(key,value)=>states.set(key,{value,version:1})};
    const provider={create:vi.fn(async input=>{seen.push(states.get('bootstrap')?.value);return f.resource;})};
    const adapters=createLiveOperationAdapters({context:f.context,store,providers:{digitalocean:provider}});
    const input={lease:f.operation,operation:{id:'op',payload:{provider:'digitalocean',quote:{},supported_protocols:['vless']}}};
    await adapters.provision(input); await adapters.provision(input);
    expect(seen[0].fingerprint).toMatch(/^SHA256:/);
    expect(seen[1]).toEqual(seen[0]);
    expect(provider.create.mock.calls[0][0].bootstrap.userData).toContain('#cloud-config');
  });
  it('holds phase execution in the claimed asynchronous lease context',async()=>{
    const f=await infrastructureFixture();
    const adapters=createLiveOperationAdapters({context:f.context});
    expect(Object.keys(adapters)).toEqual(expect.arrayContaining(['provision','configure','register','verify','publish','inventory','migrate','retire','cancelUnpublished']));
  });
});
