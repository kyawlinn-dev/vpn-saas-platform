import { isIP } from 'node:net';

export async function verifyProviderFirewall({provider,transport,machine,managementSources,profile}) {
  if (!machine?.firewallId || !managementSources?.length || managementSources.some(ip=>!isIP(ip))) return false;
  let rules;
  if (provider === 'digitalocean') {
    const response = await transport.request({method:'GET',path:`/v2/firewalls/${machine.firewallId}`});
    const group = response.data?.firewall;
    if (response.status!==200 || group?.id!==machine.firewallId || !group.tags?.includes(machine.firewallTag) || !Array.isArray(group.inbound_rules)) return false;
    rules = group.inbound_rules.map(row=>({protocol:row.protocol,ports:row.ports,addresses:row.sources?.addresses,
      indirect:Object.keys(row.sources||{}).some(key=>key!=='addresses' && row.sources[key]?.length)}));
  } else if (provider === 'vultr') {
    const response = await transport.request({method:'GET',path:`/v2/firewalls/${machine.firewallId}/rules`,query:{per_page:500}});
    if (response.status!==200 || !Array.isArray(response.data?.firewall_rules) || response.data.meta?.links?.next) return false;
    if(response.data.firewall_rules.some(row=>row.action!=='accept'))return false;
    rules = response.data.firewall_rules.map(row=>{
      const cidr=`${row.subnet}/${row.subnet_size}`;
      return {protocol:row.protocol,ports:row.port,addresses:[cidr],
        indirect:!!row.source && row.source!==cidr || !!row.loadbalancer_id || row.direction!==undefined && row.direction!=='in'};
    });
  } else return false;
  const publicListeners = ['tcp:443', ...(profile==='dual'?['tcp:8388','udp:8388']:[])];
  const expected = new Set(['tcp:22','tcp:62050',...publicListeners]);
  const found = new Set();
  const exactSources = new Set(managementSources.flatMap(ip=>[ip,`${ip}/${isIP(ip)===4?32:128}`]));
  for (const rule of rules) {
    if (rule.protocol==='icmp' || rule.protocol==='icmpv6') continue;
    const key = `${rule.protocol}:${rule.ports}`;
    if (!expected.has(key) || rule.indirect || !Array.isArray(rule.addresses) || !rule.addresses.length) return false;
    if (['22','62050'].includes(String(rule.ports)) && rule.addresses.some(ip=>!exactSources.has(ip))) return false;
    found.add(key);
  }
  // Candidates require public IPv4; a local tunnel probe cannot prove ingress.
  const publicIngress = publicListeners.every(key => rules.some(rule =>
    `${rule.protocol}:${rule.ports}` === key && rule.addresses.includes('0.0.0.0/0')));
  return publicIngress && [...expected].every(key=>found.has(key)) && ['22','62050'].every(port=>managementSources.every(ip=>
    rules.some(rule=>String(rule.ports)===port && rule.protocol==='tcp' && rule.addresses.some(address=>address===ip || address===`${ip}/${isIP(ip)===4?32:128}`))));
}
