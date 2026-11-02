import { infrastructureError } from '../repository.js';
import { readProviderRegions, readProviderPlans } from './liveCatalog.js';

const fail = code => { throw infrastructureError(code); };
const validId = value => typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{0,99}$/.test(value);
const validPlanId = value => typeof value === 'string' && /^[a-z0-9][a-z0-9_.-]{0,99}$/.test(value);
function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

export function createProviderCatalogService({ provider, catalog, policy = {}, clock = Date.now, ttlMs = 60000 }) {
  if (!['digitalocean', 'vultr'].includes(provider) || typeof catalog?.get !== 'function' ||
      typeof catalog?.list !== 'function') fail('PROVIDER_ADAPTER_UNAVAILABLE');
  if (!policy || typeof policy !== 'object' || Array.isArray(policy) ||
      Object.keys(policy).some(key => !['allowedRegions', 'allowedPlans', 'maxMonthlyAmount'].includes(key)) ||
      !Number.isFinite(ttlMs) || ttlMs < 0 || typeof clock !== 'function') fail('INVALID_PROVIDER_POLICY');
  for (const key of ['allowedRegions', 'allowedPlans']) {
    if (policy[key] !== undefined && (!Array.isArray(policy[key]) || policy[key].some(value => !(key === 'allowedPlans' ? validPlanId(value) : validId(value))))) fail('INVALID_PROVIDER_POLICY');
  }
  if (policy.maxMonthlyAmount !== undefined && (!Number.isFinite(policy.maxMonthlyAmount) || policy.maxMonthlyAmount < 0)) fail('INVALID_PROVIDER_POLICY');
  const allowedRegions = policy.allowedRegions === undefined ? null : new Set(policy.allowedRegions);
  const allowedPlans = policy.allowedPlans === undefined ? null : new Set(policy.allowedPlans);
  const maxMonthlyAmount = policy.maxMonthlyAmount;
  const ttl = Math.min(ttlMs, 300000), cache = new Map(), flights = new Map();
  const regionAllowed = region => !allowedRegions || allowedRegions.has(region);
  const policyReason = (region, plan) => !regionAllowed(region) ? 'PROVIDER_REGION_DISALLOWED'
    : allowedPlans && !allowedPlans.has(plan.id) ? 'PROVIDER_PLAN_DISALLOWED'
      : maxMonthlyAmount !== undefined && plan.price.monthly > maxMonthlyAmount ? 'PROVIDER_BUDGET_EXCEEDED' : null;

  async function snapshot(key, refresh, load) {
    const previous = cache.get(key), now = clock();
    if (!refresh && previous && !previous.value.stale && now >= previous.time && now - previous.time < ttl) return previous.value;
    if (flights.has(key)) return flights.get(key);
    if (flights.size >= 128) fail('PROVIDER_READ_UNAVAILABLE');
    const flight = (async () => {
      try {
        const data = await load(), time = clock();
        const value = freeze({ provider, ...data, observed_at: new Date(time).toISOString(), stale: false });
        cache.delete(key);
        if (cache.size >= 128) cache.delete(cache.keys().next().value);
        cache.set(key, { time, value });
        return value;
      } catch (error) {
        if (previous) {
          previous.value = freeze({ ...previous.value, stale: true });
          return previous.value;
        }
        throw error;
      } finally {
        flights.delete(key);
      }
    })();
    flights.set(key, flight);
    return flight;
  }

  async function listRegions({ refresh = false } = {}) {
    return snapshot('regions', refresh, async () => ({ regions: (await readProviderRegions(provider, catalog))
      .map(region => ({ ...region, available: region.available && regionAllowed(region.id) })) }));
  }
  async function listPlans({ region, refresh = false } = {}) {
    if (!validId(region)) fail('INVALID_PROVIDER_REGION');
    return snapshot(`plans:${region}`, refresh, async () => {
      // Read regions in the same fresh operation; stale region evidence cannot authorize a plan.
      const regions = await readProviderRegions(provider, catalog);
      const selected = regions.find(item => item.id === region);
      if (!selected) fail('INVALID_PROVIDER_REGION');
      const plans = (await readProviderPlans(provider, catalog, region)).map(plan => {
        const reason = plan.reason || policyReason(region, plan);
        return { ...plan, available: selected.available && plan.available, compatible: reason === null, reason };
      });
      return { region, plans };
    });
  }
  async function assertSelection({ region, planId } = {}) {
    if (!validPlanId(planId)) fail('INVALID_PROVIDER_PLAN');
    const result = await listPlans({ region, refresh: true });
    if (result.stale) fail('PROVIDER_CATALOG_STALE');
    const plan = result.plans.find(item => item.id === planId);
    if (!plan) fail('INVALID_PROVIDER_PLAN');
    const denied = policyReason(region, plan);
    if (denied) fail(denied);
    if (!plan.compatible) fail('PROVIDER_PLAN_INCOMPATIBLE');
    if (!plan.available) fail('PROVIDER_PLAN_UNAVAILABLE');
    return plan;
  }
  return Object.freeze({ listRegions, listPlans, assertSelection });
}
