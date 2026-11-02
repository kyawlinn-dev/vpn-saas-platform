// Public-mode SS trials and purchases share the same verified pool policy.
// Legacy mode retains paid-only switching. Resellers handle customer notices.

import express from "express";
import { supabase } from "../../lib/supabase.js";
import { switchOrderServer } from "../../services/subscriptionProvisionService.js";
import { serverDisplay } from "../../services/serverDisplay.js";
import { resolveServerAccessContext } from "../../services/serverAccessContext.js";
import { evaluateServerAccess } from "../../services/serverAccessPolicy.js";
import { accessDateOnly } from "../../utils/businessTime.js";
import { annotateServerMaintenance } from "../../services/serverMaintenanceService.js";

const router = express.Router();

async function loadSwitchableActiveOrder(orderId, resellerId, accessContext) {
  const { data: order, error } = await supabase
    .from("vpn_orders")
    .select(`
      id, customer_id, reseller_id, plan_id, status, order_type, expiry_date,
      customer:vpn_customers!vpn_orders_customer_id_fkey(id, full_name),
      plan:vpn_plans(id, name, data_limit_gb, is_trial)
    `)
    .eq("id", orderId)
    .eq("reseller_id", resellerId)
    .maybeSingle();

  if (error) throw error;
  if (!order) return { order: null, reason: "ORDER_NOT_FOUND" };
  if (order.status !== "active") return { order: null, reason: "ORDER_NOT_ACTIVE" };
  if (accessContext?.publicAccessEnabled && (!order.expiry_date || order.expiry_date < accessDateOnly())) return { order: null, reason: "ORDER_EXPIRED" };
  if (!accessContext?.publicAccessEnabled && (order.order_type === "trial" || order.plan?.is_trial)) {
    return { order: null, reason: "TRIAL_ORDERS_NOT_ELIGIBLE" };
  }
  return { order, reason: null };
}

async function loadCurrentActiveKey(orderId, resellerId) {
  const { data, error } = await supabase
    .from("vpn_keys")
    .select("id, server_id, outline_key_id, status, protocol")
    .eq("order_id", orderId)
    .eq("reseller_id", resellerId)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

// GET /api/reseller/orders/:orderId/eligible-servers
// All active, healthy servers with spare capacity — any tier, any region —
// excluding the order's current server. Health filter: outline_api_status
// must not be 'failed' (server_health_status row may not exist yet for a
// brand-new server, in which case we don't exclude it — "unknown" is not
// the same as "failed").
router.get("/:orderId/eligible-servers", async (req, res) => {
  const resellerId = req.reseller.id;
  const { orderId } = req.params;

  try {
    const accessContext = await resolveServerAccessContext();
    const { order, reason } = await loadSwitchableActiveOrder(orderId, resellerId, accessContext);
    if (!order) {
      const status = reason === "ORDER_NOT_FOUND" ? 404 : 400;
      return res.status(status).json({ error: reason });
    }

    // The active key defines the live protocol; preference is only for future keys.
    const currentKey = await loadCurrentActiveKey(orderId, resellerId);
    const protocol = currentKey?.protocol || "shadowsocks";
    if (protocol !== "shadowsocks") {
      return res.status(400).json({
        error: "PROTOCOL_NO_SWITCH",
        message: `${protocol.toUpperCase()} subscriptions include all servers automatically. No switch needed — the customer's app can connect to any server.`,
      });
    }

    const { data: servers, error } = await supabase
      .from("vpn_servers")
      .select(accessContext.publicAccessEnabled ? "*,server_health_status(outline_api_status)" :
        "id, name, region, region_code, display_country, display_city, flag_emoji, " +
          "server_tier, current_active_keys, max_active_keys, " +
          "server_health_status(outline_api_status)"
      )
      .eq("status", "active")
      .order("current_active_keys", { ascending: true });

    if (error) throw error;

    // Same city/country/flag fallback the miniapp uses (mapServerForMiniApp
    // in resellerMiniappRoutes.js) — falls back to the server's DigitalOcean
    // region when display_country/display_city/flag_emoji aren't set.
    const visibleServers = await annotateServerMaintenance(servers || []);
    const toDisplayServer = (s) => {
      const display = serverDisplay(s);
      return {
        id: s.id,
        name: display.name,
        region: s.region,
        region_code: s.region_code,
        display_country: display.country || s.region,
        display_city: display.city,
        flag_emoji: display.flag,
        server_tier: s.server_tier || "premium",
        under_maintenance: s.under_maintenance === true,
      };
    };

    const currentServerRow = currentKey?.server_id
      ? visibleServers.find((s) => s.id === currentKey.server_id)
      : null;

    const eligible = visibleServers
      .filter(s => !s.under_maintenance)
      .filter((s) => s.id !== currentKey?.server_id)
      .filter(s => !accessContext.publicAccessEnabled || evaluateServerAccess({ server: s, protocol,
        orderType: order.order_type, environment: accessContext.environment, poolId: accessContext.poolId, purpose: "switch" }).allowed)
      .filter((s) => {
        const capacity = Number(s.max_active_keys || 0) - Number(s.current_active_keys || 0);
        return capacity > 0;
      })
      .filter((s) => {
        const health = Array.isArray(s.server_health_status)
          ? s.server_health_status[0]
          : s.server_health_status;
        return health?.outline_api_status !== "failed";
      })
      .map((s) => ({
        ...toDisplayServer(s),
        remaining_capacity: Number(s.max_active_keys || 0) - Number(s.current_active_keys || 0),
      }));

    return res.json({
      current_server_id: currentKey?.server_id || null,
      current_server: currentServerRow ? toDisplayServer(currentServerRow) : null,
      servers: eligible,
    });
  } catch (err) {
    console.error("GET /reseller/orders/:orderId/eligible-servers error:", err);
    return res.status(500).json({ error: "Failed to load eligible servers" });
  }
});

// POST /api/reseller/orders/:orderId/switch-server
// Body: { new_server_id }
router.post("/:orderId/switch-server", async (req, res) => {
  const resellerId = req.reseller.id;
  const { orderId } = req.params;
  const { new_server_id: newServerId } = req.body || {};

  if (!newServerId || typeof newServerId !== "string") {
    return res.status(400).json({ error: "new_server_id is required" });
  }

  try {
    const accessContext = await resolveServerAccessContext();
    const { order, reason } = await loadSwitchableActiveOrder(orderId, resellerId, accessContext);
    if (!order) {
      const status = reason === "ORDER_NOT_FOUND" ? 404 : 400;
      return res.status(status).json({ error: reason });
    }

    const currentKey = await loadCurrentActiveKey(orderId, resellerId);
    const protocol = currentKey?.protocol || "shadowsocks";
    if (protocol !== "shadowsocks") {
      return res.status(400).json({
        error: "PROTOCOL_NO_SWITCH",
        message: `${protocol.toUpperCase()} subscriptions include all servers automatically. No switch needed.`,
      });
    }

    if (!currentKey) {
      return res.status(400).json({ error: "NO_ACTIVE_KEY" });
    }
    if (currentKey.server_id === newServerId) {
      return res.status(400).json({ error: "SAME_SERVER" });
    }

    const { data: newServer, error: serverErr } = await supabase
      .from("vpn_servers")
      .select(accessContext.publicAccessEnabled ? "*,server_health_status(outline_api_status)" :
        "id, name, region, server_tier, panel_type, panel_url, panel_username, panel_password_encrypted, " +
          "marzneshin_service_ids, marzneshin_vless_service_ids, " +
          "current_active_keys, max_active_keys, status, " +
          "server_health_status(outline_api_status)"
      )
      .eq("id", newServerId)
      .maybeSingle();

    if (serverErr) throw serverErr;
    if (!newServer || newServer.status !== "active") {
      return res.status(400).json({ error: "SERVER_NOT_AVAILABLE" });
    }
    Object.assign(newServer, (await annotateServerMaintenance([newServer]))[0]);
    if (newServer.under_maintenance) return res.status(409).json({ error: "SERVER_UNDER_MAINTENANCE" });
    if (accessContext.publicAccessEnabled) {
      const decision = evaluateServerAccess({ server: newServer, protocol, orderType: order.order_type,
        environment: accessContext.environment, poolId: accessContext.poolId, purpose: "switch" });
      if (!decision.allowed) return res.status(409).json({ error: decision.code });
    }

    const health = Array.isArray(newServer.server_health_status)
      ? newServer.server_health_status[0]
      : newServer.server_health_status;
    if (health?.outline_api_status === "failed") {
      return res.status(400).json({ error: "SERVER_UNHEALTHY" });
    }

    const capacity = Number(newServer.max_active_keys || 0) - Number(newServer.current_active_keys || 0);
    if (capacity <= 0) {
      return res.status(400).json({ error: "SERVER_FULL" });
    }

    if (!newServer.panel_url || !newServer.panel_username) {
      return res.status(500).json({ error: "SERVER_CONFIG_MISSING" });
    }

    // migrateActiveOrderToServer expects order.customer/order.plan for key
    // naming + data limit, already loaded with reseller ownership checks.
    const orderForMigration = {
      ...order,
      customer: order.customer,
      plan: order.plan,
    };

    // Only SS orders reach here (VLESS/Hysteria2 blocked above).
    const newKey = await switchOrderServer({
      order: orderForMigration,
      newServer,
      oldKey: currentKey,
      accessContext,
    });

    return res.json({
      ok: true,
      new_server: {
        id: newServer.id,
        name: newServer.name,
        region: newServer.region,
        server_tier: newServer.server_tier,
      },
      key_id: newKey.id,
    });
  } catch (err) {
    console.error("POST /reseller/orders/:orderId/switch-server error:", err);
    if (err.code === "DATA_LIMIT_REACHED") {
      return res.status(409).json({ error: "DATA_LIMIT_REACHED" });
    }
    return res.status(500).json({ error: "Failed to switch server" });
  }
});

export default router;
