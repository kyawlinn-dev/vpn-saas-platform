import express from "express";
import { supabase } from "../../lib/supabase.js";

const router = express.Router();

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

// GET /api/admin/overview
router.get("/overview", async (req, res) => {
  try {
    const [
      { count: activeOrders },
      { count: pendingOrders },
      { count: stoppedOrders },
      { count: activeKeys },
      { data: orderValues },
      { data: recentOrders },
    ] = await Promise.all([
      supabase.from("vpn_orders").select("*", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("vpn_orders").select("*", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("vpn_orders").select("*", { count: "exact", head: true }).eq("status", "stopped"),
      supabase.from("vpn_keys").select("*", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("vpn_orders").select("price_mmk"),
      supabase
        .from("vpn_orders")
        .select("*, customer:vpn_customers(id, full_name, telegram_username), plan:vpn_plans(id, name), reseller:resellers(id, name)")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const totalValue = (orderValues ?? []).reduce((s, o) => s + Number(o.price_mmk || 0), 0);

    return res.json({
      active_orders: activeOrders ?? 0,
      pending_orders: pendingOrders ?? 0,
      stopped_orders: stoppedOrders ?? 0,
      active_keys: activeKeys ?? 0,
      total_value_mmk: totalValue,
      recent_orders: recentOrders ?? [],
    });
  } catch (err) {
    console.error("admin GET overview crash:", err);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/customers
router.get("/customers", async (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req.query);
    const resellerId = req.query.reseller_id;

    let query = supabase
      .from("vpn_customers")
      .select("*, reseller:resellers(id, name)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (resellerId && resellerId !== "all") {
      query = query.eq("reseller_id", resellerId);
    }

    const { data, count, error } = await query;

    if (error) {
      console.error("admin GET customers error:", error);
      return res.status(500).json({ error: error.message });
    }
    return res.json({ data: data ?? [], total: count ?? 0, page, limit });
  } catch (err) {
    console.error("admin GET customers crash:", err);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/orders
router.get("/orders", async (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req.query);
    const status = req.query.status;
    const resellerId = req.query.reseller_id;

    let query = supabase
      .from("vpn_orders")
      .select(
        `*,
        customer:vpn_customers(id, full_name, telegram_username, phone),
        plan:vpn_plans(id, name, price_mmk, duration_days),
        reseller:resellers(id, name)`,
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status && status !== "all") {
      query = query.eq("status", status);
    }
    if (resellerId && resellerId !== "all") {
      query = query.eq("reseller_id", resellerId);
    }

    const { data, count, error } = await query;

    if (error) {
      console.error("admin GET orders error:", error);
      return res.status(500).json({ error: error.message });
    }
    return res.json({ data: data ?? [], total: count ?? 0, page, limit });
  } catch (err) {
    console.error("admin GET orders crash:", err);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/plans
router.get("/plans", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("vpn_plans")
      .select("*")
      .order("price_mmk", { ascending: true });

    if (error) {
      console.error("admin GET plans error:", error);
      return res.status(500).json({ error: error.message });
    }
    return res.json(data ?? []);
  } catch (err) {
    console.error("admin GET plans crash:", err);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/keys
router.get("/keys", async (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req.query);
    const status = req.query.status;
    const resellerId = req.query.reseller_id;

    let query = supabase
      .from("vpn_keys")
      .select("*, order:vpn_orders(id, status, payment_status)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status && status !== "all") {
      query = query.eq("status", status);
    }
    if (resellerId && resellerId !== "all") {
      query = query.eq("reseller_id", resellerId);
    }

    const { data, count, error } = await query;

    if (error) {
      console.error("admin GET keys error:", error);
      return res.status(500).json({ error: error.message });
    }
    return res.json({ data: data ?? [], total: count ?? 0, page, limit });
  } catch (err) {
    console.error("admin GET keys crash:", err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
