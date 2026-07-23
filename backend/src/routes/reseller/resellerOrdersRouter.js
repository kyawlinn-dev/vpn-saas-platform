import express from "express";
import { supabase } from "../../lib/supabase.js";
import {
  normalizeNullableString,
  normalizeRequiredString,
} from "../../utils/validators.js";
import {
  calculatePaymentAmounts,
  createOrderPayment,
  syncOrderPaymentSummary,
} from "../../services/paymentLedgerService.js";
import { deriveManualOrderPolicy } from "../../services/manualOrderPolicy.js";

const router = express.Router();

async function findCustomerForReseller({ resellerId, customerId, phone, telegram_username }) {
  if (customerId) {
    const { data, error } = await supabase
      .from("vpn_customers")
      .select("*")
      .eq("id", customerId)
      .eq("reseller_id", resellerId)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;
    return null;
  }

  if (phone) {
    const { data, error } = await supabase
      .from("vpn_customers")
      .select("*")
      .eq("reseller_id", resellerId)
      .eq("phone", phone)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) throw error;
    if (data?.[0]) return data[0];
  }

  if (telegram_username) {
    const { data, error } = await supabase
      .from("vpn_customers")
      .select("*")
      .eq("reseller_id", resellerId)
      .eq("telegram_username", telegram_username)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) throw error;
    if (data?.[0]) return data[0];
  }

  return null;
}

router.get("/", async (req, res) => {
  try {
    const reseller = req.reseller;

    const {
      status,
      review_status,
      source,
      order_type,
      customer_id,
    } = req.query;

    let query = supabase
      .from("vpn_orders")
      .select(`
        *,
        customer:vpn_customers (
          id,
          full_name,
          telegram_username,
          phone,
          customer_type,
          ssconf_token
        ),
        plan:vpn_plans (
          id,
          name,
          price_mmk,
          duration_days,
          data_limit_gb,
          max_devices,
          allowed_regions
        ),
        payments:order_payments (
          id,
          amount_mmk,
          commission_amount_mmk,
          platform_due_mmk,
          review_status,
          payment_type,
          apply_status,
          created_at
        )
      `)
      .eq("reseller_id", reseller.id)
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", String(status).trim());
    }

    if (review_status) {
      query = query.eq("review_status", String(review_status).trim());
    }

    if (source) {
      query = query.eq("source", String(source).trim());
    }

    if (order_type) {
      query = query.eq("order_type", String(order_type).trim());
    }

    if (customer_id) {
      query = query.eq("customer_id", String(customer_id).trim());
    }

    const { data, error } = await query;

    if (error) {
      console.error("GET /api/reseller/orders query error:", error);
      return res.status(500).json({ error: "Failed to load orders" });
    }

    return res.json(data ?? []);
  } catch (err) {
    console.error("GET /api/reseller/orders crash:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req, res) => {
  try {
    const reseller = req.reseller;

    const full_name = normalizeRequiredString(req.body.full_name);
    const telegram_username = normalizeNullableString(req.body.telegram_username);
    const phone = normalizeNullableString(req.body.phone);
    const notes = normalizeNullableString(req.body.notes);
    const plan_id = normalizeRequiredString(req.body.plan_id);
    const customer_id = normalizeNullableString(req.body.customer_id);
    const requestedPaymentStatus = normalizeNullableString(req.body.payment_status);
    const payment_note = normalizeNullableString(req.body.payment_note);
    const payment_screenshot_url = normalizeNullableString(req.body.payment_screenshot_url);

    if (!full_name || !plan_id) {
      return res.status(400).json({ error: "full_name and plan_id are required" });
    }

    const { data: plan, error: planError } = await supabase
      .from("vpn_plans")
      .select("*")
      .eq("id", plan_id)
      .eq("is_active", true)
      .single();

    if (planError || !plan) {
      return res.status(400).json({ error: "Invalid or inactive plan" });
    }

    const policy = deriveManualOrderPolicy({ plan, requestedPaymentStatus });
    const source = policy.source;
    const order_type = policy.orderType;
    const payment_status = policy.paymentStatus;
    const review_status = policy.reviewStatus;

    let customer = null;

    try {
      customer = await findCustomerForReseller({
        resellerId: reseller.id,
        customerId: customer_id,
        phone,
        telegram_username,
      });
    } catch (lookupError) {
      console.error("Customer lookup error:", lookupError);
      return res.status(500).json({ error: "Failed to check customer" });
    }

    if (customer_id && !customer) {
      return res.status(404).json({ error: "Customer not found for this reseller" });
    }

    if (!customer) {
      const { data: created, error: createErr } = await supabase
        .from("vpn_customers")
        .insert({
          reseller_id: reseller.id,
          full_name,
          telegram_username,
          phone,
          notes,
          status: "active",
          customer_type: "normal",
        })
        .select()
        .single();

      if (createErr || !created) {
        console.error("Create customer error:", createErr);
        return res.status(500).json({ error: "Failed to create customer" });
      }

      customer = created;
    } else {
      const patch = {};

      if (full_name && full_name !== customer.full_name) patch.full_name = full_name;
      if (!customer.telegram_username && telegram_username) patch.telegram_username = telegram_username;
      if (!customer.phone && phone) patch.phone = phone;
      if (notes) patch.notes = notes;

      if (Object.keys(patch).length > 0) {
        const { data: updated, error: updateErr } = await supabase
          .from("vpn_customers")
          .update(patch)
          .eq("id", customer.id)
          .eq("reseller_id", reseller.id)
          .select()
          .single();

        if (updateErr || !updated) {
          console.error("Update customer error:", updateErr);
          return res.status(500).json({ error: "Failed to update customer" });
        }

        customer = updated;
      }
    }

    const priceMmk = Number(plan.price_mmk || 0);
    const commissionPercent = Number(reseller.commission_percent || 20);
    const initialPaymentReviewStatus =
      payment_status === "paid" ? review_status : "pending_review";
    const initialPaymentAmounts = calculatePaymentAmounts({
      amountMmk:
        order_type === "purchase" && payment_status === "paid" && review_status === "confirmed"
          ? priceMmk
          : 0,
      commissionPercent,
    });

    const { data: order, error: orderError } = await supabase
      .from("vpn_orders")
      .insert({
        reseller_id: reseller.id,
        customer_id: customer.id,
        plan_id: plan.id,
        status: "pending",
        payment_status,
        payment_note: payment_note ?? "",
        payment_screenshot_url,
        source,
        order_type,
        review_status,
        price_mmk: priceMmk,
        total_paid_mmk: initialPaymentAmounts.amount_mmk,
        commission_percent: commissionPercent,
        commission_amount_mmk: initialPaymentAmounts.commission_amount_mmk,
      })
      .select(`
        *,
        customer:vpn_customers (
          id,
          full_name,
          telegram_username,
          phone,
          customer_type,
          ssconf_token
        ),
        plan:vpn_plans (
          id,
          name,
          price_mmk,
          duration_days,
          data_limit_gb,
          max_devices,
          allowed_regions
        )
      `)
      .single();

    if (orderError || !order) {
      console.error("Create order error:", orderError);
      return res.status(500).json({ error: "Failed to create order" });
    }

    let responseOrder = order;

    if (order_type === "purchase" && payment_status === "paid") {
      await createOrderPayment({
        order,
        amountMmk: priceMmk,
        reviewStatus: initialPaymentReviewStatus,
        source,
        paymentNote: payment_note,
        paymentScreenshotUrl: payment_screenshot_url,
      });

      if (initialPaymentReviewStatus === "confirmed") {
        const synced = await syncOrderPaymentSummary(order.id);
        responseOrder = {
          ...order,
          ...synced.order,
          customer: order.customer,
          plan: order.plan,
        };
      }
    }

    return res.status(201).json(responseOrder);
  } catch (err) {
    console.error("POST /api/reseller/orders crash:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /:orderId/screenshot-url
// Returns a 60-minute signed URL for the payment screenshot stored in the
// private Supabase bucket. The path is looked up from vpn_orders; the service-
// role key generates the signed URL server-side — the reseller client never
// gets a permanent public URL or any storage credentials.
router.get("/:orderId/screenshot-url", async (req, res) => {
  try {
    const reseller = req.reseller;
    const { orderId } = req.params;

    const { data: order, error: orderError } = await supabase
      .from("vpn_orders")
      .select("id, reseller_id, payment_screenshot_url")
      .eq("id", orderId)
      .eq("reseller_id", reseller.id)
      .maybeSingle();

    if (orderError) {
      console.error("Screenshot URL order lookup error:", orderError);
      return res.status(500).json({ error: "Failed to load order" });
    }
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }
    if (!order.payment_screenshot_url) {
      return res.status(404).json({ error: "No screenshot on this order" });
    }

    const path = order.payment_screenshot_url;

    // Legacy orders stored a full URL; return it directly.
    if (path.startsWith("http")) {
      return res.json({ signed_url: path, expires_in: null });
    }

    // New orders store the Supabase storage path — generate a short-lived
    // signed URL using the service-role key (never exposed to the client).
    const { data: signed, error: signError } = await supabase.storage
      .from("payment-screenshots")
      .createSignedUrl(path, 3600);

    if (signError || !signed?.signedUrl) {
      console.error("Signed URL generation error:", signError);
      return res.status(500).json({ error: "Failed to generate screenshot URL" });
    }

    return res.json({ signed_url: signed.signedUrl, expires_in: 3600 });
  } catch (err) {
    console.error("Screenshot URL exception:", err);
    return res.status(500).json({ error: "Unexpected server error" });
  }
});

export default router;
