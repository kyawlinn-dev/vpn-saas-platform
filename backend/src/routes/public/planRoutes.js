/**
 * planRoutes.js
 *
 * Mounted at: /api/public/plans  (no auth required)
 * Returns all active plans, ordered by price ascending.
 */

import express from "express";
import { supabase } from "../../lib/supabase.js";

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

export default router;