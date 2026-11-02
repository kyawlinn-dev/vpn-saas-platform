import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import net from 'node:net';
import { createSshRunnerTransport } from '../services/infrastructure/runnerSshTransport.js';

const hash = 'ab'.repeat(32);
const pin = `SHA256:${Buffer.from(hash, 'hex').toString('base64').replace(/=+$/, '')}`;
const id = '00000000-0000-4000-8000-000000000001';
const cleanups = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

async function fixture({ respond, handshake, forward } = {}) {
  const received = [], clients = [], sockets = new Set();
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      received.push({ method: req.method, path: req.url, headers: req.headers, body: Buffer.concat(chunks).toString() });
      if (respond) return respond(req, res);
      res.writeHead(200, { 'Content-Type': 'application/json', 'X-Test': 'ok' });
      res.end('{"ok":true}');
    });
  });
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(() => new Promise(resolve => { for (const socket of sockets) socket.destroy(); server.close(resolve); }));
  const clientFactory = vi.fn(() => {
    const client = new EventEmitter();
    client.channels = new Set();
    client.end = vi.fn(() => { for (const channel of client.channels) channel.destroy(); queueMicrotask(() => client.emit('close')); });
    client.destroy = vi.fn(() => { for (const channel of client.channels) channel.destroy(); });
    client.exec = vi.fn(() => { throw new Error('exec forbidden'); });
    client.connect = vi.fn(options => {
      client.options = options;
      queueMicrotask(() => {
        if (handshake) return handshake(client, options);
        if (!options.hostVerifier(hash)) return client.emit('error', new Error('SECRET host verification'));
        client.emit('ready');
      });
    });
    client.forwardOut = vi.fn((source, sourcePort, target, targetPort, callback) => {
      if (forward) return forward(client, callback);
      const socket = net.createConnection({ host: '127.0.0.1', port: server.address().port });
      client.channels.add(socket);
      socket.on('error', () => {});
      socket.once('connect', () => callback(null, socket));
    });
    clients.push(client);
    return client;
  });
  function create(overrides = {}) {
    const transport = createSshRunnerTransport({ host: '192.0.2.10', username: 'runner', privateKey: 'fixture-key', hostKeySha256: pin, clientFactory, ...overrides });
    cleanups.push(() => transport.close());
    return transport;
  }
  return { create, clients, clientFactory, received };
}

describe('pinned SSH runner HTTP transport', () => {
  it('shares a pinned connection and forwards only to runner loopback without exec', async () => {
    const f = await fixture(), transport = f.create();
    const results = await Promise.all([transport.request({ method: 'GET', path: '/health' }), transport.request({ method: 'GET', path: '/operations' })]);
    expect(results[0]).toMatchObject({ status: 200, headers: { 'content-type': 'application/json', 'x-test': 'ok' }, data: { ok: true } });
    expect(Object.keys(results[0].headers).every(key => key === key.toLowerCase())).toBe(true);
    expect(f.clientFactory).toHaveBeenCalledTimes(1);
    expect(f.clients[0].options).toMatchObject({ host: '192.0.2.10', port: 22, username: 'runner', algorithms: { serverHostKey: ['ssh-ed25519'] }, hostHash: 'sha256' });
    expect(f.clients[0].options.hostVerifier('invalid')).toBe(false);
    for (const args of f.clients[0].forwardOut.mock.calls) expect(args.slice(0, 4)).toEqual(['127.0.0.1', 0, '127.0.0.1', 4317]);
    expect(f.clients[0].exec).not.toHaveBeenCalled();
  });

  it.each([
    { host: 'example.com' }, { host: 'https://192.0.2.10' }, { host: '127.0.0.1\n' },
    { port: 0 }, { port: 65536 }, { runnerPort: 4318 }, { username: '' }, { privateKey: '' },
    { hostKeySha256: 'SHA256:bad' }, { timeoutMs: 0 }, { timeoutMs: 120001 }, { timeoutMs: NaN },
  ])('rejects invalid configuration before connecting: %j', async overrides => {
    const f = await fixture();
    expect(() => f.create(overrides)).toThrow(expect.objectContaining({ code: 'RUNNER_CONFIGURATION_REQUIRED' }));
    expect(f.clientFactory).not.toHaveBeenCalled();
  });

  it('accepts IPv6, custom SSH port and padded fingerprint', async () => {
    const f = await fixture();
    await f.create({ host: '2001:db8::1', port: 2222, hostKeySha256: `${pin}=` }).request({ method: 'GET', path: '/health' });
    expect(f.clients[0].options).toMatchObject({ host: '2001:db8::1', port: 2222 });
  });

  it.each(['wrong', 'missing'])('rejects a %s host pin handshake without forwarding', async mode => {
    const f = await fixture({ handshake: (client, options) => {
      if (mode === 'wrong') options.hostVerifier('cd'.repeat(32));
      client.emit('ready');
    } });
    await expect(f.create().request({ method: 'GET', path: '/health' })).rejects.toMatchObject({ code: mode === 'wrong' ? 'RUNNER_HOST_KEY_MISMATCH' : 'RUNNER_CONNECTION_FAILED' });
    expect(f.clients[0].forwardOut).not.toHaveBeenCalled();
  });

  it.each([
    ['GET', '/health'], ['GET', '/operations'], ['GET', '/operations/catalog'],
    ['GET', '/operations/catalog?provider=vultr&region=sgp&refresh=true'],
    ['GET', '/operations/catalog?provider=digitalocean&refresh=false'],
    ['POST', '/operations/quotes'], ['POST', '/operations'], ['GET', `/operations/${id}`],
    ['POST', `/operations/${id}/resume`], ['POST', `/operations/${id}/cancel`],
  ])('allows %s %s', async (method, path) => {
    const f = await fixture();
    await f.create().request({ method, path });
    expect(f.received[0]).toMatchObject({ method, path });
  });

  it.each([
    ['GET', 'http://127.0.0.1:4317/health'], ['GET', '//evil/health'], ['GET', '/health?x=1'],
    ['GET', '/operations/../health'], ['GET', '/operations/%63atalog'], ['GET', '/operations/not-uuid'],
    ['POST', `/operations/${id}`], ['GET', `/operations/${id}/cancel`], ['DELETE', '/operations'],
    ['GET', '/operations/catalog?url=http://evil'], ['GET', '/operations/catalog?provider=other'],
    ['GET', '/operations/catalog?provider=vultr&provider=vultr'], ['GET', '/operations/catalog?refresh=1'],
    ['GET', `/operations/catalog?region=${'x'.repeat(101)}`], ['GET', '/operations/catalog?region=%0a'],
    ['GET', '/health#fragment'], ['GET', '/health\r\nInjected: yes'], ['GET', '/health/'],
  ])('blocks %s %s before SSH', async (method, path) => {
    const f = await fixture();
    await expect(f.create().request({ method, path })).rejects.toMatchObject({ code: 'RUNNER_CONFIGURATION_REQUIRED' });
    expect(f.clientFactory).not.toHaveBeenCalled();
  });

  it('preserves JSON and protocol headers without forwarding browser cookies', async () => {
    const f = await fixture();
    await f.create().request({ method: 'POST', path: '/operations', headers: { Authorization: 'Bearer fixture', 'Idempotency-Key': 'same-key', 'X-Novanet-Runner-Scope': 'scope', Cookie: 'browser=secret' }, body: { secret: 'value' } });
    expect(f.received[0]).toMatchObject({ body: '{"secret":"value"}', headers: { authorization: 'Bearer fixture', 'idempotency-key': 'same-key', 'x-novanet-runner-scope': 'scope', 'content-type': 'application/json', 'content-length': '18' } });
    expect(f.received[0].headers.cookie).toBeUndefined();
  });

  it.each([
    { Host: 'evil' }, { 'Transfer-Encoding': 'chunked' }, { 'Content-Length': '0' },
    { Authorization: 'secret\r\nX: yes' }, { 'Bad Header': 'secret' }, { Accept: 'text/html' },
    { 'Content-Type': 'text/plain' }, { Authorization: ['a', 'b'] }, { 'X-Test': 'x'.repeat(16385) },
    { Authorization: 'a', authorization: 'b' },
  ])('rejects unsafe headers before connecting: %j', async headers => {
    const f = await fixture();
    await expect(f.create().request({ method: 'POST', path: '/operations', headers })).rejects.toMatchObject({ code: 'RUNNER_CONFIGURATION_REQUIRED' });
    expect(f.clientFactory).not.toHaveBeenCalled();
  });

  it('bounds JSON bodies in bytes and rejects unserializable bodies', async () => {
    const f = await fixture(), transport = f.create(), cyclic = {}; cyclic.self = cyclic;
    for (const body of [{ value: 'x'.repeat(65536) }, { value: '\u20ac'.repeat(30000) }, cyclic, 1n]) {
      await expect(transport.request({ method: 'POST', path: '/operations', body })).rejects.toMatchObject({ code: 'RUNNER_CONFIGURATION_REQUIRED' });
    }
    expect(f.clientFactory).not.toHaveBeenCalled();
    await transport.request({ method: 'POST', path: '/operations', body: 'x'.repeat(65534) });
    expect(Buffer.byteLength(f.received[0].body)).toBe(65536);
  });

  it.each([
    [302, 'application/json', '{}'], [101, 'application/json', '{}'], [700, 'application/json', '{}'],
    [200, 'text/html', 'SECRET'], [200, 'application/json', 'SECRET'], [204, 'application/json', ''],
    [200, 'application/json', `"${'x'.repeat(1048576)}"`],
  ])('rejects invalid response status/content (%s, %s)', async (status, contentType, body) => {
    const f = await fixture({ respond: (_req, res) => res.socket.end(`HTTP/1.1 ${status} Fixture\r\nContent-Type: ${contentType}\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`) });
    const error = await f.create().request({ method: 'GET', path: '/health' }).catch(e => e);
    expect(error).toMatchObject({ code: 'RUNNER_RESPONSE_INVALID' });
    expect(error.message).not.toContain('SECRET');
  });

  it('returns valid JSON HTTP error DTOs for the protocol layer', async () => {
    const f = await fixture({ respond: (_req, res) => { res.writeHead(409, { 'Content-Type': 'application/json; charset=utf-8' }); res.end('{"code":"CONFLICT"}'); } });
    await expect(f.create().request({ method: 'POST', path: '/operations' })).resolves.toMatchObject({ status: 409, data: { code: 'CONFLICT' } });
  });

  it.each(['GET', 'POST'])('times out a stalled %s without retrying', async method => {
    const f = await fixture({ respond: () => {} });
    await expect(f.create({ timeoutMs: 40 }).request({ method, path: '/operations' })).rejects.toMatchObject({ code: 'RUNNER_REQUEST_UNCERTAIN' });
    expect(f.received).toHaveLength(1);
    expect(f.clients[0].forwardOut).toHaveBeenCalledTimes(1);
  });

  it('does not replay a lost POST and reconnects only for the next explicit request', async () => {
    let lose = true;
    const f = await fixture({ respond: (_req, res) => {
      if (lose) { lose = false; f.clients[0].emit('error', new Error('SECRET ssh')); return; }
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{}');
    } });
    const transport = f.create();
    const error = await transport.request({ method: 'POST', path: '/operations', body: { secret: 'SECRET' } }).catch(e => e);
    expect(error).toMatchObject({ code: 'RUNNER_REQUEST_UNCERTAIN', message: 'RUNNER_REQUEST_UNCERTAIN' });
    expect(f.received).toHaveLength(1);
    await transport.request({ method: 'GET', path: '/operations' });
    expect(f.clientFactory).toHaveBeenCalledTimes(2);
    expect(f.received.map(r => r.method)).toEqual(['POST', 'GET']);
  });

  it('bounds a silent SSH handshake and sanitizes connection/forward errors', async () => {
    const f = await fixture({ handshake: () => {} });
    await expect(f.create({ timeoutMs: 30 }).request({ method: 'GET', path: '/health' })).rejects.toMatchObject({ code: 'RUNNER_CONNECTION_FAILED' });
    const g = await fixture({ forward: (_client, callback) => callback(new Error('SECRET forward')) });
    await expect(g.create().request({ method: 'POST', path: '/operations' })).rejects.toMatchObject({ message: 'RUNNER_CONNECTION_FAILED', code: 'RUNNER_CONNECTION_FAILED' });
  });

  it('reports a detected pin mismatch even if SSH never emits an error', async () => {
    const f = await fixture({ handshake: (_client, options) => options.hostVerifier('cd'.repeat(32)) });
    await expect(f.create({ timeoutMs: 30 }).request({ method: 'GET', path: '/health' })).rejects.toMatchObject({ code: 'RUNNER_HOST_KEY_MISMATCH' });
  });

  it.each(['GET', 'POST'])('does not retry a lost %s HTTP channel', async method => {
    const f = await fixture({ respond: (_req, res) => res.socket.destroy() });
    await expect(f.create().request({ method, path: '/operations' })).rejects.toMatchObject({ code: 'RUNNER_REQUEST_UNCERTAIN' });
    expect(f.received).toHaveLength(1);
    expect(f.clients[0].forwardOut).toHaveBeenCalledTimes(1);
  });

  it('bounds streamed responses without a content-length', async () => {
    const f = await fixture({ respond: (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(`"${'x'.repeat(1048576)}"`);
    } });
    await expect(f.create().request({ method: 'GET', path: '/health' })).rejects.toMatchObject({ code: 'RUNNER_RESPONSE_INVALID' });
  });

  it('accepts a response at the exact byte limit', async () => {
    const f = await fixture({ respond: (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(`"${'x'.repeat(1048574)}"`);
    } });
    const response = await f.create().request({ method: 'GET', path: '/health' });
    expect(response.data).toHaveLength(1048574);
  });

  it('rejects oversized response headers and malformed UTF-8 without leaking data', async () => {
    for (const raw of [
      `HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nX-Secret: ${'s'.repeat(17000)}\r\n\r\n{}`,
      Buffer.concat([Buffer.from('HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 3\r\n\r\n"'), Buffer.from([0xff]), Buffer.from('"')]),
    ]) {
      const f = await fixture({ respond: (_req, res) => res.socket.end(raw) });
      await expect(f.create().request({ method: 'GET', path: '/health' })).rejects.toMatchObject({ code: 'RUNNER_RESPONSE_INVALID' });
    }
  });

  it('rejects a truncated response as uncertain', async () => {
    const f = await fixture({ respond: (_req, res) => res.socket.end('HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{}') });
    await expect(f.create().request({ method: 'GET', path: '/health' })).rejects.toMatchObject({ code: 'RUNNER_REQUEST_UNCERTAIN' });
  });

  it('destroys a channel delivered after close and ignores late ready events', async () => {
    let deliver;
    const f = await fixture({ forward: (_client, callback) => { deliver = callback; } });
    const transport = f.create();
    const pending = transport.request({ method: 'GET', path: '/health' }).catch(e => e);
    await vi.waitFor(() => expect(deliver).toBeTypeOf('function'));
    transport.close();
    const stream = new EventEmitter(); stream.destroy = vi.fn();
    deliver(null, stream);
    f.clients[0].emit('ready');
    expect(await pending).toMatchObject({ code: 'RUNNER_CONNECTION_FAILED' });
    expect(stream.destroy).toHaveBeenCalledTimes(1);
    expect(f.clients[0].forwardOut).toHaveBeenCalledTimes(1);
  });

  it('closes a stalled forwarding connection and reconnects for the next explicit call', async () => {
    let blocked = true;
    const f = await fixture({ forward: (_client, callback) => {
      if (blocked) return;
      callback(new Error('SECRET unavailable fixture'));
    } });
    const transport = f.create({ timeoutMs: 30 });
    await expect(transport.request({ method: 'POST', path: '/operations' })).rejects.toMatchObject({ code: 'RUNNER_CONNECTION_FAILED' });
    expect(f.clients[0].end).toHaveBeenCalledTimes(1);
    blocked = false;
    await expect(transport.request({ method: 'GET', path: '/health' })).rejects.toMatchObject({ code: 'RUNNER_CONNECTION_FAILED' });
    expect(f.clientFactory).toHaveBeenCalledTimes(2);
    expect(f.received).toHaveLength(0);
  });

  it.each(['connecting', 'forwarding', 'responding'])('close aborts while %s and stays closed', async phase => {
    let reached;
    const ready = new Promise(resolve => { reached = resolve; });
    const f = await fixture({
      ...(phase === 'connecting' ? { handshake: () => reached() } : {}),
      ...(phase === 'forwarding' ? { forward: () => reached() } : {}),
      respond: () => reached(),
    });
    const transport = f.create();
    const pending = transport.request({ method: 'POST', path: '/operations' }).catch(e => e);
    await ready;
    await transport.close(); await transport.close();
    expect(await pending).toMatchObject({ code: phase === 'responding' ? 'RUNNER_REQUEST_UNCERTAIN' : 'RUNNER_CONNECTION_FAILED' });
    await expect(transport.request({ method: 'GET', path: '/health' })).rejects.toMatchObject({ code: 'RUNNER_CONNECTION_FAILED' });
    expect(f.clientFactory).toHaveBeenCalledTimes(1);
    expect(f.clients[0].end).toHaveBeenCalledTimes(1);
  });
});
