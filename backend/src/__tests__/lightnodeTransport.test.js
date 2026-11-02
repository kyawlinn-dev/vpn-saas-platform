import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { connectLightNodeTransport, isVerifiedLightNodeTransport } from '../services/infrastructure/providers/lightnodeTransport.js';

const token = 'fixture-lightnode-token';
const connection = () => ({ id: '9c86ece0-1500-4000-8000-000000000001',
  credentialSha256: createHash('sha256').update(token).digest('hex'),
  anchor: { resourceId: 'ecs-anchor', region: 'jp-tokyo-1', zone: 'jp-tokyo-1-a', createdAt: '2026-10-01 12:00:00', address: '192.0.2.10' },
  attestedAt: '2026-10-31T00:00:00Z', firstContactPolicy: 'tofu' });
const instance = () => ({ ecsResourceUUID: 'ecs-anchor', regionCode: 'jp-tokyo-1', zoneCode: 'jp-tokyo-1-a',
  createTime: '2026-10-01 12:00:00', publicIpAddress: '192.0.2.10' });
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status });
const connect = (overrides = {}) => {
  const config = connection();
  return connectLightNodeTransport({ token, expectedAccountId: config.id, connection: config,
    fetchImpl: vi.fn(async () => reply({ instance: instance(), success: true }, 202)), ...overrides });
};

describe('LightNode attested transport (offline)', () => {
  it.each([200, 202])('verifies the immutable anchor at HTTP %s and labels account assurance', async status => {
    const fetchImpl = vi.fn(async () => reply({ instance: instance(), success: true }, status));
    const transport = await connect({ fetchImpl });
    expect(transport).toMatchObject({ provider: 'lightnode', accountId: connection().id, accountAssurance: 'operator-attested' });
    expect(isVerifiedLightNodeTransport(transport)).toBe(true);
    expect(isVerifiedLightNodeTransport({ ...transport })).toBe(false);
    expect(Object.isFrozen(transport)).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe('https://openapi.lightnode.com/instance/detail?ecsResourceUUID=ecs-anchor');
    expect(init).toMatchObject({ method: 'GET', redirect: 'error', cache: 'no-store', headers: { 'x-open-token': token } });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.stringify(transport)).not.toContain(token);
  });
  it.each(['ecsResourceUUID', 'regionCode', 'zoneCode', 'createTime', 'publicIpAddress'])('rejects changed anchor %s', async field => {
    await expect(connect({ fetchImpl: async () => reply({ instance: { ...instance(), [field]: 'changed' } }) }))
      .rejects.toMatchObject({ code: 'PROVIDER_ACCOUNT_MISMATCH' });
  });
  it('rejects fingerprint/connection/policy changes before sending credentials', async () => {
    for (const patch of [{ credentialSha256: 'a'.repeat(64) }, { id: 'another' }, { attestedAt: 'invalid' }, { firstContactPolicy: 'implicit' }, { anchor: {} }]) {
      const fetchImpl = vi.fn();
      await expect(connect({ connection: { ...connection(), ...patch }, fetchImpl })).rejects.toBeInstanceOf(Error);
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  });
  it.each([401, 403, 404, 429, 500])('does not trust unsuccessful anchor status %s', async status => {
    await expect(connect({ fetchImpl: async () => reply({ instance: instance() }, status) })).rejects.toMatchObject({ code: 'PROVIDER_ACCOUNT_UNVERIFIED' });
  });
  it('rejects failure envelopes and malformed JSON without reflecting secrets', async () => {
    await expect(connect({ fetchImpl: async () => reply({ success: false, instance: instance() }) })).rejects.toMatchObject({ code: 'PROVIDER_ACCOUNT_UNVERIFIED' });
    await expect(connect({ fetchImpl: async () => new Response(token) })).rejects.toMatchObject({ code: 'PROVIDER_RESPONSE_INVALID', message: 'PROVIDER_RESPONSE_INVALID' });
  });
  it('bounds requests and rejects URL/query escapes before fetch', async () => {
    const fetchImpl = vi.fn(async () => reply({ instance: instance() }));
    const transport = await connect({ fetchImpl });
    for (const path of ['https://evil.invalid', '//evil.invalid', '/instance/../detail', '/instance/%64etail', '/instance/detail?token=x', '/instance/detail#x']) {
      await expect(transport.request({ path })).rejects.toMatchObject({ code: 'INVALID_PROVIDER_REQUEST' });
    }
    await expect(transport.request({ path: '/instance/list', query: { bad: {} } })).rejects.toMatchObject({ code: 'INVALID_PROVIDER_REQUEST' });
    await expect(transport.request({ path: '/instance/create', method: 'POST', body: { value: 'a'.repeat(1048577) } })).rejects.toMatchObject({ code: 'INVALID_PROVIDER_REQUEST' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('redacts network errors, does not retry, and passes statuses to the caller', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(reply({ instance: instance() }))
      .mockRejectedValueOnce(new Error(token)).mockResolvedValueOnce(reply({ success: false }, 429));
    const transport = await connect({ fetchImpl });
    await expect(transport.request({ path: '/region/list' })).rejects.toMatchObject({ code: 'PROVIDER_REQUEST_UNCERTAIN', message: 'PROVIDER_REQUEST_UNCERTAIN' });
    expect((await transport.request({ path: '/region/list' })).status).toBe(429);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
  it('rejects oversized responses and invalid timeout configuration', async () => {
    await expect(connect({ fetchImpl: async () => new Response('{}', { headers: { 'content-length': '4194305' } }) })).rejects.toMatchObject({ code: 'PROVIDER_RESPONSE_INVALID' });
    await expect(connect({ timeoutMs: 0 })).rejects.toMatchObject({ code: 'PROVIDER_TRANSPORT_CONFIGURATION_REQUIRED' });
  });
});
