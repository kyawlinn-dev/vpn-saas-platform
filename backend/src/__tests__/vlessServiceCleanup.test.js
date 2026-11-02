import { describe, expect, it, vi } from 'vitest';
import { removePrivateVlessService } from '../services/infrastructure/vlessServiceCleanup.js';

function fixture() {
  const services = new Map([[14, { id: 14, inbound_ids: [8, 16] }], [18, { id: 18, name: 'private', inbound_ids: [16], user_ids: [] }]]);
  const inbound = { id: 16, protocol: 'vless', node: { id: 8 } };
  const host = { id: 30, inbound_id: 16, address: '198.51.100.10', port: 443, service_ids: [18, 14], is_disabled: false, remark: 'keep' };
  const request = vi.fn(async (method, path, body) => {
    const id = Number(path.split('/').at(-1));
    if (path.startsWith('/api/services/')) {
      if (method === 'DELETE') { services.delete(id); return null; }
      return structuredClone(services.get(id) || null);
    }
    if (path === '/api/inbounds/16') return structuredClone(inbound);
    if (path === '/api/inbounds/hosts/30') {
      if (method === 'PUT') Object.assign(host, body);
      return structuredClone(host);
    }
    throw Error('Unexpected request');
  });
  const list = vi.fn(async () => [structuredClone(host)]);
  const assertOwned = vi.fn(async () => {});
  const input = { service: { id: '18', protocol: 'vless', inbound_ids: [16], node_ids: [8] }, globalServiceId: '14', request, list, assertOwned };
  return { services, inbound, host, request, list, assertOwned, input };
}

describe('private VLESS verification service cleanup', () => {
  it('removes only the unused VLESS service and its host filter, preserving the global service', async () => {
    const f = fixture(); const before = structuredClone(f.services.get(14));
    await removePrivateVlessService(f.input);
    expect(f.services.has(18)).toBe(false);
    expect(f.services.get(14)).toEqual(before);
    expect(f.host).toMatchObject({ service_ids: [14], remark: 'keep', address: '198.51.100.10' });
    expect(f.assertOwned.mock.calls).toEqual(expect.arrayContaining([['service', '18'], ['service', '14'], ['inbound', '16'], ['node', '8'], ['host', '30']]));
    await removePrivateVlessService(f.input);
    expect(f.request.mock.calls.filter(([method]) => method === 'DELETE')).toHaveLength(1);
  });
  it.each(['users', 'missing_global', 'ss', 'foreign_inbound', 'foreign_host_service', 'ownership'])('refuses unsafe cleanup: %s', async kind => {
    const f = fixture();
    if (kind === 'users') f.services.get(18).user_ids = [1];
    if (kind === 'missing_global') f.services.get(14).inbound_ids = [8];
    if (kind === 'ss') f.inbound.protocol = 'shadowsocks';
    if (kind === 'foreign_inbound') f.services.get(18).inbound_ids.push(99);
    if (kind === 'foreign_host_service') f.host.service_ids.push(5);
    if (kind === 'ownership') f.assertOwned.mockRejectedValue(Error('Foreign resource'));
    await expect(removePrivateVlessService(f.input)).rejects.toThrow();
    expect(f.request.mock.calls.every(([method]) => method === 'GET')).toBe(true);
  });
  it('blocks deletion if users appear after the host-filter update', async () => {
    const f = fixture(); const original = f.request.getMockImplementation();
    f.request.mockImplementation(async (...args) => {
      const result = await original(...args);
      if (args[0] === 'PUT') f.services.get(18).user_ids = [9];
      return result;
    });
    await expect(removePrivateVlessService(f.input)).rejects.toThrow();
    expect(f.services.has(18)).toBe(true);
  });
  it('reconciles a lost delete response after the service was deleted', async () => {
    const f = fixture(); const original = f.request.getMockImplementation();
    f.request.mockImplementation(async (...args) => {
      const result = await original(...args);
      if (args[0] === 'DELETE') throw Error('Lost response');
      return result;
    });
    await removePrivateVlessService(f.input);
    expect(f.services.has(18)).toBe(false);
  });
});
