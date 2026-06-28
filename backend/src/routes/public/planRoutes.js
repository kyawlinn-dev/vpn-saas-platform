/**
 * planRoutes.js
 *
 * Mounted at: /api/public/plans  (no auth required)
 * Returns all active plans, ordered by price ascending.
 */

import express from "express";
import { supabase } from "../../lib/supabase.js";
import axios from "axios";
import https from "https";

const router = express.Router();

router.get("/", async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from("vpn_plans")
      .select("*")
      .eq("is_active", true)
      .order("price_mmk", { ascending: true });

    if (error) {
      console.error("GET /api/public/plans query error:", error);
      return res.status(500).json({ error: error.message });
    }

    return res.json(data ?? []);
  } catch (err) {
    console.error("GET /api/public/plans crash:", err);
    return res.status(500).json({ error: err.message });
  }
});

router.get("/debug/outline", async (req, res) => {
  try {
    const { data: servers, error } = await supabase
      .from("vpn_servers")
      .select("*")
      .eq("status", "active");

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const results = [];

    for (const s of servers) {
      try {
        const r = await axios.get(`${s.outline_api_url}/server`, {
          httpsAgent: new https.Agent({
            rejectUnauthorized: false, // temporary for testing
          }),
          timeout: 10000,
        });

        results.push({
          name: s.name,
          ok: true,
        });
      } catch (e) {
        results.push({
          name: s.name,
          ok: false,
          error: e.message,
        });
      }
    }

    return res.json(results);
  } catch (err) {
    console.error("DEBUG OUTLINE ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;