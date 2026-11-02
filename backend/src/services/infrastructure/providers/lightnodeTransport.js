import { createHash, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { infrastructureError } from '../repository.js';
import { readBoundedJson } from '../httpResponse.js';

const fail = code => { throw infrastructureError(code); };
const verified = new WeakSet();
const id = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(value);
const text = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 200;
export const isVerifiedLightNodeTransport = transport => verified.has(transport);

// This binds an operator-attested connection, not a vendor-provided account ID.
// Contract: https://apidoc.lightnode.com/en/441237889e0.md
export async function connectLightNodeTransport({ token, expectedAccountId, connection, fetchImpl = globalThis.fetch, timeoutMs = 30000 } = {}) {
  const anchor = connection?.anchor;
  if (typeof token !== 'string' || !token || token !== token.trim() || /[\r\n]/.test(token) ||
      typeof fetchImpl !== 'function' || !Number.isFinite(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60000 ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(connection?.id || '') ||
      !/^[a-f0-9]{64}$/.test(connection?.credentialSha256 || '') || !text(connection?.attestedAt) ||
      !Number.isFinite(Date.parse(connection.attestedAt)) || connection.firstContactPolicy !== 'tofu' ||
      !id(anchor?.resourceId) || !id(anchor?.region) || !id(anchor?.zone) || !text(anchor?.createdAt) ||
      typeof anchor?.address !== 'string' || !isIP(anchor.address)) fail('PROVIDER_TRANSPORT_CONFIGURATION_REQUIRED');
  if (connection.id !== expectedAccountId) fail('PROVIDER_ACCOUNT_MISMATCH');
  const fingerprint = createHash('sha256').update(token).digest();
  if (!timingSafeEqual(fingerprint, Buffer.from(connection.credentialSha256, 'hex'))) fail('PROVIDER_ACCOUNT_MISMATCH');
  const evidence = Object.freeze({ id: connection.id, credentialSha256: connection.credentialSha256,
    anchor: Object.freeze({ resourceId: anchor.resourceId, region: anchor.region, zone: anchor.zone,
      createdAt: anchor.createdAt, address: anchor.address }), attestedAt: connection.attestedAt, firstContactPolicy: 'tofu' });

  async function request({ method = 'GET', path, query = {}, body } = {}) {
    if (!['GET', 'POST', 'PUT', 'DELETE'].includes(method) || typeof path !== 'string' ||
        !/^\/[A-Za-z][A-Za-z0-9_-]*(?:\/[A-Za-z0-9][A-Za-z0-9_.:-]*)+$/.test(path) ||
        path.split('/').some(part => part === '.' || part === '..') ||
        !query || typeof query !== 'object' || Array.isArray(query) || (method === 'GET' && body !== undefined)) fail('INVALID_PROVIDER_REQUEST');
    const url = new URL(path, 'https://openapi.lightnode.com');
    for (const [key, value] of Object.entries(query)) {
      if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(key) || !['string', 'number', 'boolean'].includes(typeof value) ||
          (typeof value === 'number' && !Number.isFinite(value)) || String(value).length > 2048) fail('INVALID_PROVIDER_REQUEST');
      url.searchParams.set(key, String(value));
    }
    let content;
    try { content = body === undefined ? undefined : JSON.stringify(body); } catch { fail('INVALID_PROVIDER_REQUEST'); }
    if (content !== undefined && Buffer.byteLength(content) > 1048576) fail('INVALID_PROVIDER_REQUEST');
    let response;
    try {
      response = await fetchImpl(url, { method, headers: { 'x-open-token': token, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: content, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
    } catch { fail('PROVIDER_REQUEST_UNCERTAIN'); }
    if (!Number.isInteger(response?.status) || response.status < 100 || response.status > 599 || response.redirected) fail('PROVIDER_RESPONSE_INVALID');
    if (response.status === 204) return { status: 204, data: null };
    try { return { status: response.status, data: await readBoundedJson(response) }; }
    catch { fail('PROVIDER_RESPONSE_INVALID'); }
  }
  const response = await request({ path: '/instance/detail', query: { ecsResourceUUID: evidence.anchor.resourceId } });
  if (![200, 202].includes(response.status) || response.data?.success === false ||
      (response.data?.httpStatus !== undefined && ![200, 202].includes(response.data.httpStatus)) ||
      !response.data?.instance || typeof response.data.instance !== 'object' || Array.isArray(response.data.instance)) fail('PROVIDER_ACCOUNT_UNVERIFIED');
  const instance = response.data.instance;
  if (instance.ecsResourceUUID !== evidence.anchor.resourceId || instance.regionCode !== evidence.anchor.region ||
      instance.zoneCode !== evidence.anchor.zone || instance.createTime !== evidence.anchor.createdAt ||
      instance.publicIpAddress !== evidence.anchor.address) fail('PROVIDER_ACCOUNT_MISMATCH');
  const transport = Object.freeze({ provider: 'lightnode', accountId: evidence.id, accountAssurance: 'operator-attested', connection: evidence, request });
  verified.add(transport);
  return transport;
}
