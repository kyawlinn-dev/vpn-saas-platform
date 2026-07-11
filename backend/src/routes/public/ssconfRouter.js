import express from "express";
import { supabase } from "../../lib/supabase.js";
import { parseSsUrl } from "../../utils/parseSsUrl.js";

const router = express.Router();

// GET /k/:token  (URL ends with .json — token param includes ".json", stripped below)
// Serves Outline ssconf JSON by opaque customer token — no slug, no auth required.
// The token is the 32-char hex value stored on vpn_customers.ssconf_token.
router.get("/:token", async (req, res) => {
  try {
    // Strip .json suffix added by buildSsconfHttpUrl for visual obfuscation
    const raw = req.params.token;
    const token = raw.endsWith(".json") ? raw.slice(0, -5) : raw;

    if (!token) return res.status(404).json({ error: "Not found" });

    // 1. Resolve customer from opaque token
    const { data: customer, error: customerError } = await supabase
      .from("vpn_customers")
      .select("id, reseller_id")
      .eq("ssconf_token", token)
      .maybeSingle();

    if (customerError) {
      console.error("[ssconf] customer lookup error:", customerError);
      return res.status(500).json({ error: "Internal error" });
    }
    if (!customer) return res.status(404).json({ error: "Not found" });

    // 2. Check miniapp is still enabled for this reseller
    const { data: miniapp, error: miniappError } = await supabase
      .from("reseller_miniapps")
      .select("id, is_enabled")
      .eq("reseller_id", customer.reseller_id)
      .maybeSingle();

    if (miniappError) {
      console.error("[ssconf] miniapp lookup error:", miniappError);
      return res.status(500).json({ error: "Internal error" });
    }
    if (!miniapp?.is_enabled) return res.status(403).json({ error: "Service disabled" });

    // 3. Find best active order (purchase wins over trial)
    const today = new Date().toISOString().slice(0, 10);

    const { data: orders, error: ordersError } = await supabase
      .from("vpn_orders")
      .select(`
        id,
        status,
        order_type,
        review_status,
        expiry_date,
        vpn_plans ( data_limit_gb )
      `)
      .eq("customer_id", customer.id)
      .eq("reseller_id", customer.reseller_id)
      .eq("status", "active")
      .gte("expiry_date", today)
      .order("created_at", { ascending: false });

    if (ordersError) {
      console.error("[ssconf] orders lookup error:", ordersError);
      return res.status(500).json({ error: "Internal error" });
    }

    const rows = orders || [];
    const activeOrder =
      rows.find(
        (o) =>
          o.order_type === "purchase" &&
          ["pending_review", "confirmed"].includes(o.review_status)
      ) ||
      rows.find((o) => o.order_type === "trial") ||
      null;

    if (!activeOrder) return res.status(410).json({ error: "No active subscription" });

    if (!activeOrder.expiry_date || activeOrder.expiry_date < today) {
      return res.status(410).json({ error: "Subscription expired" });
    }

    // 4. Data-limit guard
    const dataLimitGb = activeOrder.vpn_plans?.data_limit_gb;
    if (dataLimitGb && Number(dataLimitGb) > 0) {
      const limitBytes = Math.floor(Number(dataLimitGb) * 1024 * 1024 * 1024);

      const { data: keys } = await supabase
        .from("vpn_keys")
        .select("used_bytes")
        .eq("order_id", activeOrder.id)
        .in("status", ["active", "deleted"]);

      const totalUsed = (keys || []).reduce((s, k) => s + Number(k.used_bytes || 0), 0);
      if (totalUsed >= limitBytes) return res.status(410).json({ error: "Data limit reached" });
    }

    // 5. Find active key
    const { data: key, error: keyError } = await supabase
      .from("vpn_keys")
      .select("id, access_url")
      .eq("customer_id", customer.id)
      .eq("reseller_id", customer.reseller_id)
      .eq("order_id", activeOrder.id)
      .eq("status", "active")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (keyError) {
      console.error("[ssconf] key lookup error:", keyError);
      return res.status(500).json({ error: "Internal error" });
    }
    if (!key?.access_url) return res.status(410).json({ error: "No active VPN key" });

    const parsed = parseSsUrl(key.access_url);

    return res.json({
      server: parsed.server,
      server_port: parsed.port,
      password: parsed.password,
      method: parsed.method,
    });
  } catch (err) {
    console.error("[ssconf] exception:", err);
    return res.status(500).json({ error: "Unexpected error" });
  }
});

export default router;
