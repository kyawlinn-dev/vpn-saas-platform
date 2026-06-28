import express from "express";
import { supabase } from "../../lib/supabase.js";
import {
  getActiveServers,
  ServerAvailabilityError,
} from "../../services/serverService.js";
import {
  ensureOrderToken,
  getTokenByOrderId,
  deactivateToken,
  activateToken,
} from "../../services/tokenService.js";
import {
  provisionServersForToken,
  deleteProvisionedKeysForOrder,
  updateProvisionedKeyLimitsForOrder,
  deactivateTokenAssignments,
} from "../../services/subscriptionProvisionService.js";
import { normalizePaymentStatus } from "../../utils/validators.js";

const router = express.Router();

function calcExpiryDate(fromDate, durationDays) {
  const d = new Date(fromDate);
  d.setDate(d.getDate() + Number(durationDays || 30));
  return d;
}

function toDateOnly(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function buildSubscriptionUrl(token) {
  const base = process.env.PUBLIC_SUBSCRIPTION_BASE_URL?.trim();
  if (!base) return null;
  return `${base.replace(/\/$/, "")}/api/public/subscription?token=${encodeURIComponent(token)}`;
}

async function getResellerScopedOrder(orderId, resellerId) {
  const { data, error } = await supabase
    .from("vpn_orders")
    .select(`
      *,
      customer:vpn_customers(id, full_name, reseller_id, telegram_username, phone),
      plan:vpn_plans(id, name, price_mmk, duration_days, data_limit_gb, max_devices, allowed_regions)
    `)
    .eq("id", orderId)
    .eq("reseller_id", resellerId)
    .single();

  return { data, error };
}

async function resolvePlan(planId, fallbackPlan) {
  if (!planId || planId === fallbackPlan?.id) return fallbackPlan;

  const { data, error } = await supabase
    .from("vpn_plans")
    .select("*")
    .eq("id", planId)
    .eq("is_active", true)
    .single();

  if (error || !data) throw new Error("Plan not found");
  return data;
}

async function ensureCommissionEntry(order) {
  const { data: existing, error } = await supabase
    .from("commission_ledger")
    .select("id")
    .eq("order_id", order.id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (existing) return;

  const { error: insertErr } = await supabase.from("commission_ledger").insert({
    order_id: order.id,
    reseller_id: order.reseller_id,
    amount_mmk: order.commission_amount_mmk,
    status: "pending",
  });

  if (insertErr) throw new Error(insertErr.message);
}

function getPlanRegions(plan) {
  const allowed = Array.isArray(plan?.allowed_regions)
    ? plan.allowed_regions.filter(Boolean)
    : [];

  if (allowed.length > 0) return allowed;
  return ["india", "singapore"];
}

async function activateOrRenewOrder({ order, reseller, plan, mode }) {
  const now = new Date();
  const expiryAt = calcExpiryDate(now, plan.duration_days);
  const regions = getPlanRegions(plan);

  const selectedServers = await getActiveServers({
    regions,
    limit: regions.length,
  });

  if (!selectedServers.length) {
    throw new ServerAvailabilityError("No active server available", "NO_ACTIVE_SERVER");
  }

  if (regions.length && selectedServers.length < regions.length) {
    const availableRegions = new Set(
      selectedServers.map((server) => String(server.region || "").toLowerCase())
    );

    const missingRegions = regions.filter(
      (region) => !availableRegions.has(String(region || "").toLowerCase())
    );

    throw new ServerAvailabilityError(
      `Missing active server capacity for region(s): ${missingRegions.join(", ")}`,
      "MISSING_REGION_CAPACITY"
    );
  }

  const token = await ensureOrderToken({
    customerId: order.customer_id,
    resellerId: order.reseller_id,
    orderId: order.id,
    expiresAt: expiryAt.toISOString(),
  });

  if (mode === "renew") {
    await deleteProvisionedKeysForOrder(order.id);
    await deactivateTokenAssignments(token.id);
    await activateToken(token.id, expiryAt.toISOString());
  }

  const configs = await provisionServersForToken({
    token,
    order,
    customer: order.customer,
    reseller,
    plan,
    servers: selectedServers,
  });

  const updatePayload = {
    status: "active",
    activated_at: now.toISOString(),
    start_date: toDateOnly(now),
    expiry_date: toDateOnly(expiryAt),
    stopped_at: null,
    plan_id: plan.id,
    price_mmk: Number(plan.price_mmk ?? order.price_mmk ?? 0),
  };

  if (mode === "renew") {
    updatePayload.total_paid_mmk =
      Number(order.total_paid_mmk || 0) + Number(plan.price_mmk || 0);
  }

  const { error: updateErr } = await supabase
    .from("vpn_orders")
    .update(updatePayload)
    .eq("id", order.id);

  if (updateErr) throw new Error(updateErr.message);

  await ensureCommissionEntry(order);

  return {
    token: token.token,
    expires_at: expiryAt.toISOString(),
    expiry_date: toDateOnly(expiryAt),
    server_count: configs.length,
    servers: configs,
    subscription_url: buildSubscriptionUrl(token.token),
  };
}

router.post("/:orderId/activate", async (req, res) => {
  try {
    const reseller = req.reseller;
    const { data: order, error } = await getResellerScopedOrder(
      req.params.orderId,
      reseller.id
    );

    if (error || !order) return res.status(404).json({ error: "Order not found" });

    if (order.status === "active") {
      const token = await getTokenByOrderId(order.id);
      return res.json({
        success: true,
        already_active: true,
        message: "Order is already active",
        order_id: order.id,
        expiry_date: order.expiry_date,
        review_status: order.review_status || null,
        token: token?.token || null,
        subscription_url: token?.token ? buildSubscriptionUrl(token.token) : null,
      });
    }

    if (order.status !== "pending") {
      return res.status(400).json({
        error: `Only pending orders can be activated. Current status: ${order.status}`,
      });
    }

    if (order.payment_status !== "paid") {
      return res.status(400).json({
        error: "Payment must be marked as paid before activating.",
      });
    }

    const result = await activateOrRenewOrder({
      order,
      reseller,
      plan: order.plan,
      mode: "activate",
    });

    return res.json({
      success: true,
      message: "Order activated",
      order_id: order.id,
      review_status: order.review_status || null,
      ...result,
    });
  } catch (err) {
    if (err instanceof ServerAvailabilityError) {
      return res.status(409).json({ error: err.message, code: err.code });
    }

    console.error("activate crash:", err);
    return res.status(500).json({ error: err.message || "Failed to activate order" });
  }
});

router.post("/:orderId/extend", async (req, res) => {
  try {
    const { plan_id } = req.body || {};
    const reseller = req.reseller;
    const { data: order, error } = await getResellerScopedOrder(
      req.params.orderId,
      reseller.id
    );

    if (error || !order) return res.status(404).json({ error: "Order not found" });

    if (!["active", "expired"].includes(order.status)) {
      return res.status(400).json({
        error: `Only active or expired orders can be extended. Current status: ${order.status}`,
      });
    }

    const plan = await resolvePlan(plan_id, order.plan);
    const baseDate =
      order.expiry_date && new Date(order.expiry_date) > new Date()
        ? new Date(order.expiry_date)
        : new Date();

    const expiryAt = calcExpiryDate(baseDate, plan.duration_days);

    const token = await ensureOrderToken({
      customerId: order.customer_id,
      resellerId: order.reseller_id,
      orderId: order.id,
      expiresAt: expiryAt.toISOString(),
    });

    await updateProvisionedKeyLimitsForOrder({ orderId: order.id, plan });

    const { error: updateErr } = await supabase
      .from("vpn_orders")
      .update({
        status: "active",
        expiry_date: toDateOnly(expiryAt),
        plan_id: plan.id,
        price_mmk: Number(plan.price_mmk ?? 0),
        total_paid_mmk:
          Number(order.total_paid_mmk || 0) + Number(plan.price_mmk || 0),
      })
      .eq("id", order.id);

    if (updateErr) throw new Error(updateErr.message);

    return res.json({
      success: true,
      message: "Order extended",
      order_id: order.id,
      token: token.token,
      expiry_date: toDateOnly(expiryAt),
      expires_at: expiryAt.toISOString(),
      subscription_url: buildSubscriptionUrl(token.token),
    });
  } catch (err) {
    console.error("extend crash:", err);
    return res.status(500).json({ error: err.message || "Failed to extend order" });
  }
});

router.post("/:orderId/confirm-payment", async (req, res) => {
  try {
    const reseller = req.reseller;
    const { data: order, error } = await getResellerScopedOrder(
      req.params.orderId,
      reseller.id
    );

    if (error || !order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.order_type !== "purchase") {
      return res.status(400).json({ error: "Only purchase orders can be confirmed" });
    }

    if (order.status !== "active") {
      return res.status(400).json({
        error: `Only active orders can be confirmed. Current status: ${order.status}`,
      });
    }

    if (order.review_status === "confirmed") {
      return res.json({
        success: true,
        already_confirmed: true,
        message: "Payment already confirmed",
        order_id: order.id,
      });
    }

    if (order.review_status === "rejected") {
      return res.status(400).json({
        error: "Rejected orders cannot be confirmed",
      });
    }

    const { error: updateErr } = await supabase
      .from("vpn_orders")
      .update({
        review_status: "confirmed",
        payment_status: "paid",
        total_paid_mmk: Number(order.price_mmk || 0),
      })
      .eq("id", order.id);

    if (updateErr) throw new Error(updateErr.message);

    await ensureCommissionEntry(order);

    return res.json({
      success: true,
      message: "Payment confirmed",
      order_id: order.id,
      review_status: "confirmed",
      payment_status: "paid",
    });
  } catch (err) {
    console.error("confirm-payment crash:", err);
    return res.status(500).json({ error: err.message || "Failed to confirm payment" });
  }
});

router.post("/:orderId/reject-payment", async (req, res) => {
  try {
    const reseller = req.reseller;
    const { data: order, error } = await getResellerScopedOrder(
      req.params.orderId,
      reseller.id
    );

    if (error || !order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.order_type !== "purchase") {
      return res.status(400).json({ error: "Only purchase orders can be rejected" });
    }

    if (order.review_status === "rejected") {
      return res.json({
        success: true,
        already_rejected: true,
        message: "Payment already rejected",
        order_id: order.id,
      });
    }

    const token = await getTokenByOrderId(order.id);

    if (token?.id) {
      try {
        await deactivateTokenAssignments(token.id);
      } catch (err) {
        console.warn("deactivateTokenAssignments warning:", err.message);
      }

      try {
        await deactivateToken(token.id);
      } catch (err) {
        console.warn("deactivateToken warning:", err.message);
      }
    }

    try {
      await deleteProvisionedKeysForOrder(order.id);
    } catch (err) {
      console.warn("deleteProvisionedKeysForOrder warning:", err.message);
    }

    const { error: updateErr } = await supabase
      .from("vpn_orders")
      .update({
        status: "stopped",
        review_status: "rejected",
        payment_status: "unpaid",
        stopped_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    if (updateErr) throw new Error(updateErr.message);

    return res.json({
      success: true,
      message: "Payment rejected and access removed",
      order_id: order.id,
      review_status: "rejected",
      status: "stopped",
    });
  } catch (err) {
    console.error("reject-payment crash:", err);
    return res.status(500).json({ error: err.message || "Failed to reject payment" });
  }
});

router.post("/:orderId/payment-status", async (req, res) => {
  try {
    const reseller = req.reseller;
    const { status } = req.body || {};
    const normalizedStatus = normalizePaymentStatus(status);

    const { data: order, error } = await getResellerScopedOrder(
      req.params.orderId,
      reseller.id
    );

    if (error || !order) return res.status(404).json({ error: "Order not found" });
    if (!normalizedStatus) return res.status(400).json({ error: "Invalid payment status" });

    const { error: updateErr } = await supabase
      .from("vpn_orders")
      .update({ payment_status: normalizedStatus })
      .eq("id", order.id);

    if (updateErr) throw new Error(updateErr.message);

    return res.json({
      success: true,
      message: "Payment status updated",
      order_id: order.id,
      payment_status: normalizedStatus,
    });
  } catch (err) {
    console.error("payment status crash:", err);
    return res.status(500).json({ error: err.message || "Failed to update payment status" });
  }
});

export default router;