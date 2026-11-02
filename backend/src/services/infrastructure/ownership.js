import { infrastructureError, payloadHash } from "./repository.js";
import { isInfrastructureContext } from "./context.js";

export async function assertOperationAuthority(context, operation) {
  if (!isInfrastructureContext(context) || !operation?.id) throw infrastructureError("RESOURCE_SCOPE_MISMATCH");
  let valid = false;
  try { valid = await context.adapters.assertOperationLease({ context, operation }); } catch { /* Fail closed without external error contents. */ }
  if (valid !== true) throw infrastructureError("STALE_FENCE");
}

export async function assertResourceOwnership({ context, resource, operation }) {
  await assertOperationAuthority(context, operation);
  return assertResourceRegistration({ context, resource });
}

/** Customer access to an adopted shared node never grants infrastructure ownership. */
export async function assertDestinationRegistration({ context, resource }) {
  if (resource?.lifecycle_protected !== true) return assertResourceRegistration({ context, resource });
  const fail = () => { throw infrastructureError('RESOURCE_SCOPE_MISMATCH'); };
  if (!isInfrastructureContext(context) || context.environment !== 'development' || resource.kind !== 'server' ||
      resource.provider_resource_id !== null || resource.ownership_provenance?.method !== 'adopted' ||
      resource.ownership_provenance.purpose !== 'owner_authorized_shared_node_customer_access') fail();
  const registered = await context.registry.getResource({kind:'server',id:resource.id});
  if (!registered || registered.protected !== true || registered.method !== 'owner_authorized_access_adoption' ||
      !registered.manifestHash || registered.manifestHash !== resource.ownership_provenance.manifest_hash ||
      registered.provider_resource_id !== null || registered.panel_node_id !== resource.panel_node_id ||
      !['id','kind','environment','databaseIdentity','panelIdentity','poolId'].every(key => registered[key] === resource[key]) ||
      !['environment','databaseIdentity','panelIdentity','poolId'].every(key => resource[key] === context[key]) ||
      payloadHash(registered.addresses) !== payloadHash([resource.host_ip]) ||
      payloadHash([...(registered.supported_protocols || [])].sort()) !== payloadHash([...(resource.supported_protocols || [])].sort())) fail();
  return registered;
}

export async function assertDestinationOwnership(input) {
  await assertOperationAuthority(input.context, input.operation);
  return assertDestinationRegistration(input);
}

/** Read-only ownership inspection for quotes; does not grant mutation authority. */
export async function assertResourceRegistration({ context, resource }) {
  if (!isInfrastructureContext(context)) throw infrastructureError("RESOURCE_SCOPE_MISMATCH");
  if (!resource?.id || !resource.kind) throw infrastructureError("RESOURCE_SCOPE_MISMATCH");
  if (resource.protected === true || context.protectedResourceIds.includes(resource.id) ||
      resource.addresses?.some(address => context.protectedAddresses.includes(address))) throw infrastructureError("PROTECTED_RESOURCE");
  let registered;
  try { registered = await context.registry.getResource({ kind: resource.kind, id: resource.id, provider: resource.provider }); }
  catch { throw infrastructureError("OWNERSHIP_REGISTRY_UNAVAILABLE"); }
  if (registered?.protected === true) throw infrastructureError("PROTECTED_RESOURCE");
  if (!registered || !["environment", "databaseIdentity", "panelIdentity", "poolId"].every(key => registered[key] === context[key]) ||
      !["id", "kind", "environment", "databaseIdentity", "panelIdentity", "poolId"].every(key => resource[key] === registered[key])) throw infrastructureError("RESOURCE_SCOPE_MISMATCH");
  for (const key of ["panel_node_id", "provider_resource_id", "addresses", "supported_protocols"]) {
    if (registered[key] === undefined) continue;
    const normalize = value => Array.isArray(value) ? [...value].sort() : value ?? null;
    if (payloadHash(normalize(resource[key])) !== payloadHash(normalize(registered[key]))) throw infrastructureError("RESOURCE_SCOPE_MISMATCH");
  }
  if (resource.sshHostKeySha256 && registered.sshHostKeySha256 !== resource.sshHostKeySha256) throw infrastructureError("RESOURCE_SCOPE_MISMATCH");
  if (resource.kind === "provider" && (!resource.createdAt ||
      !["provider", "accountId", "createdAt"].every(key => resource[key] === registered[key]) ||
      resource.accountId !== context.providerAccounts[resource.provider])) throw infrastructureError("RESOURCE_SCOPE_MISMATCH");
  return registered;
}
