import { describe, expect, it } from 'vitest';
import { readExistingCandidate } from '../services/infrastructure/liveExistingCandidate.js';
import { infrastructureFixture } from './fixtures/infrastructure.js';

async function fixture(protocols = ['vless']) {
  const f = await infrastructureFixture();
  const server = f.own('server', 'server', { provider: 'digitalocean', provider_resource_id: 'vm', panel_node_id: 51,
    supported_protocols: protocols, host_ip: '198.51.100.10' });
  f.own('node', '51'); f.own('service', '502');
  const inbounds = protocols.map((protocol, i) => ({ id: 101 + i, protocol, node: { id: 51 } }));
  const hosts = inbounds.map(row => ({ id: row.id + 100, inbound_id: row.id, is_disabled: false, port: row.protocol === 'vless' ? 443 : 8388,
    reality_public_key: 'public', reality_short_ids: ['abcd'], service_ids: row.protocol === 'vless' ? [502] : [503] }));
  for (const row of inbounds) f.own('inbound', String(row.id), { protocol: row.protocol });
  for (const row of hosts) f.own('host', String(row.id), { inbound_id: row.inbound_id });
  const services = [{ id: 502, inbound_ids: [101] }];
  if (protocols.includes('shadowsocks')) {
    services.push({ id: 503, inbound_ids: [102] }); f.own('service', '503', { protocol: 'shadowsocks' });
  }
  const store = { getResource: async ({ kind, id }) => f.records.get(`${kind}:${id}`) };
  const panelTransport = { list: async path => path === '/api/inbounds' ? inbounds : path === '/api/services' ? services :
    hosts.filter(row => row.inbound_id === Number(path.split('/')[3])) };
  return { ...f, server, inbounds, hosts, services, input: { context: f.context, store, panelTransport, providers: { digitalocean: { inspect: async () => f.resource } }, server, lease: f.operation } };
}

describe('published candidate loading', () => {
  it.each([['vless'], ['vless', 'shadowsocks']])('loads %j without a private VLESS service', async (...protocols) => {
    const f = await fixture(protocols);
    const candidate = await readExistingCandidate(f.input);
    expect(candidate.privateServices.map(row => row.protocol)).toEqual(protocols.includes('shadowsocks') ? ['shadowsocks'] : []);
    expect(candidate.publicService.id).toBe('502');
    expect(candidate.inbounds).toHaveLength(protocols.length);
  });
  it('rejects missing SS service rather than using global VLESS for SS', async () => {
    const f = await fixture(['vless', 'shadowsocks']); f.services.pop();
    await expect(readExistingCandidate(f.input)).rejects.toMatchObject({ code: 'CANDIDATE_REGISTRATION_INVALID' });
  });
  it('rejects a VLESS node missing from the global service', async () => {
    const f = await fixture(); f.services[0].inbound_ids = [];
    await expect(readExistingCandidate(f.input)).rejects.toMatchObject({ code: 'CANDIDATE_REGISTRATION_INVALID' });
  });
});
