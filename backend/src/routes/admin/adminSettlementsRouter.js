import express from "express";
import { supabase } from "../../lib/supabase.js";
import {
  normalizeAccountingMonth,
  normalizeSettlementText,
  serializeSettlement,
  settlementMonthDate,
} from "../../services/resellerAccountingService.js";
import { sanitizeSearchTerm } from "../../utils/pagination.js";

const router = express.Router();
const SCREENSHOT_BUCKET = "payment-screenshots";

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

router.get("/", async (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req.query);
    const period = req.query.month ? normalizeAccountingMonth(req.query.month) : null;
    const status = String(req.query.status || "all").trim();
    const resellerId = String(req.query.reseller_id || "all").trim();

    if (req.query.month && !period) {
      return res.status(400).json({ error: "month must use YYYY-MM format" });
    }

    let query = supabase
      .from("monthly_settlements")
      .select(
        `
        *,
        reseller:resellers(id, name, email, commission_percent),
        confirmed_by:admins(id, full_name, email)
      `,
        { count: "exact" }
      )
      .order("settlement_month", { ascending: false })
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (period) {
      query = query.eq("settlement_month", settlementMonthDate(period));
    }

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    if (resellerId && resellerId !== "all") {
      query = query.eq("reseller_id", resellerId);
    }

    const searchTerm = sanitizeSearchTerm(req.query.search);
    if (searchTerm) {
      const pattern = `%${searchTerm}%`;
      const { data: matchedResellers, error: resellerSearchError } = await supabase
        .from("resellers")
        .select("id")
        .or(`name.ilike.${pattern},email.ilike.${pattern}`)
        .limit(200);

      if (resellerSearchError) {
        console.error("GET /api/admin/settlements search error:", resellerSearchError);
        return res.status(500).json({ error: "Failed to search settlements" });
      }

      const orParts = [`transfer_reference.ilike.${pattern}`, `transfer_note.ilike.${pattern}`];
      if (matchedResellers?.length) {
        orParts.push(`reseller_id.in.(${matchedResellers.map((r) => r.id).join(",")})`);
      }
      query = query.or(orParts.join(","));
    }

    const { data, count, error } = await query;

    if (error) {
      console.error("GET /api/admin/settlements query error:", error);
      return res.status(500).json({ error: "Failed to load settlements" });
    }

    return res.json({
      data: (data ?? []).map(serializeSettlement),
      total: count ?? 0,
      page,
      limit,
    });
  } catch (err) {
    console.error("GET /api/admin/settlements crash:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:settlementId/proof-url", async (req, res) => {
  try {
    const { settlementId } = req.params;

    const { data: settlement, error } = await supabase
      .from("monthly_settlements")
      .select("id, transfer_proof_url")
      .eq("id", settlementId)
      .maybeSingle();

    if (error) {
      console.error("admin settlement proof lookup error:", error);
      return res.status(500).json({ error: "Failed to load settlement proof" });
    }

    if (!settlement) {
      return res.status(404).json({ error: "Settlement not found" });
    }

    const path = settlement.transfer_proof_url;
    if (!path) {
      return res.status(404).json({ error: "No transfer proof on this settlement" });
    }

    if (path.startsWith("http://") || path.startsWith("https://")) {
      return res.json({ signed_url: path, expires_in: null });
    }

    const { data, error: signError } = await supabase.storage
      .from(SCREENSHOT_BUCKET)
      .createSignedUrl(path, 3600);

    if (signError || !data?.signedUrl) {
      console.error("admin settlement proof signed URL error:", signError);
      return res.status(500).json({ error: "Failed to generate proof URL" });
    }

    return res.json({ signed_url: data.signedUrl, expires_in: 3600 });
  } catch (err) {
    console.error("GET /api/admin/settlements/:id/proof-url crash:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:settlementId/confirm", async (req, res) => {
  try {
    const { settlementId } = req.params;
    const adminNote = normalizeSettlementText(req.body?.admin_note);

    const { data: existing, error: lookupError } = await supabase
      .from("monthly_settlements")
      .select("id, status")
      .eq("id", settlementId)
      .maybeSingle();

    if (lookupError) {
      console.error("admin settlement confirm lookup error:", lookupError);
      return res.status(500).json({ error: "Failed to load settlement" });
    }

    if (!existing) {
      return res.status(404).json({ error: "Settlement not found" });
    }

    if (existing.status === "confirmed") {
      return res.status(409).json({ error: "Settlement is already confirmed" });
    }

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("monthly_settlements")
      .update({
        status: "confirmed",
        confirmed_at: now,
        confirmed_by_admin_id: req.admin.id,
        admin_note: adminNote,
        updated_at: now,
      })
      .eq("id", settlementId)
      .select(
        `
        *,
        reseller:resellers(id, name, email, commission_percent),
        confirmed_by:admins(id, full_name, email)
      `
      )
      .single();

    if (error || !data) {
      console.error("admin settlement confirm update error:", error);
      return res.status(500).json({ error: "Failed to confirm settlement" });
    }

    return res.json({ settlement: serializeSettlement(data) });
  } catch (err) {
    console.error("POST /api/admin/settlements/:id/confirm crash:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:settlementId/reopen", async (req, res) => {
  try {
    const { settlementId } = req.params;
    const adminNote = normalizeSettlementText(req.body?.admin_note);
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from("monthly_settlements")
      .update({
        status: "reopened",
        confirmed_at: null,
        confirmed_by_admin_id: null,
        reopened_at: now,
        admin_note: adminNote,
        updated_at: now,
      })
      .eq("id", settlementId)
      .select(
        `
        *,
        reseller:resellers(id, name, email, commission_percent),
        confirmed_by:admins(id, full_name, email)
      `
      )
      .single();

    if (error || !data) {
      console.error("admin settlement reopen update error:", error);
      return res.status(500).json({ error: "Failed to reopen settlement" });
    }

    return res.json({ settlement: serializeSettlement(data) });
  } catch (err) {
    console.error("POST /api/admin/settlements/:id/reopen crash:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
