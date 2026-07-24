import express from "express";
import { supabase } from "../../lib/supabase.js";
import {
  addDaysToDateOnly,
  businessDateOnly,
  currentBusinessMonth,
  parseBusinessDay,
  parseBusinessMonth,
} from "../../utils/businessTime.js";
import { toNumber, isConfirmedAppliedPayment } from "../../services/customerOrderEnrichmentService.js";

const router = express.Router();

export function isTelegramManagedOrder(order) {
  const source = String(order?.source || "").toLowerCase();
  return order?.customer?.customer_type === "telegram" || source === "miniapp" || source === "bot";
}

// A Telegram/miniapp purchase still awaiting review doesn't belong in the
// general "Recent Activity" feed — that's what the Attention Queue is for.
// Once it's been reviewed (confirmed OR rejected) it's fine to show here;
// the frontend renders a distinct "Rejected" tag for the rejected case.
// Non-telegram (dashboard) orders are never excluded here.
export function belongsInRecentActivity(order) {
  return !isTelegramManagedOrder(order) || order?.review_status !== "pending_review";
}

// Same shape as OverviewPage.tsx's legacyRevenueFromOrders: orders confirmed
// before the order_payments ledger existed have no payment rows, so their
// revenue is read from the order itself instead of double counting.
//
// Only confirmed + applied payments count as revenue (matches the admin
// dashboard's isConfirmedAppliedPayment filter) — a fresh miniapp purchase's
// payment sits at review_status="pending_review" until the reseller
// confirms it, so it must not inflate today/month revenue before that.
export function revenueInWindow({ payments, legacyOrders, startIso, endIso }) {
  const inWindow = (value) => Boolean(value) && value >= startIso && value < endIso;

  const ledgerTotal = payments
    .filter(isConfirmedAppliedPayment)
    .filter((payment) => inWindow(payment.created_at))
    .reduce((sum, payment) => sum + toNumber(payment.amount_mmk), 0);

  const legacyTotal = legacyOrders
    .filter((order) => !order.payments?.length && order.order_type === "purchase" && order.review_status === "confirmed")
    .filter((order) => inWindow(order.created_at))
    .reduce((sum, order) => sum + toNumber(order.total_paid_mmk), 0);

  return ledgerTotal + legacyTotal;
}

// GET /api/reseller/stats/overview
//
// A reseller's own order history is small (tens to low hundreds of rows,
// not system-wide volume), so this fetches it once with the fields the
// whole page needs and derives every stat in JS, instead of firing a dozen
// separate count/list queries in parallel. That fan-out was cheap per query
// but saturated the PostgREST/Postgres connection pool under real
// concurrent usage, causing unrelated requests to queue up and time out.
router.get("/overview", async (req, res) => {
  try {
    const reseller = req.reseller;
    const monthWindow = parseBusinessMonth(currentBusinessMonth());
    const todayWindow = parseBusinessDay(businessDateOnly());
    const today = businessDateOnly();
    const expiryHorizon = addDaysToDateOnly(today, 7);

    const [
      { data: orders, error: ordersError },
      { count: activeKeysCount, error: keysError },
    ] = await Promise.all([
      supabase
        .from("vpn_orders")
        .select(
          `id, customer_id, status, order_type, review_status, payment_status, source,
          price_mmk, total_paid_mmk, expiry_date, created_at,
          customer:vpn_customers!vpn_orders_customer_id_fkey(id, full_name, telegram_username, phone, customer_type),
          plan:vpn_plans(id, name),
          payments:order_payments(id, amount_mmk, review_status, apply_status, created_at)`
        )
        .eq("reseller_id", reseller.id)
        .order("created_at", { ascending: false }),
      supabase.from("vpn_keys").select("*", { count: "exact", head: true }).eq("reseller_id", reseller.id).eq("status", "active"),
    ]);

    if (ordersError || keysError) {
      console.error("GET /api/reseller/stats/overview query error:", { ordersError, keysError });
      return res.status(500).json({ error: "Failed to load overview stats" });
    }

    const rows = orders ?? [];
    const allPayments = rows.flatMap((order) => order.payments ?? []);

    const activeOrders = rows.filter((order) => order.status === "active");
    const pendingOrders = rows.filter((order) => order.status === "pending");
    const activeCustomers = new Set(activeOrders.map((order) => order.customer_id)).size;

    const monthRevenue = revenueInWindow({
      payments: allPayments,
      legacyOrders: rows,
      startIso: monthWindow.startIso,
      endIso: monthWindow.endIso,
    });
    const todayRevenue = revenueInWindow({
      payments: allPayments,
      legacyOrders: rows,
      startIso: todayWindow.startIso,
      endIso: todayWindow.endIso,
    });

    const telegramReviewOrders = rows.filter(
      (order) =>
        order.order_type === "purchase" &&
        order.review_status === "pending_review" &&
        isTelegramManagedOrder(order)
    );

    const expiringOrders = activeOrders
      .filter((order) => order.expiry_date && order.expiry_date >= today && order.expiry_date <= expiryHorizon)
      .sort((a, b) => new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime());

    const recentActivityOrders = rows.filter(belongsInRecentActivity);

    return res.json({
      active_orders: activeOrders.length,
      pending_orders: pendingOrders.length,
      total_orders: rows.length,
      active_keys: activeKeysCount ?? 0,
      active_customers: activeCustomers,
      today_revenue_mmk: todayRevenue,
      month_revenue_mmk: monthRevenue,
      telegram_review: {
        count: telegramReviewOrders.length,
        recent: telegramReviewOrders.slice(0, 3),
      },
      expiring_soon: {
        count: expiringOrders.length,
        recent: expiringOrders.slice(0, 3),
      },
      recent_orders: recentActivityOrders.slice(0, 5),
    });
  } catch (err) {
    console.error("GET /api/reseller/stats/overview crash:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
