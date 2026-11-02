import { infrastructureError } from './repository.js';
import { readBoundedJson } from './httpResponse.js';
const verified = new WeakSet();
export const isVerifiedPanelTransport = transport => verified.has(transport);
const fail = code => { throw infrastructureError(code); };

export async function connectPanelTransport({ baseUrl, username, password, fetchImpl = globalThis.fetch, timeoutMs = 20000 }) {
  let base;
  try { base = new URL(baseUrl); } catch { fail('PANEL_CONFIGURATION_REQUIRED'); }
  if ((base.protocol !== 'https:' && !(base.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname))) ||
      base.username || base.password || base.search || base.hash || !['', '/'].includes(base.pathname) || !username || !password ||
      !Number.isFinite(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60000) fail('PANEL_CONFIGURATION_REQUIRED');
  let token, refreshAt = 0;
  async function send(path, method, body, login = false, query = {}) {
    if (!['GET', 'POST', 'PUT', 'DELETE'].includes(method) || !/^\/api\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(path)) fail('INVALID_PANEL_REQUEST');
    const url = new URL(path, base.origin);
    for (const [key, value] of Object.entries(query)) {
      if (!/^[a-z_]+$/.test(key) || !['string', 'number', 'boolean'].includes(typeof value) || String(value).length > 200) fail('INVALID_PANEL_REQUEST');
      url.searchParams.set(key, String(value));
    }
    const headers = { Accept: 'application/json', 'Content-Type': login ? 'application/x-www-form-urlencoded' : 'application/json' };
    if (!login) headers.Authorization = `Bearer ${token}`;
    const content = body === undefined ? undefined : login ? body.toString() : JSON.stringify(body);
    if (content && Buffer.byteLength(content) > 1048576) fail('INVALID_PANEL_REQUEST');
    let response;
    try { response = await fetchImpl(url, { method, headers, body: content, redirect: 'error', signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' }); }
    catch { fail('PANEL_REQUEST_UNCERTAIN'); }
    if (!Number.isInteger(response.status) || response.status < 100 || response.status > 599) fail('PANEL_RESPONSE_INVALID');
    try { return { status: response.status, data: response.status === 204 ? null : await readBoundedJson(response) }; }
    catch { fail('PANEL_RESPONSE_INVALID'); }
  }
  async function login() {
    const response = await send('/api/admins/token', 'POST', new URLSearchParams({ username, password, grant_type: 'password' }), true);
    if (response.status !== 200 || typeof response.data?.access_token !== 'string' || !response.data.access_token) fail('PANEL_AUTHENTICATION_FAILED');
    token = response.data.access_token; refreshAt = Date.now() + 50 * 60000;
  }
  await login();
  async function request({ path, method = 'GET', body, query }) {
    if (Date.now() >= refreshAt) await login();
    return send(path, method, body, false, query);
  }
  async function list(path, query = {}) {
    const rows = [], seen = new Set();
    for (let page = 1; page <= 1000; page++) {
      const response = await request({ path, query: { ...query, size: 100, page } });
      if (response.status !== 200) fail('PANEL_INVENTORY_INCOMPLETE');
      const data = response.data, items = Array.isArray(data) ? data : data?.items;
      if (!Array.isArray(items) || (!Array.isArray(data) && (!Number.isSafeInteger(data.pages) || data.pages < 0))) fail('PANEL_INVENTORY_INCOMPLETE');
      for (const item of items) {
        if (item?.id == null || seen.has(String(item.id))) fail('PANEL_INVENTORY_INCOMPLETE');
        seen.add(String(item.id)); rows.push(item);
      }
      if (Array.isArray(data) || page >= data.pages) return rows;
      if (!items.length) fail('PANEL_INVENTORY_INCOMPLETE');
    }
    fail('PANEL_INVENTORY_INCOMPLETE');
  }
  const transport = Object.freeze({ identity: base.origin, request, list });
  verified.add(transport);
  return transport;
}
