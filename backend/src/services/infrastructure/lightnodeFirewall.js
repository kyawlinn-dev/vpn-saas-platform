import { isIP } from 'node:net';
import { infrastructureError } from './repository.js';

const fail = () => { throw infrastructureError('NODE_FIREWALL_POLICY_UNVERIFIED'); };
const hooks = ['before-logging-input', 'before-input', 'after-input', 'after-logging-input', 'reject-input', 'track-input'];
const prefix = family => family === 4 ? 'ufw' : 'ufw6';
function host(value, family) {
  if (isIP(value) !== family) fail();
  return family === 6 ? new URL(`http://[${value}]/`).hostname.slice(1, -1) : value;
}
function sources(policy) {
  if (!Array.isArray(policy?.managementSources) || !policy.managementSources.length) fail();
  return [...new Set(policy.managementSources.map(value => {
    const family = isIP(value);
    if (!family || value.includes('%') || ['0.0.0.0', '::'].includes(host(value, family))) fail();
    return host(value, family);
  }))];
}
function dualProfile(protocols) {
  if (!Array.isArray(protocols) || !protocols.includes('vless') ||
      protocols.some(p => !['vless', 'shadowsocks'].includes(p)) || new Set(protocols).size !== protocols.length) fail();
  return protocols.includes('shadowsocks');
}
function baseline(family) {
  return ['-i lo -j ACCEPT', '-m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT',
    '-m conntrack --ctstate INVALID -j DROP', `-p ${family === 4 ? 'icmp' : 'ipv6-icmp'} -j ACCEPT`,
    family === 4 ? '-p udp -m udp --sport 67 --dport 68 -j ACCEPT' :
      '-s fe80::/10 -d fe80::/10 -p udp -m udp --sport 547 --dport 546 -j ACCEPT'];
}

/** Destructive rebuild: caller must first prove fresh operation ownership and
 * completed pinned key-auth bootstrap. Never use for shared/adopted nodes.
 * Minimal before/after files remove image defaults such as mDNS/UPnP.
 * Loopback, established replies, ICMP and narrowly scoped DHCP client replies
 * remain network control traffic (IPv6 DHCP is restricted to link-local).
 */
export function buildLightNodeFirewallCommand(policy, protocols) {
  const management = sources(policy), dual = dualProfile(protocols);
  const commands = ['set -eu', 'ufw --force reset >/dev/null',
    "sed -i 's/^IPV6=.*/IPV6=yes/' /etc/default/ufw", "grep -qx 'IPV6=yes' /etc/default/ufw",
    'ufw default deny incoming >/dev/null', 'ufw default deny routed >/dev/null',
    'ufw default allow outgoing >/dev/null', 'ufw logging off >/dev/null'];
  for (const family of [4, 6]) {
    const p = prefix(family), suffix = family === 4 ? '' : '6';
    for (const phase of ['before', 'after']) {
      const lines = ['*filter', ...['input', 'output', 'forward'].map(c => `:${p}-${phase}-${c} - [0:0]`)];
      if (phase === 'before') lines.push(...baseline(family).map(rule => `-A ${p}-before-input ${rule}`));
      lines.push('COMMIT');
      commands.push(`cat > /etc/ufw/${phase}${suffix}.rules <<'NOVANET_UFW'\n${lines.join('\n')}\nNOVANET_UFW`);
    }
  }
  for (const source of management) for (const port of [22, 62050])
    commands.push(`ufw allow from '${source}' to any port ${port} proto tcp >/dev/null`);
  commands.push('ufw allow 443/tcp >/dev/null');
  if (dual) commands.push('ufw allow 8388/tcp >/dev/null', 'ufw allow 8388/udp >/dev/null');
  commands.push('ufw --force enable >/dev/null', "LC_ALL=C ufw status | grep -qx 'Status: active'");
  return commands.join('\n');
}

// Intentionally accepts only the supported iptables-save grammar, never human
// ufw status/profile names. Unknown/truncated output is not evidence of safety.
function parseFilter(output) {
  if (typeof output !== 'string' || output.length > 4194304) fail();
  const chains = new Map();
  let started = false, completed = false;
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line === '*filter' && !started && !completed) { started = true; continue; }
    if (!started || completed) fail();
    if (line === 'COMMIT') { completed = true; continue; }
    const declaration = /^:([\w-]+) (ACCEPT|DROP|-) \[\d+:\d+\]$/.exec(line);
    if (declaration) {
      if (chains.has(declaration[1])) fail();
      chains.set(declaration[1], { policy: declaration[2], rules: [] }); continue;
    }
    const rule = /^-A ([\w-]+) (.+)$/.exec(line);
    if (!rule || !chains.has(rule[1])) fail();
    chains.get(rule[1]).rules.push(rule[2]);
  }
  if (!completed) fail();
  return chains;
}
function equalRules(actual, expected) {
  if (!actual || actual.length !== expected.length || actual.some((r, i) => r !== expected[i])) fail();
}

/** Verifies effective INPUT traversal as well as the exact UFW user allowlist.
 * Both families are mandatory, even when the provider advertises only IPv4.
 */
export function verifyLightNodeFirewall({ ipv4, ipv6 }, policy, protocols) {
  const management = sources(policy), dual = dualProfile(protocols);
  for (const [family, output] of [[4, ipv4], [6, ipv6]]) {
    const chains = parseFilter(output), p = prefix(family);
    if (chains.get('INPUT')?.policy !== 'DROP' || chains.get('FORWARD')?.policy !== 'DROP') fail();
    equalRules(chains.get('INPUT')?.rules, hooks.map(c => `-j ${p}-${c}`));
    for (const hook of hooks) {
      const chain = chains.get(`${p}-${hook}`);
      if (chain?.policy !== '-') fail();
      equalRules(chain.rules, hook === 'before-input' ? [...baseline(family), `-j ${p}-user-input`] : []);
    }
    const user = chains.get(`${p}-user-input`);
    if (user?.policy !== '-') fail();
    const expected = management.filter(s => isIP(s) === family).flatMap(s => [22, 62050].map(port => `${s}|tcp|${port}`));
    expected.push('*|tcp|443');
    if (dual) expected.push('*|tcp|8388', '*|udp|8388');
    const actual = user.rules.map(rule => {
      const match = /^(?:-s ([a-fA-F0-9.:]+)\/(32|128) )?-p (tcp|udp) -m (tcp|udp) --dport (\d+) -j ACCEPT$/.exec(rule);
      if (!match || match[3] !== match[4] || (match[1] && Number(match[2]) !== (family === 4 ? 32 : 128))) fail();
      return `${match[1] ? host(match[1], family) : '*'}|${match[3]}|${match[5]}`;
    });
    equalRules(actual.sort(), expected.sort());
  }
  return true;
}
