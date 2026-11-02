import { infrastructureError } from '../repository.js';

const origins = { digitalocean: 'https://api.digitalocean.com', vultr: 'https://api.vultr.com' };
const fail = code => { throw infrastructureError(code); };
const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
const quotePlanId = value => id(value) || (typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(value));
const amount = value => Number.isFinite(value) && value >= 0;

export function createLiveProviderCatalog({ provider, transport }) {
  if (!origins[provider] || !transport?.accountId || typeof transport.request !== 'function') fail('PROVIDER_ADAPTER_UNAVAILABLE');
  async function get(path, query = {}) {
    const response = await transport.request({ method: 'GET', path, query });
    if (response.status !== 200 || !response.data || typeof response.data !== 'object') fail('PROVIDER_READ_UNAVAILABLE');
    return response.data;
  }
  async function list(path, key, initialQuery = {}) {
    const rows = [], seen = new Set(); let query = { per_page: 200, ...initialQuery }, total;
    for (let page = 0; page < 1000; page++) {
      const data = await get(path, query);
      if (!Array.isArray(data[key])) fail('PROVIDER_RESPONSE_INVALID');
      rows.push(...data[key]);
      if (data.meta?.total !== undefined) {
        if (!Number.isSafeInteger(data.meta.total) || data.meta.total < 0 ||
            (total !== undefined && total !== data.meta.total)) fail('PROVIDER_PAGINATION_INCOMPLETE');
        total = data.meta.total;
      }
      const next = provider === 'digitalocean' ? data.links?.pages?.next : data.meta?.links?.next;
      if (next !== undefined && next !== null && typeof next !== 'string') fail('PROVIDER_PAGINATION_INCOMPLETE');
      if (!next) {
        if (total !== undefined && rows.length !== total) fail('PROVIDER_PAGINATION_INCOMPLETE');
        if (provider === 'digitalocean' && data.links?.pages?.last) {
          let last; try { last = new URL(data.links.pages.last); } catch { fail('PROVIDER_PAGINATION_INCOMPLETE'); }
          if (last.origin !== origins[provider] || last.pathname !== path || last.username || last.password ||
              !/^[1-9][0-9]*$/.test(last.searchParams.get('page') || '') ||
              Number(last.searchParams.get('page')) !== Number(query.page || 1)) fail('PROVIDER_PAGINATION_INCOMPLETE');
        }
        return rows;
      }
      let fingerprint;
      if (provider === 'digitalocean') {
        let url; try { url = new URL(next); } catch { fail('PROVIDER_PAGINATION_INCOMPLETE'); }
        if (url.origin !== origins[provider] || url.pathname !== path || url.username || url.password) fail('PROVIDER_PAGINATION_INCOMPLETE');
        query = Object.fromEntries(url.searchParams);
        if (!/^[1-9][0-9]*$/.test(query.page || '') || Object.keys(query).some(key => !['page', 'per_page', ...Object.keys(initialQuery)].includes(key))) fail('PROVIDER_PAGINATION_INCOMPLETE');
        query = { ...query, ...initialQuery };
        fingerprint = url.href;
      } else {
        if (typeof next !== 'string' || next.length > 2048) fail('PROVIDER_PAGINATION_INCOMPLETE');
        query = { per_page: 200, ...initialQuery, cursor: next }; fingerprint = next;
      }
      if (seen.has(fingerprint)) fail('PROVIDER_PAGINATION_INCOMPLETE');
      seen.add(fingerprint);
    }
    fail('PROVIDER_PAGINATION_INCOMPLETE');
  }
  async function getQuote(input) {
    if (input.provider !== provider || input.accountId !== transport.accountId || !id(input.region) || !quotePlanId(input.planId)) fail('RESOURCE_SCOPE_MISMATCH');
    const path = provider === 'digitalocean' ? '/v2/sizes' : '/v2/plans';
    const plans = await list(path, provider === 'digitalocean' ? 'sizes' : 'plans');
    const matches = plans.filter(plan => (provider === 'digitalocean' ? plan.slug : plan.id) === input.planId);
    if (matches.length > 1) fail('QUOTE_UNAVAILABLE');
    const plan = matches[0];
    if (!plan) return { available: false };
    let available;
    if (provider === 'digitalocean') available = plan.available === true && Array.isArray(plan.regions) && plan.regions.includes(input.region);
    else {
      const region = await get(`/v2/regions/${input.region}/availability`);
      if (!Array.isArray(region.available_plans)) fail('QUOTE_UNAVAILABLE');
      available = region.available_plans.includes(input.planId);
    }
    if (!available) return { available: false };
    const price = provider === 'digitalocean' ? plan.price_monthly : plan.monthly_cost;
    const transfer = provider === 'digitalocean' ? plan.transfer : plan.bandwidth;
    if (!amount(price) || !amount(transfer)) fail('QUOTE_UNAVAILABLE');
    return { available: true, recurringAmount: price, currency: 'USD', trafficTerms: { included: transfer,
      unit: provider === 'digitalocean' ? 'TB' : 'GB', overageAmount: null, source: `${origins[provider]}${path}` } };
  }
  async function inspectBillableAttachments(input) {
    if (input.provider !== provider || input.accountId !== transport.accountId || !id(input.resourceId) ||
        (input.knownAttachments !== undefined && !Array.isArray(input.knownAttachments))) fail('RESOURCE_SCOPE_MISMATCH');
    const known = new Set((input.knownAttachments || []).map(item => `${item.type}:${item.id}`));
    const items = []; let complete = true;
    const add = (type, row, linked, shared = false) => {
      const resourceId = String(row.id ?? row.ip ?? '');
      if (!resourceId || resourceId.length > 200) fail('PROVIDER_RESPONSE_INVALID');
      if (linked || known.has(`${type}:${resourceId}`)) items.push({ id: resourceId, type, shared,
        amount: amount(row.cost) ? row.cost : null, currency: amount(row.cost) ? 'USD' : null });
    };
    if (provider === 'digitalocean') {
      const volumes = await list('/v2/volumes', 'volumes');
      const volumeIds = new Set();
      for (const row of volumes) {
        if (!Array.isArray(row.droplet_ids)) fail('PROVIDER_RESPONSE_INVALID');
        const linked = row.droplet_ids.map(String).includes(input.resourceId);
        add('volume', row, linked, row.droplet_ids.length > 1);
        if (linked || known.has(`volume:${row.id}`)) volumeIds.add(String(row.id));
      }
      for (const row of await list('/v2/snapshots', 'snapshots')) {
        const volume = row.resource_type === 'volume';
        add(volume ? 'volume_snapshot' : 'snapshot', row, volume ? volumeIds.has(String(row.resource_id)) : String(row.resource_id) === input.resourceId);
      }
      for (const row of await list('/v2/reserved_ips', 'reserved_ips')) add('reserved_ip', row, String(row.droplet?.id) === input.resourceId);
    } else {
      const volumeIds = new Set();
      for (const row of await list('/v2/blocks', 'blocks')) {
        const linked = String(row.attached_to_instance) === input.resourceId;
        add('volume', row, linked);
        if (linked || known.has(`volume:${row.id}`)) volumeIds.add(String(row.id));
      }
      for (const row of await list('/v2/reserved-ips', 'reserved_ips')) add('reserved_ip', row, String(row.instance_id) === input.resourceId);
      // Vultr omits parent instance IDs for snapshots/backups. Unknown attribution
      // is not proof of clear billing; require reviewed durable references.
      for (const [path, key, type] of [['/v2/snapshots', 'snapshots', 'snapshot'], ['/v2/backups', 'backups', 'backup']]) {
        for (const row of await list(path, key)) {
          if (!known.has(`${type}:${row.id}`)) complete = false;
          add(type, row, false);
        }
      }
      for (const row of await list('/v2/blocks/snapshots', 'snapshots')) {
        const linked = volumeIds.has(String(row.block_id));
        if (!linked && !known.has(`volume_snapshot:${row.id}`)) complete = false;
        add('volume_snapshot', row, linked);
      }
    }
    return { complete, items };
  }
  return Object.freeze({ getQuote, list, get, inspectBillableAttachments });
}

const validId = value => typeof value === 'string' && /^[a-z0-9][a-z0-9_.-]{0,99}$/.test(value);
const text = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 200;
const positive = value => Number.isFinite(value) && value > 0;
const invalid = () => fail('PROVIDER_RESPONSE_INVALID');
function unique(rows, key) {
  const seen = new Set();
  for (const row of rows) {
    if (!row || !validId(row[key]) || seen.has(row[key])) invalid();
    seen.add(row[key]);
  }
  return rows;
}
function ids(values) {
  if (!Array.isArray(values) || values.some(value => !validId(value)) || new Set(values).size !== values.length) invalid();
  return values;
}

// Vendor translation stays at the provider boundary; image evidence belongs to setup.
export async function readProviderRegions(provider, catalog) {
  const doProvider = provider === 'digitalocean';
  return unique(await catalog.list('/v2/regions', 'regions'), doProvider ? 'slug' : 'id').map(row => {
    const label = doProvider ? row.name : row.city;
    if (!/^[a-z0-9][a-z0-9_-]{0,99}$/.test(doProvider ? row.slug : row.id) ||
        !text(label) || (doProvider && typeof row.available !== 'boolean')) invalid();
    return { id: doProvider ? row.slug : row.id, label, available: doProvider ? row.available : true };
  });
}

export async function readProviderPlans(provider, catalog, region) {
  const doProvider = provider === 'digitalocean';
  const rows = unique(await catalog.list(doProvider ? '/v2/sizes' : '/v2/plans', doProvider ? 'sizes' : 'plans'), doProvider ? 'slug' : 'id');
  let capacity;
  if (!doProvider) {
    const data = await catalog.get(`/v2/regions/${region}/availability`);
    capacity = new Set(ids(data.available_plans));
    if (data.meta?.links?.next || (data.meta?.total !== undefined && data.meta.total !== capacity.size)) fail('PROVIDER_PAGINATION_INCOMPLETE');
  }
  return rows.map(row => {
    const planId = doProvider ? row.slug : row.id;
    const cpu = doProvider ? row.vcpus : row.vcpu_count;
    const memory = doProvider ? row.memory : row.ram;
    const monthly = doProvider ? row.price_monthly : row.monthly_cost;
    const hourly = doProvider ? row.price_hourly : row.hourly_cost;
    const transfer = doProvider ? row.transfer : row.bandwidth;
    if (!Number.isSafeInteger(cpu) || cpu <= 0 || !Number.isSafeInteger(memory) || memory <= 0 ||
        !positive(row.disk) || !amount(monthly) || !amount(transfer) ||
        (hourly !== undefined && hourly !== null && !amount(hourly)) || (doProvider && !amount(hourly))) invalid();
    const locations = ids(doProvider ? row.regions : row.locations);
    if (doProvider && typeof row.available !== 'boolean') invalid();
    const family = doProvider ? planId.split('-')[0] : row.type;
    if (!text(family)) invalid();
    const supportedFamily = doProvider ? ['s', 'g', 'gd', 'g2', 'm', 'm3', 'm6', 'm6d', 'c', 'c2', 'c4', 'so', 'so1', 'so2'].includes(family)
      : ['vc2', 'vhf', 'vhp', 'voc'].includes(family) && planId.startsWith(`${family}-`);
    const declaredArch = row.architecture ?? row.arch;
    if (declaredArch !== undefined && !text(declaredArch)) invalid();
    const architecture = declaredArch === 'amd64' || declaredArch === 'x86' ? 'x86_64'
      : declaredArch ?? (/arm|aarch64/.test(planId) ? 'arm64' : supportedFamily ? 'x86_64' : 'unknown');
    let reason = null;
    if (row.ipv6_only === true || /ipv6|(?:^|-)v6(?:-|$)/.test(planId) || (!doProvider && planId === 'vc2-1c-0.5gb')) reason = 'IPV6_ONLY_UNSUPPORTED';
    else if (/gpu|^vcg/.test(planId) || /gpu|^vcg/.test(family)) reason = 'GPU_UNSUPPORTED';
    else if (/^(bm|vbm|baremetal|bare-metal)(-|$)/.test(planId) || /^(vbm|baremetal|bare-metal)$/.test(family)) reason = 'BARE_METAL_UNSUPPORTED';
    else if (architecture !== 'x86_64' && (architecture !== 'unknown' || declaredArch !== undefined)) reason = 'UNSUPPORTED_ARCHITECTURE';
    else if (!supportedFamily) reason = 'UNSUPPORTED_FAMILY';
    return { id: planId, label: doProvider && text(row.description) ? `${planId} (${row.description})` : planId,
      cpu, memory_mb: memory, disk_gb: row.disk, transfer: { included: transfer, unit: doProvider ? 'TB' : 'GB' },
      price: { monthly, hourly: hourly ?? null, currency: 'USD' },
      available: locations.includes(region) && (doProvider ? row.available : capacity.has(planId)),
      compatible: reason === null, reason, architecture, family };
  });
}
