import { supabase } from "../lib/supabase.js";
import { ServerAccessPolicyError } from "./serverAccessPolicy.js";

export const isPublicServerAccessEnabled = () => process.env.PUBLIC_SERVER_ACCESS_ENABLED === "true";

export function validateServerAccessContext(context) {
  const pool = context?.pool;
  if (context?.publicAccessEnabled !== true || !["development", "production"].includes(context.environment) ||
      typeof context.poolId !== "string" || !context.poolId || pool?.id !== context.poolId ||
      pool.environment !== context.environment || typeof pool.panel_identity !== "string" || !pool.panel_identity.trim() ||
      !Number.isSafeInteger(pool.vless_service_id) || pool.vless_service_id <= 0) {
    throw new ServerAccessPolicyError("RESOURCE_SCOPE_MISMATCH");
  }
  return context;
}

/** Resolve configuration inside the backend; never populate this from request bodies. */
export async function resolveServerAccessContext(context) {
  if (context !== undefined) {
    if (context?.publicAccessEnabled === false) return { publicAccessEnabled: false };
    return validateServerAccessContext(context);
  }
  if (!isPublicServerAccessEnabled()) return { publicAccessEnabled: false };
  const environment = process.env.SERVER_ACCESS_ENVIRONMENT;
  const databaseIdentity = process.env.SERVER_ACCESS_DATABASE_IDENTITY;
  const panelIdentity = process.env.SERVER_ACCESS_PANEL_IDENTITY;
  const poolId = process.env.SERVER_ACCESS_POOL_ID;
  if (!["development", "production"].includes(environment) || !databaseIdentity || !panelIdentity || !poolId) {
    throw new ServerAccessPolicyError("PUBLIC_ACCESS_CONTEXT_REQUIRED");
  }
  let actualDatabase;
  try { actualDatabase = new URL(process.env.SUPABASE_URL).hostname; } catch { /* Invalid config fails closed below. */ }
  if (actualDatabase !== databaseIdentity) throw new ServerAccessPolicyError("RESOURCE_SCOPE_MISMATCH");
  const { data: pool, error } = await supabase.from("server_access_pools")
    .select("id,environment,panel_identity,vless_service_id")
    .eq("id", poolId).eq("environment", environment).eq("panel_identity", panelIdentity).maybeSingle();
  if (error || !pool) throw new ServerAccessPolicyError("PUBLIC_ACCESS_POOL_UNAVAILABLE");
  return validateServerAccessContext({ publicAccessEnabled: true, environment, poolId, pool });
}
