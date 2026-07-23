import express from "express";
import { supabase } from "../../lib/supabase.js";
import {
  activateOrder,
  extendOrder,
  renewOrder,
  stopOrder,
  confirmPayment,
  rejectPayment,
  OrderLifecycleError,
} from "../../services/orderLifecycleService.js";

const router = express.Router();

function calcExpiryDate(fromDate, durationDays) {
  const d = new Date(fromDate);
  d.setDate(d.getDate() + Number(durationDays || 30));
  return d;
}

function toDateOnly(date) {
  return new Date(date).toISOString().slice(0, 10);
}

// Unscoped — no reseller_id filter. Admin can act on any order.
async function getOrderWithPlan(orderId) {
  const { data, error } = await supabase
    .from("vpn_orders")
    .select(`
      *,
      customer:vpn_customers(id, full_name, reseller_id, telegram_username, phone),
      plan:vpn_plans(id, name, price_mmk, duration_days, data_limit_gb, max_devices, allowed_regions)
    `)
    .eq("id", orderId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

function adminTag(req) {
  return `admin:${req.admin?.id} (${req.admin?.full_name || req.admin?.email})`;
}

function sendLifecycleError(res, err, fallback) {
  if (err instanceof OrderLifecycleError) {
    return res.status(err.status || 400).json({
      success: false,
      error: err.message,
      code: err.code,
    });
  }

  return res.status(500).json({ success: false, error: err.message || fallback });
}

// POST /api/admin/order-actions/:orderId/activate
router.post("/:orderId/activate", async (req, res) => {
  const { orderId } = req.params;

  try {
    const order = await getOrderWithPlan(orderId);
    if (!order) return res.status(404).json({ error: "Order not found" });

    if (order.status !== "pending") {
      return res.status(400).json({
        error: `Order cannot be activated — current status is "${order.status}"`,
      });
    }

    const plan = order.plan;
    if (!plan) return res.status(400).json({ error: "Order has no associated plan" });

    console.log(
      `[${adminTag(req)}] ACTIVATE order ${orderId} — ` +
        `customer: ${order.customer?.full_name}, reseller: ${order.reseller_id}, plan: ${plan.name}`
    );

    const result = await activateOrder({
      orderId,
      reseller: { id: order.reseller_id },
    });

    return res.json(result);
  } catch (err) {
    console.error(`[${adminTag(req)}] activate order ${orderId} crash:`, err);
    return sendLifecycleError(res, err, "Failed to activate order");
  }
});

// POST /api/admin/order-actions/:orderId/extend
// Body (optional): { plan_id } to swap plan
// Always extends from today so admin can recover lapsed/stopped orders.
router.post("/:orderId/extend", async (req, res) => {
  const { orderId } = req.params;

  try {
    const order = await getOrderWithPlan(orderId);
    if (!order) return res.status(404).json({ error: "Order not found" });

    if (!["active", "expired", "stopped"].includes(order.status)) {
      return res.status(400).json({
        error: `Order cannot be extended — current status is "${order.status}"`,
      });
    }

    let plan = order.plan;
    const newPlanId = req.body?.plan_id;

    if (newPlanId && newPlanId !== plan?.id) {
      const { data: newPlan, error: planErr } = await supabase
        .from("vpn_plans")
        .select("*")
        .eq("id", newPlanId)
        .maybeSingle();

      if (planErr || !newPlan) {
        return res.status(400).json({ error: "Plan not found" });
      }
      plan = newPlan;
    }

    if (!plan) return res.status(400).json({ error: "Order has no associated plan" });

    const now = new Date();
    const expiryAt = calcExpiryDate(now, plan.duration_days);

    const updates = {
      expiry_date: toDateOnly(expiryAt),
      start_date: toDateOnly(now),
      stopped_at: null,
      updated_at: now.toISOString(),
    };

    if (newPlanId && newPlanId !== order.plan_id) {
      updates.plan_id = newPlanId;
    }

    if (order.status !== "active") {
      updates.status = "active";
      updates.activated_at = now.toISOString();
    }

    console.log(
      `[${adminTag(req)}] EXTEND order ${orderId} — ` +
        `customer: ${order.customer?.full_name}, plan: ${plan.name}, new expiry: ${toDateOnly(expiryAt)}`
    );

    const result =
      order.status === "active"
        ? await extendOrder({
            orderId,
            resellerId: order.reseller_id,
            planId: newPlanId,
            idempotencyKey: req.body?.idempotency_key || req.get("Idempotency-Key") || null,
            source: "admin",
          })
        : await renewOrder({
            orderId,
            reseller: { id: order.reseller_id },
            planId: newPlanId,
            idempotencyKey: req.body?.idempotency_key || req.get("Idempotency-Key") || null,
            source: "admin",
          });

    return res.json(result);
  } catch (err) {
    console.error(`[${adminTag(req)}] extend order ${orderId} crash:`, err);
    return sendLifecycleError(res, err, "Failed to extend order");
  }
});

// POST /api/admin/order-actions/:orderId/stop
// Destructive: deletes Outline VPN keys and cuts customer access.
router.post("/:orderId/stop", async (req, res) => {
  const { orderId } = req.params;

  try {
    const order = await getOrderWithPlan(orderId);
    if (!order) return res.status(404).json({ error: "Order not found" });

    if (order.status === "stopped") {
      return res.status(400).json({ error: "Order is already stopped" });
    }

    console.log(
      `[${adminTag(req)}] STOP order ${orderId} — ` +
        `customer: ${order.customer?.full_name}, reseller: ${order.reseller_id} — DELETING VPN KEYS`
    );

    const result = await stopOrder({
      orderId,
      resellerId: order.reseller_id,
    });

    return res.json(result);

  } catch (err) {
    console.error(`[${adminTag(req)}] stop order ${orderId} crash:`, err);
    return sendLifecycleError(res, err, "Failed to stop order");
  }
});

// POST /api/admin/order-actions/:orderId/confirm-payment
router.post("/:orderId/confirm-payment", async (req, res) => {
  const { orderId } = req.params;

  try {
    const order = await getOrderWithPlan(orderId);
    if (!order) return res.status(404).json({ error: "Order not found" });

    console.log(
      `[${adminTag(req)}] CONFIRM PAYMENT order ${orderId} - ` +
        `customer: ${order.customer?.full_name}, reseller: ${order.reseller_id}`
    );

    const result = await confirmPayment({
      orderId,
      resellerId: order.reseller_id,
      reviewerAdminId: req.admin?.id || null,
    });

    return res.json(result);
  } catch (err) {
    console.error(`[${adminTag(req)}] confirm payment ${orderId} crash:`, err);
    return sendLifecycleError(res, err, "Failed to confirm payment");
  }
});

// POST /api/admin/order-actions/:orderId/reject-payment
router.post("/:orderId/reject-payment", async (req, res) => {
  const { orderId } = req.params;

  try {
    const order = await getOrderWithPlan(orderId);
    if (!order) return res.status(404).json({ error: "Order not found" });

    console.log(
      `[${adminTag(req)}] REJECT PAYMENT order ${orderId} - ` +
        `customer: ${order.customer?.full_name}, reseller: ${order.reseller_id}`
    );

    const result = await rejectPayment({
      orderId,
      resellerId: order.reseller_id,
      reviewerAdminId: req.admin?.id || null,
    });

    return res.json(result);
  } catch (err) {
    console.error(`[${adminTag(req)}] reject payment ${orderId} crash:`, err);
    return sendLifecycleError(res, err, "Failed to reject payment");
  }
});

export default router;
