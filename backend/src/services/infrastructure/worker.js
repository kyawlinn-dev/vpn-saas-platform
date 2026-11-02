import { assertOperationAuthority } from "./ownership.js";
import { infrastructureError } from "./repository.js";
import { retirementDiagnostic } from './retirement.js';
import { normalizeBillingAssurance } from './billingAssurance.js';

const phases = new Set(["queued", "provisioning", "configuring", "registering", "verifying", "inventory", "publishing", "draining", "migrating", "endpoints", "links", "retiring", "cleanup_pending", "finalizing"]);
const postPublication = new Set(["draining", "migrating", "endpoints", "links", "retiring", "cleanup_pending", "finalizing"]);
const safeErrors = new Set(["RESOURCE_SCOPE_MISMATCH", "STALE_FENCE", "CANDIDATE_VERIFICATION_FAILED", "PROBE_CLEANUP_REQUIRED", "CREATE_RECONCILIATION_REQUIRED", "DELETE_RECONCILIATION_REQUIRED", "SERVICE_MEMBERSHIP_CHANGED", "ACCESS_STATE_CHANGED", "RETIREMENT_BLOCKED", "INVENTORY_BLOCKED", "PERMANENT_LINK_VERIFICATION_FAILED"]);
safeErrors.add('SERVER_DISPLAY_SYNC_REQUIRED');
safeErrors.add('ASSIGNMENT_STATE_CHANGED');
for(const code of ['PROVIDER_CREATE_FAILED','PROVIDER_DELETE_FAILED','PROVIDER_CHECKPOINT_UNAVAILABLE',
  'PROVIDER_READ_UNAVAILABLE','PROVIDER_RESPONSE_INVALID','NODE_SSH_HARDENING_UNVERIFIED','ATTACHMENT_INVENTORY_UNAVAILABLE'])safeErrors.add(code);
safeErrors.add('OWNERSHIP_REGISTRATION_CONFLICT');
for(const code of ['SHARED_DESTINATION_UNVERIFIED','DESTINATION_PROBE_RUNNER_REQUIRED']) safeErrors.add(code);
for (const code of ['NODE_BOOTSTRAP_FAILED', 'NODE_BOOTSTRAP_TIMEOUT']) safeErrors.add(code);
for (const code of ['PROVIDER_UNAVAILABLE', 'PROVIDER_CONFIGURATION_REQUIRED', 'PROVIDER_SSH_KEY_UNAVAILABLE',
  'FIREWALL_POLICY_UNVERIFIED', 'PROVIDER_IMAGE_UNAVAILABLE', 'PROVIDER_CATALOG_STALE',
  'PROVIDER_PLAN_UNAVAILABLE', 'PROVIDER_PLAN_INCOMPATIBLE', 'PROVIDER_REGION_DISALLOWED',
  'PROVIDER_PLAN_DISALLOWED', 'PROVIDER_BUDGET_EXCEEDED', 'QUOTE_CHANGED', 'QUOTE_INVALID', 'NODE_MANAGEMENT_TLS_UNVERIFIED', 'NODE_FIREWALL_POLICY_UNVERIFIED']) safeErrors.add(code);

/** One finite, checkpointed step. Every side-effect adapter must reconcile replay. */
export async function runOperationStep({ context, lease, adapters, repository }) {
  await assertOperationAuthority(context, lease);
  const operation = await repository.readOperation({ context, operationId: lease.operationId || lease.id });
  if (["completed", "cancelled", "failed", "paused", "blocked"].includes(operation.status)) return { status: operation.status, phase: operation.stage };
  if (!["add", "replace", "move_retire"].includes(operation.kind) || !phases.has(operation.stage)) throw infrastructureError("INVALID_OPERATION");
  let state = { ...operation.checkpoint };
  let phase = operation.stage;
  const save = async (next, status = "running") => {
    if (next !== phase || state.attempts === 0) {
      state.attempts = 0;
      delete state.waitingSince;
      delete state.error_code;
      delete state.retirement_check;
      delete state.retirement_cause;
      if (next !== "cleanup_pending") delete state.nextAttemptAt;
    }
    await assertOperationAuthority(context, lease);
    await repository.checkpoint({ context, lease, stage: next, status, checkpoint: state });
    phase = next;
    return { status, phase: next, nextAttemptAt: state.nextAttemptAt || null };
  };
  const call = async (name, extra = {}) => {
    if (typeof adapters[name] !== "function") throw infrastructureError("OPERATION_ADAPTER_UNAVAILABLE");
    await repository.renewLease({ context, lease, ttlSeconds: 120 });
    await assertOperationAuthority(context, lease);
    return adapters[name]({ context, lease, operation, checkpoint: state, ...extra });
  };
  try {
    if (operation.control_requested === "cancel") {
      if (state.published || postPublication.has(phase)) return save(phase, "paused");
      if (phase !== "queued") {
        const cleanup = await call("cancelUnpublished");
        if (cleanup.published !== false) return save(phase, "paused");
        if (cleanup.resourcesAbsent !== true || cleanup.billingClear !== true) throw infrastructureError("DELETE_RECONCILIATION_REQUIRED");
        const assurance=normalizeBillingAssurance(cleanup.billingAssurance);
        if(assurance)state.billingAssurance=assurance;
      }
      state.cancellationReconciled = true;
      await save(phase);
      await repository.releaseOperation({ context, lease, status: "cancelled" });
      return { status: "cancelled", phase };
    }
    if (phase === "queued") return save(operation.kind === "move_retire" ? "verifying" : "provisioning");
    if (phase === "provisioning") {
      // Stage is durable before POST; provider adapter owns nonce/reconciliation.
      const resource = await call("provision"); state.resourceId = resource.id || resource.resourceId;
      state.attempts = 0; return save("configuring");
    }
    if (phase === "configuring") { await call("configure"); state.attempts = 0; return save("registering"); }
    if (phase === "registering") { await call("register"); state.attempts = 0; return save("verifying"); }
    if (phase === "verifying") {
      const candidate = await call(operation.kind === "move_retire" ? "loadExistingCandidate" : "resolveCandidate");
      const proof = await call("verify", { candidate });
      if (proof?.verified !== true) throw infrastructureError("CANDIDATE_VERIFICATION_FAILED");
      state.attempts = 0; return save(operation.kind === "add" ? "publishing" : "inventory");
    }
    if (phase === "inventory") {
      const inventory = await call("inventory");
      if (!Array.isArray(inventory?.blockers) || inventory.blockers.length) throw infrastructureError("INVENTORY_BLOCKED");
      await call("stageMigrationItems", { inventory });
      state.inventoryFingerprint = inventory.fingerprint; state.totalItems = inventory.movable.length; state.attempts = 0;
      return save(operation.kind === "move_retire" ? "draining" : "publishing");
    }
    if (phase === "publishing") {
      // Proofs are deliberately not serialized; re-probe after restart/stale proof.
      const candidate = await call("resolveCandidate"); const proof = await call("verify", { candidate });
      if (proof?.verified !== true) throw infrastructureError("CANDIDATE_VERIFICATION_FAILED");
      await call("publish", { candidate, proof });
      state.published = true; state.attempts = 0;
      return save(operation.kind === "add" ? "finalizing" : "draining");
    }
    if (phase === "draining") { await call("drain"); state.attempts = 0; return save("migrating"); }
    if (phase === "migrating") {
      const item = await call("nextMigrationItem");
      if (!item) return save("endpoints");
      const result = await call("migrate", { item });
      if (result?.status !== "verified") throw infrastructureError("ACCESS_STATE_CHANGED");
      // Counts are read from durable items by the API, never blindly incremented.
      state.attempts = 0; return save("migrating");
    }
    if (phase === "endpoints") { await call("replaceEndpoints"); state.attempts = 0; return save("links"); }
    if (phase === "links") {
      const result = await call("verifyPermanentLinks");
      if (result?.verified !== true) throw infrastructureError("PERMANENT_LINK_VERIFICATION_FAILED");
      state.attempts = 0; return save("retiring");
    }
    if (phase === "retiring" || phase === "cleanup_pending") {
      // Cleanup retries do not replay migrations or try to restore a deleted IP.
      const result = phase === "retiring"
        ? await call("retire", { proof: await call("verifyRetirementReady") })
        : await call("cleanup");
      if (result?.resourceAbsent !== true) throw infrastructureError("DELETE_RECONCILIATION_REQUIRED");
      state.resourceAbsent = true; state.ongoingCharges = result.ongoingCharges || [];
      const assurance=normalizeBillingAssurance(result.billingAssurance);
      if(assurance)state.billingAssurance=assurance;
      state.attempts = 0;
      if (result.cleanupPending || state.ongoingCharges.length) {
        state.nextAttemptAt = new Date(Date.now() + 60000).toISOString(); return save("cleanup_pending");
      }
      return save("finalizing");
    }
    await repository.releaseOperation({ context, lease, status: "completed" });
    return { status: "completed", phase: "finalizing" };
  } catch (error) {
    if (["STALE_FENCE", "LEASE_EXPIRED"].includes(error.code)) throw error;
    if (["PROVIDER_RESOURCE_PENDING", "PANEL_NODE_PENDING", "NODE_BOOTSTRAP_PENDING"].includes(error.code)) {
      state.waitingSince ||= new Date().toISOString();
      state.attempts = 0;
      state.nextAttemptAt = new Date(Date.now() + 15000).toISOString();
      // Persist bounded waiting separately from failed mutation attempts.
      const expired = Date.now() - Date.parse(state.waitingSince) >= 20 * 60000;
      if (error.code === 'NODE_BOOTSTRAP_PENDING') {
        if (expired) state.error_code = 'NODE_BOOTSTRAP_TIMEOUT';
        else delete state.error_code;
      } else if(error.code==='PROVIDER_RESOURCE_PENDING') {
        if(expired)state.error_code='PROVIDER_RESOURCE_TIMEOUT';
        else delete state.error_code;
      }
      await assertOperationAuthority(context, lease);
      await repository.checkpoint({ context, lease, stage: phase, status: expired ? "blocked" : "running", checkpoint: state });
      return { status: expired ? "blocked" : "running", phase, nextAttemptAt: state.nextAttemptAt };
    }
    delete state.retirement_check;delete state.retirement_cause;
    state = { ...state, ...retirementDiagnostic(error), attempts: Number(state.attempts || 0) + 1,
      error_code: safeErrors.has(error.code) ? error.code : "OPERATION_STEP_UNCERTAIN" };
    state.nextAttemptAt = new Date(Date.now() + Math.min(60000, 1000 * 2 ** state.attempts)).toISOString();
    return save(phase, state.attempts >= 3 ? "blocked" : "running");
  }
}
