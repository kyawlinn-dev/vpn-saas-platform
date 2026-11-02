import {describe,expect,it,vi} from 'vitest';
import {waitForRunnerReadiness} from '../services/infrastructure/runnerReadiness.js';
const scope={environment:'development',poolId:'pool',databaseIdentity:'db',panelIdentity:'panel'};
const health={ok:true,role:'dev-infrastructure-runner',version:1,scope};
const operations={enabled:true,recovery_enabled:true,operations:[],provider_readiness:['digitalocean','vultr'].map(id=>({id,ready:true,profiles:['dual','vless_only']}))};
describe('runner activation health gate',()=>{
  it('can require LightNode explicitly without inventing readiness for missing providers',async()=>{
    const data={...operations,provider_readiness:[{id:'lightnode',ready:true,profiles:['dual','vless_only']}]};
    const client={scope,request:vi.fn(async({path})=>({status:200,data:path==='/health'?health:data}))};
    expect((await waitForRunnerReadiness({client,attempts:1,requiredProviderIds:['lightnode']})).providersReady).toBe(true);
    await expect(waitForRunnerReadiness({client,attempts:1,requiredProviderIds:['digitalocean','lightnode']})).rejects.toThrow('RUNNER_NOT_READY');
  });
  it('never accepts an initially active service whose authenticated initialization never succeeds',async()=>{
    const client={scope,request:vi.fn(async()=>{throw Error('connection refused');})};
    await expect(waitForRunnerReadiness({client,attempts:2,delay:async()=>{}})).rejects.toThrow('RUNNER_NOT_READY');
    expect(client.request).toHaveBeenCalledTimes(2);
  });
  it('requires exact authenticated health identity and provider profiles before activation',async()=>{
    const client={scope,request:vi.fn(async({path})=>({status:200,data:path==='/health'?health:operations}))};
    expect((await waitForRunnerReadiness({client,attempts:1})).providersReady).toBe(true);
    client.request.mockResolvedValue({status:200,data:{...health,scope:{...scope,environment:'production'}}});
    await expect(waitForRunnerReadiness({client,attempts:1})).rejects.toThrow('RUNNER_NOT_READY');
    client.request.mockImplementation(async({path})=>({status:200,data:path==='/health'?health:{...operations,enabled:false}}));
    await expect(waitForRunnerReadiness({client,attempts:1})).rejects.toThrow('RUNNER_NOT_READY');
    expect((await waitForRunnerReadiness({client,attempts:1,requireProviders:false})).providersReady).toBe(false);
  });
});
