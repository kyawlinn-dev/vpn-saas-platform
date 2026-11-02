import { infrastructureError } from "./repository.js";
import { isLiveRuntimeVerification } from './liveRuntimeVerification.js';

const verifiedContexts = new WeakSet();
export const isInfrastructureContext = context => verifiedContexts.has(context);
const keys = ["environment", "databaseIdentity", "panelIdentity", "poolId"];

export async function createInfrastructureContext({ config, registry, adapters }) {
  if (!["development", "production"].includes(config?.environment) ||
      !keys.every(key => typeof config[key] === "string" && config[key].trim()) ||
      !["mock", "live"].includes(config.executionMode) || !config.providerAccounts ||
      !Array.isArray(config.protectedResourceIds) || !Array.isArray(config.protectedAddresses) ||
      typeof registry?.getResource !== "function" || typeof adapters?.inspectRuntime !== "function" ||
      typeof adapters?.assertOperationLease !== "function") throw infrastructureError("RESOURCE_SCOPE_MISMATCH");
  if (config.executionMode === "live" && !isLiveRuntimeVerification(adapters.liveVerification, config)) throw infrastructureError("LIVE_INFRASTRUCTURE_UNAVAILABLE");
  let actual;
  try { actual = await adapters.inspectRuntime(); } catch { throw infrastructureError("RUNTIME_VERIFICATION_UNAVAILABLE"); }
  if (actual?.verified !== true || !keys.every(key => actual[key] === config[key]) ||
      !Object.entries(config.providerAccounts).every(([provider, account]) => typeof account === "string" && account && actual.providerAccounts?.[provider] === account)) throw infrastructureError("RESOURCE_SCOPE_MISMATCH");
  const context = Object.freeze({ ...config, providerAccounts: Object.freeze({ ...config.providerAccounts }),
    protectedResourceIds: Object.freeze([...config.protectedResourceIds]), protectedAddresses: Object.freeze([...config.protectedAddresses]), registry, adapters });
  verifiedContexts.add(context);
  return context;
}
