import { evaluateServerAccess } from "./serverAccessPolicy.js";

export function getMiniAppServerAccessState({ activeOrder, server, allowedRegions = [], protocol = "shadowsocks", purpose = "switch", accessContext }) {
  if (server?.under_maintenance === true) return { canAccess: false, reason: "SERVER_UNDER_MAINTENANCE", requiredTier: null };
  if (!activeOrder) return { canAccess: false, reason: "NO_ACTIVE_PACKAGE", requiredTier: null };
  if (accessContext?.publicAccessEnabled) {
    const decision = evaluateServerAccess({ server, protocol, orderType: activeOrder.order_type,
      environment: accessContext.environment, poolId: accessContext.poolId, purpose });
    return { canAccess: decision.allowed, reason: decision.code, requiredTier: null };
  }
  const requiredTier = activeOrder.order_type === "trial" || activeOrder.vpn_plans?.is_trial ? "trial" : "premium";
  if (requiredTier === "premium") return { canAccess: true, reason: null, requiredTier };
  if (server?.server_tier !== "trial") return { canAccess: false, reason: "TRIAL_CANNOT_USE_PREMIUM", requiredTier };
  const regions = allowedRegions.map(region => String(region || "").trim().toLowerCase()).filter(Boolean);
  if (regions.length && !regions.includes(String(server?.region || "").trim().toLowerCase())) {
    return { canAccess: false, reason: "REGION_NOT_ALLOWED", requiredTier };
  }
  return { canAccess: true, reason: null, requiredTier };
}

export function isCurrentMiniAppServer({ key, order, server, canAccess, accessContext }) {
  if (!key?.server_id) return false;
  if (key.server_id === server?.id) return true;

  if (key.protocol === "vless" && accessContext?.publicAccessEnabled) {
    return Boolean(canAccess && server?.environment === accessContext.environment &&
      server?.access_pool_id === accessContext.poolId && server.supported_protocols?.includes("vless"));
  }

  if (key.protocol === "vless" && order?.order_type === "purchase") {
    return Boolean(canAccess && server?.marzneshin_vless_service_ids?.length);
  }

  return key.server_id === server?.id;
}
