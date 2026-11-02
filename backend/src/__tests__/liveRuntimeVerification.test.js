import { describe, expect, it, vi } from 'vitest';
import { verifyLiveRuntime } from '../services/infrastructure/liveRuntimeVerification.js';
import { createInfrastructureContext } from '../services/infrastructure/context.js';
import { connectPanelTransport } from '../services/infrastructure/livePanelTransport.js';
import { connectProviderTransport } from '../services/infrastructure/providers/liveTransport.js';

describe('live runtime identity verification', () => {
  const config = {environment:'development',databaseIdentity:'dev.supabase.co',panelIdentity:'https://panel.example.test',poolId:'pool',
    executionMode:'live',providerAccounts:{digitalocean:'account'},protectedResourceIds:[],protectedAddresses:[],publicServiceId:'502'};
  it('rejects a fabricated live attestation', async () => {
    await expect(createInfrastructureContext({config,registry:{getResource:async()=>null},adapters:{inspectRuntime:async()=>({...config,verified:true}),assertOperationLease:async()=>true,liveVerification:{verified:true}}})).rejects.toMatchObject({code:'LIVE_INFRASTRUCTURE_UNAVAILABLE'});
  });
  it('verifies actual authenticated transports and the database-owned binding', async () => {
    const panel = await connectPanelTransport({baseUrl:config.panelIdentity,username:'fixture',password:'fixture',fetchImpl:async()=>new Response(JSON.stringify({access_token:'fixture'}),{status:200})});
    const provider = await connectProviderTransport({provider:'digitalocean',token:'fixture',expectedAccountId:'account',fetchImpl:async()=>new Response(JSON.stringify({account:{uuid:'account'}}),{status:200})});
    const binding = {environment:'development',access_pool_id:'pool',database_identity:'dev.supabase.co',panel_identity:config.panelIdentity,provider_accounts:{digitalocean:'account'}};
    const chain = {select:()=>chain,eq:()=>chain,maybeSingle:vi.fn(async()=>({data:binding,error:null}))};
    const client = {from:()=>chain};
    const verification = await verifyLiveRuntime({config,client,supabaseUrl:'https://dev.supabase.co',panel,transports:{digitalocean:provider}});
    const context = await createInfrastructureContext({config,registry:{getResource:async()=>null},adapters:{liveVerification:verification,inspectRuntime:async()=>({...config,verified:true}),assertOperationLease:async()=>true}});
    expect(context.executionMode).toBe('live');
    // Database scope stays verifiable for history when a provider is offline.
    expect(await verifyLiveRuntime({config,client,supabaseUrl:'https://dev.supabase.co',panel,transports:{}})).toMatchObject({verified:true});
    await expect(verifyLiveRuntime({config,client,supabaseUrl:'https://prod.supabase.co',panel,transports:{digitalocean:provider}})).rejects.toMatchObject({code:'RESOURCE_SCOPE_MISMATCH'});
  });
});
