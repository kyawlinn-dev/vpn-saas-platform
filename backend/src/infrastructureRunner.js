import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'dotenv';
import { readRunnerScope } from './services/infrastructure/runnerProtocol.js';
import { runnerSubscriptionConfig } from './services/infrastructure/runnerSubscriptionConfig.js';

const fail = () => { throw new Error('RUNNER_CONFIGURATION_REQUIRED'); };

export function readRunnerEnvironment({ env = process.env, cwd = process.cwd() } = {}) {
  const file = env.SERVER_RUNNER_ENV_FILE;
  if (typeof file !== 'string' || !path.isAbsolute(file) || /^\.env(?:\.|$)/i.test(path.basename(file))) fail();
  // Fail closed even without the optional shared env-loader opt-out guard.
  if (['.env', '.env.production', '.env.local'].some(name => existsSync(path.join(cwd, name)))) fail();
  let configured;
  try { configured = parse(readFileSync(file)); } catch { fail(); }
  if (configured.NODE_ENV !== 'production' || (configured.APP_ENV && configured.APP_ENV !== 'production') ||
      !['SERVER_OPERATIONS_WORKER_ENABLED', 'PUBLIC_SERVER_ACCESS_ENABLED', 'SERVER_LIFECYCLE_COORDINATION_ENABLED']
        .every(key => configured[key] === 'true') || !/^[a-f0-9]{64}$/i.test(configured.SERVER_RUNNER_SECRET || '') ||
      !/^[a-f0-9]{64}$/i.test(configured.BOT_TOKEN_ENCRYPTION_KEY || '') ||
      !['SUPABASE_SERVICE_ROLE_KEY', 'MARZNESHIN_PANEL_USERNAME', 'MARZNESHIN_PANEL_PASSWORD'].every(key => configured[key]?.trim()) ||
      !['SERVER_INFRASTRUCTURE_CONFIG_PATH', 'SERVER_BOOTSTRAP_PRIVATE_KEY_PATH'].every(key =>
        typeof configured[key] === 'string' && path.isAbsolute(configured[key]) && !/^\.env(?:\.|$)/i.test(path.basename(configured[key])))) fail();
  const scope = readRunnerScope(configured);
  if (configured.MARZNESHIN_PANEL_URL !== scope.panelIdentity || configured.SUPABASE_URL !== `https://${scope.databaseIdentity}`) fail();
  return { env: Object.freeze({ ...configured, ...runnerSubscriptionConfig(configured), NODE_ENV: 'production', APP_ENV: 'production',
    NOVANET_ENV_LOADING_DISABLED: 'true' }), scope };
}

async function loadRunnerDependencies() {
  const { createClient } = await import('@supabase/supabase-js');
  const { createLiveInfrastructureRuntime } = await import('./services/infrastructure/liveRuntime.js');
  const { createRunnerApp } = await import('./services/infrastructure/runnerApp.js');
  const { startServerOperationsJob } = await import('./jobs/serverOperationsJob.js');
  return { createClient, createLiveInfrastructureRuntime, createRunnerApp, startServerOperationsJob };
}

export async function startInfrastructureRunner({ env = process.env, cwd = process.cwd(), loadDependencies = loadRunnerDependencies } = {}) {
  const configured = readRunnerEnvironment({ env, cwd });
  Object.assign(process.env, configured.env);
  // Must precede imports of runtime dependencies, some of which use process.env.
  process.env.NOVANET_ENV_LOADING_DISABLED = 'true';
  let operatorConfig, privateKey;
  try {
    operatorConfig = JSON.parse(readFileSync(configured.env.SERVER_INFRASTRUCTURE_CONFIG_PATH, 'utf8'));
    privateKey = readFileSync(configured.env.SERVER_BOOTSTRAP_PRIVATE_KEY_PATH, 'utf8');
    if (!privateKey.trim()) fail();
  } catch { fail(); }
  const { createClient, createLiveInfrastructureRuntime, createRunnerApp, startServerOperationsJob } = await loadDependencies();
  const client = createClient(configured.env.SUPABASE_URL, configured.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const runtime = await createLiveInfrastructureRuntime({ env: configured.env, client, operatorConfig, privateKey });
  const app = createRunnerApp({ runtime, scope: configured.scope, secret: configured.env.SERVER_RUNNER_SECRET });
  let stopping = false;
  const activeSteps = new Set();
  const workerRuntime = { ...runtime, repository: { ...runtime.repository,
    claimOperation: input => {
      if (stopping) throw new Error('RUNNER_STOPPING');
      return runtime.repository.claimOperation(input);
    } }, canRunOperation: async operation => !stopping && (!runtime.canRunOperation || await runtime.canRunOperation(operation)),
    withLease: async (lease, step) => {
      if (stopping) throw new Error('RUNNER_STOPPING');
      const pending = Promise.resolve().then(() => runtime.withLease ? runtime.withLease(lease, step) : step());
      activeSteps.add(pending);
      try { return await pending; } finally { activeSteps.delete(pending); }
    } };
  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(4317, '127.0.0.1', () => { listener.off('error', reject); resolve(listener); });
    listener.once('error', reject);
  });
  let stopWorker;
  try { stopWorker = startServerOperationsJob({ runtime: workerRuntime }); }
  catch (error) { app.locals.stopRunner(); await new Promise(resolve => server.close(resolve)); throw error; }
  let shutdownPromise;
  const shutdown = () => {
    if (shutdownPromise) return shutdownPromise;
    stopping = true; app.locals.stopRunner(); stopWorker();
    shutdownPromise = Promise.all([new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
      ...activeSteps]).finally(() => {
      process.off('SIGTERM', onSignal); process.off('SIGINT', onSignal);
    });
    return shutdownPromise;
  };
  const onSignal = () => { shutdown().catch(() => { process.exitCode = 1; }); };
  process.once('SIGTERM', onSignal); process.once('SIGINT', onSignal);
  return { app, server, shutdown };
}

let isMain = false;
try { isMain = !!process.argv[1] && import.meta.url === pathToFileURL(realpathSync(path.resolve(process.argv[1]))).href; }
catch { /* Importing the entrypoint never starts a process implicitly. */ }
if (isMain) {
  startInfrastructureRunner().catch(() => {
    process.stderr.write('DEV infrastructure runner startup failed\n');
    process.exitCode = 1;
  });
}
