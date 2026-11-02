import { encrypt, decrypt } from '../../lib/tokenEncryption.js';
import { callInfrastructureRpc, infrastructureError, payloadHash } from './repository.js';

const fail = code => { throw infrastructureError(code); };
const keyValid = value => typeof value === 'string' && /^[A-Za-z0-9:_-]{1,200}$/.test(value);
export function createInfrastructureStore({ context, client, getLease }) {
  const read = (name, params) => callInfrastructureRpc({ context, client }, name, params);
  function fence(operationId) {
    const lease = getLease?.();
    const id = lease?.id || lease?.operationId;
    if (!id || !lease.owner || !Number.isSafeInteger(lease.fence) || lease.fence < 1) fail('STALE_FENCE');
    if (operationId && operationId !== id) fail('RESOURCE_SCOPE_MISMATCH');
    return { p_operation_id: id, p_owner: lease.owner, p_fence: lease.fence };
  }
  const resourceKey = input => {
    const id = String(input.id || '');
    if (!keyValid(input.kind) || !id || id.length > 200 || !['', 'digitalocean', 'vultr', 'lightnode'].includes(input.provider || '')) fail('RESOURCE_SCOPE_MISMATCH');
    return { p_kind: input.kind, p_resource_id: id, p_provider: input.provider || '' };
  };
  function stateIdentity(key) {
    if (!keyValid(key)) fail('INVALID_OPERATION');
    const parameters = fence();
    return { parameters, identity: { environment: context.environment, poolId: context.poolId,
      databaseIdentity: context.databaseIdentity, panelIdentity: context.panelIdentity, operationId: parameters.p_operation_id, key } };
  }
  return Object.freeze({
    getResource: input => read('read_server_infrastructure_resource', resourceKey(input)),
    getCreateAttempt: input => read('read_server_provider_intent', { p_provider: input.provider, p_operation_id: input.operationId }),
    claimCreateAttempt: async attempt => read('claim_server_provider_intent', { ...fence(attempt.operationId), p_provider: attempt.provider, p_body: attempt }),
    recordCreatedResource: async (resource, { expectedAttempt } = {}) => read('register_server_infrastructure_resource', {
      ...fence(resource.operationId), ...resourceKey(resource), p_body: resource, p_expected_intent: expectedAttempt || null }),
    archivePanelResource: input => read('archive_server_panel_resource', {
      ...fence(), p_kind: input.kind, p_resource_id: String(input.id), p_expected_body: input.expectedBody }),
    async readState(key) {
      const { parameters, identity } = stateIdentity(key);
      const row = await read('read_server_infrastructure_state', { ...parameters, p_state_key: key });
      if (!row) return { value: null, version: null };
      let envelope;
      try { envelope = JSON.parse(decrypt(row.ciphertext)); } catch { fail('PRIVATE_STATE_UNREADABLE'); }
      if (payloadHash(envelope.identity) !== payloadHash(identity)) fail('PRIVATE_STATE_SCOPE_MISMATCH');
      return { value: envelope.value, version: row.version };
    },
    async saveState(key, value, expectedVersion) {
      const { parameters, identity } = stateIdentity(key);
      const plaintext = JSON.stringify({ identity, value });
      if (Buffer.byteLength(plaintext) > 524288) fail('CHECKPOINT_TOO_LARGE');
      const ciphertext = encrypt(plaintext);
      return read('write_server_infrastructure_state', { ...parameters, p_state_key: key, p_ciphertext: ciphertext, p_expected_version: expectedVersion });
    },
    acquireServiceLock: serviceId => read('acquire_server_service_lock', { ...fence(), p_service_id: String(serviceId) }),
    releaseServiceLock: serviceId => read('release_server_service_lock', { ...fence(), p_service_id: String(serviceId) }),
  });
}
