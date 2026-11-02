import ssh2 from 'ssh2';
import http from 'node:http';
import { isIP } from 'node:net';

const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_HEADER_BYTES = 16 * 1024;
const uuid = '[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}';
const operationPath = new RegExp(`^/operations/${uuid}$`);
const controlPath = new RegExp(`^/operations/${uuid}/(?:resume|cancel)$`);
const error = code => Object.assign(new Error(code), { code });
const invalidConfiguration = () => { throw error('RUNNER_CONFIGURATION_REQUIRED'); };
const jsonType = value => typeof value === 'string' && /^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(value);

function validatePath(method, path) {
  if (typeof path !== 'string' || path.length > 512 || /[^\x21-\x7e]|[#\\]/.test(path)) invalidConfiguration();
  const [pathname, query, extra] = path.split('?');
  if (extra !== undefined) invalidConfiguration();
  if (pathname === '/operations/catalog' && method === 'GET') {
    if (query === undefined) return;
    if (!query || !/^[A-Za-z0-9_=&%-]+$/.test(query)) invalidConfiguration();
    const params = new URLSearchParams(query);
    const seen = new Set();
    for (const [key, value] of params) {
      if (seen.has(key)) invalidConfiguration();
      seen.add(key);
      if (key === 'provider' ? !['digitalocean', 'vultr', 'lightnode'].includes(value)
        : key === 'region' ? !/^[a-zA-Z0-9_-]{1,100}$/.test(value)
          : key === 'refresh' ? !['true', 'false'].includes(value) : true) invalidConfiguration();
    }
    return;
  }
  if (query !== undefined) invalidConfiguration();
  if (method === 'GET' && (pathname === '/health' || pathname === '/operations' || operationPath.test(pathname))) return;
  if (method === 'POST' && (pathname === '/operations' || pathname === '/operations/quotes' || controlPath.test(pathname))) return;
  invalidConfiguration();
}

function prepareRequest({ method, path, headers = {}, body } = {}) {
  validatePath(method, path);
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) invalidConfiguration();
  const result = Object.create(null);
  let headerBytes = 0;
  const forbidden = new Set(['host', 'content-length', 'transfer-encoding', 'connection', 'upgrade', 'expect',
    'te', 'trailer', 'proxy-authorization', 'proxy-connection', 'keep-alive']);
  for (const [name, value] of Object.entries(headers)) {
    const key = name.toLowerCase();
    if (typeof value !== 'string' || Object.hasOwn(result, key) || forbidden.has(key)) invalidConfiguration();
    try { http.validateHeaderName(name); http.validateHeaderValue(name, value); } catch { invalidConfiguration(); }
    headerBytes += Buffer.byteLength(name) + Buffer.byteLength(value) + 4;
    if (headerBytes > MAX_HEADER_BYTES) invalidConfiguration();
    if (key === 'cookie' || key === 'cookie2') continue;
    if ((key === 'accept' || key === 'content-type') && !jsonType(value)) invalidConfiguration();
    result[key] = value;
  }
  let payload;
  if (body !== undefined) {
    if (method !== 'POST') invalidConfiguration();
    try {
      const serialized = JSON.stringify(body);
      if (serialized === undefined || Buffer.byteLength(serialized) > MAX_REQUEST_BYTES) invalidConfiguration();
      payload = Buffer.from(serialized);
    } catch { invalidConfiguration(); }
    result['content-length'] = String(payload.length);
  }
  result.accept = 'application/json';
  result['content-type'] = 'application/json';
  return { method, path, headers: result, payload };
}

export function createSshRunnerTransport({ host, port = 22, username, privateKey, hostKeySha256,
  runnerPort = 4317, timeoutMs = 90000, clientFactory = () => new ssh2.Client() } = {}) {
  if (typeof host !== 'string' || !isIP(host) || host.includes('%') || !Number.isInteger(port) || port < 1 || port > 65535 ||
    runnerPort !== 4317 || typeof username !== 'string' || !/^[a-zA-Z0-9_.-]{1,64}$/.test(username) ||
    !((typeof privateKey === 'string' || Buffer.isBuffer(privateKey)) && privateKey.length > 0) ||
    typeof hostKeySha256 !== 'string' || !/^SHA256:[A-Za-z0-9+/]{43}=?$/.test(hostKeySha256) ||
    !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000 || typeof clientFactory !== 'function') invalidConfiguration();

  let cached, closed = false;
  const expectedPin = hostKeySha256.slice(7).replace(/=+$/, '');

  function disconnect(entry, code = entry.mismatch ? 'RUNNER_HOST_KEY_MISMATCH' : 'RUNNER_CONNECTION_FAILED') {
    if (entry.dead) return;
    entry.dead = true;
    clearTimeout(entry.timer);
    if (cached === entry) cached = undefined;
    entry.reject(error(code));
    for (const abort of [...entry.active]) abort(code);
    try { entry.client.end(); } catch { /* Cleanup errors must never expose SSH details. */ }
    try { entry.client.destroy?.(); } catch { /* Best effort after ending the connection. */ }
  }

  function connection() {
    if (closed) throw error('RUNNER_CONNECTION_FAILED');
    if (cached && !cached.dead) return cached;
    let client;
    try { client = clientFactory(); } catch { throw error('RUNNER_CONNECTION_FAILED'); }
    const entry = { client, dead: false, verified: false, mismatch: false, active: new Set() };
    entry.promise = new Promise((resolve, reject) => { entry.resolve = resolve; entry.reject = reject; });
    // A connection can fail synchronously before the caller attaches its continuation.
    entry.promise.catch(() => {});
    cached = entry;
    entry.timer = setTimeout(() => disconnect(entry), timeoutMs);
    try {
      client.on('error', () => disconnect(entry, entry.mismatch ? 'RUNNER_HOST_KEY_MISMATCH' : 'RUNNER_CONNECTION_FAILED'));
      client.on('end', () => disconnect(entry));
      client.on('close', () => disconnect(entry));
      client.once('ready', () => {
        if (entry.dead) return;
        if (!entry.verified || entry.mismatch) return disconnect(entry, entry.mismatch ? 'RUNNER_HOST_KEY_MISMATCH' : 'RUNNER_CONNECTION_FAILED');
        clearTimeout(entry.timer);
        entry.resolve(entry);
      });
      client.connect({ host, port, username, privateKey, readyTimeout: timeoutMs,
        keepaliveInterval: 10000, keepaliveCountMax: 3,
        algorithms: { serverHostKey: ['ssh-ed25519'] }, hostHash: 'sha256',
        hostVerifier: hash => {
          const matches = typeof hash === 'string' && /^[a-f0-9]{64}$/i.test(hash) &&
            Buffer.from(hash, 'hex').toString('base64').replace(/=+$/, '') === expectedPin;
          entry.verified = matches;
          if (!matches) entry.mismatch = true;
          return matches && !entry.mismatch && !entry.dead;
        },
      });
    } catch { disconnect(entry, entry.mismatch ? 'RUNNER_HOST_KEY_MISMATCH' : 'RUNNER_CONNECTION_FAILED'); }
    return entry;
  }

  async function request(input) {
    let prepared;
    try { prepared = prepareRequest(input); } catch { throw error('RUNNER_CONFIGURATION_REQUIRED'); }
    const entry = connection();
    return new Promise((resolve, reject) => {
      let settled = false, dispatched = false, req, agent, channel;
      const finish = (failure, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        entry.active.delete(abort);
        req?.destroy();
        agent?.destroy();
        channel?.destroy();
        if (failure) reject(error(failure)); else resolve(value);
      };
      const abort = code => finish(dispatched ? 'RUNNER_REQUEST_UNCERTAIN' : entry.mismatch ? 'RUNNER_HOST_KEY_MISMATCH' : code);
      const timer = setTimeout(() => {
        // A pending forward has no channel to cancel; retire its SSH connection.
        if (!channel) disconnect(entry);
        abort('RUNNER_CONNECTION_FAILED');
      }, timeoutMs);
      entry.active.add(abort);
      entry.promise.then(() => {
        if (settled) return;
        if (entry.dead || closed) return abort('RUNNER_CONNECTION_FAILED');
        agent = new http.Agent({ keepAlive: false });
        agent.createConnection = (_options, callback) => {
          try {
            entry.client.forwardOut('127.0.0.1', 0, '127.0.0.1', runnerPort, (failure, stream) => {
              if (settled) { stream?.on('error', () => {}); stream?.destroy(); return; }
              if (failure || !stream) {
                callback(error('RUNNER_CONNECTION_FAILED'));
                disconnect(entry);
                return;
              }
              channel = stream;
              stream.on('error', () => abort('RUNNER_CONNECTION_FAILED'));
              callback(null, stream);
            });
          } catch { callback(error('RUNNER_CONNECTION_FAILED')); disconnect(entry); }
        };
        try {
          req = http.request({ hostname: '127.0.0.1', port: runnerPort, method: prepared.method, path: prepared.path,
            headers: prepared.headers, agent, maxHeaderSize: MAX_HEADER_BYTES }, res => {
            const invalid = () => finish('RUNNER_RESPONSE_INVALID');
            const status = res.statusCode;
            if (!Number.isInteger(status) || status < 200 || status > 599 || (status >= 300 && status < 400) ||
              !jsonType(res.headers['content-type']) ||
              (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity') ||
              (res.headers['content-length'] && (!/^\d+$/.test(res.headers['content-length']) || Number(res.headers['content-length']) > MAX_RESPONSE_BYTES))) {
              res.on('error', () => {});
              invalid();
              return;
            }
            let size = 0;
            const chunks = [];
            res.on('data', chunk => {
              size += chunk.length;
              if (size > MAX_RESPONSE_BYTES) invalid(); else chunks.push(chunk);
            });
            res.on('error', () => abort('RUNNER_CONNECTION_FAILED'));
            res.on('aborted', () => abort('RUNNER_CONNECTION_FAILED'));
            res.on('end', () => {
              if (settled) return;
              try {
                const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
                finish(null, { status, headers: { ...res.headers }, data });
              } catch { invalid(); }
            });
          });
          req.on('socket', () => { dispatched = true; });
          req.on('error', failure => {
            if (failure?.code?.startsWith('HPE_')) finish('RUNNER_RESPONSE_INVALID');
            else abort('RUNNER_CONNECTION_FAILED');
          });
          req.on('information', () => finish('RUNNER_RESPONSE_INVALID'));
          req.on('upgrade', (_res, socket) => { socket.destroy(); finish('RUNNER_RESPONSE_INVALID'); });
          req.end(prepared.payload);
        } catch { abort('RUNNER_CONNECTION_FAILED'); }
      }, failure => abort(failure.code));
    });
  }

  function close() {
    if (closed) return;
    closed = true;
    if (cached) disconnect(cached);
  }

  return Object.freeze({ request, close });
}
