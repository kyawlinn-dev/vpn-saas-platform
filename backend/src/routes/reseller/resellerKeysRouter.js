/**
 * resellerKeysRouter.js
 *
 * Mounted at: /api/reseller/keys
 * Already protected by: requireAuth + requireActiveReseller (in server.js)
 *
 *   req.user    → verified Supabase user
 *   req.reseller → verified, active reseller row from DB
 */

import express from "express";
import { supabase } from "../../lib/supabase.js";
import {
  buildKeyUsageView,
  getOutlineMetricsForServer,
} from "../../services/outlineMetricsService.js";

const router = express.Router();

// ─── GET /api/reseller/keys ───────────────────────────────────────────────────

router.get("/", async (req, res) => {
  try {
    const reseller = req.reseller; // set by requireActiveReseller

    const { data, error } = await supabase
      .from("vpn_keys")
      .select(`
        *,
        order:vpn_orders (
          id,
          status,
          payment_status,
          expiry_date
        ),
        customer:vpn_customers (
          id,
          full_name,
          telegram_username,
          phone
        )
      `)
      .eq("reseller_id", reseller.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("GET /api/reseller/keys query error:", error);
      return res.status(500).json({ error: "Failed to load keys" });
    }

    const keys = data ?? [];

    // Batch-fetch all unique servers referenced by these keys
    const serverIds = [...new Set(keys.map((k) => k.server_id).filter(Boolean))];

    let serversById = {};
    if (serverIds.length > 0) {
      const { data: servers, error: serverError } = await supabase
        .from("vpn_servers")
        .select("id, name, host_ip, status, outline_api_url")
        .in("id", serverIds);

      if (serverError) {
        console.error("Failed to load servers for keys:", serverError);
        // Non-fatal — keys are still returned, just without metrics
      } else {
        serversById = Object.fromEntries((servers ?? []).map((s) => [s.id, s]));
      }
    }

    // Fetch Outline metrics concurrently for each active server
    const metricsByServerId = Object.fromEntries(
      await Promise.all(
        Object.values(serversById)
          .filter((s) => s?.status === "active" && s?.host_ip)
          .map(async (s) => {
            const metrics = await getOutlineMetricsForServer(s.host_ip);
            return [s.id, metrics];
          })
      )
    );

    const enriched = keys.map((key) => {
      const server = key.server_id ? serversById[key.server_id] : null;
      const metrics =
        server?.id && key?.outline_key_id
          ? (metricsByServerId?.[server.id]?.[String(key.outline_key_id)] ?? {})
          : {};

      return buildKeyUsageView(
        {
          ...key,
          server: server
            ? { id: server.id, name: server.name, status: server.status, host_ip: server.host_ip }
            : null,
        },
        metrics
      );
    });

    return res.json(enriched);
  } catch (err) {
    console.error("GET /api/reseller/keys crash:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;