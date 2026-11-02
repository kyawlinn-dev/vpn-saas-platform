import { randomUUID } from "node:crypto";
import { infrastructureError, payloadHash } from "../repository.js";
import { isInfrastructureContext } from "../context.js";
import { assertOperationAuthority, assertResourceOwnership } from "../ownership.js";

const fail = code => { throw infrastructureError(code); };
const scopeKeys = ["environment", "databaseIdentity", "panelIdentity", "poolId"];
const safeId = id => typeof id === "string" && /^[a-zA-Z0-9-]{1,100}$/.test(id);

/** Shared reconciliation mechanics; provider-specific wire shapes stay in descriptors. */
export function createProviderAdapter({ context, transport, catalog, machine, descriptor }) {
  const provider = descriptor.provider;
  if (!isInfrastructureContext(context) || transport?.accountId !== context.providerAccounts[provider] ||
      typeof transport?.request !== "function" || typeof catalog?.getQuote !== "function") fail("PROVIDER_ADAPTER_UNAVAILABLE");
  const scope = Object.fromEntries(scopeKeys.map(key => [key, context[key]]));
  const accountId = context.providerAccounts[provider];
  const registryCall = async (method, ...args) => {
    try { return await context.registry[method](...args); } catch { fail("OWNERSHIP_REGISTRY_UNAVAILABLE"); }
  };
  const authorize = async (method, input, code) => {
    let allowed = false;
    try { allowed = await context.adapters[method]?.(input); } catch { /* Never surface adapter credentials. */ }
    if (allowed !== true) fail(code);
  };
  const request = async input => {
    let response;
    try { response = await transport.request(input); } catch { fail("PROVIDER_REQUEST_UNCERTAIN"); }
    if (!Number.isInteger(response?.status)) fail("PROVIDER_RESPONSE_INVALID");
    return response;
  };
  async function normalized(raw) {
    const resource = descriptor.normalize(raw);
    if (!safeId(resource.id) || !resource.createdAt) fail("PROVIDER_RESPONSE_INVALID");
    const registered = await registryCall("getResource", { kind: "provider", id: resource.id, provider });
    // Only the independent registry supplies ownership, never a name/tag/IP.
    const binding = registered ? Object.fromEntries(scopeKeys.map(key => [key, registered[key]])) : {};
    return { ...binding, ...resource, kind: "provider", provider, accountId };
  }
  async function inspect({ resourceId }) {
    if (!safeId(resourceId)) fail("RESOURCE_SCOPE_MISMATCH");
    const response = await request({ method: "GET", path: `${descriptor.path}/${resourceId}` });
    if (response.status === 404) return null;
    if (response.status !== 200) fail("PROVIDER_READ_UNAVAILABLE");
    return normalized(response.data?.[descriptor.singular]);
  }
  async function quote({ region, planId }) {
    if (!safeId(region) || typeof planId!=='string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(planId)) fail("QUOTE_INVALID");
    let price;
    try { price = await catalog.getQuote({ provider, accountId, region, planId }); } catch { fail("QUOTE_UNAVAILABLE"); }
    if (price?.available !== true || !Number.isFinite(price.recurringAmount) || price.recurringAmount < 0 ||
        !/^[A-Z]{3}$/.test(price.currency) || !price.trafficTerms?.source) fail("QUOTE_UNAVAILABLE");
    const value = { ...scope, provider, accountId, region, planId, currency: price.currency,
      recurringAmount: price.recurringAmount, trafficTerms: structuredClone(price.trafficTerms),
      expiresAt: new Date(Date.now() + 15 * 60000).toISOString() };
    return { ...value, hash: payloadHash(value) };
  }
  function validateQuote(value, { allowExpired = false } = {}) {
    if (!value) fail("QUOTE_INVALID");
    const { hash, ...body } = value;
    if (payloadHash(body) !== hash || value.provider !== provider || value.accountId !== accountId ||
        !scopeKeys.every(key => value[key] === scope[key]) || !Number.isFinite(Date.parse(value.expiresAt)) || (!allowExpired && Date.parse(value.expiresAt) <= Date.now())) fail("QUOTE_INVALID");
  }
  async function find({ operationId }) {
    if (!safeId(operationId)) fail("INVALID_OPERATION");
    const matches = [], seen = new Set();
    let query = { per_page: 200 };
    for (let page = 0; page < 1000; page++) {
      const response = await request({ method: "GET", path: descriptor.path, query });
      if (response.status !== 200 || !Array.isArray(response.data?.[descriptor.plural])) fail("PROVIDER_READ_UNAVAILABLE");
      for (const raw of response.data[descriptor.plural]) if (raw.tags?.includes(`novanet-op-${operationId}`)) matches.push(raw);
      let next;
      try { next = descriptor.nextQuery(response.data); } catch { fail("PROVIDER_PAGINATION_INCOMPLETE"); }
      if (!next) break;
      const fingerprint = JSON.stringify(next);
      if (seen.has(fingerprint) || page === 999) fail("PROVIDER_PAGINATION_INCOMPLETE");
      seen.add(fingerprint); query = next;
    }
    if (matches.length > 1) fail("AMBIGUOUS_PROVIDER_RESOURCES");
    if (!matches.length) return null;
    const attempt = await registryCall("getCreateAttempt", { provider, operationId, ...scope });
    if (!attempt || !matches[0].tags?.includes(`novanet-intent-${attempt.nonce}`)) fail("RESOURCE_SCOPE_MISMATCH");
    const resource = await normalized(matches[0]);
    if (resource.region !== attempt.region || resource.planId !== attempt.planId ||
        !scopeKeys.every(key => attempt[key] === scope[key]) || attempt.accountId !== accountId || attempt.provider !== provider ||
        !Number.isFinite(Date.parse(resource.createdAt)) || Date.parse(resource.createdAt) < Date.parse(attempt.startedAt) - 60000 ||
        Date.parse(resource.createdAt) > Date.now() + 60000) fail("RESOURCE_SCOPE_MISMATCH");
    return { resource, attempt };
  }
  async function recordFound(found, operation) {
    await assertOperationAuthority(context, operation);
    if (!descriptor.isReady(found.resource)) fail('PROVIDER_RESOURCE_PENDING');
    const prior = await registryCall("getResource", { kind: "provider", id: found.resource.id, provider });
    if (prior) {
      if (prior.operationId !== operation.id) fail('RESOURCE_SCOPE_MISMATCH');
      await assertResourceOwnership({ context, resource: found.resource, operation });
      return found.resource;
    }
    if (context.protectedResourceIds.includes(found.resource.id) || found.resource.addresses.some(address => context.protectedAddresses.includes(address))) fail("PROTECTED_RESOURCE");
    const owned = { ...found.resource, ...scope, operationId: operation.id, protected: false };
    // Adapter persists immutable identity with an operation/intent compare-and-set.
    await registryCall("recordCreatedResource", owned, { expectedAttempt: found.attempt });
    await assertResourceOwnership({ context, resource: owned, operation });
    return owned;
  }
  async function reconcileCreate({ operationId, operation }) {
    await assertOperationAuthority(context, operation);
    if (!safeId(operationId) || operation.id !== operationId) fail('RESOURCE_SCOPE_MISMATCH');
    const found = await find({ operationId });
    if (found) {
      if (found.attempt.operationId !== operationId) fail('RESOURCE_SCOPE_MISMATCH');
      return recordFound(found, operation);
    }
    // Absence from a provider list is not proof that an uncertain POST failed.
    if (await registryCall('getCreateAttempt', { provider, operationId, ...scope })) fail('CREATE_RECONCILIATION_REQUIRED');
    return null;
  }
  async function create({ operationId, quote: value, profile, operation = { id: operationId } }) {
    await assertOperationAuthority(context, operation);
    if (operation.id !== operationId || !safeId(operationId) || !["dual", "vless_only"].includes(profile)) fail("INVALID_OPERATION");
    validateQuote(value, { allowExpired: true });
    for (const method of ["getCreateAttempt", "claimCreateAttempt", "recordCreatedResource"]) if (typeof context.registry[method] !== "function") fail("OWNERSHIP_REGISTRY_UNAVAILABLE");
    const priorAttempt = await registryCall("getCreateAttempt", { provider, operationId, ...scope });
    if (priorAttempt && (priorAttempt.quoteHash !== value.hash || priorAttempt.profile !== profile)) fail("IDEMPOTENCY_CONFLICT");
    if (!priorAttempt) validateQuote(value);
    let found = await find({ operationId });
    if (found) {
      if (found.attempt.quoteHash !== value.hash || found.attempt.profile !== profile) fail("IDEMPOTENCY_CONFLICT");
      return recordFound(found, operation);
    }
    if (priorAttempt || await registryCall("getCreateAttempt", { provider, operationId, ...scope })) fail("CREATE_RECONCILIATION_REQUIRED");
    if (!machine?.sshKeyIds?.length || !machine.firewallId) fail("MACHINE_CONFIGURATION_REQUIRED");
    const fresh = await quote({ region: value.region, planId: value.planId });
    if (fresh.recurringAmount !== value.recurringAmount || fresh.currency !== value.currency || payloadHash(fresh.trafficTerms) !== payloadHash(value.trafficTerms)) fail("QUOTE_CHANGED");
    await authorize("assertPurchaseScope", { context, operation, quote: value, profile, machine }, "PURCHASE_NOT_AUTHORIZED");
    const attempt = { ...scope, provider, accountId, operationId, nonce: randomUUID(), quoteHash: value.hash,
      region: value.region, planId: value.planId, profile, machineHash: payloadHash(machine), startedAt: new Date().toISOString() };
    const tags = [`novanet-op-${operationId}`, `novanet-intent-${attempt.nonce}`, `novanet-env-${context.environment}`];
    const body = descriptor.createBody({ quote: value, machine, tags, name: `novanet-${operationId}` });
    await authorize("assertFirewallPolicy", { context, provider, machine, tags: body.tags, operation }, "FIREWALL_POLICY_UNVERIFIED");
    attempt.requestHash = payloadHash(body);
    if (await registryCall("claimCreateAttempt", attempt) !== true) fail("CREATE_RECONCILIATION_REQUIRED");
    await assertOperationAuthority(context, operation);
    try {
      const response = await request({ method: "POST", path: descriptor.path, body });
      if (![200, 201, 202].includes(response.status)) fail("CREATE_RECONCILIATION_REQUIRED");
    } catch { /* Uncertain: find by the durable nonce. Never send a second create. */ }
    found = await find({ operationId });
    if (!found) fail("CREATE_RECONCILIATION_REQUIRED");
    return recordFound(found, operation);
  }
  async function inspectBillableAttachments({ resourceId, knownAttachments }) {
    if (typeof catalog.inspectBillableAttachments !== "function") fail("ATTACHMENT_INVENTORY_UNAVAILABLE");
    let inventory;
    try { inventory = await catalog.inspectBillableAttachments({ provider, accountId, resourceId, knownAttachments }); }
    catch { fail("ATTACHMENT_INVENTORY_UNAVAILABLE"); }
    if (inventory?.complete !== true || !Array.isArray(inventory.items)) fail("ATTACHMENT_INVENTORY_UNAVAILABLE");
    return inventory;
  }
  async function deleteResource({ resourceId, expectedIdentity, operation }) {
    await assertOperationAuthority(context, operation);
    const current = await inspect({ resourceId });
    const identity = current || expectedIdentity;
    if (identity?.id !== resourceId || !expectedIdentity ||
        !["id", "createdAt", "provider", "accountId"].every(key => identity[key] === expectedIdentity[key])) fail("RESOURCE_SCOPE_MISMATCH");
    await assertResourceOwnership({ context, resource: identity, operation });
    const attachments = await inspectBillableAttachments({ resourceId });
    await authorize("assertDeletionScope", { context, resource: identity, attachments, operation }, "DELETION_NOT_AUTHORIZED");
    if (!current) return { absent: true, resourceId };
    await assertResourceOwnership({ context, resource: identity, operation });
    try { await request({ method: "DELETE", path: `${descriptor.path}/${resourceId}` }); }
    catch { /* Only confirmed readback absence establishes successful deletion. */ }
    if (await inspect({ resourceId })) fail("DELETE_RECONCILIATION_REQUIRED");
    return { absent: true, resourceId };
  }
  return Object.freeze({ quote, find, reconcileCreate, create, inspect, delete: deleteResource, inspectBillableAttachments });
}
