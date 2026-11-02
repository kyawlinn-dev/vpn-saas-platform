import { assertOperationAuthority, assertResourceOwnership, assertDestinationOwnership } from "./ownership.js";
import { infrastructureError, payloadHash } from "./repository.js";

const fail = code => { throw infrastructureError(code); };
const sameIds = (a, b) => Array.isArray(a) && Array.isArray(b) && payloadHash([...a].sort()) === payloadHash([...b].sort());
const keyFields = ["id", "order_id", "customer_id", "reseller_id", "outline_key_id", "protocol", "status", "deleted_at", "access_url", "data_limit_bytes"];
const orderFields = ["id", "customer_id", "reseller_id", "status", "expiry_date", "quota_limit_bytes", "usage_baseline_bytes", "payment_status", "review_status"];
const userFields = ["id", "username", "key", "subscription_url", "data_limit", "expire_date", "expire_strategy", "data_limit_reset_strategy", "enabled"];
const equalFields = (a, b, fields) => fields.every(key => (a?.[key] ?? null) === (b?.[key] ?? null));
export const migrationItemBindingHash = ({ item, source, destination }) => payloadHash({ keyId: item.keyId, orderId: item.orderId,
  resellerId: item.resellerId, customerId: item.customerId, sourceId: source.id, destinationId: destination.id, userId: item.userId, protocol: item.protocol });

function assertAccess({ key, order, item, source, destination, recovering }) {
  // Relocation preserves the deadline; it is not a renewal or a new-access grant.
  if (!key || !order || key.id !== item.keyId || order.id !== item.orderId || key.order_id !== order.id ||
      key.reseller_id !== item.resellerId || order.reseller_id !== item.resellerId ||
      key.customer_id !== item.customerId || order.customer_id !== item.customerId ||
      key.status !== "active" || key.deleted_at || order.status !== "active" || !order.expiry_date ||
      !equalFields(key, item.expectedKey, keyFields) || !equalFields(order, item.expectedOrder, orderFields) ||
      !(key.server_id === source.id || (recovering && key.server_id === destination.id)) ||
      !Number.isFinite(key.used_bytes) || key.used_bytes < Number(item.expectedKey.used_bytes || 0)) fail("ACCESS_STATE_CHANGED");
}
function assertUserUnchanged(before, after, desired) {
  if (!equalFields(before, after, userFields) || !sameIds(after.service_ids, desired) ||
      !Number.isFinite(after.used_traffic) || after.used_traffic < Number(before.used_traffic || 0)) fail("USER_READBACK_FAILED");
}

export async function drainSource({ context, lease, source, repository = context.adapters.repository }) {
  await assertResourceOwnership({ context, resource: source, operation: lease });
  if (typeof context.adapters.assertDrainScope !== "function" ||
      await context.adapters.assertDrainScope({ context, lease, source }) !== true || typeof repository?.drainSource !== "function") fail("DRAIN_NOT_AUTHORIZED");
  // Fenced adapter must own the server lock and compare the current row.
  return repository.drainSource({ context, lease, source, expected: source, patch: { is_active: false } });
}

export async function migrateAccessItem({ context, lease, item, source, destination, panel, repository }) {
  await assertResourceOwnership({ context, resource: source, operation: lease });
  await assertDestinationOwnership({ context, resource: destination, operation: lease });
  if (item.kind !== "access" || !["shadowsocks", "vless"].includes(item.protocol) ||
      !destination.supported_protocols?.includes(item.protocol)) fail("UNSUPPORTED_MIGRATION_ITEM");
  for (const method of ["readMigrationState", "saveMigrationState", "readScopedAccess", "moveKeyAnchor", "repairAssignments", "verifyAssignments"]) {
    if (typeof repository?.[method] !== "function") fail("MIGRATION_STORAGE_UNAVAILABLE");
  }
  if (typeof panel?.readUser !== "function" || typeof panel.updateUserServices !== "function") fail("PANEL_ADAPTER_UNAVAILABLE");
  const scope = { context, lease, keyId: item.keyId, orderId: item.orderId, resellerId: item.resellerId, customerId: item.customerId };
  const bindingHash = migrationItemBindingHash({ item, source, destination });
  let state = await repository.readMigrationState(scope);
  if (state && state.bindingHash !== bindingHash) fail("ITEM_STATE_CONFLICT");
  const access = await repository.readScopedAccess(scope);
  assertAccess({ ...access, item, source, destination, recovering: Boolean(state) });
  const owner = await context.registry.getResource({ kind: "user", id: item.userId });
  await assertResourceOwnership({ context, resource: owner, operation: lease });
  let current = await panel.readUser({ context, lease, userId: item.userId });
  if (current?.id !== item.userId) fail("RESOURCE_SCOPE_MISMATCH");
  if (!state) {
    if (!sameIds(current.service_ids, item.sourceServiceIds)) fail("USER_SERVICES_CHANGED");
    let desired = [...current.service_ids];
    if (item.protocol === "shadowsocks") {
      const from = source.marzneshin_service_ids, to = destination.marzneshin_service_ids;
      if (from?.length !== 1 || to?.length !== 1 || !from.every(Number.isSafeInteger) || !to.every(Number.isSafeInteger) ||
          from[0] <= 0 || to[0] <= 0 || !desired.includes(from[0]) || from[0] === to[0]) fail("SERVICE_CONFIGURATION_INVALID");
      desired = [...new Set(desired.map(id => id === from[0] ? to[0] : id))];
    } else if (desired.length !== 1 || String(desired[0]) !== context.publicServiceId) {
      fail("SERVICE_CONFIGURATION_INVALID");
    }
    for (const serviceId of [...new Set([...current.service_ids, ...desired])]) {
      if (destination.lifecycle_protected === true && destination.marzneshin_service_ids?.includes(serviceId) &&
          await panel.verifyDestinationService?.({destination,serviceId}) === true) continue;
      const service = await context.registry.getResource({ kind: "service", id: String(serviceId) });
      await assertResourceOwnership({ context, resource: service, operation: lease });
    }
    state = { phase: "prepared", bindingHash, beforeUser: current, desiredServiceIds: desired };
    await assertOperationAuthority(context, lease);
    await repository.saveMigrationState({ ...scope, checkpoint: state });
  }
  if (!sameIds(current.service_ids, state.desiredServiceIds)) {
    if (!sameIds(current.service_ids, state.beforeUser.service_ids) || !equalFields(current, state.beforeUser, userFields)) fail("USER_SERVICES_CHANGED");
    // The guarded adapter reads fresh state and builds a full accepted panel PUT.
    // No create/delete, quota reset, expiry rewrite or whole stale-user replay.
    await assertOperationAuthority(context, lease);
    await panel.updateUserServices({ context, lease, userId: item.userId, expectedVersion: current.version,
      expectedServiceIds: current.service_ids, serviceIds: state.desiredServiceIds,
      ...(destination.lifecycle_protected===true?{destination}:{}) });
  }
  current = await panel.readUser({ context, lease, userId: item.userId });
  assertUserUnchanged(state.beforeUser, current, state.desiredServiceIds);
  const fresh = await repository.readScopedAccess(scope);
  assertAccess({ ...fresh, item, source, destination, recovering: true });
  if (fresh.key.server_id !== destination.id) {
    await assertOperationAuthority(context, lease);
    // Database-owned move RPC/trigger updates capacity in the same transaction.
    // Never write current_active_keys or customer usage from application code.
    await repository.moveKeyAnchor({ ...scope, expectedKey: fresh.key, expectedOrder: fresh.order,
      sourceId: source.id, destinationId: destination.id, patch: { server_id: destination.id } });
  }
  await repository.saveMigrationState({ ...scope, checkpoint: { ...state, phase: "anchored" } });
  await assertOperationAuthority(context, lease);
  await repository.repairAssignments({ ...scope, sourceId: source.id, destinationId: destination.id });
  if (await repository.verifyAssignments({ ...scope, destinationId: destination.id }) !== true) fail("ASSIGNMENT_READBACK_FAILED");
  const final = await repository.readScopedAccess(scope);
  assertAccess({ ...final, item, source, destination, recovering: true });
  if (final.key.server_id !== destination.id) fail("ANCHOR_READBACK_FAILED");
  await assertOperationAuthority(context, lease);
  await repository.saveMigrationState({ ...scope, checkpoint: { ...state, phase: "verified" } });
  return { status: "verified", keyId: item.keyId, userId: item.userId };
}

export const reconcileAccessItem = input => migrateAccessItem(input);

export async function replaceManagedEndpoints({ context, lease, inventory, source, destination, panel }) {
  await assertResourceOwnership({ context, resource: source, operation: lease });
  await assertDestinationOwnership({ context, resource: destination, operation: lease });
  if (inventory.blockers?.length || !context.publicServiceId) fail("ENDPOINT_REPLACEMENT_BLOCKED");
  for (const method of ["withServiceLock", "readService", "readDestinationEndpoint", "replaceEndpoints"]) if (typeof panel?.[method] !== "function") fail("PANEL_ADAPTER_UNAVAILABLE");
  const service = await context.registry.getResource({ kind: "service", id: context.publicServiceId });
  await assertResourceOwnership({ context, resource: service, operation: lease });
  return panel.withServiceLock({ context, lease, serviceId: service.id }, async () => {
    if(panel.reconcileEndpointReplacement)await panel.reconcileEndpointReplacement({context,lease,serviceId:service.id});
    const before = await panel.readService({ context, serviceId: service.id });
    const next = await panel.readDestinationEndpoint({ context, destination });
    if (!Array.isArray(before?.endpoints) || before.version == null || String(next?.nodeId) !== String(destination.panel_node_id)) fail("SERVICE_MEMBERSHIP_CHANGED");
    if (destination.lifecycle_protected !== true) {
      const nextOwner = await context.registry.getResource({ kind: "host", id: next.id });
      await assertResourceOwnership({ context, resource: nextOwner, operation: lease });
    }
    const removed = before.endpoints.filter(endpoint => String(endpoint.nodeId) === String(source.panel_node_id));
    for (const endpoint of removed) {
      const owner = await context.registry.getResource({ kind: "host", id: endpoint.id });
      await assertResourceOwnership({ context, resource: owner, operation: lease });
    }
    const preserved = before.endpoints.filter(endpoint => !removed.some(row => row.id === endpoint.id));
    const existing = preserved.find(endpoint => endpoint.id === next.id);
    // Shared hosts must already be published. Never append or mutate their configuration.
    if (destination.lifecycle_protected === true && !existing) fail('SERVICE_MEMBERSHIP_CHANGED');
    if (existing && payloadHash(existing) !== payloadHash(next)) fail("SERVICE_MEMBERSHIP_CHANGED");
    const desired = existing ? preserved : [...preserved, next];
    await assertOperationAuthority(context, lease);
    if (removed.length || !existing) await panel.replaceEndpoints({ context, lease, serviceId: service.id,
      expectedVersion: before.version, removeEndpointIds: removed.map(row => row.id), addEndpoints: existing ? [] : [next] });
    const after = await panel.readService({ context, serviceId: service.id });
    if (!Array.isArray(after?.endpoints) || after.endpoints.length !== desired.length ||
        !desired.every(endpoint => after.endpoints.some(row => payloadHash(row) === payloadHash(endpoint)))) fail("SERVICE_MEMBERSHIP_CHANGED");
    return { updated: true, serviceId: service.id };
  });
}
