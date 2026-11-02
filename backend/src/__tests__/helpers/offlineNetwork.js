import http from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
import { vi } from 'vitest';

// Do not let owner-enabled .env.local settings override offline test fixtures.
vi.mock('../../lib/loadEnv.js', () => ({}));

const local = host => ['localhost', '127.0.0.1', '[::1]', '::1'].includes(host);
function assertLocal(input) {
  const host = typeof input === 'string' || input instanceof URL
    ? new URL(input).hostname : input?.hostname || input?.host || 'localhost';
  if (!local(host)) throw new Error('OFFLINE_TEST_NETWORK_BLOCKED');
}
for (const module of [http, https]) {
  for (const name of ['request', 'get']) {
    const original = module[name];
    module[name] = function(input, ...args) { assertLocal(input); return original.call(this, input, ...args); };
  }
}
syncBuiltinESMExports();
const originalFetch = globalThis.fetch;
globalThis.fetch = function(input, ...args) {
  assertLocal(input instanceof Request ? input.url : input);
  return originalFetch.call(this, input, ...args);
};
// Finite loopback HTTP route fixtures are allowed; external HTTP is not.
process.env.SUPABASE_URL = 'http://127.0.0.1:1';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';
process.env.SERVER_OPERATIONS_WORKER_ENABLED = 'false';
process.env.SERVER_LIFECYCLE_COORDINATION_ENABLED = 'false';
process.env.PUBLIC_SERVER_ACCESS_ENABLED = 'false';
