/**
 * resellerCustomersRouter.js
 * Mounted at: /api/reseller/customers
 * Protected by requireTrustedOrigin + requireAuth + requireActiveReseller (server.js).
 * One aggregate row per customer: profile + order history + active-key usage view.
 */
import express from "express";
import { supabase } from "../../lib/supabase.js";
import { buildKeyUsageView, getOutlineMetricsForServer } from "../../services/outlineMetricsService.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const reseller = req.reseller;

    // 1) customers for this reseller
    const { data: customers, error: custErr } = await supabase
      .from("vpn_customers")
      .select("id, full_name, telegram_username, phone, status, notes, created_at")
      .eq("reseller_id", reseller.id)
      .order("created_at", { ascending: false });
    if (custErr) { console.error("GET /reseller/customers customers query:", custErr); return res.status(500).json({ error: "Failed to load customers" }); }
    const customerRows = customers ?? [];
    if (customerRows.length === 0) return res.json([]);

    // 2) orders (with plan), newest first, grouped by customer
    const { data: orders, error: ordErr } = await supabase
      .from("vpn_orders")
      .select(`
        id, customer_id, status, payment_status, review_status, order_type, source,
        price_mmk, start_date, expiry_date, payment_note, payment_screenshot_url, created_at,
        plan:vpn_plans ( id, name, price_mmk, duration_days, data_limit_gb, max_devices )
      `)
      .eq("reseller_id", reseller.id)
      .order("created_at", { ascending: false });
    if (ordErr) { console.error("GET /reseller/customers orders query:", ordErr); return res.status(500).json({ error: "Failed to load orders" }); }
    const ordersByCustomer = {};
    for (const o of orders ?? []) { (ordersByCustomer[o.customer_id] ??= []).push(o); }

    // 3) active keys (usage source), newest first
    const { data: keys, error: keyErr } = await supabase
      .from("vpn_keys")
      .select("id, customer_id, order_id, server_id, outline_key_id, data_limit_bytes, access_url, key_name, status, created_at")
      .eq("reseller_id", reseller.id)
      .eq("status", "active")
      .order("created_at", { ascending: false });
    if (keyErr) { console.error("GET /reseller/customers keys query:", keyErr); return res.status(500).json({ error: "Failed to load keys" }); }
    const activeKeys = keys ?? [];

    // batch servers + concurrent metrics (same as resellerKeysRouter)
    const serverIds = [...new Set(activeKeys.map((k) => k.server_id).filter(Boolean))];
    let serversById = {};
    if (serverIds.length) {
      const { data: servers, error: srvErr } = await supabase
        .from("vpn_servers").select("id, name, host_ip, status").in("id", serverIds);
      if (srvErr) console.error("GET /reseller/customers servers query (non-fatal):", srvErr);
      else serversById = Object.fromEntries((servers ?? []).map((s) => [s.id, s]));
    }
    const metricsByServerId = Object.fromEntries(
      await Promise.all(
        Object.values(serversById)
          .filter((s) => s?.status === "active" && s?.host_ip)
          .map(async (s) => [s.id, await getOutlineMetricsForServer(s.host_ip)])
      )
    );

    // most-recent active key per customer → usage view
    const activeKeyByCustomer = {};
    for (const key of activeKeys) {
      if (activeKeyByCustomer[key.customer_id]) continue;
      const server = key.server_id ? serversById[key.server_id] : null;
      const metrics = server?.id && key?.outline_key_id
        ? (metricsByServerId?.[server.id]?.[String(key.outline_key_id)] ?? {})
        : {};
      activeKeyByCustomer[key.customer_id] = buildKeyUsageView(
        { ...key, server: server ? { id: server.id, name: server.name, status: server.status } : null },
        metrics
      );
    }

    // 4) assemble
    const result = customerRows.map((c) => {
      const custOrders = ordersByCustomer[c.id] ?? [];
      const activeKey = activeKeyByCustomer[c.id] ?? null;
      const activeOrder =
        (activeKey?.order_id && custOrders.find((o) => o.id === activeKey.order_id)) ||
        custOrders.find((o) => o.status === "active") ||
        custOrders[0] || null;

      return {
        id: c.id,
        full_name: c.full_name,
        telegram_username: c.telegram_username,
        phone: c.phone,
        status: c.status,
        notes: c.notes,
        created_at: c.created_at,
        current_plan_name: activeOrder?.plan?.name ?? null,
        access_status: activeOrder?.status ?? null,
        current_server: activeKey?.server?.name ?? null,
        used_gb_30d: activeKey?.used_gb_30d ?? null,
        remaining_gb_30d: activeKey?.remaining_gb_30d ?? null,
        data_limit_gb: activeKey?.data_limit_gb ?? null,
        recent_connections_24h: activeKey?.recent_connections_24h ?? 0,
        access_url: activeKey?.access_url ?? null,
        order_count: custOrders.length,
        active_order_count: custOrders.filter((o) => o.status === "active").length,
        pending_review_count: custOrders.filter((o) => o.review_status === "pending_review").length,
        orders: custOrders,
      };
    });

    return res.json(result);
  } catch (err) {
    console.error("GET /api/reseller/customers crash:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
