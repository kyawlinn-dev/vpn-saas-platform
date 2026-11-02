import { assertOperationAuthority, assertResourceOwnership, assertDestinationOwnership } from "./ownership.js";
import { infrastructureError, payloadHash } from "./repository.js";

const proofs = new WeakMap();
const checks = new Set(['source_ownership','destination_ownership','adapters','source_read','source_authorization','provider_read','provider_ownership','provider_identity','node_identity','node_ownership','inventory','destination_verification','destination_freshness','fence','proof_consistency','panel_removal']);
const causes = new Set(['RETIREMENT_BLOCKED','CHECK_FAILED','RESOURCE_SCOPE_MISMATCH','PROVIDER_UNAVAILABLE','INVENTORY_BLOCKED','INVENTORY_INCOMPLETE','CANDIDATE_VERIFICATION_FAILED','PROBE_CLEANUP_REQUIRED','SHARED_DESTINATION_UNVERIFIED','DESTINATION_PROBE_RUNNER_REQUIRED','PERMANENT_LINK_VERIFICATION_FAILED']);
export function retirementDiagnostic(error){
  return error?.code==='RETIREMENT_BLOCKED' && checks.has(error.retirement_check)?{
    retirement_check:error.retirement_check,
    retirement_cause:causes.has(error.retirement_cause)?error.retirement_cause:'CHECK_FAILED',
  }:{};
}
const blocked = check => { throw Object.assign(infrastructureError('RETIREMENT_BLOCKED'),checks.has(check)?{retirement_check:check}:{}); };
const sorted = values => [...(values || [])].sort();
const sameAddresses = (a, b) => payloadHash(sorted(a)) === payloadHash(sorted(b));
const identity = resource => ({ id: resource.id, kind: resource.kind, provider: resource.provider,
  accountId: resource.accountId, createdAt: resource.createdAt, addresses: resource.addresses,
  environment: resource.environment, databaseIdentity: resource.databaseIdentity, panelIdentity: resource.panelIdentity, poolId: resource.poolId });

export async function verifyRetirementReady({ context, lease, source, destination, adapters, operationKind }) {
  let check='source_ownership';
  try {
    await assertResourceOwnership({ context, resource: source, operation: lease });
    check='destination_ownership';
    await assertDestinationOwnership({ context, resource: destination, operation: lease });
    check='adapters';
    for (const name of ["readSource", "readDeletionAuthorization", "inventory", "verifyDestination", "readRetirementCheckpoint"]) if (typeof adapters?.[name] !== "function") blocked();
    check='source_read';
    const fresh = await adapters.readSource({ context, lease, source });
    const authorization = await adapters.readDeletionAuthorization({ context, lease });
    const checkpoint = await adapters.readRetirementCheckpoint({ context, lease });
    check='source_authorization';
    if (!fresh?.server || fresh.server.id !== source.id || fresh.server.lifecycle_protected !== false) blocked();
    await assertResourceOwnership({ context, resource: fresh.server, operation: lease });
    check='provider_read';
    let resource = await adapters.provider.inspect({ resourceId: source.provider_resource_id });
    const resourceAbsent = resource === null;
    if (resourceAbsent) {
      if (checkpoint?.phase !== "delete_issued" || checkpoint.operationId !== lease.id || checkpoint.sourceId !== source.id || !checkpoint.panelRemoved) blocked();
      resource = checkpoint.providerIdentity;
    }
    check='provider_ownership';
    await assertResourceOwnership({ context, resource, operation: lease });
    check='provider_identity';
    if (authorization?.approved !== true || authorization.provider !== resource.provider || authorization.accountId !== resource.accountId ||
        authorization.resourceId !== source.provider_resource_id || authorization.resourceId !== resource.id || authorization.createdAt !== resource.createdAt ||
        String(authorization.nodeId) !== String(source.panel_node_id) || !sameAddresses(authorization.addresses, resource.addresses) ||
        !sameAddresses(source.addresses, resource.addresses)) blocked();
    const removalIntent = checkpoint?.operationId === lease.id && checkpoint.sourceId === source.id &&
      ["panel_remove_issued", "delete_issued"].includes(checkpoint.phase) &&
      checkpoint.providerIdentity?.id === resource.id && checkpoint.nodeIdentity?.id === String(source.panel_node_id);
    check='node_identity';
    const node = fresh.node || (removalIntent ? checkpoint.nodeIdentity : null);
    if (!node || String(node.id) !== String(source.panel_node_id) || !resource.addresses.includes(node.address)) blocked();
    check='node_ownership';
    await assertResourceOwnership({ context, resource: node, operation: lease });
    check='inventory';
    const inventory = await adapters.inventory({ context, lease, source, destination });
    if (!Array.isArray(inventory?.blockers) || inventory.blockers.length || !Array.isArray(inventory.movable) || inventory.movable.length ||
        inventory.activeSourceAssignments !== 0 || inventory.pendingSourceKeys !== 0) throw infrastructureError('INVENTORY_BLOCKED');
    check='destination_verification';
    const target = await adapters.verifyDestination({ context, lease, destination });
    check='destination_freshness';
    const age = Date.now() - Date.parse(target?.verifiedAt);
    const accessVerified=operationKind==='move_retire'?target?.servicesVerified===true:target?.tunnelsVerified===true;
    if (target?.healthy !== true || !accessVerified || target.permanentLinksVerified !== true || !Number.isFinite(age) || age < -5000 || age > 30000) blocked();
    check='fence';
    await assertOperationAuthority(context, lease);
    const fingerprint = payloadHash({ sourceId: source.id, destinationId: destination.id, provider: identity(resource), node,
      authorization, resourceAbsent, operationKind });
    const proof = Object.freeze({ verified: true, sourceId: source.id, destinationId: destination.id });
    proofs.set(proof, { context, leaseId: lease.id, fence: lease.fence, expiresAt: Date.now() + 30000,
      fingerprint, source, destination, operationKind, providerIdentity: identity(resource), nodeIdentity: node, resourceAbsent });
    return proof;
  } catch (error) {
    if (error.code === "STALE_FENCE") throw error;
    throw Object.assign(infrastructureError('RETIREMENT_BLOCKED'),{retirement_check:check,
      retirement_cause:causes.has(error.code)?error.code:'CHECK_FAILED'});
  }
}

export async function retireSource({ context, lease, proof, adapters }) {
  const record = proof && proofs.get(proof);
  if (!record || record.context !== context || record.leaseId !== lease.id || record.fence !== lease.fence || record.expiresAt <= Date.now()) throw infrastructureError("RETIREMENT_PROOF_REQUIRED");
  // Repeat the entire gate under the current fence; a prior green UI is not proof.
  const freshProof = await verifyRetirementReady({ context, lease, source: record.source, destination: record.destination, operationKind:record.operationKind, adapters });
  const fresh = proofs.get(freshProof);
  if (fresh.fingerprint !== record.fingerprint) blocked('proof_consistency');
  for (const name of ["checkpointRetirement", "removeOwnedPanelResources", "billingInventory"]) if (typeof adapters[name] !== "function") blocked();
  let deletePending = false;
  if (!fresh.resourceAbsent) {
    const checkpoint = await adapters.readRetirementCheckpoint({ context, lease });
    const panelRemoved = checkpoint?.phase === 'delete_issued' && checkpoint.operationId === lease.id &&
      checkpoint.sourceId === record.source.id && checkpoint.panelRemoved === true &&
      payloadHash(checkpoint.providerIdentity) === payloadHash(fresh.providerIdentity) &&
      payloadHash(checkpoint.nodeIdentity) === payloadHash(fresh.nodeIdentity);
    if (!panelRemoved) {
      await assertOperationAuthority(context, lease);
      await adapters.checkpointRetirement({ context, lease, phase: "panel_remove_issued", operationId: lease.id,
        sourceId: record.source.id, providerIdentity: fresh.providerIdentity, nodeIdentity: fresh.nodeIdentity, panelRemoved: false });
      try{
        if (await adapters.removeOwnedPanelResources({ context, lease, source: record.source, expectedNode: fresh.nodeIdentity }) !== true) blocked('panel_removal');
      }catch(error){
        if(error.code==='STALE_FENCE')throw error;
        if(error.code!=='RETIREMENT_BLOCKED')throw error;
        throw Object.assign(infrastructureError('RETIREMENT_BLOCKED'),{retirement_check:'panel_removal',retirement_cause:'RETIREMENT_BLOCKED'});
      }
      await adapters.checkpointRetirement({ context, lease, phase: "delete_issued", operationId: lease.id,
        sourceId: record.source.id, providerIdentity: fresh.providerIdentity, nodeIdentity: fresh.nodeIdentity, panelRemoved: true });
    }
    await assertResourceOwnership({ context, resource: fresh.providerIdentity, operation: lease });
    try { await adapters.provider.delete({ resourceId: fresh.providerIdentity.id, expectedIdentity: fresh.providerIdentity, operation: lease }); }
    catch (error) {
      // Keep ordinary async polling narrow; every outcome still requires fresh
      // absence below, including pending/uncertain requests that already completed.
      deletePending = error?.code === 'PROVIDER_RESOURCE_PENDING';
    }
  }
  let absent;
  try { absent = await adapters.provider.inspect({ resourceId: fresh.providerIdentity.id }) === null; }
  catch { throw infrastructureError("DELETE_RECONCILIATION_REQUIRED"); }
  if (!absent) throw infrastructureError(deletePending ? 'PROVIDER_RESOURCE_PENDING' : 'DELETE_RECONCILIATION_REQUIRED');
  await assertOperationAuthority(context, lease);
  let billing;
  try { billing = await adapters.billingInventory({ context, lease, source: record.source, providerIdentity: fresh.providerIdentity }); } catch { /* Unknown billing remains cleanup pending. */ }
  if (billing?.complete !== true || !Array.isArray(billing.ongoingCharges)) return { resourceAbsent: true, cleanupPending: true, ongoingCharges: [{ code: "BILLING_STATE_UNKNOWN" }] };
  // Shared/unconfirmed attachments are reported, never implicitly destroyed.
  const billingAssurance = billing.billingAssurance?.scope === 'instance-package' && billing.billingAssurance.externalAttachmentsVerified === false
    ? { scope: 'instance-package', externalAttachmentsVerified: false } : null;
  return { resourceAbsent: true, cleanupPending: billing.ongoingCharges.length > 0, ongoingCharges: billing.ongoingCharges,
    ...(billingAssurance ? { billingAssurance } : {}) };
}
