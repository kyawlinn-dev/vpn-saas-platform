import express from "express";
import { supabase } from "../../lib/supabase.js";
import { getActiveServers } from "../../services/serverService.js";
import {
  ensureOrderToken,
  getTokenByOrderId,
  deactivateToken,
} from "../../services/tokenService.js";
import {
  provisionServersForToken,
  deleteProvisionedKeysForOrder,
  updateProvisionedKeyLimitsForOrder,
  deactivateTokenAssignments,
} from "../../services/subscriptionProvisionService.js";

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

    const regions = Array.isArray(plan.allowed_regions)
      ? plan.allowed_regions.filter(Boolean)
      : [];
    const limit = regions.length || 1;

    const selectedServers = await getActiveServers({ regions, limit });
    if (!selectedServers.length) {
      return res.status(409).json({ error: "No active server available" });
    }

    const now = new Date();
    const expiryAt = calcExpiryDate(now, plan.duration_days);

    const token = await ensureOrderToken({
      customerId: order.customer_id,
      resellerId: order.reseller_id,
      orderId: order.id,
      expiresAt: expiryAt.toISOString(),
    });

    await provisionServersForToken({
      token,
      order,
      customer: order.customer,
      reseller: { id: order.reseller_id },
      plan,
      servers: selectedServers,
    });

    const { error: updateErr } = await supabase
      .from("vpn_orders")
      .update({
        status: "active",
        activated_at: now.toISOString(),
        start_date: toDateOnly(now),
        expiry_date: toDateOnly(expiryAt),
        stopped_at: null,
        updated_at: now.toISOString(),
      })
      .eq("id", orderId);

    if (updateErr) throw new Error(updateErr.message);

    return res.json({
      success: true,
      message: "Order activated",
      order_id: orderId,
      expiry_date: toDateOnly(expiryAt),
    });
  } catch (err) {
    console.error(`[${adminTag(req)}] activate order ${orderId} crash:`, err);
    return res.status(500).json({ error: err.message || "Failed to activate order" });
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

    const { error: updateErr } = await supabase
      .from("vpn_orders")
      .update(updates)
      .eq("id", orderId);

    if (updateErr) throw new Error(updateErr.message);

    await updateProvisionedKeyLimitsForOrder({ orderId, plan });

    return res.json({
      success: true,
      message: "Order extended",
      order_id: orderId,
      expiry_date: toDateOnly(expiryAt),
    });
  } catch (err) {
    console.error(`[${adminTag(req)}] extend order ${orderId} crash:`, err);
    return res.status(500).json({ error: err.message || "Failed to extend order" });
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

    await deleteProvisionedKeysForOrder(orderId);

    // Deactivate legacy access token + assignments if present
    const token = await getTokenByOrderId(orderId);
    if (token) {
      await deactivateTokenAssignments(token.id);
      await deactivateToken(token.id);
    }

    const now = new Date();
    const { error: updateErr } = await supabase
      .from("vpn_orders")
      .update({
        status: "stopped",
        stopped_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("id", orderId);

    if (updateErr) throw new Error(updateErr.message);

    return res.json({
      success: true,
      message: "Order stopped — VPN keys deleted",
      order_id: orderId,
    });
  } catch (err) {
    console.error(`[${adminTag(req)}] stop order ${orderId} crash:`, err);
    return res.status(500).json({ error: err.message || "Failed to stop order" });
  }
});

export default router;
