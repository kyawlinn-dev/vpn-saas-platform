// Reseller-initiated server switching for PAID orders only.
//
// Business rule (2026-08): paid customers may connect to ANY active,
// healthy server with spare capacity — trial-tier included, any region.
// This mirrors the relaxed access rule in resellerMiniappRoutes.js
// (getMiniAppServerAccessState) so a reseller can manually move a customer
// during an outage even to a trial server that happens to have room.
// Trial orders are never eligible for this feature — trial customers stay
// on trial-tier servers via the normal miniapp flow.
//
// No rate limit, no automatic customer notification — reseller handles
// communication themselves (per user 2026-08-16 decision).

import express from "express";
import { supabase } from "../../lib/supabase.js";
import { switchOrderServer } from "../../services/subscriptionProvisionService.js";
import { getRegionLocation } from "../../constants/doRegions.js";

const router = express.Router();

async function loadPaidActiveOrder(orderId, resellerId) {
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
  if (order.order_type === "trial" || order.plan?.is_trial) {
    return { order: null, reason: "TRIAL_ORDERS_NOT_ELIGIBLE" };
  }
  return { order, reason: null };
}

async function loadCurrentActiveKey(orderId) {
  const { data, error } = await supabase
    .from("vpn_keys")
    .select("id, server_id, outline_key_id, status")
    .eq("order_id", orderId)
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
    const { order, reason } = await loadPaidActiveOrder(orderId, resellerId);
    if (!order) {
      const status = reason === "ORDER_NOT_FOUND" ? 404 : 400;
      return res.status(status).json({ error: reason });
    }

    const currentKey = await loadCurrentActiveKey(orderId);

    const { data: servers, error } = await supabase
      .from("vpn_servers")
      .select(
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
    const toDisplayServer = (s) => {
      const loc = getRegionLocation(s.region);
      return {
        id: s.id,
        name: s.name,
        region: s.region,
        region_code: s.region_code,
        display_country: s.display_country || loc?.country || s.region,
        display_city: s.display_city || loc?.city || s.name,
        flag_emoji: s.flag_emoji || loc?.flag || "🌐",
        server_tier: s.server_tier || "premium",
      };
    };

    const currentServerRow = currentKey?.server_id
      ? (servers || []).find((s) => s.id === currentKey.server_id)
      : null;

    const eligible = (servers || [])
      .filter((s) => s.id !== currentKey?.server_id)
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
    const { order, reason } = await loadPaidActiveOrder(orderId, resellerId);
    if (!order) {
      const status = reason === "ORDER_NOT_FOUND" ? 404 : 400;
      return res.status(status).json({ error: reason });
    }

    const currentKey = await loadCurrentActiveKey(orderId);
    if (!currentKey) {
      return res.status(400).json({ error: "NO_ACTIVE_KEY" });
    }
    if (currentKey.server_id === newServerId) {
      return res.status(400).json({ error: "SAME_SERVER" });
    }

    const { data: newServer, error: serverErr } = await supabase
      .from("vpn_servers")
      .select(
        "id, name, region, server_tier, outline_api_url, outline_cert_sha256, " +
          "current_active_keys, max_active_keys, status, " +
          "server_health_status(outline_api_status)"
      )
      .eq("id", newServerId)
      .maybeSingle();

    if (serverErr) throw serverErr;
    if (!newServer || newServer.status !== "active") {
      return res.status(400).json({ error: "SERVER_NOT_AVAILABLE" });
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

    if (!newServer.outline_api_url || !newServer.outline_cert_sha256) {
      return res.status(500).json({ error: "SERVER_CONFIG_MISSING" });
    }

    // migrateActiveOrderToServer expects order.customer/order.plan for key
    // naming + data limit — already loaded by loadPaidActiveOrder.
    const orderForMigration = {
      ...order,
      customer: order.customer,
      plan: order.plan,
    };

    const newKey = await switchOrderServer({
      order: orderForMigration,
      newServer,
      oldKey: currentKey,
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
    return res.status(500).json({ error: "Failed to switch server" });
  }
});

export default router;
