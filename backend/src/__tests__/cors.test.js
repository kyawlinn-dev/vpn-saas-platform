import { describe, expect, it, vi } from 'vitest';
import { createCorsMiddleware } from '../middleware/cors.js';

function fixture(method = 'OPTIONS', origin = 'http://localhost:3001') {
  const headers = {};
  const req = { method, headers: { origin, 'access-control-request-method': 'POST',
    'access-control-request-headers': 'content-type,idempotency-key,ngrok-skip-browser-warning' } };
  const res = { setHeader: (name, value) => { headers[name.toLowerCase()] = value; },
    status: vi.fn().mockReturnThis(), end: vi.fn() };
  const next = vi.fn();
  createCorsMiddleware({ isAllowedOrigin: value => value === 'http://localhost:3001' })(req, res, next);
  return { headers, res, next };
}
describe('API CORS middleware', () => {
  it('permits the server-operation idempotency header on credentialed admin preflight', () => {
    const f = fixture();
    const allowed = f.headers['access-control-allow-headers'].toLowerCase().split(',').map(value => value.trim());
    expect(allowed).toContain('idempotency-key');
    expect(f.headers['access-control-allow-origin']).toBe('http://localhost:3001');
    expect(f.headers['access-control-allow-credentials']).toBe('true');
    expect(f.res.status).toHaveBeenCalledWith(204);
    expect(f.res.end).toHaveBeenCalled();
    expect(f.next).not.toHaveBeenCalled();
  });
  it('does not grant an untrusted origin access', () => {
    const f = fixture('OPTIONS', 'https://untrusted.example');
    expect(f.headers['access-control-allow-origin']).toBeUndefined();
    expect(f.headers['access-control-allow-credentials']).toBeUndefined();
  });
  it('preserves existing headers and forwards normal requests to auth/routes', () => {
    const f = fixture('POST');
    expect(f.next).toHaveBeenCalledOnce();
    expect(f.res.end).not.toHaveBeenCalled();
    for (const header of ['Content-Type', 'Authorization', 'X-Telegram-Init-Data', 'x-novanet-session-id', 'ngrok-skip-browser-warning']) {
      expect(f.headers['access-control-allow-headers']).toContain(header);
    }
    expect(f.headers.vary).toBe('Origin');
  });
});
