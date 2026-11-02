import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { connectLightNodeTransport } from '../services/infrastructure/providers/lightnodeTransport.js';
import { createLightNodeCatalog } from '../services/infrastructure/providers/lightnodeCatalog.js';
const region = 'jp-tokyo-1', zone = `${region}-a`, planId = 'intel-c1m2-bgp-t1000-s50-d0';
const source = 'https://doc.lightnode.com/Instance/Billingdescription.html';
const billing = { kind: 'provider_pricing', source }, price = { monthly: null, hourly: null, currency: 'USD', billing };
const packageRow = (r = region, z = `${r}-a`, patch = {}) => ({ cpu: 1, memory: 2, systemDiskSize: 50, freeFlow: 1000,
  packageCode: planId, regionCode: r, zoneCode: z, publicIpChargeMode: 'PayByTraffic', ...patch });
const imageRow = (patch = {}) => ({ imageResourceUUID: 'img-ubuntu', imageAccount: 'root', imageName: 'Ubuntu 22.04', imageType: 'System',
  osVersion: 'linux', osDistroVersion: 'Ubuntu', osVersionDetail: 'Ubuntu 22.04', supportSsh: true, supportCloudInit: true, ...patch });
const regionRow = (r = region, label = 'Tokyo', zones = [`${r}-a`]) => ({ regionCode: r, regionName: label, zones: zones.map(z => ({ zoneCode: z, zoneName: z })) });
async function fixture() {
  const token = 'catalog-fixture-token';
  const connection = { id: '9c86ece0-1500-4000-8000-000000000001', credentialSha256: createHash('sha256').update(token).digest('hex'),
    anchor: { resourceId: 'ecs-anchor', region, zone, createdAt: '2026-10-01 12:00:00', address: '192.0.2.10' }, attestedAt: '2026-10-31T00:00:00Z', firstContactPolicy: 'tofu' };
  const config = { connection };
  const state = { now: Date.parse('2026-11-02T00:00:00Z'), status: 202, regions: [regionRow()], packages: [packageRow()], images: [imageRow()], extra: {}, pages: null, imageRegions: {} };
  const fetchImpl = vi.fn(async url => {
    const path = url.pathname, r = url.searchParams.get('regionCode');
    const key = path === '/region/list' ? 'regions' : path === '/package/list' ? 'packages' : 'images';
    const rows = key === 'packages' ? state.packages.filter(row => row.regionCode === r || row.regionCode === 'other') : key === 'images' ? state.imageRegions[r] ?? state.images : state.regions;
    const data = path === '/instance/detail' ? { instance: { ecsResourceUUID: 'ecs-anchor', regionCode: region, zoneCode: zone, createTime: connection.anchor.createdAt, publicIpAddress: connection.anchor.address } }
      : state.pages && path === '/image/list' ? state.pages(Number(url.searchParams.get('page'))) : { [key]: rows, ...(key === 'images' ? { rowCount: rows.length } : {}), ...state.extra };
    return new Response(JSON.stringify(data), { status: state.status });
  });
  const transport = await connectLightNodeTransport({ token, expectedAccountId: connection.id, connection, fetchImpl });
  const catalog = createLightNodeCatalog({ transport, config, clock: () => state.now });
  return { catalog, state, config, transport, fetchImpl, quoteInput: { provider: 'lightnode', accountId: connection.id, region, planId } };
}
const selection = { region, planId, profile: 'dual' };
describe('LightNode automatic catalogue discovery', () => {
  it.each([
    ['tha-bangkok-1', 'Bangkok', 'TH'], ['ger-frankfurt-1', 'Frankfurt', 'DE'],
    ['sau-jeddah-1', 'Jeddah', 'SA'], ['bg-dhaka-1', 'Dhaka', 'BD'],
    ['sa-johannesburg-1', 'Johannesburg', 'ZA'], ['cn-hongkong-3', 'Hong Kong', 'HK'],
    ['cn-taiwan-2', 'Taipei II', 'TW'],
  ])('normalizes provider-specific geographic code %s to %s / %s', async (code, label, country) => {
    const { catalog, state } = await fixture(); state.regions = [regionRow(code, label)];
    expect((await catalog.listRegions()).regions[0]).toMatchObject({ city: label, country });
  });
  it('requires genuine transport and exact account binding', async () => {
    const { transport, config, catalog, quoteInput } = await fixture();
    expect(() => createLightNodeCatalog({ transport: { ...transport }, config })).toThrow();
    expect(() => createLightNodeCatalog({ transport })).toThrow('PROVIDER_ACCOUNT_MISMATCH');
    expect(() => createLightNodeCatalog({ transport, config: { connection: { ...config.connection, credentialSha256: 'a'.repeat(64) } } })).toThrow();
    for (const patch of [{ accountId: 'wrong' }, { provider: 'vultr' }]) await expect(catalog.getQuote({ ...quoteInput, ...patch })).rejects.toMatchObject({ code: 'RESOURCE_SCOPE_MISMATCH' });
  });
  it('discovers without configuration/prices and binds raw specs and image in nullable quotes', async () => {
    const { catalog, quoteInput, state } = await fixture();
    expect(await catalog.listRegions()).toMatchObject({ provider: 'lightnode', stale: false, regions: [{ id: region, city: 'Tokyo', country: 'JP', available: true }] });
    const result = await catalog.listPlans({ region });
    expect(result.plans).toHaveLength(1);
    expect(result.plans[0]).toMatchObject({ id: planId, zone, image_resource_uuid: 'img-ubuntu', cpu: 1, memory_mb: 2048, disk_gb: 50,
      transfer: { included: 1000, unit: 'GB' }, billing_mode: 'PayByTraffic', bandwidth_mbps: null, price, available: true, compatible: true, reason: null });
    expect(Object.isFrozen(result.plans[0].price.billing)).toBe(true);
    expect(await catalog.assertSelection(selection)).toMatchObject({ id: planId, compatible: true });
    expect(await catalog.getQuote(quoteInput)).toEqual({ available: true, recurringAmount: null, currency: 'USD', trafficTerms: {
      included: 1000, unit: 'GB', overageAmount: null, source, zone, imageResourceUUID: 'img-ubuntu', billing,
      specs: { cpu: 1, memory_mb: 2048, disk_gb: 50, transfer: { included: 1000, unit: 'GB' }, billing_mode: 'PayByTraffic', bandwidth_mbps: null } } });
    state.now += 100 * 86400000; expect((await catalog.getQuote(quoteInput)).available).toBe(true);
  });
  it.each([undefined, null, [], { allowedRegions: [], allowedPlans: [], maxMonthlyAmount: 0 }, { malformed: true }])('ignores legacy policy %j and expired duplicate prices/maps', async policy => {
    const { transport, config, state, quoteInput } = await fixture();
    const catalog = createLightNodeCatalog({ transport, config: { ...config, policy, prices: [{ hourly: 9999, verifiedAt: '2000-01-01' }, { hourly: 9999, verifiedAt: '2000-01-01' }],
      regionalMachines: { [region]: { dual: { zone: 'bad', imageResourceUUID: 'bad' }, vless_only: { zone: 'other' } } } }, clock: () => state.now });
    expect((await catalog.listRegions()).regions[0].available).toBe(true);
    expect(await catalog.assertSelection(selection)).toMatchObject({ compatible: true, price });
    expect((await catalog.getQuote(quoteInput)).available).toBe(true);
    expect(await catalog.inspect()).toEqual({ ready: true, reason: null, profiles: ['dual', 'vless_only'], profile_reasons: {} });
  });
  it('exposes Thailand and chooses first compatible zone then Ubuntu22 deterministically across profiles', async () => {
    const { catalog, state } = await fixture(); const r = 'tha-bangkok-1', a = `${r}-a`, b = `${r}-b`, c = `${r}-c`;
    state.regions.push(regionRow(r, 'Bangkok', [c, b, a]), regionRow('us-test-1', 'Test', []));
    state.packages.push(packageRow(r, a, { packageCode: 'arm-c1m2-t1000-s50-d0' }), packageRow(r, c), packageRow(r, b));
    state.imageRegions[r] = [imageRow({ imageResourceUUID: 'z-22' }), imageRow({ imageResourceUUID: 'a-24', osVersionDetail: 'Ubuntu 24.04' }), imageRow({ imageResourceUUID: 'a-22' })];
    expect((await catalog.listRegions()).regions.map(r => [r.id, r.available])).toEqual([[region, true], [r, true], ['us-test-1', false]]);
    for (const profile of ['dual', 'vless_only']) {
      expect(await catalog.resolveMachine({ region: r, profile })).toEqual({ zone: b, imageResourceUUID: 'a-22', bootstrapMode: 'password-tofu', firstContactPolicy: 'tofu' });
      expect((await catalog.listPlans({ region: r, profile })).plans).toMatchObject([{ id: planId, zone: b, image_resource_uuid: 'a-22', compatible: true }]);
    }
    state.regions[1].zones.reverse(); state.packages.reverse(); state.imageRegions[r].reverse();
    expect(await catalog.resolveMachine({ region: r, profile: 'dual' })).toMatchObject({ zone: b, imageResourceUUID: 'a-22' });
  });
  it('supports mixed bandwidth/traffic without inventing unlimited transfer', async () => {
    const { catalog, state, quoteInput } = await fixture(); const p = 'amd-c1m2-bgp-b2-s50-d0';
    state.packages.push(packageRow(region, zone, { packageCode: p, publicIpChargeMode: 'PayByBandwidth', freeFlow: undefined, bandwidth: 2 }));
    expect((await catalog.listPlans({ region })).plans.find(row => row.id === p)).toMatchObject({ compatible: true, billing_mode: 'PayByBandwidth', bandwidth_mbps: 2, transfer: { included: null, unit: null }, price });
    expect(await catalog.getQuote({ ...quoteInput, planId: p })).toMatchObject({ available: true, recurringAmount: null, trafficTerms: { included: null, unit: null, specs: { billing_mode: 'PayByBandwidth', bandwidth_mbps: 2 } } });
    state.packages[0].bandwidth = 10; expect((await catalog.assertSelection(selection)).bandwidth_mbps).toBe(10);
    state.packages[0].freeFlow = 0; expect((await catalog.assertSelection(selection)).transfer).toEqual({ included: 0, unit: 'GB' });
  });
  it.each([undefined, null, 0, -1, '2'])('rejects a bandwidth-billed package without actual positive bandwidth %j', async bandwidth => {
    const { catalog, state } = await fixture();
    Object.assign(state.packages[0], { publicIpChargeMode: 'PayByBandwidth', bandwidth });
    await expect(catalog.listPlans({ region })).rejects.toMatchObject({ code: 'PROVIDER_RESPONSE_INVALID' });
  });
  it.each([undefined, null, 0, -1, '2'])('keeps absent/invalid optional bandwidth %j null', async bandwidth => {
    const { catalog, state } = await fixture(); state.packages[0].bandwidth = bandwidth;
    expect((await catalog.assertSelection(selection)).bandwidth_mbps).toBeNull();
  });
  it.each([[{ packageCode: 'arm-c1m2-t1000-s50-d0' }, 'UNSUPPORTED_FAMILY'], [{ dataDiskSize: 10 }, 'UNSUPPORTED_STORAGE'],
    [{ packageCode: 'intel-c1m2-bgp-t1000-s50-d20' }, 'UNSUPPORTED_STORAGE'], [{ packageCode: 'intel-c1m2-bgp-t1000-s50' }, 'UNSUPPORTED_STORAGE']])('reports technical incompatibility %j', async (patch, reason) => {
    const { catalog, state } = await fixture(); Object.assign(state.packages[0], patch);
    expect((await catalog.listPlans({ region })).plans[0]).toMatchObject({ compatible: false, reason, price });
    await expect(catalog.assertSelection({ region, planId: state.packages[0].packageCode })).rejects.toMatchObject({ code: 'PROVIDER_PLAN_INCOMPATIBLE' });
    expect((await catalog.inspect()).ready).toBe(false);
  });
  it.each([{ supportSsh: false }, { supportCloudInit: false }, { imageAccount: 'ubuntu' }, { osVersion: 'windows' }, { osVersionDetail: 'Ubuntu 20.04' }, { imageType: 'Custom' }])('reports unsupported images %j', async patch => {
    const { catalog, state, quoteInput } = await fixture(); Object.assign(state.images[0], patch);
    await expect(catalog.resolveMachine({ region, profile: 'dual' })).rejects.toMatchObject({ code: 'PROVIDER_IMAGE_UNAVAILABLE' });
    expect((await catalog.listPlans({ region })).plans[0]).toMatchObject({ compatible: false, reason: 'PROVIDER_IMAGE_UNAVAILABLE' });
    expect(await catalog.getQuote(quoteInput)).toEqual({ available: false });
  });
  it('uses Ubuntu24 fallback and accepts omitted capabilities, rejecting missing images', async () => {
    const { catalog, state } = await fixture(); state.images = [imageRow({ supportSsh: false }), imageRow({ imageResourceUUID: 'ubuntu24', osVersionDetail: 'Ubuntu 24.04', supportSsh: undefined, supportCloudInit: undefined })];
    expect(await catalog.resolveMachine({ region, profile: 'dual' })).toMatchObject({ imageResourceUUID: 'ubuntu24' });
    state.images = []; expect((await catalog.listPlans({ region })).plans[0].reason).toBe('PROVIDER_IMAGE_UNAVAILABLE');
  });
  it('revalidates fresh specs/images/regions on every quote and selection', async () => {
    const { catalog, state, quoteInput } = await fixture(); expect((await catalog.getQuote(quoteInput)).available).toBe(true);
    state.packages[0].freeFlow = 512; state.packages[0].cpu = 2;
    expect(await catalog.getQuote(quoteInput)).toMatchObject({ trafficTerms: { included: 512, specs: { cpu: 2 } } });
    state.images = []; await expect(catalog.assertSelection(selection)).rejects.toMatchObject({ code: 'PROVIDER_PLAN_INCOMPATIBLE' });
    expect(await catalog.getQuote(quoteInput)).toEqual({ available: false }); state.regions = [];
    await expect(catalog.assertSelection(selection)).rejects.toMatchObject({ code: 'INVALID_PROVIDER_REGION' });
  });
  it('probes anchor first and avoids 37 image calls when ready', async () => {
    const { catalog, state, fetchImpl } = await fixture(); state.regions.unshift(...Array.from({ length: 36 }, (_, i) => regionRow(`th-test-${i}`, `Test ${i}`)));
    expect((await catalog.inspect()).profiles).toEqual(['dual', 'vless_only']);
    expect(fetchImpl.mock.calls.filter(([url]) => url.pathname === '/image/list').map(([url]) => url.searchParams.get('regionCode'))).toEqual([region]);
  });
  it('falls back from unavailable anchor to another compatible region for both profiles', async () => {
    const { catalog, state, fetchImpl } = await fixture(); const r = 'tha-bangkok-1'; state.regions.push(regionRow(r, 'Bangkok')); state.packages.push(packageRow(r)); state.imageRegions[region] = [];
    expect(await catalog.inspect()).toEqual({ ready: true, reason: null, profiles: ['dual', 'vless_only'], profile_reasons: {} });
    expect(fetchImpl.mock.calls.filter(([url]) => url.pathname === '/image/list').map(([url]) => url.searchParams.get('regionCode'))).toEqual([region, r]);
  });
  it('completes image pagination and rejects truncation, changing totals, repeated identities', async () => {
    const { catalog, state, fetchImpl } = await fixture(); const first = { images: [imageRow({ imageResourceUUID: 'z-other' })], rowCount: 2 };
    state.pages = page => page === 1 ? first : { images: state.images, rowCount: 2 };
    expect(await catalog.resolveMachine({ region, profile: 'dual' })).toMatchObject({ imageResourceUUID: 'img-ubuntu' });
    expect(fetchImpl.mock.calls.some(([url]) => url.searchParams.get('page') === '2')).toBe(true);
    for (const tail of [{ images: [], rowCount: 2 }, { images: state.images, rowCount: 3 }, { images: state.images }, { images: state.images, rowCount: -1 }]) {
      state.pages = page => page === 1 ? first : tail;
      await expect(catalog.listPlans({ region })).rejects.toMatchObject({ code: 'PROVIDER_PAGINATION_INCOMPLETE' });
    }
    state.pages = () => first; await expect(catalog.listPlans({ region })).rejects.toMatchObject({ code: 'PROVIDER_RESPONSE_INVALID' });
  });
  it('bounds pagination at 1000 pages', async () => {
    const { catalog, state, fetchImpl } = await fixture(); state.pages = page => ({ images: [imageRow({ imageResourceUUID: `img-${page}` })], rowCount: 1001 });
    await expect(catalog.list('/image/list', 'images', { regionCode: region })).rejects.toMatchObject({ code: 'PROVIDER_PAGINATION_INCOMPLETE' });
    expect(fetchImpl.mock.calls.filter(([url]) => url.pathname === '/image/list')).toHaveLength(1000);
  });
  it.each([{ cpu: 0 }, { memory: '2' }, { systemDiskSize: null }, { freeFlow: -1 }, { freeFlow: undefined }, { regionCode: 'other' }, { zoneCode: 'unknown' }, { dataDiskSize: -1 }, { publicIpChargeMode: 'unknown' }])('rejects malformed package %j', async patch => {
    const { catalog, state } = await fixture(); Object.assign(state.packages[0], patch);
    await expect(catalog.listPlans({ region })).rejects.toMatchObject({ code: 'PROVIDER_RESPONSE_INVALID' });
  });
  it('rejects cross-region images and malformed capabilities', async () => {
    const { catalog, state } = await fixture(); state.images[0].regionCode = 'other';
    await expect(catalog.listPlans({ region })).rejects.toMatchObject({ code: 'PROVIDER_RESPONSE_INVALID' });
    delete state.images[0].regionCode; state.images[0].supportSsh = 'true';
    await expect(catalog.listPlans({ region })).rejects.toMatchObject({ code: 'PROVIDER_RESPONSE_INVALID' });
  });
  it.each([{ osVersionDetail: ['Ubuntu 22.04'] }, { osVersionDetail: null }, { imageAccount: null }, { imageType: 42 }])
  ('rejects malformed image metadata instead of coercing it %j', async patch => {
    const { catalog, state } = await fixture(); Object.assign(state.images[0], patch);
    await expect(catalog.listPlans({ region })).rejects.toMatchObject({ code: 'PROVIDER_RESPONSE_INVALID' });
  });
  it('accepts public captured mixed packages and selects captured Ubuntu22 without console prices', async () => {
    const { catalog, state, fetchImpl } = await fixture();
    // Public wire-regions/images/packages.json representatives, 2026-11-01.
    // The image/package capture is Tokyo; Bangkok verifies the actual region ID.
    state.regions.push(regionRow('tha-bangkok-1', 'Bangkok'), regionRow('mm-yangon-1', 'Yangon'));
    state.images = [imageRow({ imageResourceUUID: 'img-cm0001955pec', osVersionDetail: 'Ubuntu 22.04 x64（RDP）' }),
      imageRow({ imageResourceUUID: 'img-cm0001955pek', osVersionDetail: 'Ubuntu 24.04' }),
      imageRow({ imageResourceUUID: 'img-sp0001955x1u', regionCode: region, configSystemCloudInit: false })];
    state.packages = [
      { bandwidth: 10, cpu: 16, dataDiskSize: 300, memory: 32, packageCode: 'intel-c16m32-bgp-b10-s50-d300',
        publicIpChargeMode: 'PayByBandwidth', regionCode: region, systemDiskSize: 50, zoneCode: zone },
      { bandwidth: 2, cpu: 1, memory: 2, packageCode: 'intel-c1m2-bgp-b2-s50-d0',
        publicIpChargeMode: 'PayByBandwidth', regionCode: region, systemDiskSize: 50, zoneCode: zone },
      { cpu: 1, freeFlow: 1000, memory: 2, packageCode: planId,
        publicIpChargeMode: 'PayByTraffic', regionCode: region, systemDiskSize: 50, zoneCode: zone },
    ];
    const result = await catalog.listPlans({ region });
    expect(result.plans.map(plan => [plan.id, plan.compatible, plan.reason])).toEqual([
      ['intel-c16m32-bgp-b10-s50-d300', false, 'UNSUPPORTED_STORAGE'],
      ['intel-c1m2-bgp-b2-s50-d0', true, null], [planId, true, null],
    ]);
    expect(await catalog.resolveMachine({ region, profile: 'dual' })).toMatchObject({ zone, imageResourceUUID: 'img-sp0001955x1u' });
    expect(fetchImpl.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
  });
  it('rejects failure envelopes, duplicate inventory and invalid list inputs', async () => {
    const { catalog, state } = await fixture(); state.status = 429; await expect(catalog.listRegions()).rejects.toMatchObject({ code: 'PROVIDER_READ_UNAVAILABLE' }); state.status = 200;
    for (const extra of [{ success: false }, { success: 'true' }, { httpStatus: 500 }]) { state.extra = extra; await expect(catalog.listRegions()).rejects.toMatchObject({ code: 'PROVIDER_READ_UNAVAILABLE' }); }
    state.extra = {}; state.regions.push(state.regions[0]); await expect(catalog.listRegions()).rejects.toMatchObject({ code: 'PROVIDER_RESPONSE_INVALID' });
    state.regions.pop(); state.packages.push(state.packages[0]); await expect(catalog.listPlans({ region })).rejects.toMatchObject({ code: 'PROVIDER_RESPONSE_INVALID' });
    await expect(catalog.list('/image/list', 'images', { page: 2 })).rejects.toMatchObject({ code: 'INVALID_PROVIDER_REQUEST' });
  });
  it('rejects unknown regions, absent zones and invalid profiles', async () => {
    const { catalog, state } = await fixture(); await expect(catalog.resolveMachine({ region: 'missing', profile: 'dual' })).rejects.toMatchObject({ code: 'INVALID_PROVIDER_REGION' });
    await expect(catalog.listPlans({ region, profile: 'other' })).rejects.toMatchObject({ code: 'PROVIDER_CONFIGURATION_REQUIRED' });
    state.regions[0].zones = []; await expect(catalog.resolveMachine({ region, profile: 'dual' })).rejects.toMatchObject({ code: 'PROVIDER_ZONE_UNAVAILABLE' });
  });
});
