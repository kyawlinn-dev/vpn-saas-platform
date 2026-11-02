import { supabase } from "../lib/supabase.js";

const terminal = new Set(["completed", "cancelled", "failed"]);

/** Selection-only state: never disable listeners or change persisted server flags. */
export async function annotateServerMaintenance(servers = [], { client = supabase } = {}) {
  if (process.env.SERVER_LIFECYCLE_COORDINATION_ENABLED !== "true") return servers;
  const groups = new Map();
  for (const server of servers) {
    if (!server?.environment || !server.access_pool_id || !server.id) continue;
    const scope = JSON.stringify([server.environment, server.access_pool_id]);
    if (!groups.has(scope)) groups.set(scope, []);
    groups.get(scope).push(server);
  }
  const maintenance = new Set();
  for (const [scope, rows] of groups) {
    const [environment, poolId] = JSON.parse(scope);
    // Bounded pages keep PostgREST filters and response size below API limits.
    for (let offset = 0; offset < rows.length; offset += 200) {
      const keys = rows.slice(offset, offset + 200).map(row => `server:${row.id}`);
      const { data, error } = await client.from("server_operation_locks")
        .select("resource_key,operation:server_operations!inner(kind,status,payload)")
        .eq("environment", environment).eq("access_pool_id", poolId).in("resource_key", keys);
      if (error || !Array.isArray(data)) {
        throw Object.assign(new Error("Server maintenance status unavailable"), { code: "SERVER_MAINTENANCE_UNAVAILABLE" });
      }
      for (const lock of data) {
        const operation = lock.operation;
        if (!["replace", "move_retire"].includes(operation?.kind) || terminal.has(operation.status)) continue;
        if (lock.resource_key === `server:${operation.payload?.source_server_id}`) {
          maintenance.add(JSON.stringify([scope, operation.payload.source_server_id]));
        }
      }
    }
  }
  return servers.map(server => {
    if (!server?.environment || !server.access_pool_id || !server.id) return server;
    const scope = JSON.stringify([server.environment, server.access_pool_id]);
    return { ...server, under_maintenance: maintenance.has(JSON.stringify([scope, server.id])) };
  });
}
