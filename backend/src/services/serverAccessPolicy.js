const ENVIRONMENTS = new Set(["development", "production"]);
const ORDER_TYPES = new Set(["trial", "purchase"]);
const PURPOSES = new Set(["assign", "switch", "display"]);
const OWNERSHIP_METHODS = new Set(["adopted", "provisioned"]);

const positiveId = value => Number.isSafeInteger(value) && value > 0;
const nonemptyString = value => typeof value === "string" && value.trim().length > 0;
const result = code => ({ allowed: code === null, code });

export class ServerAccessPolicyError extends Error {
  constructor(code) {
    super(code);
    this.name = "ServerAccessPolicyError";
    this.code = code;
  }
}

function ownedByScope(server, environment, poolId) {
  const owner = server?.ownership_provenance;
  return ENVIRONMENTS.has(environment) && nonemptyString(poolId) &&
    server?.environment === environment && server.access_pool_id === poolId &&
    positiveId(server.panel_node_id) && owner && OWNERSHIP_METHODS.has(owner.method) &&
    owner.environment === environment && owner.access_pool_id === poolId &&
    owner.panel_node_id === server.panel_node_id && nonemptyString(owner.panel_identity) &&
    typeof owner.verified_at === "string" && Number.isFinite(Date.parse(owner.verified_at));
}

function supports(server, protocol) {
  const protocols = server?.supported_protocols;
  if (!Array.isArray(protocols)) return false;
  const valid = (protocols.length === 1 && protocols[0] === "vless") ||
    (protocols.length === 2 && protocols.includes("shadowsocks") && protocols.includes("vless"));
  return valid && protocols.includes(protocol);
}

function ssServices(server) {
  const ids = server?.marzneshin_service_ids;
  const registered = server?.ownership_provenance?.ss_service_ids;
  if (!Array.isArray(ids) || ids.length !== 1 || !positiveId(ids[0]) ||
      !Array.isArray(registered) || registered.length !== 1 || registered[0] !== ids[0]) {
    throw new ServerAccessPolicyError("SERVICE_CONFIGURATION_INVALID");
  }
  return [...ids];
}

/** Public access differs by protocol and scope, not the package's trial/paid tier. */
export function evaluateServerAccess({ server, protocol, orderType, environment, poolId, purpose = "assign" }) {
  if (!ownedByScope(server, environment, poolId)) return result("RESOURCE_SCOPE_MISMATCH");
  if (!ORDER_TYPES.has(orderType)) return result("ORDER_TYPE_INVALID");
  if (!PURPOSES.has(purpose)) return result("ACCESS_PURPOSE_INVALID");
  if (!supports(server, protocol)) return result("PROTOCOL_UNSUPPORTED");
  if (server.under_maintenance === true) return result("SERVER_UNDER_MAINTENANCE");
  const health = Array.isArray(server.server_health_status) ? server.server_health_status[0] : server.server_health_status;
  if (server.panel_type !== "marzneshin" || server.status !== "active" || server.is_active !== true ||
      health?.outline_api_status !== "healthy") return result("SERVER_UNAVAILABLE");
  if (protocol === "shadowsocks") {
    try { ssServices(server); } catch (error) { return result(error.code); }
  }
  if (purpose !== "display") {
    const current = server.current_active_keys;
    const max = server.max_active_keys;
    if (!Number.isSafeInteger(current) || current < 0 || !positiveId(max)) return result("SERVER_CAPACITY_INVALID");
    if (current >= max) return result("SERVER_FULL");
  }
  return result(null);
}

/** Resolve only verified services; legacy trial/global columns are never a fallback. */
export function selectServiceIds({ server, protocol, pool }) {
  if (!pool || !ownedByScope(server, pool.environment, pool.id) ||
      pool.panel_identity !== server.ownership_provenance.panel_identity) {
    throw new ServerAccessPolicyError("RESOURCE_SCOPE_MISMATCH");
  }
  if (!supports(server, protocol)) throw new ServerAccessPolicyError("PROTOCOL_UNSUPPORTED");
  if (protocol === "shadowsocks") return ssServices(server);
  if (!positiveId(pool.vless_service_id)) throw new ServerAccessPolicyError("SERVICE_CONFIGURATION_INVALID");
  return [pool.vless_service_id];
}
