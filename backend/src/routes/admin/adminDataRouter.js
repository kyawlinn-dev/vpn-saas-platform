import express from "express";
import { supabase } from "../../lib/supabase.js";

const router = express.Router();

// GET /api/admin/customers
router.get("/customers", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("vpn_customers")
      .select("*, reseller:resellers(id, name)")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("admin GET customers error:", error);
      return res.status(500).json({ error: error.message });
    }
    return res.json(data ?? []);
  } catch (err) {
    console.error("admin GET customers crash:", err);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/orders
router.get("/orders", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("vpn_orders")
      .select(`
        *,
        customer:vpn_customers(id, full_name, telegram_username, phone),
        plan:vpn_plans(id, name, price_mmk, duration_days),
        reseller:resellers(id, name)
      `)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("admin GET orders error:", error);
      return res.status(500).json({ error: error.message });
    }
    return res.json(data ?? []);
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
    const { data, error } = await supabase
      .from("vpn_keys")
      .select("*, order:vpn_orders(id, status, payment_status)")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("admin GET keys error:", error);
      return res.status(500).json({ error: error.message });
    }
    return res.json(data ?? []);
  } catch (err) {
    console.error("admin GET keys crash:", err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
