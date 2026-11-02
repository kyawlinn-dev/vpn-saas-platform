import { randomBytes } from 'node:crypto';
import { parseSsUrl } from '../../utils/parseSsUrl.js';
import { assertOperationAuthority, assertResourceOwnership } from './ownership.js';
import { infrastructureError } from './repository.js';
import { connectStrictInfrastructureSsh } from './liveSsh.js';
import { CORE_VERSION } from './nodeConfigurator.js';

const fail = code => { throw infrastructureError(code); };
export function probeClientConfiguration(link, port) {
  let outbound;
  if (link.startsWith('ss://')) {
    const parsed = parseSsUrl(link);
    outbound = { protocol: 'shadowsocks', settings: { servers: [{ address: parsed.server, port: parsed.port, method: parsed.method, password: parsed.password }] } };
  } else {
    const url = new URL(link);
    if (url.protocol !== 'vless:' || url.searchParams.get('security') !== 'reality' || url.searchParams.get('type') !== 'tcp') fail('CANDIDATE_VERIFICATION_FAILED');
    outbound = { protocol: 'vless', settings: { vnext: [{ address: url.hostname, port: Number(url.port), users: [{ id: decodeURIComponent(url.username), encryption: 'none', flow: url.searchParams.get('flow') || '' }] }] },
      streamSettings: { network: 'tcp', security: 'reality', realitySettings: { serverName: url.searchParams.get('sni'), fingerprint: url.searchParams.get('fp') || 'chrome',
        publicKey: url.searchParams.get('pbk'), shortId: url.searchParams.get('sid'), spiderX: '/' } } };
  }
  return { log: { loglevel: 'error' }, inbounds: [{ listen: '127.0.0.1', port, protocol: 'socks', settings: { auth: 'noauth', udp: false } }], outbounds: [outbound] };
}
export function createLiveProbes({ context, store, transport, privateKey, renewLease, fetchImpl = globalThis.fetch,
  sessionFactory = connectStrictInfrastructureSsh }) {
  const save = async value => { const old = await store.readState('probe-run'); await store.saveState('probe-run', value, old.version); };
  async function request(candidate, method, path, body) {
    await renewLease(candidate.operation); await assertOperationAuthority(context, candidate.operation);
    const response = await transport.request({ method, path, body });
    if (response.status !== 404 && (response.status < 200 || response.status >= 300)) fail('PROBE_OPERATION_UNCERTAIN');
    return response;
  }
  function matches(user, intent) {
    return user?.username === intent.username && user.note === intent.note && Array.isArray(user.service_ids) &&
      JSON.stringify([...user.service_ids].sort()) === JSON.stringify([...intent.services].sort());
  }
  async function session(candidate, action) {
    await assertResourceOwnership({ context, resource: candidate.resource, operation: candidate.operation });
    await renewLease(candidate.operation);
    const ssh = await sessionFactory({ host: candidate.address, expectedHostKey: candidate.resource.sshHostKeySha256, privateKey });
    try { return await action(ssh); } finally { ssh.close(); }
  }
  async function create({ candidate, operation }) {
    const services = [];
    let privateVless = false;
    for (const service of candidate.privateServices) {
      await assertResourceOwnership({ context, resource: service, operation });
      if (service.protocol === 'vless') {
        const result = await request(candidate, 'GET', `/api/services/${Number(service.id)}`);
        // Old candidate checkpoints may reference a verification service removed at publication.
        if (result.status === 404) continue;
        if (JSON.stringify(result.data?.inbound_ids) !== JSON.stringify(service.inbound_ids)) fail('SERVICE_MEMBERSHIP_CHANGED');
        privateVless = true;
      }
      services.push(Number(service.id));
    }
    if (candidate.supportedProtocols?.includes('vless') && !privateVless) {
      if (candidate.publicService?.id !== context.publicServiceId) fail('RESOURCE_SCOPE_MISMATCH');
      await assertResourceOwnership({ context, resource: candidate.publicService, operation });
      const inbound = candidate.inbounds.find(row => row.protocol === 'vless');
      if (!inbound) fail('SERVICE_MEMBERSHIP_CHANGED');
      await assertResourceOwnership({ context, resource: inbound, operation });
      const global = await request(candidate, 'GET', `/api/services/${Number(context.publicServiceId)}`);
      if (!global.data?.inbound_ids?.includes(Number(inbound.id))) fail('SERVICE_MEMBERSHIP_CHANGED');
      let visible = false;
      for (const host of candidate.hosts.filter(row => Number(row.inbound_id) === Number(inbound.id))) {
        await assertResourceOwnership({ context, resource: host, operation });
        const result = await request(candidate, 'GET', `/api/inbounds/hosts/${Number(host.id)}`);
        const raw = result.data;
        visible ||= !!raw && !raw.is_disabled && Number(raw.inbound_id ?? raw.inbound?.id) === Number(inbound.id) &&
          Array.isArray(raw.service_ids) && (!raw.service_ids.length || raw.service_ids.includes(Number(context.publicServiceId)));
      }
      if (!visible) fail('SERVICE_MEMBERSHIP_CHANGED');
      services.push(Number(context.publicServiceId));
    }
    if (!services.length) fail('SERVICE_MEMBERSHIP_CHANGED');
    let intent = (await store.readState('probe-run')).value;
    if (!intent || intent.cleaned) {
      const nonce = randomBytes(12).toString('hex');
      intent = { username: `np_${nonce}`, note: `novanet-probe:${operation.id}:${nonce}`, services,
        resourceId: candidate.resource.id, operationId: operation.id, requested: false, cleaned: false, expireDate: new Date(Date.now() + 30 * 60000).toISOString() };
      await save(intent);
    }
    if (intent.resourceId !== candidate.resource.id || intent.operationId !== operation.id) fail('RESOURCE_SCOPE_MISMATCH');
    if (JSON.stringify([...intent.services].sort()) !== JSON.stringify([...services].sort())) fail('SERVICE_MEMBERSHIP_CHANGED');
    let result = await request(candidate, 'GET', `/api/users/${intent.username}`);
    if (result.status === 404) {
      if (intent.requested) fail('PROBE_CREATE_RECONCILIATION_REQUIRED');
      intent.requested = true; await save(intent);
      try { await request(candidate, 'POST', '/api/users', { username: intent.username, note: intent.note, service_ids: intent.services,
        expire_strategy: 'fixed_date', expire_date: intent.expireDate, data_limit: 10485760, data_limit_reset_strategy: 'no_reset', enabled: true }); } catch { /* Read back the durable nonce, never repeat creation. */ }
      result = await request(candidate, 'GET', `/api/users/${intent.username}`);
    }
    if (!matches(result.data, intent) || !result.data.key) fail('PROBE_CREATE_RECONCILIATION_REQUIRED');
    return { username: intent.username, key: result.data.key, resourceId: intent.resourceId, operationId: intent.operationId };
  }
  async function health({ candidate }) {
    const node = await request(candidate, 'GET', `/api/nodes/${Number(candidate.node.id)}`);
    const version = await session(candidate, ssh => ssh.exec(`/var/lib/marznode/xray-${CORE_VERSION} version`));
    return { connected: node.data?.status === 'healthy', coreVersion: new RegExp(`^Xray ${CORE_VERSION.replaceAll('.', '\\.')}(?:\\s|$)`).test(version) ? CORE_VERSION : null };
  }
  async function subscription({ candidate, probe }) {
    const url = new URL(`/sub/${encodeURIComponent(probe.username)}/${encodeURIComponent(probe.key)}`, transport.identity);
    let response;
    try { response = await fetchImpl(url, { headers: { 'User-Agent': 'v2ray', Accept: 'text/plain' }, redirect: 'error', signal: AbortSignal.timeout(20000), cache: 'no-store' }); }
    catch { fail('PROBE_SUBSCRIPTION_UNAVAILABLE'); }
    if (response.status !== 200) fail('PROBE_SUBSCRIPTION_UNAVAILABLE');
    const reader = response.body?.getReader(); if (!reader) fail('PROBE_SUBSCRIPTION_UNAVAILABLE');
    const chunks = []; let size = 0;
    try {
      for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length;
        if (size > 1048576) fail('PROBE_SUBSCRIPTION_UNAVAILABLE'); chunks.push(Buffer.from(value)); }
    } finally { await reader.cancel().catch(() => {}); }
    const raw = Buffer.concat(chunks).toString('utf8').trim();
    const text = /^(ss|vless):\/\//.test(raw) ? raw : Buffer.from(raw, 'base64').toString('utf8');
    return text.split(/\r?\n/).map(row => row.trim()).filter(Boolean);
  }
  async function tunnel({ candidate, probe, protocol }) {
    const links = await subscription({ candidate, probe });
    const link = links.find(link => {
      try { return protocol === 'shadowsocks' ? link.startsWith('ss://') && parseSsUrl(link).server === candidate.address : link.startsWith('vless://') && new URL(link).hostname === candidate.address; }
      catch { return false; }
    });
    if (!link) fail('CANDIDATE_VERIFICATION_FAILED');
    const port = 20000 + randomBytes(2).readUInt16BE() % 20000;
    const file = `/var/lib/marznode/probe-${probe.username}.json`;
    const config = probeClientConfiguration(link, port);
    const intent=(await store.readState('probe-run')).value;
    if(intent?.username!==probe.username || intent.operationId!==candidate.operation.id) fail('RESOURCE_SCOPE_MISMATCH');
    await save({...intent,tunnelStarted:true});
    const output = await session(candidate, async ssh => {
      await ssh.write(file, JSON.stringify(config));
      // The trap cleans the exact child; timeout bounds a disconnected SSH session.
      return ssh.exec(`set -eu; PID=''; trap 'test -z "$PID" || kill "$PID" 2>/dev/null || true; rm -f ${file}' EXIT; XRAY_LOCATION_ASSET=/var/lib/marznode/assets timeout 45s /var/lib/marznode/xray-${CORE_VERSION} run -c ${file} >/dev/null 2>&1 & PID=$!; sleep 2; curl -4 --fail --silent --show-error --max-time 20 --socks5-hostname 127.0.0.1:${port} https://api.ipify.org?format=json`, { timeoutMs: 55000 });
    });
    let egressAddress; try { egressAddress = JSON.parse(output).ip; } catch { fail('CANDIDATE_VERIFICATION_FAILED'); }
    return { connected: candidate.resource.addresses.includes(egressAddress), protocol, resourceId: candidate.resource.id, egressAddress };
  }
  async function cleanup({ candidate, operationId }) {
    const intent = (await store.readState('probe-run')).value;
    if (!intent || intent.cleaned) return true;
    if (intent.operationId !== operationId || intent.resourceId !== candidate.resource.id || !/^np_[a-f0-9]{24}$/.test(intent.username)) fail('RESOURCE_SCOPE_MISMATCH');
    if(intent.tunnelStarted) {
      const pattern=`^/var/lib/marznode/xray-${CORE_VERSION.replaceAll('.','[.]')} run -c /var/lib/marznode/probe-${intent.username}[.]json$`;
      await session(candidate,ssh=>ssh.exec(`set -eu; PIDS=$(pgrep -f '${pattern}' || true); for PID in $PIDS; do kill "$PID" 2>/dev/null || true; done; for i in $(seq 1 10); do pgrep -f '${pattern}' >/dev/null || break; sleep 1; done; ! pgrep -f '${pattern}' >/dev/null; rm -f /var/lib/marznode/probe-${intent.username}.json`,{timeoutMs:20000}));
    }
    const path = `/api/users/${intent.username}`, before = await request(candidate, 'GET', path);
    if (before.status !== 404) {
      if (!matches(before.data, intent)) fail('RESOURCE_SCOPE_MISMATCH');
      await request(candidate, 'DELETE', path);
      if ((await request(candidate, 'GET', path)).status !== 404) return false;
    }
    await save({ ...intent, cleaned: true });
    return true;
  }
  return { create, health, subscription, tunnel, cleanup };
}
