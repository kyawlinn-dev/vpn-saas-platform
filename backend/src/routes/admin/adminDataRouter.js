import express from "express";
import { supabase } from "../../lib/supabase.js";
import {
  buildDynamicAccessUrl,
  buildSsconfHttpUrl,
} from "../../services/publicAccessUrlService.js";
import { stopOrderAccess } from "../../services/orderLifecycleService.js";

const router = express.Router();
const BUSINESS_TIME_ZONE = "Asia/Bangkok";

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

function toNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function formatLocalDateKey(date, timeZone = BUSINESS_TIME_ZONE) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getLocalParts(date, timeZone = BUSINESS_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    hour12: false,
  }).formatToParts(date);

  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}

function getTimeZoneOffsetMs(date, timeZone = BUSINESS_TIME_ZONE) {
  const parts = getLocalParts(date, timeZone);
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return asUtc - date.getTime();
}

function zonedDateTimeToUtc({ year, month, day, hour = 0, minute = 0, second = 0 }, timeZone = BUSINESS_TIME_ZONE) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const offset = getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
  return new Date(utcGuess - offset);
}

function parseMonth(value, now = new Date()) {
  const match = typeof value === "string" ? value.match(/^(\d{4})-(\d{2})$/) : null;
  if (match) {
    return { year: Number(match[1]), month: Number(match[2]) };
  }

  const parts = getLocalParts(now);
  return { year: Number(parts.year), month: Number(parts.month) };
}

function getMonthWindow(monthValue) {
  const { year, month } = parseMonth(monthValue);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return {
    month: `${year}-${String(month).padStart(2, "0")}`,
    start: zonedDateTimeToUtc({ year, month, day: 1 }),
    end: zonedDateTimeToUtc({ year: nextYear, month: nextMonth, day: 1 }),
  };
}

function getTodayWindow(now = new Date()) {
  const parts = getLocalParts(now);
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  return {
    date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    start: zonedDateTimeToUtc({ year, month, day }),
    end: zonedDateTimeToUtc({ year, month, day: day + 1 }),
  };
}

function isConfirmedAppliedPayment(payment) {
  return payment?.review_status === "confirmed" && String(payment?.apply_status || "applied") === "applied";
}

function addPaymentToBucket(bucket, payment) {
  bucket.gross_mmk += toNumber(payment.amount_mmk);
  bucket.commission_mmk += toNumber(payment.commission_amount_mmk);
  bucket.platform_due_mmk += toNumber(payment.platform_due_mmk);
  bucket.payment_count += 1;
}

function enrichOrderAccess(order, req) {
  const customerToken = order?.customer?.ssconf_token;
  const label = order?.reseller?.name || "NovaNet MM";
  const ssconfUrl = buildSsconfHttpUrl(customerToken, { req });
  const dynamicAccessUrl = buildDynamicAccessUrl(customerToken, label, { req });
  const keys = (order?.keys ?? []).map((key) => ({
    ...key,
    ssconf_url: ssconfUrl,
    dynamic_access_url: dynamicAccessUrl,
    preferred_access_url: dynamicAccessUrl || ssconfUrl || key.access_url || null,
  }));

  return {
    ...order,
    ssconf_url: ssconfUrl,
    dynamic_access_url: dynamicAccessUrl,
    preferred_access_url: dynamicAccessUrl || ssconfUrl || keys[0]?.access_url || null,
    keys,
  };
}

function summarizeOrderPayments(payments) {
  const rows = Array.isArray(payments) ? payments : [];
  return rows.reduce(
    (acc, payment) => {
      if (isConfirmedAppliedPayment(payment)) {
        acc.gross_mmk += toNumber(payment.amount_mmk);
        acc.commission_mmk += toNumber(payment.commission_amount_mmk);
        acc.platform_due_mmk += toNumber(payment.platform_due_mmk);
        acc.confirmed_count += 1;
      }
      if (payment.review_status === "pending_review") {
        acc.pending_mmk += toNumber(payment.amount_mmk);
        acc.pending_count += 1;
      }
      return acc;
    },
    {
      gross_mmk: 0,
      commission_mmk: 0,
      platform_due_mmk: 0,
      pending_mmk: 0,
      confirmed_count: 0,
      pending_count: 0,
    }
  );
}

function getCustomerActiveOrder(orders) {
  const rows = Array.isArray(orders) ? orders : [];
  return (
    rows.find((order) => order.status === "active" && String(order.order_type || "purchase") === "purchase") ||
    rows.find((order) => order.status === "active") ||
    rows[0] ||
    null
  );
}

function enrichCustomer(customer, { orders = [], telegramLink = null, req } = {}) {
  const customerOrders = orders
    .filter((order) => order.customer_id === customer.id)
    .map((order) => enrichOrderAccess({ ...order, customer, reseller: customer.reseller || order.reseller }, req))
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  const activeOrder = getCustomerActiveOrder(customerOrders);
  const allPayments = customerOrders.flatMap((order) => order.payments ?? []);
  const paymentSummary = summarizeOrderPayments(allPayments);
  const label = customer.reseller?.name || "NovaNet MM";
  const ssconfUrl = buildSsconfHttpUrl(customer.ssconf_token, { req });
  const dynamicAccessUrl = buildDynamicAccessUrl(customer.ssconf_token, label, { req });

  return {
    ...customer,
    customer_type: telegramLink ? "telegram" : "normal",
    telegram_link: telegramLink,
    orders: customerOrders,
    active_order: activeOrder,
    keys: customerOrders.flatMap((order) => order.keys ?? []),
    payment_summary: paymentSummary,
    ssconf_url: ssconfUrl,
    dynamic_access_url: dynamicAccessUrl,
    preferred_access_url: dynamicAccessUrl || ssconfUrl || null,
  };
}

async function fetchEnrichedCustomer(customerId, req) {
  const { data: customer, error: customerError } = await supabase
    .from("vpn_customers")
    .select("*, reseller:resellers(id, name)")
    .eq("id", customerId)
    .maybeSingle();

  if (customerError) {
    throw new Error(customerError.message);
  }
  if (!customer) return null;

  const [{ data: orders, error: ordersError }, { data: telegramLinks, error: telegramError }] = await Promise.all([
    supabase
      .from("vpn_orders")
      .select(
        `*,
        plan:vpn_plans(id, name, price_mmk, duration_days, data_limit_gb),
        reseller:resellers(id, name),
        payments:order_payments(
          id, order_id, customer_id, reseller_id, amount_mmk, commission_percent,
          commission_amount_mmk, platform_due_mmk, review_status, payment_type,
          apply_status, source, payment_method, payment_note, created_at, submitted_at,
          reviewed_at, review_note, package_duration_days, package_data_limit_gb
        ),
        keys:vpn_keys(
          id, order_id, customer_id, reseller_id, server_id, outline_key_id,
          key_name, access_url, data_limit_bytes, used_bytes, status, created_at,
          deleted_at
        )`
      )
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false }),
    supabase
      .from("telegram_links")
      .select("id, telegram_user_id, telegram_username, customer_id, reseller_id, trial_used_at, trial_order_id, created_at")
      .eq("customer_id", customerId)
      .maybeSingle(),
  ]);

  if (ordersError) throw new Error(ordersError.message);
  if (telegramError) throw new Error(telegramError.message);

  return enrichCustomer(customer, {
    orders: orders ?? [],
    telegramLink: telegramLinks ?? null,
    req,
  });
}

function normalizeIdList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))];
}

async function fetchCustomerCleanupPreview({ resellerId, customerIds }) {
  if (!resellerId || resellerId === "all") {
    const err = new Error("reseller_id is required");
    err.status = 400;
    throw err;
  }
  if (!customerIds.length) {
    const err = new Error("Select at least one customer");
    err.status = 400;
    throw err;
  }
  if (customerIds.length > 100) {
    const err = new Error("Cleanup is limited to 100 selected customers at a time");
    err.status = 400;
    throw err;
  }

  const { data: customers, error: customersError } = await supabase
    .from("vpn_customers")
    .select("id, reseller_id, full_name, telegram_username, phone, created_at, reseller:resellers(id, name)")
    .eq("reseller_id", resellerId)
    .in("id", customerIds);

  if (customersError) throw new Error(customersError.message);

  if ((customers || []).length !== customerIds.length) {
    const found = new Set((customers || []).map((customer) => customer.id));
    const missing = customerIds.filter((id) => !found.has(id));
    const sample = missing.slice(0, 3).join(", ");
    const suffix = missing.length > 3 ? ` and ${missing.length - 3} more` : "";
    const err = new Error(`Some selected customers do not belong to this reseller (${missing.length} invalid: ${sample}${suffix}). Refresh the customer list and select again.`);
    err.status = 400;
    throw err;
  }

  const { data: orders, error: ordersError } = await supabase
    .from("vpn_orders")
    .select("id, customer_id, reseller_id, status, order_type, payment_status, review_status, price_mmk, total_paid_mmk")
    .eq("reseller_id", resellerId)
    .in("customer_id", customerIds);

  if (ordersError) throw new Error(ordersError.message);

  const orderIds = (orders || []).map((order) => order.id);
  let keys = [];
  let payments = [];
  let tokens = [];
  let telegramLinks = [];
  let commissionRows = [];

  const [
    { data: keyRows, error: keysError },
    { data: paymentRows, error: paymentsError },
  ] = await Promise.all([
    supabase
      .from("vpn_keys")
      .select("id, order_id, customer_id, reseller_id, server_id, status, outline_key_id, deleted_at")
      .eq("reseller_id", resellerId)
      .in("customer_id", customerIds),
    supabase
      .from("order_payments")
      .select("id, order_id, customer_id, reseller_id, amount_mmk, review_status, apply_status, payment_type")
      .eq("reseller_id", resellerId)
      .in("customer_id", customerIds),
  ]);

  if (keysError) throw new Error(keysError.message);
  if (paymentsError) throw new Error(paymentsError.message);
  keys = keyRows || [];
  payments = paymentRows || [];

  if (orderIds.length > 0) {
    const { data: commissionLedger, error: commissionError } = await supabase
      .from("commission_ledger")
      .select("id, order_id, reseller_id, amount_mmk, status")
      .eq("reseller_id", resellerId)
      .in("order_id", orderIds);

    if (commissionError) throw new Error(commissionError.message);
    commissionRows = commissionLedger || [];
  }

  const { data: tokenRows, error: tokensError } = await supabase
    .from("access_tokens")
    .select("id, order_id, customer_id, reseller_id, status")
    .eq("reseller_id", resellerId)
    .in("customer_id", customerIds);

  if (tokensError) throw new Error(tokensError.message);
  tokens = tokenRows || [];

  const { data: linkRows, error: linksError } = await supabase
    .from("telegram_links")
    .select("id, customer_id, reseller_id, telegram_user_id, telegram_username")
    .eq("reseller_id", resellerId)
    .in("customer_id", customerIds);

  if (linksError) throw new Error(linksError.message);
  telegramLinks = linkRows || [];

  const confirmedPaidPayments = payments.filter(isConfirmedAppliedPayment);
  const activeKeys = keys.filter((key) => key.status === "active" && !key.deleted_at);
  const orderIdSet = new Set(orderIds);
  const orphanActiveKeys = activeKeys.filter((key) => !key.order_id || !orderIdSet.has(key.order_id));
  const activeOrders = (orders || []).filter((order) => order.status === "active");
  const grossConfirmedMmk = confirmedPaidPayments.reduce((sum, payment) => sum + toNumber(payment.amount_mmk), 0);

  return {
    reseller_id: resellerId,
    reseller_name: customers?.[0]?.reseller?.name || null,
    customer_ids: customerIds,
    customers: (customers || []).map((customer) => ({
      id: customer.id,
      full_name: customer.full_name,
      telegram_username: customer.telegram_username,
      phone: customer.phone,
      created_at: customer.created_at,
      order_count: (orders || []).filter((order) => order.customer_id === customer.id).length,
      confirmed_paid_mmk: confirmedPaidPayments
        .filter((payment) => payment.customer_id === customer.id)
        .reduce((sum, payment) => sum + toNumber(payment.amount_mmk), 0),
    })),
    counts: {
      customers: customers?.length || 0,
      orders: orders?.length || 0,
      active_orders: activeOrders.length,
      keys: keys.length,
      active_keys: activeKeys.length,
      orphan_active_keys: orphanActiveKeys.length,
      payments: payments.length,
      confirmed_paid_payments: confirmedPaidPayments.length,
      telegram_links: telegramLinks.length,
      access_tokens: tokens.length,
      commission_rows: commissionRows.length,
    },
    gross_confirmed_mmk: grossConfirmedMmk,
    has_confirmed_paid_data: grossConfirmedMmk > 0 || confirmedPaidPayments.length > 0,
    warnings: [
      activeKeys.length > 0 ? `${activeKeys.length} active VPN key(s) will be deleted from Outline before database cleanup.` : null,
      orphanActiveKeys.length > 0 ? `${orphanActiveKeys.length} active VPN key(s) are not attached to a selected order. Cleanup is blocked until those keys are handled manually.` : null,
      grossConfirmedMmk > 0 ? `Selected customers include ${grossConfirmedMmk.toLocaleString()} MMK confirmed paid ledger data.` : null,
    ].filter(Boolean),
    ids: {
      order_ids: orderIds,
      key_ids: keys.map((key) => key.id),
      orphan_active_key_ids: orphanActiveKeys.map((key) => key.id),
      payment_ids: payments.map((payment) => payment.id),
      token_ids: tokens.map((token) => token.id),
      telegram_link_ids: telegramLinks.map((link) => link.id),
      commission_ledger_ids: commissionRows.map((row) => row.id),
    },
  };
}

async function deleteRows(table, column, ids) {
  if (!ids.length) return 0;
  const { error } = await supabase.from(table).delete().in(column, ids);
  if (error) throw new Error(error.message);
  return ids.length;
}

// GET /api/admin/overview
router.get("/overview", async (req, res) => {
  try {
    const [
      { count: activeOrders },
      { count: pendingOrders },
      { count: stoppedOrders },
      { count: activeKeys },
      { data: confirmedPayments },
      { data: recentOrders },
    ] = await Promise.all([
      supabase.from("vpn_orders").select("*", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("vpn_orders").select("*", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("vpn_orders").select("*", { count: "exact", head: true }).eq("status", "stopped"),
      supabase.from("vpn_keys").select("*", { count: "exact", head: true }).eq("status", "active"),
      supabase
        .from("order_payments")
        .select("amount_mmk, review_status, apply_status")
        .eq("review_status", "confirmed")
        .eq("apply_status", "applied"),
      supabase
        .from("vpn_orders")
        .select("*, customer:vpn_customers(id, full_name, telegram_username), plan:vpn_plans(id, name), reseller:resellers(id, name)")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const totalValue = (confirmedPayments ?? []).reduce(
      (sum, payment) => sum + toNumber(payment.amount_mmk),
      0
    );

    return res.json({
      active_orders: activeOrders ?? 0,
      pending_orders: pendingOrders ?? 0,
      stopped_orders: stoppedOrders ?? 0,
      active_keys: activeKeys ?? 0,
      total_value_mmk: totalValue,
      recent_orders: recentOrders ?? [],
    });
  } catch (err) {
    console.error("admin GET overview crash:", err);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/analytics
router.get("/analytics", async (req, res) => {
  try {
    const monthWindow = getMonthWindow(req.query.month);
    const todayWindow = getTodayWindow();

    const [
      { count: activeOrders },
      { count: pendingOrders },
      { count: activeKeys },
      { count: activeResellers },
      { count: submittedSettlements },
      { data: payments, error: paymentsError },
      { data: recentPayments, error: recentPaymentsError },
    ] = await Promise.all([
      supabase.from("vpn_orders").select("*", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("vpn_orders").select("*", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("vpn_keys").select("*", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("resellers").select("*", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("monthly_settlements").select("*", { count: "exact", head: true }).eq("status", "submitted"),
      supabase
        .from("order_payments")
        .select(
          `id, order_id, customer_id, reseller_id, amount_mmk, commission_percent,
          commission_amount_mmk, platform_due_mmk, review_status, payment_type,
          apply_status, source, created_at, submitted_at, reviewed_at,
          reseller:resellers!order_payments_reseller_id_fkey(id, name, email),
          order:vpn_orders(id, status, order_type, created_at,
            customer:vpn_customers(id, full_name, telegram_username),
            plan:vpn_plans(id, name))`
        )
        .gte("created_at", monthWindow.start.toISOString())
        .lt("created_at", monthWindow.end.toISOString())
        .order("created_at", { ascending: false }),
      supabase
        .from("order_payments")
        .select(
          `id, order_id, customer_id, reseller_id, amount_mmk, commission_percent,
          commission_amount_mmk, platform_due_mmk, review_status, payment_type,
          apply_status, source, created_at, submitted_at, reviewed_at,
          reseller:resellers!order_payments_reseller_id_fkey(id, name, email),
          order:vpn_orders(id, status, order_type, created_at,
            customer:vpn_customers(id, full_name, telegram_username),
            plan:vpn_plans(id, name))`
        )
        .order("created_at", { ascending: false })
        .limit(12),
    ]);

    if (paymentsError) {
      console.error("admin GET analytics payments error:", paymentsError);
      return res.status(500).json({ error: paymentsError.message });
    }
    if (recentPaymentsError) {
      console.error("admin GET analytics recent payments error:", recentPaymentsError);
      return res.status(500).json({ error: recentPaymentsError.message });
    }

    const confirmedPayments = (payments ?? []).filter(isConfirmedAppliedPayment);
    const pendingReviewPayments = (payments ?? []).filter((payment) => payment.review_status === "pending_review");
    const todayConfirmedPayments = confirmedPayments.filter((payment) => {
      const createdAt = new Date(payment.created_at);
      return createdAt >= todayWindow.start && createdAt < todayWindow.end;
    });

    const dailyMap = new Map();
    const resellerMap = new Map();
    const paymentTypeMap = new Map();

    for (const payment of confirmedPayments) {
      const createdAt = new Date(payment.created_at);
      const dateKey = formatLocalDateKey(createdAt);
      const dailyBucket = dailyMap.get(dateKey) ?? {
        date: dateKey,
        gross_mmk: 0,
        commission_mmk: 0,
        platform_due_mmk: 0,
        payment_count: 0,
      };
      addPaymentToBucket(dailyBucket, payment);
      dailyMap.set(dateKey, dailyBucket);

      const resellerId = payment.reseller_id || "unknown";
      const resellerBucket = resellerMap.get(resellerId) ?? {
        reseller_id: resellerId,
        reseller_name: payment.reseller?.name || "Unknown reseller",
        gross_mmk: 0,
        commission_mmk: 0,
        platform_due_mmk: 0,
        payment_count: 0,
      };
      addPaymentToBucket(resellerBucket, payment);
      resellerMap.set(resellerId, resellerBucket);

      const paymentType = payment.payment_type || "initial";
      const paymentTypeBucket = paymentTypeMap.get(paymentType) ?? {
        payment_type: paymentType,
        gross_mmk: 0,
        commission_mmk: 0,
        platform_due_mmk: 0,
        payment_count: 0,
      };
      addPaymentToBucket(paymentTypeBucket, payment);
      paymentTypeMap.set(paymentType, paymentTypeBucket);
    }

    const summary = {
      today_gross_mmk: todayConfirmedPayments.reduce((sum, payment) => sum + toNumber(payment.amount_mmk), 0),
      month_gross_mmk: confirmedPayments.reduce((sum, payment) => sum + toNumber(payment.amount_mmk), 0),
      reseller_commission_mmk: confirmedPayments.reduce((sum, payment) => sum + toNumber(payment.commission_amount_mmk), 0),
      platform_due_mmk: confirmedPayments.reduce((sum, payment) => sum + toNumber(payment.platform_due_mmk), 0),
      pending_review_mmk: pendingReviewPayments.reduce((sum, payment) => sum + toNumber(payment.amount_mmk), 0),
      payment_count: confirmedPayments.length,
      pending_review_count: pendingReviewPayments.length,
      active_orders: activeOrders ?? 0,
      pending_orders: pendingOrders ?? 0,
      active_keys: activeKeys ?? 0,
      active_resellers: activeResellers ?? 0,
      submitted_settlements: submittedSettlements ?? 0,
    };

    return res.json({
      period: {
        month: monthWindow.month,
        time_zone: BUSINESS_TIME_ZONE,
        start_iso: monthWindow.start.toISOString(),
        end_iso: monthWindow.end.toISOString(),
        today: {
          date: todayWindow.date,
          start_iso: todayWindow.start.toISOString(),
          end_iso: todayWindow.end.toISOString(),
        },
      },
      summary,
      daily_revenue: Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
      reseller_breakdown: Array.from(resellerMap.values()).sort((a, b) => b.gross_mmk - a.gross_mmk),
      payment_type_breakdown: Array.from(paymentTypeMap.values()).sort((a, b) => b.gross_mmk - a.gross_mmk),
      recent_payments: recentPayments ?? [],
      pending_reviews: pendingReviewPayments.slice(0, 10),
    });
  } catch (err) {
    console.error("admin GET analytics crash:", err);
    return res.status(500).json({ error: err.message });
  }
});

router.post("/customers/cleanup-preview", async (req, res) => {
  try {
    const resellerId = String(req.body?.reseller_id || "").trim();
    const customerIds = normalizeIdList(req.body?.customer_ids);
    const preview = await fetchCustomerCleanupPreview({ resellerId, customerIds });
    return res.json({ success: true, preview });
  } catch (err) {
    console.error("admin POST customers cleanup preview crash:", err);
    return res.status(err.status || 500).json({ error: err.message });
  }
});

router.post("/customers/cleanup-delete", async (req, res) => {
  try {
    const resellerId = String(req.body?.reseller_id || "").trim();
    const customerIds = normalizeIdList(req.body?.customer_ids);
    const confirmation = String(req.body?.confirmation || "").trim();
    const allowPaidCustomers = req.body?.allow_paid_customers === true;
    const preview = await fetchCustomerCleanupPreview({ resellerId, customerIds });

    if (confirmation !== "DELETE TEST CUSTOMERS") {
      return res.status(400).json({ error: "Type DELETE TEST CUSTOMERS to confirm cleanup" });
    }

    if (preview.has_confirmed_paid_data && !allowPaidCustomers) {
      return res.status(409).json({
        error: "Selected customers include confirmed paid data. Re-preview and explicitly allow paid test customer deletion.",
        preview,
      });
    }

    if (preview.counts.orphan_active_keys > 0) {
      return res.status(409).json({
        error: "Cleanup blocked because selected customers have active VPN keys that are not attached to selected orders.",
        preview,
      });
    }

    for (const orderId of preview.ids.order_ids) {
      await stopOrderAccess(orderId);
    }

    if (preview.ids.token_ids.length > 0) {
      await deleteRows("token_server_assignments", "token_id", preview.ids.token_ids);
    }

    const deleted = {
      commission_ledger: await deleteRows("commission_ledger", "id", preview.ids.commission_ledger_ids),
      order_payments: await deleteRows("order_payments", "id", preview.ids.payment_ids),
      vpn_keys: await deleteRows("vpn_keys", "id", preview.ids.key_ids),
      access_tokens: await deleteRows("access_tokens", "id", preview.ids.token_ids),
      telegram_links: await deleteRows("telegram_links", "id", preview.ids.telegram_link_ids),
      vpn_orders: await deleteRows("vpn_orders", "id", preview.ids.order_ids),
      vpn_customers: await deleteRows("vpn_customers", "id", preview.customer_ids),
    };

    return res.json({
      success: true,
      message: "Selected test customers deleted",
      deleted,
      preview,
    });
  } catch (err) {
    console.error("admin POST customers cleanup delete crash:", err);
    return res.status(err.status || 500).json({ error: err.message });
  }
});

// GET /api/admin/customers
router.get("/customers", async (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req.query);
    const resellerId = req.query.reseller_id;

    let query = supabase
      .from("vpn_customers")
      .select("*, reseller:resellers(id, name)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (resellerId && resellerId !== "all") {
      query = query.eq("reseller_id", resellerId);
    }

    const { data, count, error } = await query;

    if (error) {
      console.error("admin GET customers error:", error);
      return res.status(500).json({ error: error.message });
    }

    const customers = data ?? [];
    const customerIds = customers.map((customer) => customer.id);
    let ordersByCustomerId = new Map();
    let telegramByCustomerId = new Map();

    if (customerIds.length > 0) {
      const [{ data: orders, error: ordersError }, { data: telegramLinks, error: telegramError }] = await Promise.all([
        supabase
          .from("vpn_orders")
          .select(
            `*,
            plan:vpn_plans(id, name, price_mmk, duration_days, data_limit_gb),
            reseller:resellers(id, name),
            payments:order_payments(
              id, order_id, customer_id, reseller_id, amount_mmk, commission_percent,
              commission_amount_mmk, platform_due_mmk, review_status, payment_type,
              apply_status, source, payment_method, payment_note, created_at, submitted_at,
              reviewed_at, review_note, package_duration_days, package_data_limit_gb
            ),
            keys:vpn_keys(
              id, order_id, customer_id, reseller_id, server_id, outline_key_id,
              key_name, access_url, data_limit_bytes, used_bytes, status, created_at,
              deleted_at
            )`
          )
          .in("customer_id", customerIds)
          .order("created_at", { ascending: false }),
        supabase
          .from("telegram_links")
          .select("id, telegram_user_id, telegram_username, customer_id, reseller_id, trial_used_at, trial_order_id, created_at")
          .in("customer_id", customerIds),
      ]);

      if (ordersError) {
        console.error("admin GET customers orders error:", ordersError);
        return res.status(500).json({ error: ordersError.message });
      }
      if (telegramError) {
        console.error("admin GET customers telegram error:", telegramError);
        return res.status(500).json({ error: telegramError.message });
      }

      for (const order of orders ?? []) {
        const list = ordersByCustomerId.get(order.customer_id) ?? [];
        list.push(order);
        ordersByCustomerId.set(order.customer_id, list);
      }
      for (const link of telegramLinks ?? []) {
        telegramByCustomerId.set(link.customer_id, link);
      }
    }

    return res.json({
      data: customers.map((customer) =>
        enrichCustomer(customer, {
          orders: ordersByCustomerId.get(customer.id) ?? [],
          telegramLink: telegramByCustomerId.get(customer.id) ?? null,
          req,
        })
      ),
      total: count ?? 0,
      page,
      limit,
    });
  } catch (err) {
    console.error("admin GET customers crash:", err);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/customers/:customerId
router.get("/customers/:customerId", async (req, res) => {
  try {
    const customerId = String(req.params.customerId || "").trim();
    const customer = await fetchEnrichedCustomer(customerId, req);

    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    return res.json({ data: customer });
  } catch (err) {
    console.error("admin GET customer detail crash:", err);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/orders
router.get("/orders", async (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req.query);
    const status = req.query.status;
    const resellerId = req.query.reseller_id;

    let query = supabase
      .from("vpn_orders")
      .select(
        `*,
        customer:vpn_customers(id, full_name, telegram_username, phone, ssconf_token),
        plan:vpn_plans(id, name, price_mmk, duration_days, data_limit_gb),
        reseller:resellers(id, name),
        payments:order_payments(
          id, order_id, customer_id, reseller_id, amount_mmk, commission_percent,
          commission_amount_mmk, platform_due_mmk, review_status, payment_type,
          apply_status, source, payment_method, payment_note, created_at, submitted_at,
          reviewed_at, review_note, package_duration_days, package_data_limit_gb
        ),
        keys:vpn_keys(
          id, order_id, customer_id, reseller_id, server_id, outline_key_id,
          key_name, access_url, data_limit_bytes, used_bytes, status, created_at,
          deleted_at
        )`,
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status && status !== "all") {
      query = query.eq("status", status);
    }
    if (resellerId && resellerId !== "all") {
      query = query.eq("reseller_id", resellerId);
    }

    const { data, count, error } = await query;

    if (error) {
      console.error("admin GET orders error:", error);
      return res.status(500).json({ error: error.message });
    }
    return res.json({
      data: (data ?? []).map((order) => enrichOrderAccess(order, req)),
      total: count ?? 0,
      page,
      limit,
    });
  } catch (err) {
    console.error("admin GET orders crash:", err);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/plans
router.get("/plans", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("vpn_plans")
      .select("*")
      .order("price_mmk", { ascending: true });

    if (error) {
      console.error("admin GET plans error:", error);
      return res.status(500).json({ error: error.message });
    }
    return res.json(data ?? []);
  } catch (err) {
    console.error("admin GET plans crash:", err);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/keys
router.get("/keys", async (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req.query);
    const status = req.query.status;
    const resellerId = req.query.reseller_id;

    let query = supabase
      .from("vpn_keys")
      .select("*, order:vpn_orders(id, status, payment_status)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status && status !== "all") {
      query = query.eq("status", status);
    }
    if (resellerId && resellerId !== "all") {
      query = query.eq("reseller_id", resellerId);
    }

    const { data, count, error } = await query;

    if (error) {
      console.error("admin GET keys error:", error);
      return res.status(500).json({ error: error.message });
    }
    return res.json({ data: data ?? [], total: count ?? 0, page, limit });
  } catch (err) {
    console.error("admin GET keys crash:", err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
