import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { connectStrictInfrastructureSsh, makeHostBootstrap } from '../services/infrastructure/liveSsh.js';
describe('infrastructure SSH', () => {
  it('generates a pre-pinned cloud-init host key rather than trusting the first connection', () => {
    const bootstrap = makeHostBootstrap();
    expect(bootstrap.fingerprint).toMatch(/^SHA256:[A-Za-z0-9+/]{43}$/);
    expect(bootstrap.userData).toMatch(/^#cloud-config\n/);
    const config = JSON.parse(bootstrap.userData.split('\n').slice(1).join('\n'));
    expect(config.ssh_keys.ed25519_private).toContain('PRIVATE KEY');
    expect(config.ssh_deletekeys).toBe(true);
  });
  function clientFixture() {
    const client = new EventEmitter();
    client.connect = vi.fn(options => { queueMicrotask(() => client.emit('ready')); return client; });
    client.end = vi.fn();
    client.exec = vi.fn((_cmd, callback) => {
      const stream = new PassThrough(); stream.stderr = new PassThrough(); stream.signal = vi.fn();
      callback(null, stream); queueMicrotask(() => { stream.emit('data', Buffer.from('ok')); stream.emit('close', 0); });
    });
    return client;
  }
  it('rejects unknown host keys and closes bounded sessions after use', async () => {
    const client = clientFixture();
    const fingerprint = `SHA256:${Buffer.alloc(32, 1).toString('base64').replace(/=+$/, '')}`;
    const ssh = await connectStrictInfrastructureSsh({ host: '198.51.100.10', expectedHostKey: fingerprint, privateKey: 'fixture', clientFactory: () => client });
    const options = client.connect.mock.calls[0][0];
    expect(options.hostVerifier('01'.repeat(32))).toBe(true);
    expect(options.hostVerifier('02'.repeat(32))).toBe(false);
    expect(await ssh.exec('true')).toBe('ok');
    await ssh.close(); expect(client.end).toHaveBeenCalledTimes(1);
  });
  it('does not construct a connection without a verified fingerprint', async () => {
    const clientFactory = vi.fn();
    await expect(connectStrictInfrastructureSsh({ host: '198.51.100.10', privateKey: 'fixture', clientFactory })).rejects.toMatchObject({ code: 'NODE_SECURITY_CONFIGURATION_REQUIRED' });
    expect(clientFactory).not.toHaveBeenCalled();
  });
});
