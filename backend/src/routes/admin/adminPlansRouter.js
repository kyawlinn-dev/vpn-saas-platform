import express from "express";
import { supabase } from "../../lib/supabase.js";

const router = express.Router();

// POST /api/admin/plans
router.post("/", async (req, res) => {
  try {
    const {
      name,
      price_mmk,
      data_limit_gb,
      duration_days,
      max_devices,
      is_active,
      is_trial,
      sort_order,
      allowed_regions,
      features,
    } = req.body;

    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "name is required" });
    }
    if (!Number.isInteger(price_mmk) || price_mmk < 0) {
      return res.status(400).json({ error: "price_mmk must be a non-negative integer" });
    }
    if (!Number.isInteger(data_limit_gb) || data_limit_gb < 0) {
      return res.status(400).json({ error: "data_limit_gb must be a non-negative integer (0 = unlimited)" });
    }
    if (!Number.isInteger(duration_days) || duration_days <= 0) {
      return res.status(400).json({ error: "duration_days must be a positive integer" });
    }
    if (!Number.isInteger(max_devices) || max_devices <= 0) {
      return res.status(400).json({ error: "max_devices must be a positive integer" });
    }
    if (typeof is_active !== "boolean") {
      return res.status(400).json({ error: "is_active must be a boolean" });
    }
    if (typeof is_trial !== "boolean") {
      return res.status(400).json({ error: "is_trial must be a boolean" });
    }
    if (!Number.isInteger(sort_order)) {
      return res.status(400).json({ error: "sort_order must be an integer" });
    }

    const insert = {
      name: name.trim(),
      price_mmk,
      data_limit_gb,
      duration_days,
      max_devices,
      is_active,
      is_trial,
      sort_order,
    };

    if (Array.isArray(allowed_regions)) {
      insert.allowed_regions = allowed_regions.filter((r) => typeof r === "string" && r.trim());
    }

    if (Array.isArray(features)) {
      if (!features.every((f) => typeof f === "string")) {
        return res.status(400).json({ error: "features must be an array of strings" });
      }
      insert.features = features.map((f) => f.trim()).filter(Boolean);
    }

    console.log(`[admin:${req.admin?.id}] POST /api/admin/plans — creating "${insert.name}"`);

    const { data, error } = await supabase
      .from("vpn_plans")
      .insert(insert)
      .select()
      .single();

    if (error || !data) {
      console.error("admin POST plans error:", error);
      return res.status(500).json({ error: error?.message || "Failed to create plan" });
    }

    return res.status(201).json({ success: true, plan: data });
  } catch (err) {
    console.error("admin POST plans crash:", err);
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/plans/:id
// Soft-deactivate via { is_active: false }. No DELETE — plans are FK-referenced by vpn_orders.
router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body;
    const updates = {};

    if ("name" in body) {
      if (typeof body.name !== "string" || !body.name.trim()) {
        return res.status(400).json({ error: "name must be a non-empty string" });
      }
      updates.name = body.name.trim();
    }

    for (const field of ["price_mmk", "data_limit_gb", "duration_days", "max_devices", "sort_order"]) {
      if (field in body) {
        if (!Number.isInteger(body[field])) {
          return res.status(400).json({ error: `${field} must be an integer` });
        }
        updates[field] = body[field];
      }
    }

    for (const field of ["is_active", "is_trial"]) {
      if (field in body) {
        if (typeof body[field] !== "boolean") {
          return res.status(400).json({ error: `${field} must be a boolean` });
        }
        updates[field] = body[field];
      }
    }

    if ("allowed_regions" in body) {
      if (body.allowed_regions === null) {
        updates.allowed_regions = null;
      } else if (Array.isArray(body.allowed_regions)) {
        updates.allowed_regions = body.allowed_regions.filter(
          (r) => typeof r === "string" && r.trim()
        );
      } else {
        return res.status(400).json({ error: "allowed_regions must be an array or null" });
      }
    }

    if ("features" in body) {
      if (!Array.isArray(body.features)) {
        return res.status(400).json({ error: "features must be an array of strings" });
      }
      updates.features = body.features;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    updates.updated_at = new Date().toISOString();

    console.log(
      `[admin:${req.admin?.id}] PATCH /api/admin/plans/${id} — fields: ${Object.keys(updates).join(", ")}`
    );

    const { data, error } = await supabase
      .from("vpn_plans")
      .update(updates)
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) {
      console.error("admin PATCH plans error:", error);
      return res.status(500).json({ error: error.message });
    }
    if (!data) {
      return res.status(404).json({ error: "Plan not found" });
    }

    return res.json({ success: true, plan: data });
  } catch (err) {
    console.error("admin PATCH plans crash:", err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
