import {infrastructureError} from './repository.js';
import {runnerScopeHash} from './runnerProtocol.js';

/** Deployment health is an authenticated HTTP check, not systemd's active bit. */
export async function waitForRunnerReadiness({client,attempts=20,delay=()=>new Promise(resolve=>setTimeout(resolve,2000)),requireProviders=true,requiredProviderIds=['digitalocean','vultr']}) {
  if(!Number.isInteger(attempts)||attempts<1||attempts>30||!client?.scope||!Array.isArray(requiredProviderIds)||!requiredProviderIds.length||
    new Set(requiredProviderIds).size!==requiredProviderIds.length||requiredProviderIds.some(id=>!['digitalocean','vultr','lightnode'].includes(id)))throw infrastructureError('RUNNER_NOT_READY');
  for(let attempt=0;attempt<attempts;attempt++) {
    try {
      const health=await client.request({method:'GET',path:'/health'});
      if(health.status!==200||health.data?.ok!==true||health.data.role!=='dev-infrastructure-runner'||health.data.version!==1||
        !health.data.scope||runnerScopeHash(health.data.scope)!==runnerScopeHash(client.scope))throw infrastructureError('RUNNER_NOT_READY');
      const result=await client.request({method:'GET',path:'/operations'});
      if(result.status!==200||!Array.isArray(result.data?.operations)||!Array.isArray(result.data.provider_readiness))throw infrastructureError('RUNNER_NOT_READY');
      const providersReady=result.data.enabled===true && result.data.recovery_enabled===true && requiredProviderIds.every(id=>
        result.data.provider_readiness.some(row=>row.id===id&&row.ready===true&&['dual','vless_only'].every(profile=>row.profiles?.includes(profile))));
      if(requireProviders&&!providersReady)throw infrastructureError('RUNNER_NOT_READY');
      return{healthy:true,providersReady,operations:result.data};
    }catch{/* Initialization races and connection errors remain bounded and private. */}
    if(attempt+1<attempts)await delay();
  }
  throw infrastructureError('RUNNER_NOT_READY');
}
