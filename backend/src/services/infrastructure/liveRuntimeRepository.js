import { createCommandRepository } from './commandRepository.js';
import { createMigrationRepository } from './migrationRepository.js';
import { callInfrastructureRpc, claimItem, infrastructureError, payloadHash } from './repository.js';
import { migrationItemBindingHash } from './migration.js';

function fence(lease) {
  const id = lease?.id || lease?.operationId;
  if (!id || !lease.owner || !Number.isSafeInteger(lease.fence) || lease.fence < 1) throw infrastructureError('STALE_FENCE');
  return { p_operation_id: id, p_owner: lease.owner, p_fence: lease.fence };
}
export function createLiveRuntimeRepository({ client, store } = {}) {
  const rpc = (input, name, params) => callInfrastructureRpc({ ...input, client }, name, params);
  const commands = createCommandRepository({ client });
  const migration = createMigrationRepository({ client });
  return {
    ...commands, ...migration,
    async nextMigrationItem(input) {
      const row = await rpc(input, 'next_server_operation_item', fence(input.lease));
      if (!row) return null;
      const item = (await store.readState(`migration-item:${row.item_key}`)).value;
      if (!item) throw infrastructureError('ITEM_STATE_CONFLICT');
      return item;
    },
    cleanupAssignment: input => rpc(input, 'cleanup_server_operation_assignment', { ...fence(input.lease), p_assignment_id: input.item.assignmentId,
      p_key_id: input.item.keyId, p_source_id: input.source.id, p_expected: input.item.expectedAssignment }),
    ensureCandidate: input => rpc(input, 'ensure_server_operation_candidate', { ...fence(input.lease), p_server: input.server }),
    assignCandidateDisplay: input => rpc(input, 'assign_server_operation_display', { ...fence(input.lease), p_server_id: input.serverId,
      p_city: input.location.city, p_country: input.location.country, p_country_code: input.location.countryCode, p_flag: input.location.flag }),
    publishCandidate: input => rpc(input, 'publish_server_operation_candidate', { ...fence(input.lease), p_server_id: input.candidate.serverId,
      p_node_id: Number(input.candidate.node.id), p_provider_resource_id: input.candidate.resource.id, p_verified_at: input.proof.verifiedAt }),
    retireServer: input => rpc(input, 'retire_server_operation_resource', { ...fence(input.lease), p_server_id: input.server.id,
      p_provider_resource_id: input.server.provider_resource_id, p_node_id: input.server.panel_node_id }),
    async stageMigrationItems(input) {
      for (const item of input.inventory.movable) {
        const itemKey = item.kind === 'access' ? `key:${item.keyId}` : `assignment:${item.assignmentId}`;
        if (store) {
          const old = await store.readState(`migration-item:${itemKey}`);
          if (old.value && payloadHash(old.value) !== payloadHash(item)) throw infrastructureError('ITEM_STATE_CONFLICT');
          if (!old.value) await store.saveState(`migration-item:${itemKey}`, item, old.version);
        }
        await claimItem({ ...input, client, lease: { ...input.lease, operationId: input.lease.id || input.lease.operationId },
          itemKey,
          expected: { bindingHash: migrationItemBindingHash({ ...input, item }) } });
      }
    },
  };
}
