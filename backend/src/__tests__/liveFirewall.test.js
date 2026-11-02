import { describe, expect, it } from 'vitest';
import { verifyProviderFirewall } from '../services/infrastructure/liveFirewall.js';
describe('provider firewall evidence',()=>{
  const machine = {firewallId:'firewall',firewallTag:'novanet-dev'};
  const rules = [{protocol:'tcp',ports:'22',sources:{addresses:['192.0.2.2/32']}},
    {protocol:'tcp',ports:'62050',sources:{addresses:['192.0.2.2/32']}},
    {protocol:'tcp',ports:'443',sources:{addresses:['0.0.0.0/0','::/0']}}];
  const transport = body => ({request:async()=>({status:200,data:body})});
  it('accepts only the approved tagged group with restricted management and expected listeners',async()=>{
    expect(await verifyProviderFirewall({provider:'digitalocean',transport:transport({firewall:{id:'firewall',tags:['novanet-dev'],inbound_rules:rules}}),machine,managementSources:['192.0.2.2'],profile:'vless_only'})).toBe(true);
  });
  it('rejects broad management rules even when another restrictive rule exists',async()=>{
    expect(await verifyProviderFirewall({provider:'digitalocean',transport:transport({firewall:{id:'firewall',tags:['novanet-dev'],inbound_rules:[...rules,{protocol:'tcp',ports:'1-65535',sources:{addresses:['0.0.0.0/0']}}]}}),machine,managementSources:['192.0.2.2'],profile:'vless_only'})).toBe(false);
  });
  it('requires both operator and panel addresses to be allowed on each management port',async()=>{
    expect(await verifyProviderFirewall({provider:'digitalocean',transport:transport({firewall:{id:'firewall',tags:['novanet-dev'],inbound_rules:rules}}),machine,managementSources:['192.0.2.2','192.0.2.3'],profile:'vless_only'})).toBe(false);
  });
  function firewallInput(provider, inboundRules, profile = 'dual') {
    const body = provider === 'digitalocean'
      ? { firewall: { id: machine.firewallId, tags: [machine.firewallTag], inbound_rules: inboundRules } }
      : { firewall_rules: inboundRules.flatMap(row => row.sources.addresses.map(address => {
        const [subnet, prefix] = address.split('/');
        return { action: 'accept', protocol: row.protocol, port: row.ports, subnet,
          subnet_size: Number(prefix), source: address, direction: 'in', loadbalancer_id: '' };
      })), meta: { links: { next: '' } } };
    return { provider, transport: transport(body), machine, managementSources: ['192.0.2.2'], profile };
  }
  const dualRules = () => [...structuredClone(rules),
    { protocol: 'tcp', ports: '8388', sources: { addresses: ['0.0.0.0/0', '::/0'] } },
    { protocol: 'udp', ports: '8388', sources: { addresses: ['0.0.0.0/0', '::/0'] } }];
  describe.each(['digitalocean', 'vultr'])('%s public customer ingress', provider => {
    it('accepts public VPN listeners, including separate IPv4/IPv6 rules', async () => {
      expect(await verifyProviderFirewall(firewallInput(provider, dualRules()))).toBe(true);
    });
    it.each([['tcp', '443'], ['tcp', '8388'], ['udp', '8388']])(
      'rejects operator-only access to %s/%s', async (protocol, port) => {
        const input = dualRules();
        input.find(row => row.protocol === protocol && row.ports === port).sources.addresses = ['192.0.2.2/32'];
        expect(await verifyProviderFirewall(firewallInput(provider, input))).toBe(false);
      });
    it('rejects IPv6-only VPN ingress because candidates require public IPv4', async () => {
      const input = structuredClone(rules);
      input[2].sources.addresses = ['::/0'];
      expect(await verifyProviderFirewall(firewallInput(provider, input, 'vless_only'))).toBe(false);
    });
    it('accepts public IPv4 VPN ingress without requiring IPv6 on the candidate', async () => {
      const input = dualRules();
      for (const rule of input) rule.sources.addresses = rule.sources.addresses.filter(address => address !== '::/0');
      expect(await verifyProviderFirewall(firewallInput(provider, input))).toBe(true);
    });
  });
  it.each(['cidr', 'cloudflare', 'outbound', 'loadbalancer'])('validates actual Vultr source evidence: %s', async kind => {
    const firewall_rules = rules.map(row => {
      const [subnet, prefix] = row.sources.addresses[0].split('/');
      return { action: 'accept', protocol: row.protocol, port: row.ports, subnet,
        subnet_size: Number(prefix), source: `${subnet}/${prefix}`, direction: 'in', loadbalancer_id: '' };
    });
    if (kind === 'cloudflare') firewall_rules[0].source = 'cloudflare';
    if (kind === 'outbound') firewall_rules[0].direction = 'out';
    if (kind === 'loadbalancer') firewall_rules[0].loadbalancer_id = 'foreign';
    const result = await verifyProviderFirewall({ provider: 'vultr', machine,
      transport: transport({ firewall_rules, meta: { total: firewall_rules.length, links: { next: '' } } }),
      managementSources: ['192.0.2.2'], profile: 'vless_only' });
    expect(result).toBe(kind === 'cidr');
  });
});
