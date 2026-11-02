import { infrastructureError, payloadHash } from './repository.js';
import { isVerifiedPanelTransport } from './livePanelTransport.js';
import { isVerifiedProviderTransport } from './providers/liveTransport.js';
import { isVerifiedLightNodeTransport } from './providers/lightnodeTransport.js';
const attestations = new WeakMap();
const binding = config => ({ environment:config.environment,databaseIdentity:config.databaseIdentity,panelIdentity:config.panelIdentity,
  poolId:config.poolId,providerAccounts:config.providerAccounts,publicServiceId:config.publicServiceId });
export const isLiveRuntimeVerification = (value, config) => attestations.get(value) === payloadHash(binding(config));
export async function verifyLiveRuntime({ config, client, supabaseUrl, panel, transports }) {
  const fail = () => { throw infrastructureError('RESOURCE_SCOPE_MISMATCH'); };
  let host; try { host = new URL(supabaseUrl).hostname; } catch { fail(); }
  if (host !== config.databaseIdentity || !isVerifiedPanelTransport(panel) || panel.identity !== config.panelIdentity ||
      !Object.keys(config.providerAccounts).length || !Object.entries(config.providerAccounts).every(([name,id])=>
        ['digitalocean','vultr','lightnode'].includes(name) && typeof id==='string' && id.length>0) ||
      !Object.entries(transports).every(([name,transport])=>(name==='lightnode'?isVerifiedLightNodeTransport(transport):isVerifiedProviderTransport(transport)) &&
        transport.provider===name && transport.accountId===config.providerAccounts[name])) fail();
  const { data, error } = await client.from('server_operation_runtime_bindings').select('*').eq('environment',config.environment).eq('access_pool_id',config.poolId).maybeSingle();
  if (error || !data || data.database_identity !== host || data.panel_identity !== panel.identity ||
      payloadHash(data.provider_accounts) !== payloadHash(config.providerAccounts)) fail();
  const result = Object.freeze({ verified:true });
  attestations.set(result,payloadHash(binding(config)));
  return result;
}
