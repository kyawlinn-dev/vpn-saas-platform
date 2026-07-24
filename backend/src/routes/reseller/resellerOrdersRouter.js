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
import { parsePagination, sanitizeSearchTerm } from "../../utils/pagination.js";
import { addDaysToDateOnly, businessDateOnly } from "../../utils/businessTime.js";
import { enrichOrderAccess } from "../../services/customerOrderEnrichmentService.js";

const router = express.Router();

const ORDER_SELECT = `
  *,
  customer:vpn_customers!vpn_orders_customer_id_fkey (
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
  ),
  keys:vpn_keys!vpn_keys_order_tenant_fk (
    id, order_id, customer_id, reseller_id, server_id, outline_key_id,
    key_name, access_url, data_limit_bytes, used_bytes, status, created_at,
    deleted_at
  )
`;

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

async function getResellerAccessLabel(reseller) {
  const { data: miniapp } = await supabase
    .from("reseller_miniapps")
    .select("brand_name")
    .eq("reseller_id", reseller.id)
    .maybeSingle();

  return miniapp?.brand_name || reseller.name || "NovaNet MM";
}

router.get("/", async (req, res) => {
  try {
    const reseller = req.reseller;
    const { page, limit, offset } = parsePagination(req.query);
    const accessLabel = await getResellerAccessLabel(reseller);

    const {
      status,
      review_status,
      source,
      order_type,
      customer_id,
      customer_type,
      scope,
      search,
      hide_unconfirmed_telegram,
      hide_rejected_telegram,
    } = req.query;

    let query = supabase
      .from("vpn_orders")
      .select(ORDER_SELECT, { count: "exact" })
      .eq("reseller_id", reseller.id);

    // customer_type isn't a column on vpn_orders — resolve matching customer
    // ids first (same base-table-only pattern as search below, and cheap:
    // one reseller's customer list, not a system-wide scan).
    if (customer_type === "normal" || customer_type === "telegram") {
      const { data: typedCustomers, error: typeError } = await supabase
        .from("vpn_customers")
        .select("id")
        .eq("reseller_id", reseller.id)
        .eq("customer_type", customer_type);

      if (typeError) {
        console.error("GET /api/reseller/orders customer_type query error:", typeError);
        return res.status(500).json({ error: "Failed to load orders" });
      }

      const typedIds = (typedCustomers ?? []).map((c) => c.id);
      if (typedIds.length === 0) {
        return res.json({ data: [], total: 0, page, limit });
      }
      query = query.in("customer_id", typedIds);
    }

    // "expiring" isn't a real status value — it's active orders whose
    // expiry falls within the next 7 days, same window used by
    // /reseller/stats/overview's expiring_soon count.
    if (status === "expiring") {
      const today = businessDateOnly();
      const horizon = addDaysToDateOnly(today, 7);
      query = query
        .eq("status", "active")
        .gte("expiry_date", today)
        .lte("expiry_date", horizon);
    } else if (status) {
      query = query.eq("status", String(status).trim());
    }

    if (review_status) {
      query = query.eq("review_status", String(review_status).trim());
    }

    // Overview's "Order Workbench" preview: a Telegram/miniapp purchase that
    // isn't confirmed yet (still pending review, or rejected) shouldn't
    // appear as a normal order row — pending ones live in the Attention
    // Queue, and both pending and rejected ones stay visible on the
    // Telegram Orders review page instead. Scoped to source (miniapp/bot)
    // rather than isTelegramManagedOrder's fuller customer.customer_type
    // check for the same base-table-only .or() constraint noted above for
    // scope=telegram_purchases.
    if (String(hide_unconfirmed_telegram).trim() === "true") {
      query = query.or("source.not.in.(miniapp,bot),review_status.eq.confirmed");
    }

    // Main Orders page: a rejected Telegram/miniapp purchase clutters the
    // order-management list with a "Stopped" row indistinguishable from a
    // normal expired subscription — it stays visible only on the Telegram
    // Orders review page instead. Pending-review ones are left visible here
    // (they show as "Active" while awaiting review, which isn't confusing).
    if (String(hide_rejected_telegram).trim() === "true") {
      query = query.or("source.not.in.(miniapp,bot),review_status.neq.rejected");
    }

    if (customer_id) {
      query = query.eq("customer_id", String(customer_id).trim());
    }

    // Telegram Orders page: purchases with a Mini App/bot order source.
    // PostgREST's or()/and() logic tree cannot combine a base-table condition
    // (source) with a joined-table condition (customer.customer_type) in one
    // group — confirmed against the live project, not just docs — so this
    // intentionally no longer also matches a dashboard-sourced order placed
    // for an already Telegram-typed customer; that edge case is rare enough
    // to not be worth the id-list scale risk (see search below) of resolving
    // it via a precomputed customer_id list instead.
    if (scope === "telegram_purchases") {
      query = query.eq("order_type", "purchase");
      if (source && source !== "all") {
        query = query.eq("source", String(source).trim());
      } else {
        query = query.in("source", ["miniapp", "bot"]);
      }
    } else {
      if (order_type) {
        query = query.eq("order_type", String(order_type).trim());
      }
      if (source) {
        query = query.eq("source", String(source).trim());
      }
    }

    const searchTerm = sanitizeSearchTerm(search);
    if (searchTerm) {
      // Same base-table-only constraint as above: resolve matching customers/
      // plans first, then OR two plain columns (customer_id, plan_id) on
      // vpn_orders itself instead of embedding customer.*/plan.* conditions
      // directly in an .or() string.
      const pattern = `%${searchTerm}%`;
      const [{ data: matchedCustomers, error: customerSearchError }, { data: matchedPlans, error: planSearchError }] =
        await Promise.all([
          supabase
            .from("vpn_customers")
            .select("id")
            .eq("reseller_id", reseller.id)
            .or(`full_name.ilike.${pattern},telegram_username.ilike.${pattern},phone.ilike.${pattern}`)
            .limit(200),
          supabase.from("vpn_plans").select("id").ilike("name", pattern).limit(200),
        ]);

      if (customerSearchError || planSearchError) {
        console.error("GET /api/reseller/orders search error:", customerSearchError || planSearchError);
        return res.status(500).json({ error: "Failed to search orders" });
      }

      const orParts = [];
      if (matchedCustomers?.length) {
        orParts.push(`customer_id.in.(${matchedCustomers.map((c) => c.id).join(",")})`);
      }
      if (matchedPlans?.length) {
        orParts.push(`plan_id.in.(${matchedPlans.map((p) => p.id).join(",")})`);
      }

      if (orParts.length === 0) {
        return res.json({ data: [], total: 0, page, limit });
      }

      query = query.or(orParts.join(","));
    }

    query = query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, count, error } = await query;

    if (error) {
      console.error("GET /api/reseller/orders query error:", error);
      return res.status(500).json({ error: "Failed to load orders" });
    }

    return res.json({
      data: (data ?? []).map((order) =>
        enrichOrderAccess({ ...order, reseller: { name: accessLabel } }, req)
      ),
      total: count ?? 0,
      page,
      limit,
    });
  } catch (err) {
    console.error("GET /api/reseller/orders crash:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/reseller/orders/counts
// Filter-tab counts (OrdersTable's 7 status tabs, TelegramOrdersPage's 4
// review-status tabs) in a single query instead of one round trip per tab —
// firing several separate exact-count queries per page load was saturating
// the PostgREST/Postgres connection pool under real concurrent usage, even
// though each individual count was fast in isolation.
router.get("/counts", async (req, res) => {
  try {
    const reseller = req.reseller;
    const { data, error } = await supabase
      .from("vpn_orders")
      .select("status, review_status, order_type, source, expiry_date")
      .eq("reseller_id", reseller.id);

    if (error) {
      console.error("GET /api/reseller/orders/counts query error:", error);
      return res.status(500).json({ error: "Failed to load order counts" });
    }

    const rows = data ?? [];
    const today = businessDateOnly();
    const horizon = addDaysToDateOnly(today, 7);
    const isExpiringRow = (row) =>
      row.status === "active" &&
      row.expiry_date &&
      row.expiry_date >= today &&
      row.expiry_date <= horizon;

    const status = {
      all: rows.length,
      pending: rows.filter((row) => row.status === "pending").length,
      active: rows.filter((row) => row.status === "active").length,
      expiring: rows.filter(isExpiringRow).length,
      overdue: rows.filter((row) => row.status === "overdue").length,
      expired: rows.filter((row) => row.status === "expired").length,
      stopped: rows.filter((row) => row.status === "stopped").length,
    };

    const telegramRows = rows.filter(
      (row) => row.order_type === "purchase" && (row.source === "miniapp" || row.source === "bot")
    );
    const telegram_review = {
      total: telegramRows.length,
      pending: telegramRows.filter((row) => row.review_status === "pending_review").length,
      confirmed: telegramRows.filter((row) => row.review_status === "confirmed").length,
      rejected: telegramRows.filter((row) => row.review_status === "rejected").length,
    };

    return res.json({ status, telegram_review });
  } catch (err) {
    console.error("GET /api/reseller/orders/counts crash:", err);
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

    if (order_type === "purchase") {
      const { data: existingActivePurchase, error: activePurchaseError } = await supabase
        .from("vpn_orders")
        .select("id")
        .eq("customer_id", customer.id)
        .eq("reseller_id", reseller.id)
        .eq("status", "active")
        .eq("order_type", "purchase")
        .maybeSingle();

      if (activePurchaseError) {
        console.error("Active purchase check error:", activePurchaseError);
        return res.status(500).json({ error: "Failed to check active package" });
      }

      if (existingActivePurchase) {
        return res.status(409).json({
          error:
            "This customer already has an active package. Renewing or adding a top-up isn't supported yet.",
          code: "ACTIVE_PACKAGE_EXISTS",
        });
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
        customer:vpn_customers!vpn_orders_customer_id_fkey (
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
