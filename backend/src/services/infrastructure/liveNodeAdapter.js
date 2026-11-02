import { assertResourceOwnership, assertOperationAuthority } from './ownership.js';
import { infrastructureError } from './repository.js';
import { connectStrictInfrastructureSsh } from './liveSsh.js';
import { NODE_IMAGE, CORE_IMAGE, CORE_VERSION } from './nodeConfigurator.js';
import { MANAGEMENT_TLS_PROBE } from './managementTlsProbe.js';
import { buildLightNodeFirewallCommand, verifyLightNodeFirewall } from './lightnodeFirewall.js';

const fail = code => { throw infrastructureError(code); };
export function createLiveNodeAdapter({ context, store, panel, privateKey, policy, renewLease,
  sessionFactory = connectStrictInfrastructureSsh }) {
  let session;
  async function checkpointWrite(key, value) {
    const prior = await store.readState(key);
    return store.saveState(key, value, prior.version);
  }
  return {
    policy, secretStorageEncrypted: true,
    async readConfigurationCheckpoint() { return (await store.readState('node-configuration')).value; },
    saveConfigurationCheckpoint: value => checkpointWrite('node-configuration', value),
    async installBundle({ operation, resource, bundle, expectedHostKey, strictHostKeyChecking }) {
      const lightnode = resource.provider === 'lightnode';
      async function authorize() {
        const registered = await assertResourceOwnership({ context, resource, operation });
        if (lightnode && (resource.kind !== 'provider' || resource.operationId !== operation.id ||
            registered.provider !== 'lightnode' || registered.operationId !== operation.id)) fail('RESOURCE_SCOPE_MISMATCH');
      }
      await authorize();
      if (strictHostKeyChecking !== true || expectedHostKey !== resource.sshHostKeySha256) fail('NODE_SECURITY_CONFIGURATION_REQUIRED');
      const address = resource.addresses?.find(value => /^\d+\.\d+\.\d+\.\d+$/.test(value));
      if (!address) fail('NODE_ADDRESS_UNAVAILABLE');
      if (lightnode) {
        const ssh = (await store.readState('lightnode-ssh')).value;
        if (ssh?.completed !== true || ssh.resourceId !== resource.id || ssh.operationId !== operation.id ||
            ssh.fingerprint !== expectedHostKey || ssh.address !== address) fail('NODE_FIREWALL_POLICY_UNVERIFIED');
      }
      const settings = await panel.request({ method: 'GET', path: '/api/nodes/settings' });
      if (settings.status !== 200 || !settings.data?.certificate?.includes('-----BEGIN CERTIFICATE-----')) fail('NODE_MANAGEMENT_TLS_UNAVAILABLE');
      const savedTls = await store.readState('node-tls');
      if (savedTls.value && savedTls.value.clientCertificate !== settings.data.certificate) fail('NODE_CONFIGURATION_CHANGED');
      await renewLease(operation); await assertOperationAuthority(context, operation);
      try { session = await sessionFactory({ host: address, expectedHostKey, privateKey }); }
      catch (error) {
        if (['SSH_CONNECTION_TIMEOUT', 'SSH_CONNECTION_FAILED'].includes(error.code)) fail('NODE_BOOTSTRAP_PENDING');
        throw error;
      }
      async function run(command, options) {
        await renewLease(operation); await authorize();
        return session.exec(command, options);
      }
      async function write(path, content) {
        await renewLease(operation); await authorize();
        return session.write(path, content);
      }
      // Poll readiness across fenced steps; provider bootstrapping can outlast one SSH call.
      const output = await run('timeout 10s cloud-init status --format json 2>/dev/null || true', { timeoutMs: 15000 });
      let bootstrap;
      try { bootstrap = JSON.parse(output); } catch { fail('NODE_BOOTSTRAP_FAILED'); }
      if (['running', 'not run'].includes(bootstrap.status)) fail('NODE_BOOTSTRAP_PENDING');
      const stages = ['init-local', 'init', 'modules-config', 'modules-final'];
      if (bootstrap.status !== 'done' || !Array.isArray(bootstrap.errors) || bootstrap.errors.length ||
          stages.some(stage => bootstrap[stage]?.errors?.length)) fail('NODE_BOOTSTRAP_FAILED');
      await run('export DEBIAN_FRONTEND=noninteractive; timeout 80s apt-get update -qq');
      await run('export DEBIAN_FRONTEND=noninteractive; timeout 80s apt-get install -y -qq docker.io docker-compose ufw openssl ca-certificates curl >/dev/null');
      await run('systemctl enable --now docker >/dev/null && install -d -m 700 /var/lib/marznode /opt/marznode /var/lib/marznode/assets');
      for (const image of [NODE_IMAGE, CORE_IMAGE]) {
        await run(`docker pull '${image}' >/dev/null && docker image inspect '${image}' --format '{{json .RepoDigests}}' | grep -F '${image}' >/dev/null`);
      }
      await run(`set -eu; STAGE=$(docker create '${CORE_IMAGE}'); trap 'docker rm "$STAGE" >/dev/null 2>&1 || true' EXIT; docker cp "$STAGE:/usr/bin/xray" /var/lib/marznode/xray-${CORE_VERSION}; (docker cp "$STAGE:/usr/share/xray/." /var/lib/marznode/assets || docker cp "$STAGE:/usr/local/share/xray/." /var/lib/marznode/assets); chmod 755 /var/lib/marznode/xray-${CORE_VERSION}; test -s /var/lib/marznode/assets/geoip.dat`);
      for (const file of bundle.files) await write(file.path, file.content);
      await write('/var/lib/marznode/client.pem', settings.data.certificate);
      if (savedTls.value) {
        await write('/var/lib/marznode/server.key', savedTls.value.privateKey);
        await write('/var/lib/marznode/server.cert', savedTls.value.certificate);
      } else {
        await run("test -s /var/lib/marznode/server.key -a -s /var/lib/marznode/server.cert || openssl req -x509 -newkey rsa:2048 -keyout /var/lib/marznode/server.key -out /var/lib/marznode/server.cert -days 3650 -nodes -subj /CN=marznode >/dev/null 2>&1");
        const certificate = await run('cat /var/lib/marznode/server.cert');
        const privateKey = await run('cat /var/lib/marznode/server.key');
        await store.saveState('node-tls', { certificate, privateKey, clientCertificate: settings.data.certificate }, savedTls.version);
      }
      await run(`chmod 600 /var/lib/marznode/*.key /var/lib/marznode/*.cert /var/lib/marznode/*.pem /var/lib/marznode/xray_config.json && XRAY_LOCATION_ASSET=/var/lib/marznode/assets /var/lib/marznode/xray-${CORE_VERSION} run -test -config /var/lib/marznode/xray_config.json >/dev/null`);
      const rules = ['ufw default deny incoming >/dev/null', 'ufw default allow outgoing >/dev/null'];
      for (const source of bundle.firewall.managementSources) for (const port of [22, 62050]) rules.push(`ufw allow from '${source}' to any port ${port} proto tcp >/dev/null`);
      // Vultr Ubuntu images may inherit a public SSH rule. Restrict access first,
      // then remove only that exact rule; never reset unrelated firewall state.
      rules.push("if LC_ALL=C ufw show added | grep -Fxq 'ufw allow 22/tcp'; then ufw --force delete allow 22/tcp >/dev/null; fi");
      for (const port of bundle.firewall.publicTcpPorts) rules.push(`ufw allow ${port}/tcp >/dev/null`);
      for (const port of bundle.firewall.publicUdpPorts) rules.push(`ufw allow ${port}/udp >/dev/null`);
      rules.push('ufw --force enable >/dev/null', "LC_ALL=C ufw status | grep -q '^Status: active'", "! LC_ALL=C ufw status | grep -E '^(22|62050)(/tcp)?[[:space:]].*ALLOW.*Anywhere'");
      if (!bundle.supportedProtocols.includes('shadowsocks')) rules.push("! LC_ALL=C ufw status | grep -E '^8388(/tcp|/udp)?[[:space:]].*ALLOW'");
      try {
        if (lightnode) {
          // A saved bootstrap alone is insufficient: verify the current daemon
          // still exposes only key-auth SSH on the reviewed management port.
          const sshPolicy = (await run('/usr/sbin/sshd -T')).trim().split(/\r?\n/);
          for (const expected of ['port 22', 'passwordauthentication no', 'kbdinteractiveauthentication no', 'pubkeyauthentication yes']) {
            const key = expected.split(' ')[0];
            const values = sshPolicy.filter(line => line.startsWith(`${key} `));
            if (values.length !== 1 || values[0] !== expected) fail('NODE_FIREWALL_POLICY_UNVERIFIED');
          }
          const root = sshPolicy.filter(line => line.startsWith('permitrootlogin '));
          if (root.length !== 1 || !/^permitrootlogin (prohibit-password|without-password)$/.test(root[0])) fail('NODE_FIREWALL_POLICY_UNVERIFIED');
          const listeners = sshPolicy.filter(line => line.startsWith('listenaddress '));
          if (!listeners.length || listeners.some(line => !/^listenaddress (?:[\d.]+|\[[a-fA-F0-9:]+\]):22$/.test(line))) fail('NODE_FIREWALL_POLICY_UNVERIFIED');
          await run(buildLightNodeFirewallCommand(policy, bundle.supportedProtocols));
          const ipv4 = await run('LC_ALL=C iptables-save -t filter');
          const ipv6 = await run('LC_ALL=C ip6tables-save -t filter');
          verifyLightNodeFirewall({ ipv4, ipv6 }, policy, bundle.supportedProtocols);
        } else {
          await run(`set -eu; ${rules.join(' && ')}`);
        }
      } catch (error) {
        if (['STALE_FENCE', 'LEASE_EXPIRED', 'RESOURCE_SCOPE_MISMATCH'].includes(error.code)) throw error;
        fail('NODE_FIREWALL_POLICY_UNVERIFIED');
      }
      await run('docker-compose -f /opt/marznode/compose.json up -d >/dev/null');
      try {
        await run("set -eu; openssl verify -CAfile /var/lib/marznode/server.cert /var/lib/marznode/server.cert >/dev/null; for i in $(seq 1 20); do if ss -lnt | grep -q ':62050 '; then break; fi; sleep 1; done", { timeoutMs: 30000 });
        await run(MANAGEMENT_TLS_PROBE, { timeoutMs: 20000 });
      } catch (error) {
        if (['STALE_FENCE', 'LEASE_EXPIRED', 'RESOURCE_SCOPE_MISMATCH'].includes(error.code)) throw error;
        fail('NODE_MANAGEMENT_TLS_UNVERIFIED');
      }
      return { hostKeyVerified: true, imageDigestsVerified: true, syntaxValid: true, firewallVerified: true, managementTlsVerified: true };
    },
    async close() { await session?.close(); session = null; },
  };
}
