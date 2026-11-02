import { assertOperationAuthority, assertResourceOwnership } from "./ownership.js";
import { infrastructureError, payloadHash } from "./repository.js";
import { assertCandidateVerification } from "./verification.js";
import { validCapabilities } from "./nodeConfigurator.js";

export async function registerCandidate({ context, operation, resource, supportedProtocols, configuration, panel }) {
  await assertResourceOwnership({ context, resource, operation });
  if (!validCapabilities(supportedProtocols) || !configuration?.fingerprint || configuration.resourceId !== resource.id ||
      configuration.operationId !== operation.id || typeof panel?.ensurePrivateCandidate !== "function") throw infrastructureError("CANDIDATE_CONFIGURATION_REQUIRED");
  // Adapter checkpoints immutable IDs before returning. It must never attach global services.
  const candidate = await panel.ensurePrivateCandidate({ context, operation, resource, supportedProtocols, configuration });
  if (candidate?.public !== false || candidate.resource?.id !== resource.id ||
      payloadHash([...candidate.supportedProtocols].sort()) !== payloadHash([...supportedProtocols].sort()) ||
      candidate.operation?.id !== operation.id || candidate.operation?.fence !== operation.fence) throw infrastructureError("CANDIDATE_REGISTRATION_INVALID");
  for (const entry of [candidate.node, ...(candidate.inbounds || []), ...(candidate.hosts || []), ...(candidate.privateServices || [])]) {
    await assertResourceOwnership({ context, resource: entry, operation });
  }
  if (!candidate.inbounds?.length || !candidate.hosts?.length || !candidate.privateServices?.length ||
      candidate.privateServices.some(service => service.id === context.publicServiceId)) throw infrastructureError("CANDIDATE_REGISTRATION_INVALID");
  return candidate;
}

export async function publishCandidate({ context, lease, candidate, proof, panel, repository }) {
  assertCandidateVerification({ context, candidate, proof, lease });
  await assertResourceOwnership({ context, resource: candidate.resource, operation: lease });
  await assertResourceOwnership({ context, resource: candidate.node, operation: lease });
  await assertResourceOwnership({ context, resource: candidate.publicService, operation: lease });
  if (!context.publicServiceId || candidate.publicService.id !== context.publicServiceId) throw infrastructureError("RESOURCE_SCOPE_MISMATCH");
  for (const method of ["withServiceLock", "readService", "appendEndpoint"]) if (typeof panel?.[method] !== "function") throw infrastructureError("PANEL_ADAPTER_UNAVAILABLE");
  if (typeof repository?.checkpointPublication !== "function" || typeof repository?.publishCandidate !== "function") throw infrastructureError("PUBLICATION_STORAGE_UNAVAILABLE");
  return panel.withServiceLock({ context, lease, serviceId: candidate.publicService.id }, async () => {
    const before = await panel.readService({ context, serviceId: candidate.publicService.id });
    if (!Array.isArray(before?.endpoints) || before.version == null) throw infrastructureError("SERVICE_MEMBERSHIP_CHANGED");
    const existing = before.endpoints.find(endpoint => endpoint.id === candidate.endpoint.id);
    if (existing && payloadHash(existing) !== payloadHash(candidate.endpoint)) throw infrastructureError("SERVICE_MEMBERSHIP_CHANGED");
    await repository.checkpointPublication({ context, lease, candidate, expectedMembership: before });
    assertCandidateVerification({ context, candidate, proof, lease });
    await assertOperationAuthority(context, lease);
    if (!existing) await panel.appendEndpoint({ context, lease, serviceId: candidate.publicService.id, expectedVersion: before.version, endpoint: candidate.endpoint });
    const after = await panel.readService({ context, serviceId: candidate.publicService.id });
    if (!Array.isArray(after?.endpoints) || ![...before.endpoints, candidate.endpoint].every(endpoint =>
      after.endpoints.some(current => current.id === endpoint.id && payloadHash(current) === payloadHash(endpoint)))) throw infrastructureError("SERVICE_MEMBERSHIP_CHANGED");
    assertCandidateVerification({ context, candidate, proof, lease });
    await assertOperationAuthority(context, lease);
    // Fenced DB adapter owns readiness publication; no direct counter writes here.
    return repository.publishCandidate({ context, lease, candidate, proof });
  });
}
