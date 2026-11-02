import { createHash } from "node:crypto";

export const infrastructureError = code => Object.assign(new Error(code), { code });
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export const payloadHash = payload => createHash("sha256").update(JSON.stringify(canonical(payload))).digest("hex");
const safeCodes = ["IDEMPOTENCY_CONFLICT", "STALE_FENCE", "LEASE_EXPIRED", "LEASE_BUSY", "RESOURCE_SCOPE_MISMATCH", "SERVER_MIGRATION_IN_PROGRESS", "OPERATION_NOT_FOUND", "OPERATION_NOT_TERMINAL", "CHECKPOINT_TOO_LARGE", "INVALID_OPERATION", "ITEM_STATE_CONFLICT", "ACCESS_STATE_CHANGED", "DESTINATION_PROTOCOL_MISMATCH", "DESTINATION_CAPACITY_INSUFFICIENT", "SERVER_COUNTER_RECONCILIATION_REQUIRED", "QUOTE_EXPIRED", "QUOTE_ALREADY_USED", "CONFIRMATION_REQUIRED", "CONTROL_CONFLICT"];
safeCodes.push('ASSIGNMENT_STATE_CHANGED');
safeCodes.push('OWNERSHIP_REGISTRATION_CONFLICT');

export function scopeParameters(context) {
  if (!["development", "production"].includes(context?.environment) ||
      !["poolId", "databaseIdentity", "panelIdentity"].every(key => typeof context[key] === "string" && context[key].trim())) throw infrastructureError("RESOURCE_SCOPE_MISMATCH");
  return { p_environment: context.environment, p_pool_id: context.poolId,
    p_database_identity: context.databaseIdentity, p_panel_identity: context.panelIdentity };
}
function leaseParameters(lease) {
  if (!lease?.operationId || !lease.owner || !Number.isSafeInteger(lease.fence) || lease.fence <= 0) throw infrastructureError("STALE_FENCE");
  return { p_operation_id: lease.operationId, p_owner: lease.owner, p_fence: lease.fence };
}
function bounded(value = {}) {
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > 65536) throw infrastructureError("CHECKPOINT_TOO_LARGE");
  return value;
}
export async function callInfrastructureRpc(input, name, params) {
  const scope = scopeParameters(input.context);
  const client = input.client || (await import("../../lib/supabase.js")).supabase;
  const { data, error } = await client.rpc(name, { ...scope, ...params });
  if (error) throw infrastructureError(safeCodes.find(code => String(error.message).includes(code)) || "INFRASTRUCTURE_STORAGE_UNAVAILABLE");
  return data;
}
export async function createOperation(input) {
  if (!["add", "replace", "move_retire"].includes(input.kind) || !input.idempotencyKey) throw infrastructureError("INVALID_OPERATION");
  const payload = bounded(input.payload);
  return callInfrastructureRpc(input, "create_server_operation", { p_kind: input.kind, p_idempotency_key: input.idempotencyKey, p_payload: payload, p_payload_hash: payloadHash({ kind: input.kind, payload }) });
}
export async function claimOperation(input) {
  return callInfrastructureRpc(input, "claim_server_operation", { p_operation_id: input.operationId, p_owner: input.owner, p_ttl_seconds: input.ttlSeconds ?? 60 });
}
export async function renewLease(input) {
  return callInfrastructureRpc(input, "renew_server_operation_lease", { ...leaseParameters(input.lease), p_ttl_seconds: input.ttlSeconds ?? 60 });
}
export async function checkpoint(input) {
  return callInfrastructureRpc(input, "checkpoint_server_operation", { ...leaseParameters(input.lease), p_stage: input.stage, p_status: input.status, p_checkpoint: bounded(input.checkpoint) });
}
export async function claimItem(input) {
  return callInfrastructureRpc(input, "claim_server_operation_item", { ...leaseParameters(input.lease), p_item_key: input.itemKey, p_expected: bounded(input.expected) });
}
export async function finishItem(input) {
  return callInfrastructureRpc(input, "finish_server_operation_item", { ...leaseParameters(input.lease), p_item_key: input.itemKey, p_status: input.status, p_checkpoint: bounded(input.checkpoint) });
}
export async function releaseOperation(input) {
  return callInfrastructureRpc(input, "release_server_operation", { ...leaseParameters(input.lease), p_status: input.status });
}
export async function readOperation(input) {
  return callInfrastructureRpc(input, "read_server_operation", { p_operation_id: input.operationId });
}
