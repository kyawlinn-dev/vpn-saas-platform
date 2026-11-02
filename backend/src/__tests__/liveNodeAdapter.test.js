import { describe, expect, it, vi } from 'vitest';
import { createLiveNodeAdapter } from '../services/infrastructure/liveNodeAdapter.js';
import { configureCandidate, NODE_IMAGE, CORE_IMAGE } from '../services/infrastructure/nodeConfigurator.js';
import { infrastructureFixture } from './fixtures/infrastructure.js';
import { createInfrastructureContext } from '../services/infrastructure/context.js';

const hardenedSsh = 'port 22\nlistenaddress 0.0.0.0:22\nlistenaddress [::]:22\npasswordauthentication no\nkbdinteractiveauthentication no\npubkeyauthentication yes\npermitrootlogin prohibit-password\n';
function effectiveRules(family, dual) {
  const p = family === 4 ? 'ufw' : 'ufw6';
  const hooks = ['before-logging-input', 'before-input', 'after-input', 'after-logging-input', 'reject-input', 'track-input'];
  return ['*filter', ':INPUT DROP [0:0]', ':FORWARD DROP [0:0]', ':OUTPUT ACCEPT [0:0]',
    ...[...hooks, 'user-input'].map(c => `:${p}-${c} - [0:0]`),
    ...hooks.map(c => `-A INPUT -j ${p}-${c}`),
    `-A ${p}-before-input -i lo -j ACCEPT`,
    `-A ${p}-before-input -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT`,
    `-A ${p}-before-input -m conntrack --ctstate INVALID -j DROP`,
    `-A ${p}-before-input -p ${family === 4 ? 'icmp' : 'ipv6-icmp'} -j ACCEPT`,
    family === 4 ? '-A ufw-before-input -p udp -m udp --sport 67 --dport 68 -j ACCEPT' :
      '-A ufw6-before-input -s fe80::/10 -d fe80::/10 -p udp -m udp --sport 547 --dport 546 -j ACCEPT',
    `-A ${p}-before-input -j ${p}-user-input`,
    ...(family === 4 ? ['-A ufw-user-input -s 192.0.2.20/32 -p tcp -m tcp --dport 22 -j ACCEPT',
      '-A ufw-user-input -s 192.0.2.20/32 -p tcp -m tcp --dport 62050 -j ACCEPT'] : []),
    `-A ${p}-user-input -p tcp -m tcp --dport 443 -j ACCEPT`,
    ...(dual ? [`-A ${p}-user-input -p tcp -m tcp --dport 8388 -j ACCEPT`, `-A ${p}-user-input -p udp -m udp --dport 8388 -j ACCEPT`] : []),
    'COMMIT', ''].join('\n');
}
async function lightNodeFixture({ output = 'unverified', completed = true, operationId = 'op', registeredOperationId = operationId, protectedNode = false, sshPolicy = hardenedSsh, provider = 'lightnode' } = {}) {
  const f = await infrastructureFixture();
  const config = { ...f.context, providerAccounts: { [provider]: 'account' } };
  f.adapters.inspectRuntime.mockResolvedValue({ ...config, verified: true });
  f.context = await createInfrastructureContext({ config, registry: f.registry, adapters: f.adapters });
  f.resource = { ...f.resource, provider, operationId, protected: protectedNode };
  f.records.set('provider:vm', { ...f.resource, operationId: registeredOperationId });
  const states = new Map([['lightnode-ssh', { value: { completed, resourceId: 'vm', operationId: 'op',
    fingerprint: f.resource.sshHostKeySha256, address: '198.51.100.10' }, version: 1 }]]);
  const store = { readState: async k => states.get(k) || { value: null, version: null },
    saveState: async (k, value) => states.set(k, { value, version: 1 }) };
  const ssh = { exec: vi.fn(async command => {
    if (command.includes('cloud-init status')) return JSON.stringify({ status: 'done', errors: [] });
    if (command === '/usr/sbin/sshd -T') return sshPolicy;
    if (/ip6?tables-save/.test(command)) return typeof output === 'function' ? output(command.includes('ip6tables') ? 6 : 4) : output;
    return 'fixture';
  }), write: vi.fn(), close: vi.fn() };
  const sessionFactory = vi.fn(async () => ssh);
  const nodeAdapter = createLiveNodeAdapter({ context: f.context, store, privateKey: 'fixture-key', sessionFactory,
    panel: { request: async () => ({ status: 200, data: { certificate: '-----BEGIN CERTIFICATE-----\nfixture' } }) },
    renewLease: async () => {}, policy: { realityServerName: 'www.apple.com', managementSources: ['192.0.2.20'] } });
  return { ...f, nodeAdapter, ssh, sessionFactory, states };
}
describe('connected node installation', () => {
  it.each(['digitalocean', 'vultr'])('preserves %s setup without a reset or LightNode bootstrap requirement', async provider => {
    const f = await lightNodeFixture({ provider, completed: false, sshPolicy: 'unverified' });
    await expect(configureCandidate({ ...f, supportedProtocols: ['vless'] })).resolves.toMatchObject({ vlessPort: 443 });
    const commands = f.ssh.exec.mock.calls.map(([c]) => c).join('\n');
    expect(commands).not.toContain('ufw --force reset');
    expect(commands).not.toContain('iptables-save');
    expect(commands).toContain('ufw --force delete allow 22/tcp');
  });
  it.each([false, true])('rebuilds and verifies fresh LightNode policy before Marznode (dual=%s)', async dual => {
    const f = await lightNodeFixture({ output: family => effectiveRules(family, dual) });
    await expect(configureCandidate({ ...f, supportedProtocols: dual ? ['vless', 'shadowsocks'] : ['vless'] })).resolves.toMatchObject({ vlessPort: 443, ssPort: dual ? 8388 : null });
    const commands = f.ssh.exec.mock.calls.map(([c]) => c);
    const reset = commands.findIndex(c => c.includes('ufw --force reset'));
    const verify6 = commands.indexOf('LC_ALL=C ip6tables-save -t filter');
    expect(reset).toBeGreaterThan(commands.indexOf('/usr/sbin/sshd -T'));
    expect(verify6).toBeGreaterThan(reset);
    expect(commands.findIndex(c => c.includes('compose.json up'))).toBeGreaterThan(verify6);
    expect(commands[reset]).toContain("ufw allow from '192.0.2.20' to any port 62050 proto tcp");
    expect(commands[reset].includes('ufw allow 8388/udp')).toBe(dual);
    expect(f.sessionFactory).toHaveBeenCalledWith(expect.objectContaining({ privateKey: 'fixture-key', expectedHostKey: f.resource.sshHostKeySha256 }));
    expect(f.sessionFactory.mock.calls[0][0]).not.toHaveProperty('password');
  });
  it.each([
    hardenedSsh.replace('port 22', 'port 2222'),
    hardenedSsh + 'port 2222\n',
    hardenedSsh.replace('[::]:22', '[::]:2222'),
    hardenedSsh.replace('passwordauthentication no', 'passwordauthentication yes'),
  ])('rejects drifted effective SSH policy before resetting the firewall %#', async sshPolicy => {
    const f = await lightNodeFixture({ sshPolicy });
    await expect(configureCandidate({ ...f, supportedProtocols: ['vless'] })).rejects.toMatchObject({ code: 'NODE_FIREWALL_POLICY_UNVERIFIED' });
    expect(f.ssh.exec.mock.calls.some(([c]) => c.includes('ufw --force reset'))).toBe(false);
  });
  it.each([4, 6])('rejects extra effective IPv%s SSH rules before Marznode starts', async family => {
    const f = await lightNodeFixture({ output: current => effectiveRules(current, false).replace('COMMIT',
      current === family ? `-A ${current === 4 ? 'ufw' : 'ufw6'}-user-input -p tcp -m tcp --dport 22 -j ACCEPT\nCOMMIT` : 'COMMIT') });
    await expect(configureCandidate({ ...f, supportedProtocols: ['vless'] })).rejects.toMatchObject({ code: 'NODE_FIREWALL_POLICY_UNVERIFIED' });
    expect(f.ssh.exec.mock.calls.some(([c]) => c.includes('compose.json up'))).toBe(false);
  });
  it('rejects LightNode command success without effective rule evidence before starting Marznode', async () => {
    const f = await lightNodeFixture();
    await expect(configureCandidate({ ...f, supportedProtocols: ['vless'] })).rejects.toMatchObject({ code: 'NODE_FIREWALL_POLICY_UNVERIFIED' });
    expect(f.ssh.exec.mock.calls.some(([c]) => c.includes('compose.json up'))).toBe(false);
    expect(f.ssh.close).toHaveBeenCalled();
  });
  it.each([
    { completed: false }, { operationId: 'other' }, { registeredOperationId: 'other' }, { protectedNode: true },
  ])('never resets an unbootstrapped, shared or foreign-operation LightNode: %j', async options => {
    const f = await lightNodeFixture(options);
    await expect(configureCandidate({ ...f, supportedProtocols: ['vless'] })).rejects.toBeDefined();
    expect(f.ssh.exec.mock.calls.some(([c]) => c.includes('ufw --force reset'))).toBe(false);
  });
  it.each(['running', 'not run', 'ssh-pending', 'error'])('handles bootstrap readiness without starting package setup: %s', async status => {
    const f = await infrastructureFixture(), states = new Map();
    const store = { readState: async key => states.get(key) || { value: null, version: null }, saveState: async (key, value) => states.set(key, { value, version: 1 }) };
    const ssh = { exec: vi.fn(async () => JSON.stringify({ status, errors: status === 'error' ? ['private bootstrap output'] : [] })), write: vi.fn(), close: vi.fn() };
    const nodeAdapter = createLiveNodeAdapter({ context: f.context, store, privateKey: 'fixture',
      panel: { request: async () => ({ status: 200, data: { certificate: '-----BEGIN CERTIFICATE-----\nfixture' } }) },
      sessionFactory: async () => { if (status === 'ssh-pending') throw Object.assign(Error('private transport error'), { code: 'SSH_CONNECTION_TIMEOUT' }); return ssh; },
      renewLease: async () => {}, policy: { realityServerName: 'www.apple.com', managementSources: ['192.0.2.20'] } });
    const code = status === 'error' ? 'NODE_BOOTSTRAP_FAILED' : 'NODE_BOOTSTRAP_PENDING';
    await expect(configureCandidate({ ...f, supportedProtocols: ['vless'], nodeAdapter })).rejects.toMatchObject({ code, message: code });
    expect(ssh.exec.mock.calls.some(([command]) => command.includes('apt-get'))).toBe(false);
    expect(ssh.write).not.toHaveBeenCalled();
  });
  it.each([
    ['MANAGEMENT_MTLS_VERIFIED', 'NODE_MANAGEMENT_TLS_UNVERIFIED'],
    ['ufw default deny incoming', 'NODE_FIREWALL_POLICY_UNVERIFIED'],
  ])('fails closed with a safe diagnostic for %s', async (marker, code) => {
    const f = await infrastructureFixture();
    const states = new Map();
    const store = { readState: async key => states.get(key) || { value: null, version: null },
      saveState: async (key, value) => { states.set(key, { value, version: 1 }); } };
    const ssh = { exec: vi.fn(async command => {
      if (command.includes('cloud-init status')) return JSON.stringify({ status: 'done', errors: [] });
      if (command.includes(marker)) throw Object.assign(new Error('private-certificate-output'), { code: 'SSH_COMMAND_FAILED' });
      return 'fixture';
    }), write: vi.fn(async () => {}), close: vi.fn() };
    const nodeAdapter = createLiveNodeAdapter({ context: f.context, store, privateKey: 'fixture',
      panel: { request: async () => ({ status: 200, data: { certificate: '-----BEGIN CERTIFICATE-----\nfixture' } }) },
      sessionFactory: async () => ssh, renewLease: async () => {},
      policy: { realityServerName: 'www.apple.com', managementSources: ['192.0.2.20'] } });
    await expect(configureCandidate({ ...f, operation: f.operation, supportedProtocols: ['vless'], nodeAdapter }))
      .rejects.toMatchObject({ code, message: code });
    expect(ssh.close).toHaveBeenCalled();
  });
  it.each([{ supportedProtocols: ['vless'] }, { supportedProtocols: ['shadowsocks', 'vless'] }])('runs bounded, pinned setup for $supportedProtocols and saves private TLS material encrypted', async ({ supportedProtocols }) => {
    const f = await infrastructureFixture();
    const states = new Map();
    const store = { readState: vi.fn(async key => states.get(key) || { value: null, version: null }), saveState: vi.fn(async (key, value) => { states.set(key, { value, version: 1 }); }) };
    const ssh = { exec: vi.fn(async command => command.includes('cloud-init status') ? JSON.stringify({ status: 'done', errors: [], extended_status: 'degraded done', recoverable_errors: { WARNING: ['provider warning'] } }) : command.includes('cat /var/lib/marznode/server.cert') ? 'fixture-certificate' : command.includes('cat /var/lib/marznode/server.key') ? 'fixture-private-key' : 'verified'), write: vi.fn(async () => {}), close: vi.fn() };
    const sessionFactory = vi.fn(async () => ssh);
    const renewLease = vi.fn(async () => {});
    const panel = { request: vi.fn(async () => ({ status: 200, data: { certificate: '-----BEGIN CERTIFICATE-----\nfixture\n-----END CERTIFICATE-----' } })) };
    const nodeAdapter = createLiveNodeAdapter({ context: f.context, store, panel, sessionFactory, privateKey: 'fixture-ssh-key', renewLease,
      policy: { realityServerName: 'www.apple.com', managementSources: ['192.0.2.20'] } });
    const result = await configureCandidate({ ...f, operation: f.operation, supportedProtocols, nodeAdapter });
    expect(result.vlessPort).toBe(443);
    expect(result.ssPort).toBe(supportedProtocols.includes('shadowsocks') ? 8388 : null);
    expect(sessionFactory).toHaveBeenCalledWith(expect.objectContaining({ host: '198.51.100.10', expectedHostKey: f.resource.sshHostKeySha256 }));
    const commands = ssh.exec.mock.calls.map(([command]) => command).join('\n');
    expect(commands).toContain(NODE_IMAGE); expect(commands).toContain(CORE_IMAGE);
    expect(commands).toContain('run -test'); expect(commands).toContain('ufw');
    expect(commands).not.toContain('ufw --force reset');
    const firewall = ssh.exec.mock.calls.map(([command]) => command).find(command => command.includes('ufw default deny incoming'));
    expect(firewall).toContain("if LC_ALL=C ufw show added | grep -Fxq 'ufw allow 22/tcp'");
    expect(firewall).toContain('ufw --force delete allow 22/tcp');
    expect(firewall.indexOf("ufw allow from '192.0.2.20' to any port 22"))
      .toBeLessThan(firewall.indexOf('ufw --force delete allow 22/tcp'));
    expect(firewall.indexOf('ufw --force delete allow 22/tcp')).toBeLessThan(firewall.indexOf('ufw --force enable'));
    expect(commands).toContain('ssl.CERT_REQUIRED');
    expect(commands).toContain('ssl.SSLCertVerificationError');
    expect(commands).not.toContain("grep -Eiq 'certificate required|bad certificate|handshake failure'");
    expect(commands).not.toContain('fixture-private-key');
    expect(store.saveState).toHaveBeenCalledWith('node-tls', expect.objectContaining({ privateKey: 'fixture-private-key' }), null);
    expect(renewLease.mock.calls.length).toBeGreaterThan(5);
    expect(ssh.close).toHaveBeenCalled();
  });
});
