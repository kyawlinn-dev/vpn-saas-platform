import express from "express";
import crypto from "node:crypto";
import multer from "multer";
import { supabase } from "../../lib/supabase.js";
import {
  buildSettlementPayload,
  buildMonthlyAccountingSnapshot,
  buildMonthlyAccountingSnapshotFromPayments,
  normalizeAccountingMonth,
  serializeSettlement,
  settlementMonthDate,
} from "../../services/resellerAccountingService.js";

const router = express.Router();
const SCREENSHOT_BUCKET = "payment-screenshots";
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const EXT_MAP = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

const uploadSingle = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(Object.assign(new Error("Only JPEG, PNG and WebP images are accepted"), { code: "INVALID_TYPE" }));
    }
  },
}).single("file");

function runUploadMiddleware(req, res, next) {
  uploadSingle(req, res, (err) => {
    if (!err) return next();
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "File exceeds the 5 MB limit" });
    }
    return res.status(415).json({ error: err.message || "Invalid file upload" });
  });
}

const MAGIC_CHECKS = {
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  "image/webp": (b) =>
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50,
};

function hasValidMagicBytes(buffer, mimetype) {
  const check = MAGIC_CHECKS[mimetype];
  return check && buffer.length >= 12 && check(buffer);
}

function validProofPath({ resellerId, period, path }) {
  if (!path) return true;
  if (typeof path !== "string") return false;
  if (path.startsWith("http://") || path.startsWith("https://")) return true;
  return (
    path.startsWith(`${resellerId}/settlements/${period.month}/`) &&
    [".jpg", ".png", ".webp"].some((ext) => path.endsWith(ext))
  );
}

async function signedProofResponse({ res, path }) {
  if (!path) {
    return res.status(404).json({ error: "No transfer proof on this settlement" });
  }

  if (path.startsWith("http://") || path.startsWith("https://")) {
    return res.json({ signed_url: path, expires_in: null });
  }

  const { data, error } = await supabase.storage
    .from(SCREENSHOT_BUCKET)
    .createSignedUrl(path, 3600);

  if (error || !data?.signedUrl) {
    console.error("Settlement proof signed URL error:", error);
    return res.status(500).json({ error: "Failed to generate proof URL" });
  }

  return res.json({ signed_url: data.signedUrl, expires_in: 3600 });
}

async function loadMonthlySnapshot({ reseller, month }) {
  const period = normalizeAccountingMonth(month);

  if (!period) {
    return { error: { status: 400, message: "month must use YYYY-MM format" } };
  }

  const { data: payments, error: paymentsError } = await supabase
    .from("order_payments")
    .select(`
        id,
        order_id,
        reseller_id,
        customer_id,
        amount_mmk,
        commission_percent,
        commission_amount_mmk,
        platform_due_mmk,
        review_status,
        payment_type,
        apply_status,
        plan_id,
        package_duration_days,
        package_data_limit_gb,
        applied_at,
        source,
        payment_note,
        payment_screenshot_url,
        submitted_at,
        reviewed_at,
        created_at,
        order:vpn_orders (
          id,
          status,
          payment_status,
          order_type,
          source,
          price_mmk,
          total_paid_mmk,
          created_at,
          customer:vpn_customers (
            id,
            full_name,
            telegram_username,
            customer_type
          ),
          plan:vpn_plans (
            id,
            name,
            duration_days,
            data_limit_gb
          )
        )
      `)
    .eq("reseller_id", reseller.id)
    .gte("created_at", period.startIso)
    .lt("created_at", period.endIso)
    .order("created_at", { ascending: false });

  if (!paymentsError && (payments ?? []).length > 0) {
    const snapshot = buildMonthlyAccountingSnapshotFromPayments({
      reseller,
      payments: payments ?? [],
      period,
    });

    const { data: settlement, error: settlementError } = await supabase
      .from("monthly_settlements")
      .select("*")
      .eq("reseller_id", reseller.id)
      .eq("settlement_month", settlementMonthDate(period))
      .maybeSingle();

    if (settlementError) {
      console.error("reseller accounting settlement query error:", settlementError);
      return { error: { status: 500, message: "Failed to load settlement data" } };
    }

    snapshot.settlement = serializeSettlement(settlement);
    return { snapshot };
  }

  if (paymentsError && paymentsError.code !== "42P01") {
    console.error("reseller accounting payments query error:", paymentsError);
    return { error: { status: 500, message: "Failed to load payment ledger data" } };
  }

  const { data, error } = await supabase
    .from("vpn_orders")
    .select(`
        id,
        reseller_id,
        customer_id,
        plan_id,
        status,
        payment_status,
        review_status,
        order_type,
        source,
        price_mmk,
        total_paid_mmk,
        commission_percent,
        commission_amount_mmk,
        created_at,
        customer:vpn_customers (
          id,
          full_name,
          telegram_username,
          customer_type
        ),
        plan:vpn_plans (
          id,
          name,
          duration_days,
          data_limit_gb
        )
      `)
    .eq("reseller_id", reseller.id)
    .gte("created_at", period.startIso)
    .lt("created_at", period.endIso)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("reseller accounting orders query error:", error);
    return { error: { status: 500, message: "Failed to load accounting data" } };
  }

  const snapshot = buildMonthlyAccountingSnapshot({
    reseller,
    orders: data ?? [],
    period,
  });

  const { data: settlement, error: settlementError } = await supabase
    .from("monthly_settlements")
    .select("*")
    .eq("reseller_id", reseller.id)
    .eq("settlement_month", settlementMonthDate(period))
    .maybeSingle();

  if (settlementError) {
    console.error("reseller accounting settlement query error:", settlementError);
    return { error: { status: 500, message: "Failed to load settlement data" } };
  }

  snapshot.settlement = serializeSettlement(settlement);
  return { snapshot };
}

router.get("/monthly", async (req, res) => {
  try {
    const result = await loadMonthlySnapshot({
      reseller: req.reseller,
      month: req.query.month,
    });

    if (result.error) {
      return res.status(result.error.status).json({ error: result.error.message });
    }

    return res.json(result.snapshot);
  } catch (err) {
    console.error("GET /api/reseller/accounting/monthly crash:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/monthly/settlement-proof", runUploadMiddleware, async (req, res) => {
  try {
    const reseller = req.reseller;
    const period = normalizeAccountingMonth(req.body?.month);

    if (!period) {
      return res.status(400).json({ error: "month must use YYYY-MM format" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Image file is required" });
    }

    if (!hasValidMagicBytes(req.file.buffer, req.file.mimetype)) {
      return res.status(415).json({ error: "File content does not match its declared image type" });
    }

    const { data: existing, error: settlementError } = await supabase
      .from("monthly_settlements")
      .select("id, status")
      .eq("reseller_id", reseller.id)
      .eq("settlement_month", settlementMonthDate(period))
      .maybeSingle();

    if (settlementError) {
      console.error("Settlement proof lookup error:", settlementError);
      return res.status(500).json({ error: "Failed to check settlement" });
    }

    if (existing?.status === "confirmed") {
      return res.status(409).json({ error: "This month is already confirmed by admin" });
    }

    const ext = EXT_MAP[req.file.mimetype] || "jpg";
    const storagePath = `${reseller.id}/settlements/${period.month}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(SCREENSHOT_BUCKET)
      .upload(storagePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false,
      });

    if (uploadError) {
      console.error("Settlement proof upload error:", uploadError);
      return res.status(500).json({ error: "Failed to store transfer proof" });
    }

    return res.json({ path: storagePath });
  } catch (err) {
    console.error("POST /api/reseller/accounting/monthly/settlement-proof crash:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/monthly/settlement-proof-url", async (req, res) => {
  try {
    const reseller = req.reseller;
    const period = normalizeAccountingMonth(req.query.month);

    if (!period) {
      return res.status(400).json({ error: "month must use YYYY-MM format" });
    }

    const { data: settlement, error } = await supabase
      .from("monthly_settlements")
      .select("id, transfer_proof_url")
      .eq("reseller_id", reseller.id)
      .eq("settlement_month", settlementMonthDate(period))
      .maybeSingle();

    if (error) {
      console.error("Settlement proof URL lookup error:", error);
      return res.status(500).json({ error: "Failed to load settlement proof" });
    }

    if (!settlement) {
      return res.status(404).json({ error: "Settlement not found" });
    }

    return signedProofResponse({ res, path: settlement.transfer_proof_url });
  } catch (err) {
    console.error("GET /api/reseller/accounting/monthly/settlement-proof-url crash:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/monthly/settlement", async (req, res) => {
  try {
    const result = await loadMonthlySnapshot({
      reseller: req.reseller,
      month: req.body?.month,
    });

    if (result.error) {
      return res.status(result.error.status).json({ error: result.error.message });
    }

    if (result.snapshot.settlement?.status === "confirmed") {
      return res.status(409).json({ error: "This month is already confirmed by admin" });
    }

    if (
      !validProofPath({
        resellerId: req.reseller.id,
        period: result.snapshot.period,
        path: req.body?.transfer_proof_url,
      })
    ) {
      return res.status(400).json({ error: "Invalid transfer proof path" });
    }

    const payload = buildSettlementPayload({
      snapshot: result.snapshot,
      transferNote: req.body?.transfer_note,
      transferReference: req.body?.transfer_reference,
      transferProofUrl: req.body?.transfer_proof_url,
    });

    const { data, error } = await supabase
      .from("monthly_settlements")
      .upsert(payload, { onConflict: "reseller_id,settlement_month" })
      .select("*")
      .single();

    if (error || !data) {
      console.error("POST /api/reseller/accounting/monthly/settlement error:", error);
      return res.status(500).json({ error: "Failed to submit settlement" });
    }

    return res.status(201).json({ settlement: serializeSettlement(data) });
  } catch (err) {
    console.error("POST /api/reseller/accounting/monthly/settlement crash:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
