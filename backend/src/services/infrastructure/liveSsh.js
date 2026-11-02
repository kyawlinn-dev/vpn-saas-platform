import ssh2 from 'ssh2';
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { infrastructureError } from './repository.js';
const { Client, utils } = ssh2;
const fail = code => { throw infrastructureError(code); };
export function privateSshPublicKey(privateKey) {
  const parsed=utils.parseKey(privateKey);
  if(parsed instanceof Error || Array.isArray(parsed) || !parsed?.isPrivateKey?.()) fail('INFRASTRUCTURE_SSH_KEY_UNAVAILABLE');
  return parsed.getPublicSSH();
}
export function matchesSshPublicKey(publicKey,expected) {
  try {const parsed=utils.parseKey(publicKey);return !(parsed instanceof Error) && !Array.isArray(parsed) && parsed.getPublicSSH().equals(expected);}
  catch{return false;}
}

export function makeHostBootstrap() {
  const key = utils.generateKeyPairSync('ed25519');
  const blob = key.public.trim().split(/\s+/)[1];
  const fingerprint = `SHA256:${createHash('sha256').update(Buffer.from(blob, 'base64')).digest('base64').replace(/=+$/, '')}`;
  return { fingerprint, userData: '#cloud-config\n' + JSON.stringify({ ssh_deletekeys: true, ssh_genkeytypes: ['ed25519'],
    ssh_keys: { ed25519_private: key.private, ed25519_public: key.public.trim() } }) };
}

export async function connectStrictInfrastructureSsh({ host, expectedHostKey, privateKey, password, username = 'root', clientFactory = () => new Client(), readyTimeout = 20000 }) {
  if (!isIP(host) || !/^SHA256:[A-Za-z0-9+/]{43}=?$/.test(expectedHostKey || '') || (!privateKey && !password) ||
      (password !== undefined && (privateKey || typeof password !== 'string' || !/^[a-f0-9]{22}Aa9!$/.test(password))) ||
      !Number.isFinite(readyTimeout) || readyTimeout < 1000 || readyTimeout > 30000) fail('NODE_SECURITY_CONFIGURATION_REQUIRED');
  const client = clientFactory(); let closed = false;
  const close = () => { if (!closed) { closed = true; client.end(); } };
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { close(); reject(infrastructureError('SSH_CONNECTION_TIMEOUT')); }, readyTimeout + 1000);
    client.once('ready', () => { clearTimeout(timer); resolve(); });
    client.on('error', () => { clearTimeout(timer); close(); reject(infrastructureError('SSH_CONNECTION_FAILED')); });
    try { client.connect({ host, username, ...(password ? {password} : {privateKey}), readyTimeout, keepaliveInterval: 10000, keepaliveCountMax: 3,
      algorithms: { serverHostKey: ['ssh-ed25519'] }, hostHash: 'sha256', hostVerifier: hash =>
        typeof hash === 'string' && /^[a-f0-9]{64}$/i.test(hash) && Buffer.from(hash, 'hex').toString('base64').replace(/=+$/, '') === expectedHostKey.slice(7).replace(/=+$/, '') }); }
    catch { clearTimeout(timer); close(); reject(infrastructureError('SSH_CONNECTION_FAILED')); }
  });
  function exec(command, { timeoutMs = 90000, maxOutputBytes = 4194304 } = {}) {
    if (closed || typeof command !== 'string' || Buffer.byteLength(command) > 262144 || !Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 100000) return Promise.reject(infrastructureError('INVALID_SSH_COMMAND'));
    return new Promise((resolve, reject) => {
      let settled = false, output = '', size = 0, stream;
      const finish = (error, result) => {
        if (settled) return; settled = true; clearTimeout(timer);
        if (error) { stream?.signal?.('KILL'); close(); reject(error); } else resolve(result);
      };
      const timer = setTimeout(() => finish(infrastructureError('SSH_COMMAND_TIMEOUT')), timeoutMs);
      client.exec(command, (error, channel) => {
        if (error) return finish(infrastructureError('SSH_COMMAND_FAILED'));
        stream = channel;
        stream.on('error', () => finish(infrastructureError('SSH_COMMAND_FAILED')));
        stream.on('data', chunk => { size += chunk.length; if (size > maxOutputBytes) finish(infrastructureError('SSH_OUTPUT_TOO_LARGE')); else output += chunk.toString(); });
        stream.stderr.on('data', chunk => { size += chunk.length; if (size > maxOutputBytes) finish(infrastructureError('SSH_OUTPUT_TOO_LARGE')); });
        stream.on('close', code => finish(code === 0 ? null : infrastructureError('SSH_COMMAND_FAILED'), output));
      });
    });
  }
  async function write(path, content) {
    if (closed || typeof path !== 'string' || !/^\/(?:var\/lib\/marznode|opt\/marznode)\/[A-Za-z0-9_.-]+$/.test(path) ||
        !['string', 'object'].includes(typeof content) || Buffer.byteLength(content) > 1048576) fail('INVALID_SSH_FILE');
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = error => { if (settled) return; settled = true; clearTimeout(timer); if (error) { close(); reject(infrastructureError('SSH_FILE_WRITE_FAILED')); } else resolve(); };
      const timer = setTimeout(() => finish(new Error('timeout')), 30000);
      client.sftp((error, sftp) => {
        if (error) return finish(error);
        sftp.writeFile(path, content, { mode: 0o600 }, error => { sftp.end(); finish(error); });
      });
    });
  }
  return Object.freeze({ exec, write, close });
}
