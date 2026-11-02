import {infrastructureError} from './repository.js';

function executionMode(env) {
  const mode = env.SERVER_OPERATIONS_EXECUTION_MODE || 'local';
  if (!['local','remote'].includes(mode)) throw infrastructureError('RUNNER_CONFIGURATION_REQUIRED');
  return mode;
}
export const shouldStartLocalOperationsWorker = env => executionMode(env) === 'local' && env.SERVER_OPERATIONS_WORKER_ENABLED === 'true';
export async function initializeServerOperations({env=process.env,createLocalRuntime,createRemoteClient}) {
  if (executionMode(env) === 'remote') {
    if(env.PUBLIC_SERVER_ACCESS_ENABLED!=='true'||env.SERVER_LIFECYCLE_COORDINATION_ENABLED!=='true')throw infrastructureError('INFRASTRUCTURE_EXECUTION_DISABLED');
    return {runtime:null,remoteClient:await createRemoteClient({env})};
  }
  return {runtime:await createLocalRuntime({env}),remoteClient:null};
}
