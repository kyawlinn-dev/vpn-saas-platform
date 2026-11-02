import { callInfrastructureRpc, claimItem, finishItem, infrastructureError } from "./repository.js";

function fenced(input) {
  const lease = input.lease;
  const id = lease?.id || lease?.operationId;
  if (!id || !lease.owner || !Number.isSafeInteger(lease.fence) || lease.fence <= 0) throw infrastructureError("STALE_FENCE");
  return { p_operation_id: id, p_owner: lease.owner, p_fence: lease.fence };
}
function access(input) {
  return { ...fenced(input), p_key_id: input.keyId, p_order_id: input.orderId, p_reseller_id: input.resellerId, p_customer_id: input.customerId };
}
export function createMigrationRepository({ client } = {}) {
  const rpc = (input, name, params) => callInfrastructureRpc({ ...input, client }, name, params);
  return {
    async readMigrationState(input) {
      const value = await rpc(input, "read_server_operation_item", { ...fenced(input), p_item_key: `key:${input.keyId}` });
      // A crash between claim and first checkpoint has no external side effect yet.
      return value && Object.keys(value).length ? value : null;
    },
    async saveMigrationState(input) {
      const envelope = { ...input, client, lease: { ...input.lease, operationId: input.lease.id || input.lease.operationId }, itemKey: `key:${input.keyId}` };
      await claimItem({ ...envelope, expected: { bindingHash: input.checkpoint.bindingHash } });
      return finishItem({ ...envelope, status: input.checkpoint.phase === "verified" ? "verified" : "prepared", checkpoint: input.checkpoint });
    },
    readScopedAccess: input => rpc(input, "read_server_operation_access", access(input)),
    moveKeyAnchor: input => {
      if (Object.keys(input.patch || {}).length !== 1 || input.patch.server_id !== input.destinationId) throw infrastructureError("INVALID_ANCHOR_PATCH");
      return rpc(input, "move_server_operation_key", { ...access(input), p_source_id: input.sourceId, p_destination_id: input.destinationId, p_expected_key: input.expectedKey, p_expected_order: input.expectedOrder });
    },
    repairAssignments: input => rpc(input, "repair_server_operation_assignments", { ...access(input), p_destination_id: input.destinationId }),
    verifyAssignments: input => rpc(input, "verify_server_operation_assignments", { ...access(input), p_destination_id: input.destinationId }),
    drainSource: input => rpc(input, "drain_server_operation_source", { ...fenced(input), p_server_id: input.source.id }),
    lockServer: input => rpc(input, "lock_server_operation_server", { ...fenced(input), p_server_id: input.serverId }),
  };
}
