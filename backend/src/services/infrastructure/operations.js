import { randomUUID } from "node:crypto";
import { infrastructureError, payloadHash } from "./repository.js";
import { isInfrastructureContext } from "./context.js";
import { assertResourceRegistration, assertDestinationRegistration } from "./ownership.js";
import { validCapabilities } from "./nodeConfigurator.js";
import { assertCompatibleDestination } from "./dependencyInventory.js";
import { retirementDiagnostic } from './retirement.js';
import { normalizeBillingAssurance } from './billingAssurance.js';
import { isProviderPricedQuote, providerPricingBilling } from './providers/providerPricing.js';

const fail = code => { throw infrastructureError(code); };
const uuid = value => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const reference = value => typeof value === "string" && /^[a-zA-Z0-9_-][a-zA-Z0-9_.-]{0,99}$/.test(value);
const knownErrors = new Set(["OPERATION_STEP_UNCERTAIN", "RESOURCE_SCOPE_MISMATCH", "CANDIDATE_VERIFICATION_FAILED", "PROBE_CLEANUP_REQUIRED", "CREATE_RECONCILIATION_REQUIRED", "DELETE_RECONCILIATION_REQUIRED", "SERVICE_MEMBERSHIP_CHANGED", "ACCESS_STATE_CHANGED", "RETIREMENT_BLOCKED", "INVENTORY_BLOCKED", "PERMANENT_LINK_VERIFICATION_FAILED"]);
knownErrors.add('SERVER_DISPLAY_SYNC_REQUIRED');
knownErrors.add('ASSIGNMENT_STATE_CHANGED');
knownErrors.add('PROVIDER_RESOURCE_TIMEOUT');
for(const code of ['PROVIDER_CREATE_FAILED','PROVIDER_DELETE_FAILED','PROVIDER_CHECKPOINT_UNAVAILABLE',
  'PROVIDER_READ_UNAVAILABLE','PROVIDER_RESPONSE_INVALID','NODE_SSH_HARDENING_UNVERIFIED','ATTACHMENT_INVENTORY_UNAVAILABLE'])knownErrors.add(code);
knownErrors.add('OWNERSHIP_REGISTRATION_CONFLICT');
for(const code of ['SHARED_DESTINATION_UNVERIFIED','DESTINATION_PROBE_RUNNER_REQUIRED']) knownErrors.add(code);
for (const code of ['NODE_BOOTSTRAP_FAILED', 'NODE_BOOTSTRAP_TIMEOUT']) knownErrors.add(code);
for (const code of ['PROVIDER_UNAVAILABLE', 'PROVIDER_CONFIGURATION_REQUIRED', 'PROVIDER_SSH_KEY_UNAVAILABLE',
  'FIREWALL_POLICY_UNVERIFIED', 'PROVIDER_IMAGE_UNAVAILABLE', 'PROVIDER_CATALOG_STALE',
  'PROVIDER_PLAN_UNAVAILABLE', 'PROVIDER_PLAN_INCOMPATIBLE', 'PROVIDER_REGION_DISALLOWED',
  'PROVIDER_PLAN_DISALLOWED', 'PROVIDER_BUDGET_EXCEEDED', 'QUOTE_CHANGED', 'QUOTE_INVALID', 'NODE_MANAGEMENT_TLS_UNVERIFIED', 'NODE_FIREWALL_POLICY_UNVERIFIED']) knownErrors.add(code);
const phases = new Set(["queued", "provisioning", "configuring", "registering", "verifying", "inventory", "publishing", "draining", "migrating", "endpoints", "links", "retiring", "cleanup_pending", "finalizing"]);
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
function runtimeReady(runtime, recovery = false) {
  if (!isInfrastructureContext(runtime?.context) || !(runtime.executionReady === true || recovery && runtime.recoveryReady === true)) fail("INFRASTRUCTURE_EXECUTION_DISABLED");
}
const scope = context => Object.fromEntries(["environment", "poolId", "databaseIdentity", "panelIdentity"].map(key => [key, context[key]]));
const sameScope = (a, context) => Object.entries(scope(context)).every(([key, value]) => a?.[key] === value);
function strictKeys(input, keys) {
  if (!input || Array.isArray(input) || typeof input !== "object" || Object.keys(input).some(key => !keys.includes(key))) fail("INVALID_OPERATION_INPUT");
}
function priceSnapshot(price) {
  if (!price || !["digitalocean", "vultr", "lightnode"].includes(price.provider) || !reference(price.region) || !reference(price.planId) ||
      ((!Number.isFinite(price.recurringAmount) || price.recurringAmount < 0)&&!isProviderPricedQuote(price.provider,price)) || !/^[A-Z]{3}$/.test(price.currency)) fail("QUOTE_UNAVAILABLE");
  // The provider hashes its complete scoped quote; keep that private value intact.
  return structuredClone(price);
}
export function quoteResponse(quote) {
  const price = quote.price;
  const billing=publicBilling(price?.trafficTerms?.billing);
  return { id: quote.id, kind: quote.kind, ...(quote.choice.retire_only === true ? { retire_only: true } : {}), source_server_id: quote.choice.source_server_id || null,
    destination_server_id: quote.choice.destination_server_id || null, supported_protocols: quote.supported_protocols,
    price: price ? { provider: price.provider, region: price.region, planId: price.planId, currency: price.currency,
      recurringAmount: price.recurringAmount, trafficTerms: { included: Number.isFinite(price.trafficTerms?.included) ? price.trafficTerms.included : null,
        unit: ["GB", "TB"].includes(price.trafficTerms?.unit) ? price.trafficTerms.unit : null,
        ...(['PayByTraffic','PayByBandwidth'].includes(price.trafficTerms?.specs?.billing_mode)?{billing_mode:price.trafficTerms.specs.billing_mode}:{}),
        ...(Number.isFinite(price.trafficTerms?.specs?.bandwidth_mbps)&&price.trafficTerms.specs.bandwidth_mbps>0?{bandwidth_mbps:price.trafficTerms.specs.bandwidth_mbps}:{}),
        overageAmount: Number.isFinite(price.trafficTerms?.overageAmount) ? price.trafficTerms.overageAmount : null,
        ...(billing?{billing}:{}) } } : null,
    temporary_billing_overlap: quote.kind === "replace", expiresAt: quote.expiresAt };
}
function publicBilling(value) {
  const providerBilling=providerPricingBilling(value);if(providerBilling)return providerBilling;
  if(value?.kind!=='operator_verified_hourly'||value.currency!=='USD'||
    !['hourly','monthlyEstimate','referenceHours'].every(key=>Number.isFinite(value[key])&&value[key]>0)||
    typeof value.source!=='string'||value.source.length>500||!Number.isFinite(Date.parse(value.verifiedAt)))return null;
  return Object.fromEntries(['kind','hourly','monthlyEstimate','referenceHours','currency','verifiedAt','source'].map(key=>[key,value[key]]));
}
async function inspectSource(runtime, serverId) {
  const server = await runtime.repository.getServer({ context: runtime.context, serverId });
  if (server?.lifecycle_protected !== false) fail("PROTECTED_RESOURCE");
  await assertResourceRegistration({ context: runtime.context, resource: server });
  const provider = runtime.providers?.[server.provider];
  if (!provider) fail("PROVIDER_UNAVAILABLE");
  const resource = await provider.inspect({ resourceId: server.provider_resource_id });
  await assertResourceRegistration({ context: runtime.context, resource });
  return { server, deletionScope: { approved: true, provider: resource.provider, accountId: resource.accountId,
    resourceId: resource.id, createdAt: resource.createdAt, addresses: resource.addresses, nodeId: String(server.panel_node_id) } };
}
function assertVlessOnly(source) {
  if (!Array.isArray(source.supported_protocols) || source.supported_protocols.length !== 1 || source.supported_protocols[0] !== 'vless') fail('INVALID_OPERATION_INPUT');
}
async function validateRetirementFallback(runtime, source, destination) {
  await assertDestinationRegistration({ context: runtime.context, resource: destination });
  assertCompatibleDestination({ source, destination, inventory: { movable: [] } });
  if (!Number.isSafeInteger(source.current_active_keys) || source.current_active_keys < 0) fail('RETIREMENT_FALLBACK_UNAVAILABLE');
  if (source.current_active_keys > destination.max_active_keys - destination.current_active_keys) fail('DESTINATION_CAPACITY_INSUFFICIENT');
  if (runtime.canRunOperation && !await runtime.canRunOperation({ payload: { source_server_id: source.id, destination_server_id: destination.id } })) fail('PROVIDER_UNAVAILABLE');
}
async function selectRetirementFallback(runtime, source) {
  const candidates = await runtime.repository.listRetirementCandidates({ context: runtime.context });
  candidates.sort((a, b) => Number(b.is_default === true) - Number(a.is_default === true) ||
    a.current_active_keys / a.max_active_keys - b.current_active_keys / b.max_active_keys || a.id.localeCompare(b.id));
  for (const destination of candidates) {
    try { await validateRetirementFallback(runtime, source, destination); return destination; }
    catch (error) {
      if (!['RESOURCE_SCOPE_MISMATCH', 'PROTECTED_RESOURCE', 'DESTINATION_SCOPE_MISMATCH', 'DESTINATION_PROTOCOL_MISMATCH',
        'DESTINATION_NOT_READY', 'DESTINATION_CAPACITY_INSUFFICIENT', 'PROVIDER_UNAVAILABLE', 'RETIREMENT_FALLBACK_UNAVAILABLE'].includes(error.code)) throw error;
    }
  }
  fail('RETIREMENT_FALLBACK_UNAVAILABLE');
}
export async function quoteOperation(runtime, input) {
  runtimeReady(runtime, input?.kind === 'move_retire');
  strictKeys(input, ["kind", "source_server_id", "destination_server_id", "provider", "region", "plan_id", "supported_protocols", "retire_only"]);
  if (!["add", "replace", "move_retire"].includes(input.kind)) fail("INVALID_OPERATION_INPUT");
  if ('retire_only' in input && (input.retire_only !== true || input.kind !== 'move_retire' || 'destination_server_id' in input)) fail('INVALID_OPERATION_INPUT');
  const choice = structuredClone(input);
  let source, deletionScope;
  if (input.kind !== "add") {
    if (!uuid(input.source_server_id)) fail("INVALID_OPERATION_INPUT");
    ({ server: source, deletionScope } = await inspectSource(runtime, input.source_server_id));
  } else if (input.source_server_id || input.destination_server_id) fail("INVALID_OPERATION_INPUT");
  let price = null, protocols = input.supported_protocols;
  if (input.kind === "move_retire") {
    if ((!input.retire_only && !uuid(input.destination_server_id)) || ["provider", "region", "plan_id", "supported_protocols"].some(key => key in input)) fail("INVALID_OPERATION_INPUT");
    if (input.retire_only) assertVlessOnly(source);
    const destination = input.retire_only ? await selectRetirementFallback(runtime, source) :
      await runtime.repository.getServer({ context: runtime.context, serverId: input.destination_server_id });
    choice.destination_server_id = destination.id;
    await assertDestinationRegistration({ context: runtime.context, resource: destination });
    assertCompatibleDestination({ source, destination, inventory: { movable: [] } }); protocols = destination.supported_protocols;
    if(runtime.canRunOperation && !await runtime.canRunOperation({payload:{source_server_id:source.id,destination_server_id:destination.id}})) fail('PROVIDER_UNAVAILABLE');
  } else {
    if (input.destination_server_id || !["digitalocean", "vultr", "lightnode"].includes(input.provider) || !reference(input.region) || !reference(input.plan_id) || !validCapabilities(protocols)) fail("INVALID_OPERATION_INPUT");
    if (source?.supported_protocols?.some(protocol => !protocols.includes(protocol))) fail("DESTINATION_PROTOCOL_MISMATCH");
    await runtime.assertProvisionable?.({provider:input.provider,region:input.region,planId:input.plan_id,profile:protocols.includes('shadowsocks')?'dual':'vless_only'});
    const raw = await runtime.providers[input.provider]?.quote({ region: input.region, planId: input.plan_id });
    price = priceSnapshot(raw);
    if (price.currency !== (runtime.currency || "USD")) fail("QUOTE_CURRENCY_MISMATCH");
  }
  const quote = { id: randomUUID(), ...scope(runtime.context), kind: input.kind, choice,
    supported_protocols: [...protocols].sort(), price, deletionScope: deletionScope || null,
    expiresAt: new Date(Date.now() + 10 * 60000).toISOString() };
  await runtime.repository.storeQuote({ context: runtime.context, ...quote });
  return quoteResponse(quote);
}
export async function createOperationCommand(runtime, input, idempotencyKey) {
  runtimeReady(runtime, true);
  strictKeys(input, ["quote_id", "confirm_cost", "confirm_temporary_billing", "confirm_delete_source"]);
  if (!uuid(input.quote_id) || !reference(idempotencyKey) || Object.entries(input).some(([key, value]) => key !== "quote_id" && typeof value !== "boolean")) fail("INVALID_OPERATION_INPUT");
  const requestHash = payloadHash(input);
  const existing = await runtime.repository.findByIdempotencyKey({ context: runtime.context, idempotencyKey });
  if (existing) {
    if (existing.payload?.request_hash !== requestHash) fail("IDEMPOTENCY_CONFLICT");
    return toOperationResponse(existing);
  }
  const quote = await runtime.repository.getQuote({ context: runtime.context, quoteId: input.quote_id });
  if (!quote || !Number.isFinite(Date.parse(quote.expiresAt)) || Date.parse(quote.expiresAt) <= Date.now()) fail("QUOTE_EXPIRED");
  runtimeReady(runtime, quote.kind === 'move_retire');
  if (!sameScope(quote, runtime.context)) fail("RESOURCE_SCOPE_MISMATCH");
  if ((quote.price && input.confirm_cost !== true) || (quote.kind === "replace" && input.confirm_temporary_billing !== true) ||
      (quote.kind !== "add" && input.confirm_delete_source !== true)) fail("CONFIRMATION_REQUIRED");
  if (quote.kind !== "add") {
    const fresh = await inspectSource(runtime, quote.choice.source_server_id);
    if (payloadHash(fresh.deletionScope) !== payloadHash(quote.deletionScope)) fail("RESOURCE_SCOPE_MISMATCH");
    if (quote.choice.retire_only === true) {
      assertVlessOnly(fresh.server);
      const destination = await runtime.repository.getServer({ context: runtime.context, serverId: quote.choice.destination_server_id });
      await validateRetirementFallback(runtime, fresh.server, destination);
    }
  }
  if (quote.price) {
    await runtime.assertProvisionable?.({provider:quote.price.provider,region:quote.price.region,planId:quote.price.planId,
      profile:quote.supported_protocols.includes('shadowsocks')?'dual':'vless_only'});
    const raw = await runtime.providers[quote.price.provider].quote({ region: quote.price.region, planId: quote.price.planId });
    const fresh = priceSnapshot(raw);
    if (["currency", "recurringAmount", "accountId"].some(key => fresh[key] !== quote.price[key]) || payloadHash(fresh.trafficTerms) !== payloadHash(quote.price.trafficTerms)) fail("QUOTE_CHANGED");
  }
  const payload = { ...quote.choice, quote_id: quote.id, quote: quote.price,
    supported_protocols: quote.supported_protocols, delete_scope: quote.deletionScope, request_hash: requestHash,
    confirmations: { cost: input.confirm_cost === true, temporary_billing: input.confirm_temporary_billing === true, delete_source: input.confirm_delete_source === true } };
  const operation = await runtime.repository.createQuotedOperation({ context: runtime.context, quoteId: quote.id, idempotencyKey, kind: quote.kind, payload });
  return toOperationResponse(operation);
}
export function toOperationResponse(operation) {
  const cp = operation.checkpoint || {};
  const status = ["queued", "running", "blocked", "paused", "completed", "cancelled", "failed", "partial"].includes(operation.status) ? operation.status : "blocked";
  const allowed_actions = ["blocked", "paused", "partial"].includes(status) ? ["resume"] : ["queued", "running"].includes(status) && !["cleanup_pending", "finalizing"].includes(operation.stage) ? ["cancel"] : [];
  return { id: operation.id, kind: operation.kind, ...(operation.kind === 'move_retire' && operation.payload?.retire_only === true ? { retire_only: true } : {}), status, phase: phases.has(operation.stage) ? operation.stage : "unknown",
    source_server_id: operation.payload?.source_server_id || null, destination_server_id: operation.payload?.destination_server_id || null,
    counts: { total: count(operation.item_counts?.total ?? cp.totalItems), verified: count(operation.item_counts?.verified) },
    price: operation.payload?.quote ? { recurringAmount: operation.payload.quote.recurringAmount, currency: operation.payload.quote.currency } : null,
    created_at: operation.created_at || null, updated_at: operation.updated_at || null,
    error_code: cp.error_code ? knownErrors.has(cp.error_code) ? cp.error_code : "OPERATION_REVIEW_REQUIRED" : null,
    ...retirementDiagnostic({...cp,code:cp.error_code}),
    ...(normalizeBillingAssurance(cp.billingAssurance)?{billing_assurance:{scope:'instance-package',external_attachments_verified:false}}:{}),
    ongoing_charges: (Array.isArray(cp.ongoingCharges) ? cp.ongoingCharges : []).slice(0, 100).map(row => ({
      id: reference(row?.id) ? row.id : null, type: ["volume", "snapshot", "reserved_ip", "volume_snapshot", "backup"].includes(row?.type) ? row.type : "unknown",
      amount: Number.isFinite(row?.amount) && row.amount >= 0 ? row.amount : null, currency: /^[A-Z]{3}$/.test(row?.currency || "") ? row.currency : null })), allowed_actions };
}
