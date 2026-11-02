import { describe, expect, it, vi } from 'vitest';
import * as serviceModule from '../services/infrastructure/providers/catalogService.js';
import { createLiveProviderCatalog } from '../services/infrastructure/providers/liveCatalog.js';

// Shapes mirror DO /v2/{regions,sizes} and Vultr /v2/{regions,plans}.
const size = (extra = {}) => ({ slug: 's-1vcpu-1gb', memory: 1024, vcpus: 1, disk: 25,
  transfer: 1, price_monthly: 6, price_hourly: 0.00893, available: true,
  regions: ['sgp1', 'nyc3'], description: 'Basic', ...extra });
const plan = (extra = {}) => ({ id: 'vc2-1c-1gb', vcpu_count: 1, ram: 1024, disk: 25,
  bandwidth: 1000, monthly_cost: 5, type: 'vc2', locations: ['sgp'], ...extra });
function fixture(provider = 'digitalocean', policy = {}, ttlMs = 100) {
  const state = { now: 0, down: false, sizes: [size()], plans: [plan()], available: ['vc2-1c-1gb'],
    regions: provider === 'digitalocean'
      ? [{ slug: 'sgp1', name: 'Singapore 1', available: true }, { slug: 'nyc3', name: 'New York 3', available: false }]
      : [{ id: 'sgp', city: 'Singapore', country: 'SG', continent: 'Asia', options: ['ddos_protection'] }] };
  const request = vi.fn(async ({ path }) => {
    if (state.down) return { status: 429, data: { message: 'private vendor error' } };
    const data = path === '/v2/regions' ? { regions: state.regions }
      : path === '/v2/sizes' ? { sizes: state.sizes }
        : path === '/v2/plans' ? { plans: state.plans } : { available_plans: state.available };
    return { status: 200, data: { ...data, links: {}, meta: { links: {} } } };
  });
  const catalog = createLiveProviderCatalog({ provider, transport: { accountId: 'fixture-account', request } });
  const service = serviceModule.createProviderCatalogService({ provider, catalog, policy, clock: () => state.now, ttlMs });
  return { state, request, service };
}

describe('normalized provider catalogue', () => {
  it('exports the approved constructor', () => {
    expect(serviceModule.createProviderCatalogService).toBeTypeOf('function');
  });
  it('discovers real regions and normalizes DO prices/specs without a static shortlist', async () => {
    const { service } = fixture();
    expect(await service.listRegions()).toEqual({ provider: 'digitalocean', observed_at: new Date(0).toISOString(), stale: false,
      regions: [{ id: 'sgp1', label: 'Singapore 1', available: true }, { id: 'nyc3', label: 'New York 3', available: false }] });
    const result = await service.listPlans({ region: 'sgp1' });
    expect(result).toMatchObject({ provider: 'digitalocean', region: 'sgp1', stale: false, plans: [{ id: 's-1vcpu-1gb',
      cpu: 1, memory_mb: 1024, disk_gb: 25, transfer: { included: 1, unit: 'TB' },
      price: { monthly: 6, hourly: 0.00893, currency: 'USD' }, available: true, compatible: true,
      architecture: 'x86_64', family: 's', reason: null }] });
    expect(Object.isFrozen(result.plans[0].price)).toBe(true);
    expect((await service.listPlans({ region: 'nyc3' })).plans[0].available).toBe(false);
  });
  it('uses Vultr regional capacity and leaves absent hourly pricing unknown', async () => {
    const { service, state, request } = fixture('vultr');
    expect((await service.listRegions()).regions).toEqual([{ id: 'sgp', label: 'Singapore', available: true }]);
    expect((await service.listPlans({ region: 'sgp' })).plans[0]).toMatchObject({ cpu: 1, memory_mb: 1024, disk_gb: 25,
      price: { monthly: 5, hourly: null, currency: 'USD' }, transfer: { included: 1000, unit: 'GB' }, compatible: true, available: true });
    expect(request.mock.calls.some(([input]) => input.path === '/v2/regions/sgp/availability')).toBe(true);
    state.available = [];
    expect((await service.listPlans({ region: 'sgp', refresh: true })).plans[0].available).toBe(false);
  });
  it('caches with TTL and single-flight, refreshes explicitly, and exposes stale snapshots on failure', async () => {
    const { service, state, request } = fixture();
    await Promise.all([service.listPlans({ region: 'sgp1' }), service.listPlans({ region: 'sgp1' })]);
    expect(request).toHaveBeenCalledTimes(2);
    state.sizes = [size({ price_monthly: 7 })];
    expect((await service.listPlans({ region: 'sgp1' })).plans[0].price.monthly).toBe(6);
    expect((await service.listPlans({ region: 'sgp1', refresh: true })).plans[0].price.monthly).toBe(7);
    state.now = 100; state.down = true;
    const stale = await service.listPlans({ region: 'sgp1' });
    expect(stale).toMatchObject({ stale: true, observed_at: new Date(0).toISOString() });
    await expect(service.assertSelection({ region: 'sgp1', planId: 's-1vcpu-1gb' })).rejects.toMatchObject({ code: 'PROVIDER_CATALOG_STALE' });
  });
  it('always refreshes purchase evidence even inside TTL and returns the normalized plan', async () => {
    const { service, state } = fixture();
    await service.listPlans({ region: 'sgp1' });
    state.sizes = [size({ price_monthly: 9 })];
    expect(await service.assertSelection({ region: 'sgp1', planId: 's-1vcpu-1gb' })).toMatchObject({ price: { monthly: 9 } });
    state.sizes = [size({ available: false })];
    await expect(service.assertSelection({ region: 'sgp1', planId: 's-1vcpu-1gb' })).rejects.toMatchObject({ code: 'PROVIDER_PLAN_UNAVAILABLE' });
  });
  it.each(['../sgp1', '', 'sgp1?x=1', 'SGP1', 'unknown'])('rejects invalid/unknown region %s', async region => {
    const { service } = fixture();
    await expect(service.listPlans({ region })).rejects.toMatchObject({ code: 'INVALID_PROVIDER_REGION' });
  });
  it.each([
    ['allowedRegions', ['nyc3'], 'PROVIDER_REGION_DISALLOWED'],
    ['allowedPlans', [], 'PROVIDER_PLAN_DISALLOWED'],
    ['maxMonthlyAmount', 5, 'PROVIDER_BUDGET_EXCEEDED'],
  ])('enforces optional %s policy before selection', async (key, value, code) => {
    const { service } = fixture('digitalocean', { [key]: value });
    await expect(service.assertSelection({ region: 'sgp1', planId: 's-1vcpu-1gb' })).rejects.toMatchObject({ code });
  });
  it.each([
    ['s-1vcpu-1gb', { architecture: 'arm64' }, 'UNSUPPORTED_ARCHITECTURE'],
    ['gpu-h100x1-80gb', {}, 'GPU_UNSUPPORTED'],
    ['bm-8vcpu-32gb', {}, 'BARE_METAL_UNSUPPORTED'],
    ['s-1vcpu-1gb', { ipv6_only: true }, 'IPV6_ONLY_UNSUPPORTED'],
    ['unknown-1vcpu', {}, 'UNSUPPORTED_FAMILY'],
  ])('shows DO incompatibility for %s %j', async (slug, extra, reason) => {
    const { service, state } = fixture(); state.sizes = [size({ slug, ...extra })];
    expect((await service.listPlans({ region: 'sgp1' })).plans[0]).toMatchObject({ compatible: false, reason });
    await expect(service.assertSelection({ region: 'sgp1', planId: slug })).rejects.toMatchObject({ code: 'PROVIDER_PLAN_INCOMPATIBLE' });
  });
  it.each([
    ['vc2', 'vc2-1c-1gb', true, null], ['vhf', 'vhf-1c-1gb', true, null],
    ['vhp', 'vhp-1c-1gb-amd', true, null], ['voc', 'voc-c-2c-4gb', true, null],
    ['vbm', 'vbm-8c-32gb', false, 'BARE_METAL_UNSUPPORTED'],
    ['vcg', 'vcg-a16-1c-4gb', false, 'GPU_UNSUPPORTED'],
    ['vc2', 'vc2-1c-0.5gb', false, 'IPV6_ONLY_UNSUPPORTED'],
    ['mystery', 'mystery-1c', false, 'UNSUPPORTED_FAMILY'],
  ])('classifies Vultr %s/%s', async (type, id, compatible, reason) => {
    const { service, state } = fixture('vultr'); state.plans = [plan({ type, id })]; state.available = [id];
    expect((await service.listPlans({ region: 'sgp' })).plans[0]).toMatchObject({ compatible, reason });
  });
  it.each([{ price_monthly: null }, { price_hourly: '0.01' }, { memory: 0 }, { disk: NaN }, { vcpus: 1.5 }, { transfer: -1 }])(
    'rejects malformed DO evidence %j', async extra => {
      const { service, state } = fixture(); state.sizes = [size(extra)];
      await expect(service.listPlans({ region: 'sgp1' })).rejects.toMatchObject({ code: 'PROVIDER_RESPONSE_INVALID' });
    });
  it('rejects ambiguous region and plan IDs', async () => {
    const { service, state } = fixture(); state.sizes.push(size());
    await expect(service.listPlans({ region: 'sgp1' })).rejects.toMatchObject({ code: 'PROVIDER_RESPONSE_INVALID' });
    state.regions.push(state.regions[0]);
    await expect(service.listRegions()).rejects.toMatchObject({ code: 'PROVIDER_RESPONSE_INVALID' });
  });
  it('keeps vendor outages independent and does not expose raw errors', async () => {
    const a = fixture(), b = fixture('vultr'); a.state.down = true;
    await expect(a.service.listRegions()).rejects.toMatchObject({ code: 'PROVIDER_READ_UNAVAILABLE', message: 'PROVIDER_READ_UNAVAILABLE' });
    expect((await b.service.listRegions()).stale).toBe(false);
  });
  it('does not infer x86 support from an explicitly unknown architecture', async () => {
    const { service, state } = fixture(); state.sizes = [size({ architecture: 'unknown' })];
    expect((await service.listPlans({ region: 'sgp1' })).plans[0]).toMatchObject({ compatible: false, reason: 'UNSUPPORTED_ARCHITECTURE' });
  });
  it('keeps a failed explicit refresh visibly stale within the original TTL', async () => {
    const { service, state } = fixture(); await service.listRegions(); state.down = true;
    expect((await service.listRegions({ refresh: true })).stale).toBe(true);
    expect((await service.listRegions()).stale).toBe(true);
  });
  it.each(['digitalocean', 'vultr'])('reads every official %s discovery page', async provider => {
    const doProvider = provider === 'digitalocean';
    const request = vi.fn(async ({ path, query }) => {
      const second = doProvider ? query.page === '2' : query.cursor === 'page-two';
      const key = path === '/v2/regions' ? 'regions' : doProvider ? 'sizes' : 'plans';
      const rows = key === 'regions' ? (doProvider ? [{ slug: 'sgp1', name: 'Singapore 1', available: true }]
        : [{ id: 'sgp', city: 'Singapore' }]) : doProvider ? [size()] : [plan()];
      if (path.endsWith('/availability')) return { status: 200, data: { available_plans: ['vc2-1c-1gb'] } };
      return { status: 200, data: { [key]: second ? rows : [], meta: { total: 1,
        links: { next: !doProvider && !second ? 'page-two' : '' } },
      links: { pages: second ? {} : { next: `https://api.digitalocean.com${path}?page=2&per_page=200` } } } };
    });
    const catalog = createLiveProviderCatalog({ provider, transport: { accountId: 'fixture', request } });
    const service = serviceModule.createProviderCatalogService({ provider, catalog });
    expect((await service.listPlans({ region: doProvider ? 'sgp1' : 'sgp' })).plans).toHaveLength(1);
    expect(request).toHaveBeenCalledTimes(doProvider ? 4 : 5);
  });
  it('rejects partial Vultr availability evidence', async () => {
    const catalog = { list: async path => path === '/v2/regions' ? [{ id: 'sgp', city: 'Singapore' }] : [plan()],
      get: async () => ({ available_plans: ['vc2-1c-1gb'], meta: { total: 2, links: { next: 'unfinished' } } }) };
    const service = serviceModule.createProviderCatalogService({ provider: 'vultr', catalog });
    await expect(service.listPlans({ region: 'sgp' })).rejects.toMatchObject({ code: 'PROVIDER_PAGINATION_INCOMPLETE' });
  });
  it.each([{ monthly_cost: '5' }, { ram: null }, { locations: null }, { hourly_cost: -1 }])('rejects malformed Vultr evidence %j', async extra => {
    const { service, state } = fixture('vultr'); state.plans = [plan(extra)];
    await expect(service.listPlans({ region: 'sgp' })).rejects.toMatchObject({ code: 'PROVIDER_RESPONSE_INVALID' });
  });
  it('rejects missing and ambiguous plan selections', async () => {
    const { service } = fixture();
    await expect(service.assertSelection({ region: 'sgp1', planId: 'missing' })).rejects.toMatchObject({ code: 'INVALID_PROVIDER_PLAN' });
    await expect(service.assertSelection({ region: 'sgp1', planId: '../plan' })).rejects.toMatchObject({ code: 'INVALID_PROVIDER_PLAN' });
  });
  it('keeps official fractional-memory IPv4 Vultr IDs usable by the existing quote method', async () => {
    const { service, state, request } = fixture('vultr');
    const planId = 'vc2-1c-0.5gb-v4';
    state.plans = [plan({ id: planId, ram: 512, monthly_cost: 3.5 })]; state.available = [planId];
    expect(await service.assertSelection({ region: 'sgp', planId })).toMatchObject({ compatible: true, memory_mb: 512 });
    const catalog = createLiveProviderCatalog({ provider: 'vultr', transport: { accountId: 'fixture-account', request } });
    expect(await catalog.getQuote({ provider: 'vultr', accountId: 'fixture-account', region: 'sgp', planId }))
      .toMatchObject({ available: true, recurringAmount: 3.5, currency: 'USD' });
  });
});

describe('catalogue enumeration completeness', () => {
  it.each(['digitalocean', 'vultr'])('rejects a missing next link when %s total proves truncation', async provider => {
    const catalog = createLiveProviderCatalog({ provider, transport: { accountId: 'fixture',
      request: async () => ({ status: 200, data: { regions: [], meta: { total: 2, links: {} }, links: {} } }) } });
    await expect(catalog.list('/v2/regions', 'regions')).rejects.toMatchObject({ code: 'PROVIDER_PAGINATION_INCOMPLETE' });
  });
  it('rejects repeated Vultr cursors', async () => {
    const catalog = createLiveProviderCatalog({ provider: 'vultr', transport: { accountId: 'fixture',
      request: async () => ({ status: 200, data: { plans: [], meta: { links: { next: 'same-cursor' } } } }) } });
    await expect(catalog.list('/v2/plans', 'plans')).rejects.toMatchObject({ code: 'PROVIDER_PAGINATION_INCOMPLETE' });
  });
  it('rejects DO last-page evidence without the required next page', async () => {
    const catalog = createLiveProviderCatalog({ provider: 'digitalocean', transport: { accountId: 'fixture',
      request: async () => ({ status: 200, data: { regions: [], links: { pages: { last: 'https://api.digitalocean.com/v2/regions?page=2' } } } }) } });
    await expect(catalog.list('/v2/regions', 'regions')).rejects.toMatchObject({ code: 'PROVIDER_PAGINATION_INCOMPLETE' });
  });
  it('rejects a malformed terminal cursor', async () => {
    const catalog = createLiveProviderCatalog({ provider: 'vultr', transport: { accountId: 'fixture',
      request: async () => ({ status: 200, data: { plans: [], meta: { links: { next: 0 } } } }) } });
    await expect(catalog.list('/v2/plans', 'plans')).rejects.toMatchObject({ code: 'PROVIDER_PAGINATION_INCOMPLETE' });
  });
});
