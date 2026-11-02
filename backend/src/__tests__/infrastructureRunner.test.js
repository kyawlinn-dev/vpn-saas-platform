import http from 'node:http';
import { once } from 'node:events';
import { EventEmitter } from 'node:events';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { infrastructureFixture } from './fixtures/infrastructure.js';
import { runnerScopeHash } from '../services/infrastructure/runnerProtocol.js';
import { createInfrastructureContext } from '../services/infrastructure/context.js';

const secret = 'ab'.repeat(32);
const servers = [], directories = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise(resolve => server.close(resolve))));
  directories.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true }));
});

async function fixture() {
  const { createRunnerApp } = await import('../services/infrastructure/runnerApp.js');
  const f = await infrastructureFixture();
  const scope = Object.fromEntries(['environment', 'poolId', 'databaseIdentity', 'panelIdentity'].map(key => [key, f.context[key]]));
  const runtime = { context: f.context, executionReady: true, repository: {
    listOperations: vi.fn(async () => []), readOperation: vi.fn(async () => { throw new Error('PRIVATE provider credentials'); }),
    requestControl: vi.fn(async () => ({ id: '11111111-1111-4111-8111-111111111111', status: 'queued', checkpoint: {} })),
  }, getCatalog: vi.fn(async input => input) };
  const app = createRunnerApp({ runtime, scope, secret });
  const server = app.listen(0, '127.0.0.1'); servers.push(server); await once(server, 'listening');
  const headers = { authorization: `Bearer ${secret}`, 'x-novanet-runner-scope': runnerScopeHash(scope) };
  const request = (url, options = {}) => new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: server.address().port, path: url,
      method: options.method || 'GET', headers: { ...headers, ...options.headers } }, res => {
      let body = ''; res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(body) }));
    });
    req.on('error', reject); req.end(options.body);
  });
  return { app, runtime, scope, request, createRunnerApp };
}

describe('standalone DEV infrastructure runner', () => {
  it('authenticates health and returns only the bound scope', async () => {
    const f = await fixture(); const response = await f.request('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, role: 'dev-infrastructure-runner', version: 1, scope: f.scope });
    expect(response.headers['x-novanet-runner-scope']).toBe(runnerScopeHash(f.scope));
    expect(f.runtime.repository.listOperations).not.toHaveBeenCalled();
  });
  it.each(['', 'Bearer bad', `Bearer ${'cd'.repeat(32)}`])('rejects invalid auth before parsing: %s', async authorization => {
    const f = await fixture();
    const response = await f.request('/operations', { method: 'POST', headers: { authorization, 'content-type': 'application/json' }, body: '{PRIVATE' });
    expect(response.status).toBe(401);
    expect(JSON.stringify(response.body)).not.toContain('PRIVATE');
    expect(response.headers['x-novanet-runner-scope']).toBe(runnerScopeHash(f.scope));
    expect(f.runtime.repository.requestControl).not.toHaveBeenCalled();
  });
  it.each(['', 'wrong'])('rejects absent/wrong scope before handlers: %s', async hash => {
    const f = await fixture();
    expect((await f.request('/operations', { headers: { 'x-novanet-runner-scope': hash } })).status).toBe(403);
    expect(f.runtime.repository.listOperations).not.toHaveBeenCalled();
  });
  it('rejects unverified and mismatched runtime contexts and invalid secrets', async () => {
    const f = await fixture();
    expect(() => f.createRunnerApp({ runtime: { ...f.runtime, context: { ...f.runtime.context } }, scope: f.scope, secret })).toThrow();
    for (const key of ['environment', 'poolId', 'databaseIdentity', 'panelIdentity']) {
      expect(() => f.createRunnerApp({ runtime: f.runtime, scope: { ...f.scope, [key]: 'foreign' }, secret })).toThrow();
    }
    for (const value of [undefined, '', 'a'.repeat(63), 'g'.repeat(64)]) {
      expect(() => f.createRunnerApp({ runtime: f.runtime, scope: f.scope, secret: value })).toThrow();
    }
  });
  it('checks the socket address, ignoring forwarded loopback headers', async () => {
    const f = await fixture();
    const boundary = f.app.router.stack.find(layer => layer.name === 'runnerBoundary').handle;
    for (const remoteAddress of [undefined, '198.51.100.2']) {
      const res = { set: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();
      boundary({ socket: { remoteAddress }, get: name => name === 'x-forwarded-for' ? '127.0.0.1' : undefined }, res, next);
      expect(res.status).toHaveBeenCalledWith(403); expect(next).not.toHaveBeenCalled();
    }
  });
  it.each(['/calls', '/api/admin/servers', '/operations/not-a-uuid', '/operations?url=https://example.com', '/health?x=1', '/operations/catalog?provider=digitalocean&url=x'])('rejects unknown paths/queries: %s', async url => {
    const f = await fixture(); expect((await f.request(url)).status).toBe(404);
    expect(f.runtime.repository.listOperations).not.toHaveBeenCalled();
  });
  it('preserves read/catalog behavior and existing command validation', async () => {
    const f = await fixture();
    expect((await f.request('/operations')).body.operations).toEqual([]);
    expect((await f.request('/operations/catalog?provider=digitalocean&region=sgp1')).body).toEqual({ provider: 'digitalocean', region: 'sgp1', refresh: false });
    expect((await f.request('/operations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status).toBe(400);
    expect(f.runtime.repository.requestControl).not.toHaveBeenCalled();
  });
  it('sanitizes parser, size and runtime errors with the scope header', async () => {
    const f = await fixture();
    const cases = [
      ['/operations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{PRIVATE' }, 400],
      ['/operations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ private: 'x'.repeat(65536) }) }, 413],
      ['/operations/11111111-1111-4111-8111-111111111111', {}, 503],
    ];
    for (const [url, options, status] of cases) {
      const response = await f.request(url, options);
      expect(response.status).toBe(status); expect(JSON.stringify(response.body)).not.toMatch(/PRIVATE|credentials|SyntaxError/);
      expect(response.headers['x-novanet-runner-scope']).toBe(runnerScopeHash(f.scope));
    }
  });
  it('refuses requests after shutdown begins', async () => {
    const f = await fixture(); f.app.locals.stopRunner();
    expect((await f.request('/operations', { method: 'POST', body: '{}' })).status).toBe(503);
    expect(f.runtime.repository.listOperations).not.toHaveBeenCalled();
  });
  it('does not admit a command whose body finishes after shutdown', async () => {
    const f = await fixture();
    const id = '11111111-1111-4111-8111-111111111111';
    const response = new Promise((resolve, reject) => {
      const server = servers.at(-1);
      const req = http.request({ hostname: '127.0.0.1', port: server.address().port, path: `/operations/${id}/cancel`, method: 'POST',
        headers: { authorization: `Bearer ${secret}`, 'x-novanet-runner-scope': runnerScopeHash(f.scope), 'content-type': 'application/json', 'content-length': 2 } }, res => {
        res.resume(); res.on('end', () => resolve(res.statusCode));
      });
      req.on('error', reject);
      server.once('request', () => { f.app.locals.stopRunner(); req.end('}'); });
      req.write('{');
    });
    expect(await response).toBe(503);
    expect(f.runtime.repository.requestControl).not.toHaveBeenCalled();
  });
});

function environmentFixture() {
  const cwd = mkdtempSync(path.join(tmpdir(), 'novanet-runner-')); directories.push(cwd);
  const values = { NODE_ENV: 'production', SERVER_ACCESS_ENVIRONMENT: 'development',
    SUPABASE_URL: 'https://huqmzvlzfcexycdrsxpn.supabase.co', SERVER_ACCESS_DATABASE_IDENTITY: 'huqmzvlzfcexycdrsxpn.supabase.co',
    SERVER_ACCESS_PANEL_IDENTITY: 'https://panel.example.com', SERVER_ACCESS_POOL_ID: '11111111-1111-4111-8111-111111111111',
    MARZNESHIN_PANEL_URL: 'https://panel.example.com', MARZNESHIN_PANEL_USERNAME: 'runner', MARZNESHIN_PANEL_PASSWORD: 'private',
    PUBLIC_SUBSCRIPTION_BASE_URL: 'https://dev.example.com',
    SERVER_OPERATIONS_WORKER_ENABLED: 'true', PUBLIC_SERVER_ACCESS_ENABLED: 'true', SERVER_LIFECYCLE_COORDINATION_ENABLED: 'true',
    SERVER_RUNNER_SECRET: secret, SUPABASE_SERVICE_ROLE_KEY: 'fixture', BOT_TOKEN_ENCRYPTION_KEY: 'ef'.repeat(32),
    SERVER_INFRASTRUCTURE_CONFIG_PATH: path.join(cwd, 'infrastructure.json'), SERVER_BOOTSTRAP_PRIVATE_KEY_PATH: path.join(cwd, 'runner.key') };
  const envFile = path.join(cwd, 'runner.env');
  const write = () => writeFileSync(envFile, Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n'));
  write(); return { cwd, values, write, env: { SERVER_RUNNER_ENV_FILE: envFile } };
}

describe('runner entrypoint configuration', () => {
  it('rejects missing permanent-link configuration before loading runtime dependencies', async () => {
    const {readRunnerEnvironment}=await import('../infrastructureRunner.js');
    const f=environmentFixture();delete f.values.PUBLIC_SUBSCRIPTION_BASE_URL;f.write();
    expect(()=>readRunnerEnvironment({env:f.env,cwd:f.cwd})).toThrow('RUNNER_SUBSCRIPTION_CONFIGURATION_REQUIRED');
  });
  it('imports without startup and loads only the explicitly selected environment', async () => {
    const { readRunnerEnvironment } = await import('../infrastructureRunner.js');
    const f = environmentFixture();
    const result = readRunnerEnvironment({ env: { ...f.env, SUPABASE_URL: 'https://production.example.com' }, cwd: f.cwd });
    expect(result.env.SUPABASE_URL).toBe(f.values.SUPABASE_URL);
    expect(result.env.NODE_ENV).toBe('production'); expect(result.scope.environment).toBe('development');
  });
  it('fails closed on generic env files, relative paths, nonproduction mode and unsafe scope/flags', async () => {
    const { readRunnerEnvironment } = await import('../infrastructureRunner.js'); const f = environmentFixture();
    expect(() => readRunnerEnvironment({ env: {}, cwd: f.cwd })).toThrow();
    expect(() => readRunnerEnvironment({ env: { SERVER_RUNNER_ENV_FILE: 'runner.env' }, cwd: f.cwd })).toThrow();
    for (const [key, value] of [['NODE_ENV', 'development'], ['SERVER_ACCESS_ENVIRONMENT', 'production'], ['PUBLIC_SERVER_ACCESS_ENABLED', '1'], ['SERVER_OPERATIONS_WORKER_ENABLED', 'false'], ['SERVER_LIFECYCLE_COORDINATION_ENABLED', 'TRUE'], ['SUPABASE_URL', 'https://production.example.com'], ['SERVER_RUNNER_SECRET', 'bad'], ['SERVER_BOOTSTRAP_PRIVATE_KEY_PATH', 'relative.key']]) {
      const previous = f.values[key]; f.values[key] = value; f.write();
      expect(() => readRunnerEnvironment({ env: f.env, cwd: f.cwd }), key).toThrow(); f.values[key] = previous; f.write();
    }
    for (const name of ['.env', '.env.production', '.env.local']) {
      writeFileSync(path.join(f.cwd, name), 'PRIVATE=secret');
      expect(() => readRunnerEnvironment({ env: f.env, cwd: f.cwd })).toThrow(); rmSync(path.join(f.cwd, name));
    }
  });
  it('has no full backend, telemetry, bot or customer-job startup imports', () => {
    const source = readFileSync(new URL('../infrastructureRunner.js', import.meta.url), 'utf8');
    expect(source).not.toMatch(/(?:from\s*|import\s*\()["'][^"']*(?:server\.js|sentry|bot\/|loadEnv|lib\/supabase)/);
    expect([...source.matchAll(/import\(['"]([^'"]*jobs\/[^'"]*)['"]\)/g)].map(match => match[1])).toEqual(['./jobs/serverOperationsJob.js']);
  });
  it('loads dependencies only after validation and uses explicit credentials with a loopback-only listener', async () => {
    const { startInfrastructureRunner } = await import('../infrastructureRunner.js');
    const { createRunnerApp } = await import('../services/infrastructure/runnerApp.js');
    const f = environmentFixture();
    writeFileSync(f.values.SERVER_INFRASTRUCTURE_CONFIG_PATH, '{"fixture":true}');
    writeFileSync(f.values.SERVER_BOOTSTRAP_PRIVATE_KEY_PATH, 'fixture private key');
    const base = await infrastructureFixture();
    const scope = { environment: 'development', poolId: f.values.SERVER_ACCESS_POOL_ID,
      databaseIdentity: f.values.SERVER_ACCESS_DATABASE_IDENTITY, panelIdentity: f.values.SERVER_ACCESS_PANEL_IDENTITY };
    const config = { ...base.context, ...scope };
    const context = await createInfrastructureContext({ config, registry: base.registry,
      adapters: { ...base.adapters, inspectRuntime: async () => ({ ...config, verified: true }) } });
    const runtime = { context, repository: { claimOperation: vi.fn() } };
    const listener = new EventEmitter(); listener.close = vi.fn(callback => callback());
    const listen = vi.fn((port, host, callback) => { queueMicrotask(callback); return listener; });
    const stopWorker = vi.fn(); const client = {};
    const dependencies = { createClient: vi.fn(() => client), createLiveInfrastructureRuntime: vi.fn(async () => runtime),
      createRunnerApp: options => { const app = createRunnerApp(options); app.listen = listen; return app; },
      startServerOperationsJob: vi.fn(() => stopWorker) };
    const previous = { ...process.env }; let runner;
    try {
      runner = await startInfrastructureRunner({ env: f.env, cwd: f.cwd, loadDependencies: async () => {
        expect(process.env.NOVANET_ENV_LOADING_DISABLED).toBe('true');
        expect(process.env.NODE_ENV).toBe('production'); return dependencies;
      } });
      expect(listen).toHaveBeenCalledWith(4317, '127.0.0.1', expect.any(Function));
      expect(dependencies.createLiveInfrastructureRuntime).toHaveBeenCalledWith(expect.objectContaining({ client,
        env: expect.objectContaining({ SUPABASE_URL: f.values.SUPABASE_URL }), operatorConfig: { fixture: true }, privateKey: 'fixture private key' }));
      expect(dependencies.createClient).toHaveBeenCalledWith(f.values.SUPABASE_URL, 'fixture',
        { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
      const worker = dependencies.startServerOperationsJob.mock.calls[0][0].runtime;
      let finish;
      const step = worker.withLease({}, () => new Promise(resolve => { finish = resolve; }));
      await Promise.resolve();
      const shutdown = runner.shutdown(); let closed = false; shutdown.then(() => { closed = true; });
      await Promise.resolve(); expect(closed).toBe(false);
      expect(stopWorker).toHaveBeenCalledTimes(1);
      expect(() => worker.repository.claimOperation({})).toThrow('RUNNER_STOPPING');
      await expect(worker.canRunOperation({})).resolves.toBe(false);
      finish(); await step; await shutdown;
      expect(runner.shutdown()).toBe(shutdown);
      expect(listener.close).toHaveBeenCalledTimes(1);
    } finally { await runner?.shutdown(); process.env = previous; }
  });
});
