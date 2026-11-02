import { describe, expect, it, vi } from 'vitest';
import { createLiveProbes, probeClientConfiguration } from '../services/infrastructure/liveProbes.js';
import { infrastructureFixture } from './fixtures/infrastructure.js';

describe('live candidate probes', () => {
  it('uses the selected Reality endpoint and binds the client to loopback', () => {
    const config = probeClientConfiguration('vless://00000000-0000-4000-8000-000000000001@198.51.100.10:443?security=reality&type=tcp&pbk=public&sid=1234&sni=example.com&flow=xtls-rprx-vision', 19081);
    expect(config.inbounds[0]).toMatchObject({ listen: '127.0.0.1', port: 19081, protocol: 'socks' });
    expect(config.outbounds[0].streamSettings.realitySettings).toMatchObject({ publicKey: 'public', shortId: '1234', serverName: 'example.com' });
    expect(config.outbounds[0].settings.vnext[0].users[0].flow).toBe('xtls-rprx-vision');
  });
  it('cleans the operation-scoped temporary user and creates a fresh identity for the next verification', async () => {
    const f = await infrastructureFixture();
    const states = new Map(), users = new Map();
    const store = { readState: async key => states.get(key) || { value: null, version: null },
      saveState: async (key, value) => states.set(key, { value: structuredClone(value), version: 1 }) };
    const transport = { list: async () => [...users.values()], request: vi.fn(async ({method,path,body}) => {
      const username = path.split('/').at(-1);
      if (method === 'POST') { users.set(body.username, { ...body, key: 'fixture-key' }); return { status: 200, data: users.get(body.username) }; }
      if (method === 'DELETE') { users.delete(username); return { status: 204 }; }
      return { status: users.has(username) ? 200 : 404, data: users.get(username) };
    }) };
    const candidate = { resource: f.resource, operation: f.operation, privateServices: [f.own('service','503')], address: '198.51.100.10' };
    const probes = createLiveProbes({ context: f.context, store, transport, renewLease: async () => {} });
    const first = await probes.create({ candidate, operation: f.operation });
    expect(await probes.cleanup({ candidate, operationId: f.operation.id })).toBe(true);
    expect(users.size).toBe(0);
    const next = await probes.create({ candidate, operation: f.operation });
    expect(next.username).not.toBe(first.username);
    expect(users.size).toBe(1);
  });
  it.each([false, true])('verifies a published VLESS node through global membership (stale private receipt: %s)', async stale => {
    const f = await infrastructureFixture(); const states = new Map(), users = new Map();
    const global = f.own('service', '502');
    const inbound = f.own('inbound', '101', { protocol: 'vless' });
    const host = f.own('host', '30', { inbound_id: 101 });
    const temporary = f.own('service', '503', { protocol: 'vless', inbound_ids: [101] });
    const store = { readState: async key => states.get(key) || { value: null }, saveState: async (key, value) => states.set(key, { value: structuredClone(value), version: 1 }) };
    const transport = { request: vi.fn(async ({ method, path, body }) => {
      if (path === '/api/services/503') return { status: 404 };
      if (path === '/api/services/502') return { status: 200, data: { id: 502, inbound_ids: [101] } };
      if (path === '/api/inbounds/hosts/30') return { status: 200, data: { id: 30, inbound_id: 101, service_ids: [502], is_disabled: false } };
      if (method === 'POST') { users.set(body.username, { ...body, key: 'fixture' }); return { status: 200 }; }
      if (method === 'DELETE') { users.delete(path.split('/').at(-1)); return { status: 204 }; }
      const user = users.get(path.split('/').at(-1)); return { status: user ? 200 : 404, data: user };
    }) };
    const candidate = { resource: f.resource, operation: f.operation, supportedProtocols: ['vless'],
      inbounds: [inbound], hosts: [host], publicService: global, privateServices: stale ? [temporary] : [] };
    const probes = createLiveProbes({ context: f.context, store, transport, renewLease: async () => {} });
    await probes.create({ candidate, operation: f.operation });
    expect([...users.values()][0].service_ids).toEqual([502]);
    expect(transport.request.mock.calls.filter(([r]) => r.method === 'POST').map(([r]) => r.path)).toEqual(['/api/users']);
    await probes.cleanup({ candidate, operationId: f.operation.id });
  });
  it('does not use the global service when the candidate inbound is not published', async () => {
    const f = await infrastructureFixture();
    const candidate = { resource: f.resource, operation: f.operation, supportedProtocols: ['vless'],
      inbounds: [f.own('inbound', '101', { protocol: 'vless' })], hosts: [], privateServices: [], publicService: f.own('service', '502') };
    const transport = { request: vi.fn(async () => ({ status: 200, data: { id: 502, inbound_ids: [99] } })) };
    const probes = createLiveProbes({ context: f.context, store: {}, transport, renewLease: async () => {} });
    await expect(probes.create({ candidate, operation: f.operation })).rejects.toMatchObject({ code: 'SERVICE_MEMBERSHIP_CHANGED' });
    expect(transport.request.mock.calls.every(([r]) => r.method === 'GET')).toBe(true);
  });
});
