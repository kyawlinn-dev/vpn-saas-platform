import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { callInfrastructureRpc, infrastructureError, payloadHash } from "./repository.js";

const activeMutation = new AsyncLocalStorage();
export async function registerCreatedCustomerUser({ server, created }) {
  const state = activeMutation.getStore();
  if (!state) {
    if (process.env.SERVER_LIFECYCLE_COORDINATION_ENABLED === "true") throw infrastructureError("CUSTOMER_MUTATION_GUARD_REQUIRED");
    return;
  }
  if (!state.resources.has(`server:${server?.id}`) || !created?.outline_key_id || !created._marzneshin_meta?.subscription_key) throw infrastructureError("RESOURCE_SCOPE_MISMATCH");
  await callInfrastructureRpc(state, "register_server_customer_user", { p_guard_id: state.id, p_server_id: server.id,
    p_username: created.outline_key_id, p_subscription_key_hash: payloadHash(created._marzneshin_meta.subscription_key) });
}
async function runtimeContext() {
  const { resolveServerAccessContext } = await import("../serverAccessContext.js");
  const access = await resolveServerAccessContext();
  if (!access.publicAccessEnabled) throw infrastructureError("RESOURCE_SCOPE_MISMATCH");
  return { environment: access.environment, poolId: access.poolId, panelIdentity: access.pool.panel_identity,
    databaseIdentity: process.env.SERVER_ACCESS_DATABASE_IDENTITY };
}

/** Hold the whole customer saga, including external calls, against lifecycle drains. */
export async function withCustomerInfrastructureMutation(input, action) {
  const parent = activeMutation.getStore();
  if (!parent && !input.context && process.env.SERVER_LIFECYCLE_COORDINATION_ENABLED !== "true") return action();
  const state = parent || { context: input.context || await runtimeContext(), client: input.client, id: randomUUID(), resources: new Set() };
  if (input.context && JSON.stringify(input.context) !== JSON.stringify(state.context)) throw infrastructureError("RESOURCE_SCOPE_MISMATCH");
  for (const id of input.orderIds || []) if (id) state.resources.add(`order:${id}`);
  for (const id of input.serverIds || []) if (id) state.resources.add(`server:${id}`);
  await callInfrastructureRpc(state, "acquire_server_customer_mutation", { p_guard_id: state.id,
    p_resource_keys: [...state.resources].sort(), p_reseller_id: input.resellerId || null });
  if (parent) return action();
  let uncertain = true;
  try {
    const result = await activeMutation.run(state, action);
    uncertain = false;
    const finished = await callInfrastructureRpc(state, "finish_server_customer_mutation", { p_guard_id: state.id, p_uncertain: false });
    if (finished !== true) throw infrastructureError("CUSTOMER_MUTATION_RECONCILIATION_REQUIRED");
    return result;
  } finally {
    if (uncertain) {
      // Failure to save uncertainty must never release the durable guard.
      await callInfrastructureRpc(state, "finish_server_customer_mutation", { p_guard_id: state.id, p_uncertain: true }).catch(() => {});
    }
  }
}
