import { createHash } from 'node:crypto';
import { infrastructureError } from '../repository.js';
import { readBoundedJson } from '../httpResponse.js';

const origins = { digitalocean: 'https://api.digitalocean.com', vultr: 'https://api.vultr.com' };
const fail = code => { throw infrastructureError(code); };
const verified = new WeakSet();
export const isVerifiedProviderTransport = transport => verified.has(transport);
export function providerAccountIdentity(provider, account) {
  if (provider === 'digitalocean' && typeof account?.uuid === 'string' && account.uuid) return account.uuid;
  // Vultr's account API exposes email, not a stable account UUID. Never persist PII.
  if (provider === 'vultr' && typeof account?.email === 'string' && account.email.includes('@')) {
    return `email-sha256:${createHash('sha256').update(account.email.trim().toLowerCase()).digest('hex')}`;
  }
  fail('PROVIDER_ACCOUNT_UNVERIFIED');
}

export async function connectProviderTransport({ provider, token, expectedAccountId, fetchImpl = globalThis.fetch, timeoutMs = 30000 }) {
  if (!origins[provider] || typeof token !== 'string' || !token.trim() || typeof expectedAccountId !== 'string' || !expectedAccountId ||
      typeof fetchImpl !== 'function' || !Number.isFinite(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60000) fail('PROVIDER_TRANSPORT_CONFIGURATION_REQUIRED');
  async function request({ method = 'GET', path, query = {}, body }) {
    if (!['GET', 'POST', 'PUT', 'DELETE'].includes(method) || typeof path !== 'string' || !/^\/v2\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_.:-]+)*$/.test(path) ||
        path.split('/').some(segment => segment === '.' || segment === '..') || !query || Array.isArray(query) || typeof query !== 'object') fail('INVALID_PROVIDER_REQUEST');
    const url = new URL(path, origins[provider]);
    for (const [key, value] of Object.entries(query)) {
      if (!/^[a-z_]+$/.test(key) || !['string', 'number', 'boolean'].includes(typeof value) || String(value).length > 2048) fail('INVALID_PROVIDER_REQUEST');
      url.searchParams.set(key, String(value));
    }
    const content = body === undefined ? undefined : JSON.stringify(body);
    if (content && Buffer.byteLength(content) > 1048576) fail('INVALID_PROVIDER_REQUEST');
    let response;
    try {
      response = await fetchImpl(url, { method, headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: content, redirect: 'error', signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' });
    } catch { fail('PROVIDER_REQUEST_UNCERTAIN'); }
    if (!Number.isInteger(response?.status) || response.status < 100 || response.status > 599) fail('PROVIDER_RESPONSE_INVALID');
    if (response.status === 204) return { status: 204, data: null };
    try {
      return { status: response.status, data: await readBoundedJson(response) };
    } catch { fail('PROVIDER_RESPONSE_INVALID'); }
  }
  const response = await request({ method: 'GET', path: '/v2/account' });
  if (response.status !== 200) fail('PROVIDER_ACCOUNT_UNVERIFIED');
  const accountId = providerAccountIdentity(provider, response.data?.account);
  if (accountId !== expectedAccountId) fail('PROVIDER_ACCOUNT_MISMATCH');
  const transport = Object.freeze({ provider, accountId, request });
  verified.add(transport);
  return transport;
}
