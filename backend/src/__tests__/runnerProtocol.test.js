import {describe, expect, it, vi} from 'vitest';
import {isRunnerPath, readRunnerScope, runnerScopeHash} from '../services/infrastructure/runnerProtocol.js';
import {initializeServerOperations, shouldStartLocalOperationsWorker} from '../services/infrastructure/serverOperationsStartup.js';

const env = {SERVER_ACCESS_ENVIRONMENT:'development', SERVER_ACCESS_POOL_ID:'bee21225-e51f-4294-892f-576007223ebc',
  PUBLIC_SERVER_ACCESS_ENABLED:'true', SERVER_LIFECYCLE_COORDINATION_ENABLED:'true',
  SERVER_ACCESS_DATABASE_IDENTITY:'huqmzvlzfcexycdrsxpn.supabase.co', SERVER_ACCESS_PANEL_IDENTITY:'https://panel.novanetmm.com',
  SUPABASE_URL:'https://huqmzvlzfcexycdrsxpn.supabase.co'};
describe('DEV runner protocol boundary', () => {
  it('pins complete DEV scope and hashes it independent of object order', () => {
    const scope = readRunnerScope(env);
    expect(scope.environment).toBe('development');
    expect(runnerScopeHash(scope)).toBe(runnerScopeHash(Object.fromEntries(Object.entries(scope).reverse())));
    for (const change of [{SERVER_ACCESS_ENVIRONMENT:'production'}, {SUPABASE_URL:'https://other.supabase.co'},
      {SERVER_ACCESS_DATABASE_IDENTITY:'other.supabase.co'}, {SERVER_ACCESS_POOL_ID:'bad'}, {SERVER_ACCESS_PANEL_IDENTITY:'http://panel.novanetmm.com'}]) {
      expect(() => readRunnerScope({...env,...change})).toThrow('RUNNER_SCOPE_MISMATCH');
    }
  });
  it.each([['GET','/health'],['GET','/operations'],['GET','/operations/'],['GET','/operations/catalog?provider=vultr&region=sgp&refresh=true'],
    ['POST','/operations/quotes'],['POST','/operations'],['GET','/operations/11111111-1111-4111-8111-111111111111'],
    ['POST','/operations/11111111-1111-4111-8111-111111111111/resume']])('allows %s %s', (method,path) => {
    expect(isRunnerPath(method,path)).toBe(true);
  });
  it.each([['POST','/health'],['DELETE','/operations'],['GET','https://evil/operations'],['GET','/operations/../users'],
    ['GET','/operations/%2e%2e/users'],['GET','//operations'],['GET','/operations?scope=production'],
    ['GET','/operations/catalog?provider=vultr&provider=digitalocean'],['GET','/operations/catalog?provider=vultr#x'],
    ['POST','/operations/other/cancel'],['GET','/operations/catalog?provider=vultr&url=https://evil']])('rejects %s %s',(method,path)=>{
    expect(isRunnerPath(method,path)).toBe(false);
  });
  it('remote mode never constructs local adapters and never enables a local worker', async () => {
    const createLocalRuntime = vi.fn(), remoteClient = {request: vi.fn()};
    const createRemoteClient = vi.fn(async () => remoteClient);
    const remoteEnv = {...env,SERVER_OPERATIONS_EXECUTION_MODE:'remote',SERVER_OPERATIONS_WORKER_ENABLED:'true'};
    expect(await initializeServerOperations({env:remoteEnv,createLocalRuntime,createRemoteClient})).toEqual({runtime:null,remoteClient});
    expect(createLocalRuntime).not.toHaveBeenCalled();
    expect(shouldStartLocalOperationsWorker(remoteEnv)).toBe(false);
    createRemoteClient.mockRejectedValue(Error('configuration unavailable'));
    await expect(initializeServerOperations({env:remoteEnv,createLocalRuntime,createRemoteClient})).rejects.toThrow();
    expect(createLocalRuntime).not.toHaveBeenCalled();
  });
  it('preserves explicit local mode and rejects unknown mode without fallback', async () => {
    const runtime = {}, createLocalRuntime = vi.fn(async () => runtime), createRemoteClient = vi.fn();
    expect(await initializeServerOperations({env:{SERVER_OPERATIONS_WORKER_ENABLED:'true'},createLocalRuntime,createRemoteClient})).toEqual({runtime,remoteClient:null});
    expect(shouldStartLocalOperationsWorker({SERVER_OPERATIONS_WORKER_ENABLED:'true'})).toBe(true);
    await expect(initializeServerOperations({env:{SERVER_OPERATIONS_EXECUTION_MODE:'typo'},createLocalRuntime,createRemoteClient})).rejects.toThrow('RUNNER_CONFIGURATION_REQUIRED');
  });
  it.each([{PUBLIC_SERVER_ACCESS_ENABLED:'false'},{SERVER_LIFECYCLE_COORDINATION_ENABLED:'false'},
    {PUBLIC_SERVER_ACCESS_ENABLED:undefined},{SERVER_LIFECYCLE_COORDINATION_ENABLED:undefined}])('refuses remote mode without local customer coordination %j',async change=>{
    const createLocalRuntime=vi.fn(),createRemoteClient=vi.fn();
    await expect(initializeServerOperations({env:{...env,SERVER_OPERATIONS_EXECUTION_MODE:'remote',...change},createLocalRuntime,createRemoteClient})).rejects.toThrow('INFRASTRUCTURE_EXECUTION_DISABLED');
    expect(createRemoteClient).not.toHaveBeenCalled();expect(createLocalRuntime).not.toHaveBeenCalled();
  });
});
