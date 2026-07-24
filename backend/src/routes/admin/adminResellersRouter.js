import express from "express";
import crypto from "node:crypto";
import { supabase } from "../../lib/supabase.js";
import { encrypt } from "../../lib/tokenEncryption.js";
import {
  buildBotStatus,
  applyWorkspacePostUpdateEffects,
} from "../../services/workspaceSettingsService.js";

const router = express.Router();

// Auto-generate a slug from a display name.
// Replaces any run of non-[a-z0-9] characters with a single hyphen,
// then strips leading/trailing hyphens.
function slugifyName(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

// Strict-sanitize an admin-provided slug.
// Only a-z, 0-9, and hyphens survive. Everything else is stripped.
// Consecutive hyphens are collapsed; leading/trailing hyphens removed.
function sanitizeSlug(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

// 20-character URL-safe random password (base64url alphabet).
function generateTempPassword() {
  return crypto.randomBytes(15).toString("base64url");
}

// GET /api/admin/resellers — list all resellers with miniapp_slug
// Supports ?page=1&limit=20 for pagination; omitting page returns paginated shape too.
// Also accepts ?all=1 to return a flat array (used by dropdown selects).
router.get("/", async (req, res) => {
  try {
    if (req.query.all === "1") {
      // Lightweight flat list for dropdown selects — no pagination
      const { data: resellers, error } = await supabase
        .from("resellers")
        .select("id, name, email, status, commission_percent, created_at")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("admin GET resellers (all) error:", error);
        return res.status(500).json({ error: error.message });
      }

      const resellerIds = (resellers ?? []).map((r) => r.id);
      let miniappsById = {};
      if (resellerIds.length > 0) {
        const { data: miniapps } = await supabase
          .from("reseller_miniapps")
          .select("reseller_id, miniapp_slug, is_enabled")
          .in("reseller_id", resellerIds);
        for (const m of miniapps ?? []) miniappsById[m.reseller_id] = m;
      }

      return res.json(
        (resellers ?? []).map((r) => ({
          ...r,
          miniapp_slug: miniappsById[r.id]?.miniapp_slug ?? null,
          miniapp_enabled: miniappsById[r.id]?.is_enabled ?? null,
        }))
      );
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const { data: resellers, error, count } = await supabase
      .from("resellers")
      .select("id, name, email, status, commission_percent, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("admin GET resellers error:", error);
      return res.status(500).json({ error: error.message });
    }

    const resellerIds = (resellers ?? []).map((r) => r.id);
    let miniappsById = {};

    if (resellerIds.length > 0) {
      const { data: miniapps } = await supabase
        .from("reseller_miniapps")
        .select("reseller_id, miniapp_slug, is_enabled")
        .in("reseller_id", resellerIds);

      for (const m of miniapps ?? []) {
        miniappsById[m.reseller_id] = m;
      }
    }

    const enriched = (resellers ?? []).map((r) => ({
      ...r,
      miniapp_slug: miniappsById[r.id]?.miniapp_slug ?? null,
      miniapp_enabled: miniappsById[r.id]?.is_enabled ?? null,
    }));

    return res.json({ data: enriched, total: count ?? 0, page, limit });
  } catch (err) {
    console.error("admin GET resellers crash:", err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/resellers — atomically create auth user + resellers row + miniapps row
router.post("/", async (req, res) => {
  let createdAuthUserId = null;
  let createdResellerId = null;

  try {
    const name = String(req.body?.name || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const commissionPercent =
      req.body?.commission_percent != null ? Number(req.body.commission_percent) : 20;

    // Derive or sanitize slug
    let miniappSlug =
      req.body?.miniapp_slug != null ? String(req.body.miniapp_slug).trim() : "";

    if (miniappSlug) {
      miniappSlug = sanitizeSlug(miniappSlug);
    } else {
      miniappSlug = slugifyName(name);
    }

    // Validation
    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Valid email is required" });
    }
    if (!miniappSlug) {
      return res.status(400).json({
        error:
          "miniapp_slug could not be derived from name — provide one explicitly (a-z, 0-9, hyphens only)",
      });
    }
    if (
      !Number.isFinite(commissionPercent) ||
      commissionPercent < 0 ||
      commissionPercent > 100
    ) {
      return res.status(400).json({ error: "commission_percent must be between 0 and 100" });
    }

    // Slug uniqueness check
    const { data: existingMiniapp, error: slugCheckError } = await supabase
      .from("reseller_miniapps")
      .select("miniapp_slug")
      .eq("miniapp_slug", miniappSlug)
      .maybeSingle();

    if (slugCheckError) {
      console.error("admin POST resellers slug check error:", slugCheckError);
      return res.status(500).json({ error: "Failed to check slug availability" });
    }
    if (existingMiniapp) {
      return res.status(409).json({ error: `Slug '${miniappSlug}' is already taken` });
    }

    // Step 1: Create Supabase auth user
    const tempPassword = generateTempPassword();
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    });

    if (authError || !authData?.user) {
      console.error("admin POST resellers createUser error:", authError);
      return res
        .status(500)
        .json({ error: authError?.message || "Failed to create auth user" });
    }

    createdAuthUserId = authData.user.id;

    // Step 2: Insert resellers row
    const { data: reseller, error: resellerError } = await supabase
      .from("resellers")
      .insert({
        supabase_user_id: createdAuthUserId,
        name,
        email,
        status: "active",
        commission_percent: commissionPercent,
      })
      .select("id, name, email, status, commission_percent, created_at")
      .single();

    if (resellerError || !reseller) {
      console.error("admin POST resellers insert reseller error:", resellerError);
      try {
        await supabase.auth.admin.deleteUser(createdAuthUserId);
      } catch (e) {
        console.error("rollback deleteUser failed:", e.message);
      }
      return res
        .status(500)
        .json({ error: resellerError?.message || "Failed to create reseller" });
    }

    createdResellerId = reseller.id;

    // Step 3: Insert reseller_miniapps row.
    // primary_color, trial_data_limit_gb, trial_duration_days are NOT NULL in the DB.
    // They have server-side defaults but passing explicit null overrides those defaults
    // and triggers a NOT NULL violation — so supply real values here.
    const { error: miniappError } = await supabase.from("reseller_miniapps").insert({
      reseller_id: createdResellerId,
      miniapp_slug: miniappSlug,
      brand_name: name,
      is_enabled: true,
      trial_enabled: false,
      payment_info: [],
      primary_color: "#2f7bff",
      trial_data_limit_gb: 5,
      trial_duration_days: 7,
    });

    if (miniappError) {
      console.error("admin POST resellers insert miniapps error:", miniappError);
      try {
        await supabase.from("resellers").delete().eq("id", createdResellerId);
      } catch (e) {
        console.error("rollback delete reseller failed:", e.message);
      }
      try {
        await supabase.auth.admin.deleteUser(createdAuthUserId);
      } catch (e) {
        console.error("rollback deleteUser failed:", e.message);
      }
      return res
        .status(500)
        .json({ error: miniappError?.message || "Failed to create miniapp workspace" });
    }

    // temp_password returned ONCE — never stored in plaintext anywhere
    return res.status(201).json({
      success: true,
      reseller: {
        id: reseller.id,
        name: reseller.name,
        email: reseller.email,
        status: reseller.status,
        commission_percent: reseller.commission_percent,
        miniapp_slug: miniappSlug,
      },
      temp_password: tempPassword,
    });
  } catch (err) {
    console.error("admin POST resellers crash:", err);
    // Best-effort rollback on unexpected error
    if (createdResellerId) {
      try {
        await supabase.from("resellers").delete().eq("id", createdResellerId);
      } catch (_) {}
    }
    if (createdAuthUserId) {
      try {
        await supabase.auth.admin.deleteUser(createdAuthUserId);
      } catch (_) {}
    }
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
});

// PATCH /api/admin/resellers/:id — enable or disable a reseller
router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { enabled } = req.body;

    if (typeof enabled !== "boolean") {
      return res.status(400).json({ error: "enabled must be a boolean" });
    }

    const newStatus = enabled ? "active" : "disabled";

    const { error: resellerError } = await supabase
      .from("resellers")
      .update({ status: newStatus })
      .eq("id", id);

    if (resellerError) {
      console.error("admin PATCH resellers update resellers error:", resellerError);
      return res.status(500).json({ error: resellerError.message });
    }

    // Also sync miniapp visibility — non-fatal if miniapp row doesn't exist yet
    const { error: miniappError } = await supabase
      .from("reseller_miniapps")
      .update({ is_enabled: enabled })
      .eq("reseller_id", id);

    if (miniappError) {
      console.warn(
        "admin PATCH resellers: reseller status updated but miniapp sync failed:",
        miniappError.message
      );
    }

    return res.json({ success: true, status: newStatus, enabled });
  } catch (err) {
    console.error("admin PATCH resellers crash:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
});

// GET /api/admin/resellers/:id/workspace — Mini App config admin owns:
// Telegram bot, slug, brand logo/color, trial settings. brand_name /
// support_username / payment_info stay reseller-managed and aren't editable
// here, though brand_name is included read-only for context.
router.get("/:id/workspace", async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from("reseller_miniapps")
      .select(
        "miniapp_slug, brand_name, brand_logo_url, primary_color, " +
          "trial_enabled, trial_data_limit_gb, trial_duration_days, " +
          "bot_token_encrypted, bot_connected, bot_username, bot_id"
      )
      .eq("reseller_id", id)
      .maybeSingle();

    if (error) {
      console.error("admin GET reseller workspace error:", error);
      return res.status(500).json({ error: "Failed to load mini app settings" });
    }
    if (!data) {
      return res.status(404).json({ error: "Mini app workspace not configured" });
    }

    const botStatus = buildBotStatus(data, id);

    return res.json({
      miniapp_slug: data.miniapp_slug,
      brand_name: data.brand_name ?? "",
      brand_logo_url: data.brand_logo_url ?? "",
      primary_color: data.primary_color ?? "",
      trial_enabled: data.trial_enabled ?? false,
      trial_data_limit_gb: data.trial_data_limit_gb ?? null,
      trial_duration_days: data.trial_duration_days ?? null,
      bot_connected: botStatus.connected,
      bot_status: botStatus,
    });
  } catch (err) {
    console.error("admin GET reseller workspace crash:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/admin/resellers/:id/workspace
router.patch("/:id/workspace", async (req, res) => {
  try {
    const resellerId = req.params.id;
    const body = req.body;
    const updates = {};

    if ("miniapp_slug" in body) {
      const slug = sanitizeSlug(String(body.miniapp_slug || "").trim());
      if (!slug) {
        return res.status(400).json({ error: "miniapp_slug must contain a-z, 0-9, or hyphens" });
      }

      const { data: existing, error: slugCheckError } = await supabase
        .from("reseller_miniapps")
        .select("reseller_id")
        .eq("miniapp_slug", slug)
        .neq("reseller_id", resellerId)
        .maybeSingle();

      if (slugCheckError) {
        console.error("admin PATCH reseller workspace slug check error:", slugCheckError);
        return res.status(500).json({ error: "Failed to check slug availability" });
      }
      if (existing) {
        return res.status(409).json({ error: `Slug '${slug}' is already taken` });
      }

      updates.miniapp_slug = slug;
    }

    for (const f of ["brand_logo_url", "primary_color"]) {
      if (f in body) {
        if (typeof body[f] !== "string") {
          return res.status(400).json({ error: `${f} must be a string` });
        }
        updates[f] = body[f];
      }
    }

    if ("trial_enabled" in body) {
      if (typeof body.trial_enabled !== "boolean") {
        return res.status(400).json({ error: "trial_enabled must be a boolean" });
      }
      updates.trial_enabled = body.trial_enabled;
    }

    for (const f of ["trial_data_limit_gb", "trial_duration_days"]) {
      if (f in body) {
        if (!Number.isInteger(body[f]) || body[f] <= 0) {
          return res.status(400).json({ error: `${f} must be a positive integer` });
        }
        updates[f] = body[f];
      }
    }

    if ("bot_token" in body) {
      if (typeof body.bot_token !== "string" || !body.bot_token.trim()) {
        return res.status(400).json({ error: "bot_token must be a non-empty string" });
      }
      updates.bot_token_encrypted = encrypt(body.bot_token.trim());
      // plaintext token is never logged or persisted beyond this scope
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    const { error } = await supabase
      .from("reseller_miniapps")
      .update(updates)
      .eq("reseller_id", resellerId);

    if (error) {
      console.error("admin PATCH reseller workspace error:", error);
      return res.status(500).json({ error: "Failed to update mini app settings" });
    }

    const result = await applyWorkspacePostUpdateEffects({ resellerId, body, updates });
    return res.json(result);
  } catch (err) {
    console.error("admin PATCH reseller workspace crash:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
