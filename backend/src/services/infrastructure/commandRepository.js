import * as storage from "./repository.js";

export function createCommandRepository({ client } = {}) {
  const serverResource = (data, context) => ({ ...data, kind: "server", poolId: data.access_pool_id,
    databaseIdentity: context.databaseIdentity, panelIdentity: data.ownership_provenance?.panel_identity,
    addresses: data.ownership_provenance?.addresses || (data.host_ip ? [data.host_ip] : []) });
  const rpc = (input, name, params) => storage.callInfrastructureRpc({ ...input, client }, name, params);
  const result = Object.fromEntries(["claimOperation", "renewLease", "checkpoint", "releaseOperation", "readOperation"].map(name => [name, input => storage[name]({ ...input, client })]));
  return { ...result,
    readOperation: input => rpc(input, "read_server_operation_summary", { p_operation_id: input.operationId }),
    async getServer(input) {
      const db = client || (await import("../../lib/supabase.js")).supabase;
      const { data, error } = await db.from("vpn_servers").select("*,server_health_status(outline_api_status)").eq("id", input.serverId)
        .eq("environment", input.context.environment).eq("access_pool_id", input.context.poolId).maybeSingle();
      if (error || !data) throw storage.infrastructureError("RESOURCE_SCOPE_MISMATCH");
      return serverResource(data, input.context);
    },
    async listRetirementCandidates({ context }) {
      const db = client || (await import("../../lib/supabase.js")).supabase;
      const rows = [];
      for (let offset = 0; offset < 10000; offset += 500) {
        const { data, error } = await db.from('vpn_servers').select('*,server_health_status(outline_api_status)')
          .eq('environment', context.environment).eq('access_pool_id', context.poolId)
          .eq('status', 'active').eq('is_active', true).order('id').range(offset, offset + 499);
        if (error || !Array.isArray(data)) throw storage.infrastructureError('RETIREMENT_FALLBACK_UNAVAILABLE');
        rows.push(...data.map(row => serverResource(row, context)));
        if (data.length < 500) return rows;
      }
      throw storage.infrastructureError('RETIREMENT_FALLBACK_UNAVAILABLE');
    },
    storeQuote(input) {
      const { context, ...quote } = input;
      return rpc(input, "store_server_operation_quote", { p_quote_id: quote.id, p_body: quote, p_expires_at: quote.expiresAt });
    },
    getQuote: input => rpc(input, "read_server_operation_quote", { p_quote_id: input.quoteId }),
    findByIdempotencyKey: input => rpc(input, "find_server_operation_request", { p_idempotency_key: input.idempotencyKey }),
    createQuotedOperation: input => rpc(input, "create_quoted_server_operation", { p_quote_id: input.quoteId, p_kind: input.kind, p_idempotency_key: input.idempotencyKey,
      p_payload: input.payload, p_payload_hash: storage.payloadHash({ kind: input.kind, payload: input.payload }) }),
    listOperations: input => rpc(input, "list_server_operations", { p_limit: input.limit || 50, p_runnable_only: false, p_owner: null }),
    listRunnableOperations: input => rpc(input, "list_runnable_server_operations", { p_limit: input.limit ?? 10, p_owner: input.owner,
      p_after_created_at: input.cursor?.createdAt ?? null, p_after_id: input.cursor?.id ?? null }),
    requestControl: input => rpc(input, "request_server_operation_control", { p_operation_id: input.operationId, p_action: input.action }),
  };
}
