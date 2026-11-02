import { infrastructureError, payloadHash } from '../repository.js';
import { isVerifiedLightNodeTransport } from './lightnodeTransport.js';

const fail = code => { throw infrastructureError(code); };
const invalid = () => fail('PROVIDER_RESPONSE_INVALID');
const id = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(value);
const text = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 500;
const positive = value => Number.isFinite(value) && value > 0;
const nonnegative = value => Number.isFinite(value) && value >= 0;
const profiles = ['dual', 'vless_only'];
const billingSource = 'https://doc.lightnode.com/Instance/Billingdescription.html';
const billing = () => ({ kind: 'provider_pricing', source: billingSource });
// Provider geographic identifiers are not always ISO country codes.
const countryAliases = new Map([['THA', 'TH'], ['GER', 'DE'], ['SAU', 'SA'],
  ['bg-dhaka', 'BD'], ['sa-johannesburg', 'ZA'], ['cn-hongkong', 'HK'], ['cn-taiwan', 'TW']]);
const collections = { '/region/list': ['regions', 'regionCode', false], '/package/list': ['packages', 'packageCode', false],
  '/image/list': ['images', 'imageResourceUUID', true], '/sshkey/list': ['sshKeys', 'sshKeyUUID', true],
  '/firewall/list': ['firewalls', 'firewallUUID', true], '/instance/list': ['instances', 'ecsResourceUUID', true] };
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
// Exact wire shapes: https://apidoc.lightnode.com/en/llms.txt
// No catalogue cache: spending evidence always comes from a fresh provider read.
export function createLightNodeCatalog({ transport, config, clock = Date.now } = {}) {
  if (!isVerifiedLightNodeTransport(transport) || transport.provider !== 'lightnode' || typeof clock !== 'function') fail('PROVIDER_ADAPTER_UNAVAILABLE');
  if (!config?.connection || payloadHash(config.connection) !== payloadHash(transport.connection)) fail('PROVIDER_ACCOUNT_MISMATCH');
  const timestamp = () => {
    const now = clock();
    if (!Number.isFinite(now)) fail('PROVIDER_CONFIGURATION_REQUIRED');
    return now;
  };
  async function get(path, query = {}) {
    let response;
    try { response = await transport.request({ method: 'GET', path, query }); }
    catch { fail('PROVIDER_READ_UNAVAILABLE'); }
    const data = response.data;
    if (![200, 202].includes(response.status) || !data || typeof data !== 'object' || Array.isArray(data) ||
        data.success === false || (data.success !== undefined && typeof data.success !== 'boolean') ||
        (data.httpStatus !== undefined && ![200, 202].includes(data.httpStatus))) fail('PROVIDER_READ_UNAVAILABLE');
    return data;
  }
  async function list(path, key, initialQuery = {}) {
    const definition = collections[path];
    if (!definition || definition[0] !== key || !initialQuery || typeof initialQuery !== 'object' || Array.isArray(initialQuery) ||
        Object.keys(initialQuery).some(name => ['page', 'pageSize'].includes(name))) fail('INVALID_PROVIDER_REQUEST');
    const [, identity, paginated] = definition;
    const rows = [], seen = new Set(); let total;
    for (let page = 1; page <= 1000; page++) {
      const data = await get(path, { ...initialQuery, ...(paginated ? { page, pageSize: 50 } : {}) });
      if (!Array.isArray(data[key])) invalid();
      if (data.rowCount !== undefined) {
        if (!Number.isSafeInteger(data.rowCount) || data.rowCount < 0 || (total !== undefined && data.rowCount !== total)) fail('PROVIDER_PAGINATION_INCOMPLETE');
        total = data.rowCount;
      } else if (paginated) fail('PROVIDER_PAGINATION_INCOMPLETE');
      for (const row of data[key]) {
        if (!row || typeof row !== 'object' || !id(row[identity])) invalid();
        const uniqueId = path === '/package/list' ? `${row.regionCode}/${row.zoneCode}/${row.packageCode}` : row[identity];
        if (seen.has(uniqueId)) invalid();
        seen.add(uniqueId); rows.push(row);
      }
      if (total !== undefined && rows.length > total) fail('PROVIDER_PAGINATION_INCOMPLETE');
      if (!paginated || rows.length === total) {
        if (total !== undefined && rows.length !== total) fail('PROVIDER_PAGINATION_INCOMPLETE');
        return rows;
      }
      if (!data[key].length) fail('PROVIDER_PAGINATION_INCOMPLETE');
    }
    fail('PROVIDER_PAGINATION_INCOMPLETE');
  }
  async function listRegions() {
    const rows = await list('/region/list', 'regions');
    const regions = rows.map(row => {
      if (!text(row.regionName) || !Array.isArray(row.zones)) invalid();
      const zones = new Set();
      for (const zone of row.zones) {
        if (!id(zone?.zoneCode) || !text(zone.zoneName) || zones.has(zone.zoneCode)) invalid();
        zones.add(zone.zoneCode);
      }
      // Normalize known vendor aliases; unknown geography stays unspecified.
      const prefix = row.regionCode.split('-')[0].toUpperCase();
      const code = countryAliases.get(row.regionCode.replace(/-\d+$/, '')) || countryAliases.get(prefix) || prefix;
      const country = /^[A-Z]{2}$/.test(code) && new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' }).of(code) ? code : null;
      return { id: row.regionCode, label: row.regionName, available: zones.size > 0, city: row.regionName, country,
        zones: row.zones.map(zone => ({ id: zone.zoneCode, label: zone.zoneName })) };
    });
    return freeze({ provider: 'lightnode', observed_at: new Date(timestamp()).toISOString(), stale: false, regions });
  }
  function validateSelection(region, profile) {
    if (!id(region)) fail('INVALID_PROVIDER_REGION');
    if (profile !== undefined && !profiles.includes(profile)) fail('PROVIDER_CONFIGURATION_REQUIRED');
  }
  function hardwareReason(row) {
    if (!/^(intel|amd)-/.test(row.packageCode)) return 'UNSUPPORTED_FAMILY';
    if ((row.dataDiskSize ?? 0) > 0 || !/-d0$/.test(row.packageCode)) return 'UNSUPPORTED_STORAGE';
    return null;
  }
  async function inventory(region, profile) {
    validateSelection(region, profile);
    const selected = (await listRegions()).regions.find(row => row.id === region);
    if (!selected) fail('INVALID_PROVIDER_REGION');
    if (!selected.zones.length) return { selected, rows: [], machineReason: 'PROVIDER_ZONE_UNAVAILABLE' };
    const rows = await list('/package/list', 'packages', { regionCode: region });
    for (const row of rows) {
      if (row.regionCode !== region || !id(row.zoneCode) || !selected.zones.some(zone => zone.id === row.zoneCode) ||
          !Number.isSafeInteger(row.cpu) || row.cpu <= 0 || !positive(row.memory) || !Number.isSafeInteger(row.memory * 1024) ||
          !positive(row.systemDiskSize) || (row.dataDiskSize !== undefined && !nonnegative(row.dataDiskSize)) ||
          !['PayByTraffic', 'PayByBandwidth'].includes(row.publicIpChargeMode) ||
          (row.publicIpChargeMode === 'PayByTraffic' && !nonnegative(row.freeFlow)) ||
          (row.publicIpChargeMode === 'PayByBandwidth' && !positive(row.bandwidth)) ||
          (row.freeFlow !== undefined && !nonnegative(row.freeFlow))) invalid();
    }
    // One zone per region keeps actual packageCode IDs unambiguous. Unsupported
    // rows remain visible in a deterministic fallback zone with a technical reason.
    const zones = selected.zones.map(zone => zone.id).sort();
    const zone = zones.find(zone => rows.some(row => row.zoneCode === zone && !hardwareReason(row)))
      ?? zones.find(zone => rows.some(row => row.zoneCode === zone)) ?? zones[0];
    let image, machineReason = zone ? null : 'PROVIDER_ZONE_UNAVAILABLE';
    if (zone) {
      const images = await list('/image/list', 'images', { regionCode: region, imageType: 'System' });
      for (const row of images) {
        if (['imageType', 'imageAccount', 'osVersion', 'osDistroVersion', 'osVersionDetail'].some(key => !text(row[key])) ||
            (row.regionCode !== undefined && row.regionCode !== region) ||
            ['supportSsh', 'supportCloudInit'].some(key => row[key] !== undefined && typeof row[key] !== 'boolean')) invalid();
      }
      const version = row => /\bUbuntu (22\.04|24\.04)\b/i.exec(row.osVersionDetail || '')?.[1];
      const compatible = images.filter(row => row.imageType === 'System' && row.imageAccount === 'root' && row.osVersion === 'linux' &&
        row.osDistroVersion === 'Ubuntu' && version(row) && row.supportSsh !== false && row.supportCloudInit !== false);
      const plain = row => /^Ubuntu (22\.04|24\.04)$/i.test(row.osVersionDetail.trim());
      compatible.sort((a, b) => version(a).localeCompare(version(b)) ||
        Number(plain(b)) - Number(plain(a)) ||
        (a.imageResourceUUID < b.imageResourceUUID ? -1 : a.imageResourceUUID > b.imageResourceUUID ? 1 : 0));
      image = compatible[0];
      if (!image) machineReason = 'PROVIDER_IMAGE_UNAVAILABLE';
    }
    return { selected, rows: rows.filter(row => row.zoneCode === zone), zone, image, machineReason };
  }
  async function resolveMachine({ region, profile } = {}) {
    const evidence = await inventory(region, profile);
    if (evidence.machineReason) fail(evidence.machineReason);
    if (!evidence.rows.some(row => !hardwareReason(row))) fail('PROVIDER_PLAN_UNAVAILABLE');
    return freeze({ zone: evidence.zone, imageResourceUUID: evidence.image.imageResourceUUID,
      bootstrapMode: 'password-tofu', firstContactPolicy: 'tofu' });
  }
  async function listPlans({ region, profile } = {}) {
    const { selected, rows, image, machineReason } = await inventory(region, profile);
    const plans = rows.map(row => {
      const family = /^(intel|amd)-/.exec(row.packageCode)?.[1] || 'unknown';
      const reason = hardwareReason(row) || machineReason;
      const traffic = row.publicIpChargeMode === 'PayByTraffic';
      return { id: row.packageCode, label: row.packageCode, zone: row.zoneCode, image_resource_uuid: image?.imageResourceUUID ?? null,
        cpu: row.cpu, memory_mb: row.memory * 1024, disk_gb: row.systemDiskSize,
        transfer: { included: traffic ? row.freeFlow : null, unit: traffic ? 'GB' : null },
        billing_mode: row.publicIpChargeMode, bandwidth_mbps: positive(row.bandwidth) ? row.bandwidth : null,
        price: { monthly: null, hourly: null, currency: 'USD', billing: billing() },
        available: selected.available, compatible: !reason, reason: reason || null,
        architecture: family === 'unknown' ? 'unknown' : 'x86_64', family };
    });
    if (new Set(plans.map(plan => plan.id)).size !== plans.length) invalid();
    return freeze({ provider: 'lightnode', region, observed_at: new Date(timestamp()).toISOString(), stale: false, plans });
  }
  async function assertSelection({ region, planId, profile } = {}) {
    if (!id(planId)) fail('INVALID_PROVIDER_PLAN');
    const plan = (await listPlans({ region, profile })).plans.find(row => row.id === planId);
    if (!plan) fail('INVALID_PROVIDER_PLAN');
    if (!plan.compatible) fail('PROVIDER_PLAN_INCOMPATIBLE');
    if (!plan.available) fail('PROVIDER_PLAN_UNAVAILABLE');
    return plan;
  }
  async function getQuote(input = {}) {
    if (input.provider !== 'lightnode' || input.accountId !== transport.accountId || !id(input.region) || !id(input.planId)) fail('RESOURCE_SCOPE_MISMATCH');
    const plan = (await listPlans(input)).plans.find(row => row.id === input.planId);
    if (!plan?.available || !plan.compatible) return { available: false };
    return freeze({ available: true, recurringAmount: null, currency: 'USD', trafficTerms: {
      included: plan.transfer.included, unit: plan.transfer.unit, overageAmount: null, source: billingSource,
      zone: plan.zone, imageResourceUUID: plan.image_resource_uuid, billing: billing(),
      specs: { cpu: plan.cpu, memory_mb: plan.memory_mb, disk_gb: plan.disk_gb, transfer: plan.transfer,
        billing_mode: plan.billing_mode, bandwidth_mbps: plan.bandwidth_mbps } } });
  }
  async function inspect() {
    let reason = 'PROVIDER_PLAN_UNAVAILABLE';
    try {
      const regions = (await listRegions()).regions.filter(row => row.available).map(row => row.id).sort();
      const anchor = transport.connection.anchor.region;
      if (regions.includes(anchor)) {
        regions.splice(regions.indexOf(anchor), 1);
        regions.unshift(anchor);
      }
      for (const region of regions) {
        try {
          const result = await listPlans({ region });
          if (result.plans.some(plan => plan.available && plan.compatible)) {
            return freeze({ ready: true, reason: null, profiles: [...profiles], profile_reasons: {} });
          }
          reason = result.plans[0]?.reason || 'PROVIDER_PLAN_UNAVAILABLE';
        } catch (error) { reason = error.code || 'PROVIDER_READ_UNAVAILABLE'; }
      }
    } catch (error) { reason = error.code || 'PROVIDER_READ_UNAVAILABLE'; }
    return freeze({ ready: false, reason, profiles: [], profile_reasons: Object.fromEntries(profiles.map(profile => [profile, reason])) });
  }
  return Object.freeze({ get, list, getQuote, listRegions, listPlans, assertSelection, resolveMachine, inspect });
}
