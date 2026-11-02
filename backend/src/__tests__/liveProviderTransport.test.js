import { describe, expect, it, vi } from 'vitest';
import { connectProviderTransport, providerAccountIdentity } from '../services/infrastructure/providers/liveTransport.js';
import { createLiveProviderCatalog } from '../services/infrastructure/providers/liveCatalog.js';
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
describe('live provider HTTP boundary (injected fetch only)', () => {
  it('does not send mutation requests until the configured account is verified', async () => {
    const fetchImpl = vi.fn(async () => reply({ account: { uuid: 'another-account' } }));
    await expect(connectProviderTransport({ provider: 'digitalocean', token: 'fixture-secret', expectedAccountId: 'account', fetchImpl })).rejects.toMatchObject({ code: 'PROVIDER_ACCOUNT_MISMATCH' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][1].method).toBe('GET');
  });
  it('uses fixed HTTPS origins, bounded requests and no automatic mutation retry', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(reply({ account: { uuid: 'account' } })).mockRejectedValueOnce(new Error('fixture-secret'));
    const transport = await connectProviderTransport({ provider: 'digitalocean', token: 'fixture-secret', expectedAccountId: 'account', fetchImpl });
    await expect(transport.request({ method: 'POST', path: '/v2/droplets', body: { name: 'fixture' } })).rejects.toMatchObject({ code: 'PROVIDER_REQUEST_UNCERTAIN', message: 'PROVIDER_REQUEST_UNCERTAIN' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [url, init] = fetchImpl.mock.calls[1];
    expect(String(url)).toBe('https://api.digitalocean.com/v2/droplets');
    expect(init.redirect).toBe('error'); expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.headers.Authorization).toBe('Bearer fixture-secret');
    for (const path of ['https://evil.invalid/v2/droplets', '//evil.invalid', '/v2/../account', '/v2/droplets?token=secret', '/v2/%2e%2e/account']) {
      await expect(transport.request({ method: 'GET', path })).rejects.toMatchObject({ code: 'INVALID_PROVIDER_REQUEST' });
    }
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it('uses a deterministic non-PII identity for Vultr account verification', async () => {
    const id = providerAccountIdentity('vultr', { email: 'Owner@Example.invalid' });
    expect(id).toMatch(/^email-sha256:[a-f0-9]{64}$/);
    const fetchImpl = vi.fn(async () => reply({ account: { email: 'owner@example.invalid' } }));
    const transport = await connectProviderTransport({ provider: 'vultr', token: 'fixture-secret', expectedAccountId: id, fetchImpl });
    expect(transport.accountId).toBe(id); expect(JSON.stringify(transport)).not.toContain('fixture-secret');
  });
  it('passes through non-2xx status without leaking raw provider errors', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(reply({ account: { uuid: 'account' } })).mockResolvedValueOnce(reply({ message: 'fixture-error' }, 429));
    const transport = await connectProviderTransport({ provider: 'digitalocean', token: 'fixture-secret', expectedAccountId: 'account', fetchImpl });
    expect((await transport.request({ method: 'GET', path: '/v2/sizes' })).status).toBe(429);
  });
});
describe('live catalogue mappings', () => {
  it('reads every DO size page and quotes actual regional availability and monthly USD cost', async () => {
    const request = vi.fn(async ({ query }) => query.page === '2'
      ? { status: 200, data: { sizes: [{ slug: 'small', available: true, price_monthly: 6, transfer: 1, regions: ['sgp1'] }], links: {} } }
      : { status: 200, data: { sizes: [], links: { pages: { next: 'https://api.digitalocean.com/v2/sizes?page=2&per_page=200' } } } });
    const catalog = createLiveProviderCatalog({ provider: 'digitalocean', transport: { accountId: 'account', request } });
    expect(await catalog.getQuote({ provider: 'digitalocean', accountId: 'account', region: 'sgp1', planId: 'small' })).toMatchObject({ available: true, recurringAmount: 6, currency: 'USD', trafficTerms: { included: 1, unit: 'TB', overageAmount: null } });
    expect(request).toHaveBeenCalledTimes(2);
    expect((await catalog.getQuote({ provider: 'digitalocean', accountId: 'account', region: 'nyc1', planId: 'small' })).available).toBe(false);
  });
  it('cross-checks Vultr regional availability instead of assuming a listed plan is deployable', async () => {
    const request = vi.fn(async ({ path }) => path === '/v2/plans'
      ? { status: 200, data: { plans: [{ id: 'small', monthly_cost: 6, bandwidth: 1000, locations: ['sgp'] }], meta: { links: {} } } }
      : { status: 200, data: { available_plans: [] } });
    const catalog = createLiveProviderCatalog({ provider: 'vultr', transport: { accountId: 'account', request } });
    expect((await catalog.getQuote({ provider: 'vultr', accountId: 'account', region: 'sgp', planId: 'small' })).available).toBe(false);
    request.mockResolvedValueOnce({ status: 200, data: { plans: [{ id: 'small', monthly_cost: 6, bandwidth: 1000 }], meta: { links: {} } } }).mockResolvedValueOnce({ status: 200, data: { available_plans: ['small'] } });
    expect(await catalog.getQuote({ provider: 'vultr', accountId: 'account', region: 'sgp', planId: 'small' })).toMatchObject({ available: true, recurringAmount: 6, trafficTerms: { included: 1000, unit: 'GB' } });
  });
  it('rejects foreign pagination and missing price evidence', async () => {
    const request = vi.fn(async () => ({ status: 200, data: { sizes: [], links: { pages: { next: 'https://evil.invalid/v2/sizes?page=2' } } } }));
    const catalog = createLiveProviderCatalog({ provider: 'digitalocean', transport: { accountId: 'account', request } });
    await expect(catalog.getQuote({ provider: 'digitalocean', accountId: 'account', region: 'sgp1', planId: 'small' })).rejects.toMatchObject({ code: 'PROVIDER_PAGINATION_INCOMPLETE' });
    request.mockResolvedValue({ status: 200, data: { sizes: [{ slug: 'small', available: true, regions: ['sgp1'] }], links: {} } });
    await expect(catalog.getQuote({ provider: 'digitalocean', accountId: 'account', region: 'sgp1', planId: 'small' })).rejects.toMatchObject({ code: 'QUOTE_UNAVAILABLE' });
  });
  it('keeps a detached billable volume visible using its durable pre-deletion reference', async () => {
    const request = vi.fn(async ({ path }) => ({ status: 200, data: path === '/v2/volumes' ? { volumes: [{ id: 'volume', droplet_ids: [] }], links: {} }
      : path === '/v2/snapshots' ? { snapshots: [], links: {} } : { reserved_ips: [], links: {} } }));
    const catalog = createLiveProviderCatalog({ provider: 'digitalocean', transport: { accountId: 'account', request } });
    const inventory = await catalog.inspectBillableAttachments({ provider: 'digitalocean', accountId: 'account', resourceId: '123', knownAttachments: [{ type: 'volume', id: 'volume' }] });
    expect(inventory.complete).toBe(true);
    expect(inventory.items).toContainEqual(expect.objectContaining({ id: 'volume', type: 'volume', amount: null }));
    expect(request.mock.calls.every(([input]) => input.method === 'GET')).toBe(true);
  });
  it('does not claim complete Vultr billing evidence when snapshot ownership cannot be established', async () => {
    const request = vi.fn(async ({ path }) => ({ status: 200, data: { blocks: [], reserved_ips: [], snapshots: path === '/v2/snapshots' ? [{ id: 'unknown-snapshot' }] : [], backups: [], block_storage_snapshots: [], meta: { links: {} } } }));
    const catalog = createLiveProviderCatalog({ provider: 'vultr', transport: { accountId: 'account', request } });
    expect((await catalog.inspectBillableAttachments({ provider: 'vultr', accountId: 'account', resourceId: '123' })).complete).toBe(false);
  });
});
