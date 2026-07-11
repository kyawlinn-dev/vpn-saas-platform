import { supabase } from "../lib/supabase.js";
import { getActiveServers, ServerAvailabilityError } from "./serverService.js";
import {
  ensureOrderToken,
  getTokenByOrderId,
  deactivateToken,
  activateToken,
} from "./tokenService.js";
import {
  provisionServersForToken,
  deleteProvisionedKeysForOrder,
  updateProvisionedKeyLimitsForOrder,
  deactivateTokenAssignments,
} from "./subscriptionProvisionService.js";

export class OrderLifecycleError extends Error {
  constructor(message, status = 400, code = "ORDER_LIFECYCLE_ERROR") {
    super(message);
    this.name = "OrderLifecycleError";
    this.status = status;
    this.code = code;
  }
}

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

function getPlanRegions(plan) {
  if (!Array.isArray(plan?.allowed_regions)) return [];
  return plan.allowed_regions.filter(Boolean);
}

export async function getResellerScopedOrder(orderId, resellerId) {
  if (!orderId) {
    throw new OrderLifecycleError("Invalid order ID", 400, "INVALID_ORDER_ID");
  }
  if (!resellerId) {
    throw new OrderLifecycleError("Missing reseller ID", 401, "MISSING_RESELLER_ID");
  }

  const { data, error } = await supabase
    .from("vpn_orders")
    .select(`
      *,
      customer:vpn_customers(id, full_name, reseller_id, telegram_username, phone),
      plan:vpn_plans(id, name, price_mmk, duration_days, data_limit_gb, max_devices, allowed_regions, is_active, is_trial)
    `)
    .eq("id", orderId)
    .eq("reseller_id", resellerId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) {
    throw new OrderLifecycleError("Order not found", 404, "ORDER_NOT_FOUND");
  }

  return data;
}

async function resolvePlan(planId, fallbackPlan) {
  if (!planId || planId === fallbackPlan?.id) {
    if (!fallbackPlan?.id) {
      throw new OrderLifecycleError("Order plan is missing", 400, "PLAN_NOT_FOUND");
    }
    if (fallbackPlan.is_active === false) {
      throw new OrderLifecycleError("Order plan is inactive", 400, "PLAN_INACTIVE");
    }
    return fallbackPlan;
  }

  const { data, error } = await supabase
    .from("vpn_plans")
    .select("*")
    .eq("id", planId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) {
    throw new OrderLifecycleError("Plan not found or inactive", 400, "PLAN_NOT_FOUND");
  }

  return data;
}

async function ensureCommissionEntry(order) {
  if (Number(order.commission_amount_mmk || 0) <= 0) return;

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

async function countActiveKeys(orderId) {
  const { count, error } = await supabase
    .from("vpn_keys")
    .select("id", { count: "exact", head: true })
    .eq("order_id", orderId)
    .eq("status", "active")
    .is("deleted_at", null);

  if (error) throw new Error(error.message);
  return Number(count || 0);
}

export async function assertNoOtherActivePurchase({ customerId, resellerId, excludeOrderId }) {
  const { data, error } = await supabase
    .from("vpn_orders")
    .select("id")
    .eq("customer_id", customerId)
    .eq("reseller_id", resellerId)
    .eq("status", "active")
    .eq("order_type", "purchase")
    .neq("id", excludeOrderId)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (data) {
    throw new OrderLifecycleError(
      "Customer already has an active paid subscription",
      409,
      "CUSTOMER_ALREADY_ACTIVE"
    );
  }
}

export async function stopOrderAccess(orderId) {
  const token = await getTokenByOrderId(orderId);

  if (token?.id) {
    await deactivateTokenAssignments(token.id);
    await deactivateToken(token.id);
  }

  await deleteProvisionedKeysForOrder(orderId);
}

async function markOrderStopped(orderId, extra = {}) {
  const { error } = await supabase
    .from("vpn_orders")
    .update({
      status: "stopped",
      stopped_at: new Date().toISOString(),
      ...extra,
    })
    .eq("id", orderId);

  if (error) throw new Error(error.message);
}

export async function stopActiveTrialsForCustomer({ customerId, resellerId, excludeOrderId = null }) {
  const { data: trials, error } = await supabase
    .from("vpn_orders")
    .select("id")
    .eq("customer_id", customerId)
    .eq("reseller_id", resellerId)
    .eq("status", "active")
    .eq("order_type", "trial");

  if (error) throw new Error(error.message);

  for (const trial of trials || []) {
    if (excludeOrderId && trial.id === excludeOrderId) continue;
    await stopOrderAccess(trial.id);
    await markOrderStopped(trial.id);
  }
}

export async function provisionOrderAccess({ order, reseller, plan, mode = "activate" }) {
  const now = new Date();
  const expiryAt = calcExpiryDate(now, plan.duration_days);
  const regions = getPlanRegions(plan);

  if (["activate", "renew"].includes(mode)) {
    // Retry safety: if a previous activation attempt created partial access
    // before the order status changed, remove it before provisioning again.
    await stopOrderAccess(order.id);
  }

  // With regions: pick one server per region. Without: pick the single least-loaded server.
  const serverLimit = regions.length > 0 ? regions.length : 1;

  const selectedServers = await getActiveServers({
    regions,
    limit: serverLimit,
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

  return {
    token: token.token,
    expires_at: expiryAt.toISOString(),
    expiry_date: toDateOnly(expiryAt),
    server_count: configs.length,
    servers: configs,
    subscription_url: buildSubscriptionUrl(token.token),
  };
}

export async function activatePendingReviewPurchase({ order, reseller, plan }) {
  if (!order?.id) {
    throw new OrderLifecycleError("Invalid order", 400, "INVALID_ORDER");
  }

  if (order.order_type !== "purchase") {
    throw new OrderLifecycleError("Only purchase orders can be provisioned", 400, "INVALID_ORDER_TYPE");
  }

  if (order.review_status === "rejected") {
    throw new OrderLifecycleError("Rejected orders cannot be provisioned", 409, "ORDER_REJECTED");
  }

  if (order.status === "active") {
    const activeKeyCount = await countActiveKeys(order.id);
    if (activeKeyCount > 0) {
      const token = await getTokenByOrderId(order.id);
      return {
        success: true,
        already_active: true,
        message: "Order already has active access",
        order_id: order.id,
        token: token?.token || null,
        expiry_date: order.expiry_date,
        expires_at: token?.expires_at || null,
        subscription_url: token?.token ? buildSubscriptionUrl(token.token) : null,
      };
    }
  } else if (order.status !== "pending") {
    throw new OrderLifecycleError(
      `Only pending purchase orders can start review access. Current status: ${order.status}`,
      409,
      "INVALID_STATUS"
    );
  }

  await assertNoOtherActivePurchase({
    customerId: order.customer_id,
    resellerId: order.reseller_id,
    excludeOrderId: order.id,
  });

  await stopActiveTrialsForCustomer({
    customerId: order.customer_id,
    resellerId: order.reseller_id,
    excludeOrderId: order.id,
  });

  const resolvedPlan = await resolvePlan(plan?.id || order.plan_id, plan || order.plan);
  const result = await provisionOrderAccess({
    order,
    reseller,
    plan: resolvedPlan,
    mode: "activate",
  });

  try {
    await assertNoOtherActivePurchase({
      customerId: order.customer_id,
      resellerId: order.reseller_id,
      excludeOrderId: order.id,
    });
  } catch (err) {
    await stopOrderAccess(order.id);
    await markOrderStopped(order.id);
    throw err;
  }

  const now = new Date();
  const { data: updated, error: updateErr } = await supabase
    .from("vpn_orders")
    .update({
      status: "active",
      payment_status: order.payment_status || "unpaid",
      review_status: "pending_review",
      activated_at: now.toISOString(),
      start_date: toDateOnly(now),
      expiry_date: result.expiry_date,
      stopped_at: null,
      plan_id: resolvedPlan.id,
      price_mmk: Number(resolvedPlan.price_mmk ?? order.price_mmk ?? 0),
      total_paid_mmk: 0,
    })
    .eq("id", order.id)
    .select("*")
    .single();

  if (updateErr || !updated) {
    await stopOrderAccess(order.id);
    throw new Error(updateErr?.message || "Failed to activate pending review order");
  }

  return {
    success: true,
    message: "Pending-review purchase access activated",
    order: updated,
    ...result,
  };
}

export async function activateOrder({ orderId, reseller }) {
  const order = await getResellerScopedOrder(orderId, reseller.id);

  if (order.status === "active") {
    const token = await getTokenByOrderId(order.id);
    return {
      success: true,
      already_active: true,
      message: "Order is already active",
      order_id: order.id,
      expiry_date: order.expiry_date,
      review_status: order.review_status || null,
      token: token?.token || null,
      subscription_url: token?.token ? buildSubscriptionUrl(token.token) : null,
    };
  }

  if (order.status !== "pending") {
    throw new OrderLifecycleError(
      `Only pending orders can be activated. Current status: ${order.status}`,
      409,
      "INVALID_STATUS"
    );
  }

  if (order.payment_status !== "paid") {
    throw new OrderLifecycleError(
      "Payment must be marked as paid before activating.",
      409,
      "PAYMENT_NOT_PAID"
    );
  }

  if (order.review_status === "rejected") {
    throw new OrderLifecycleError("Rejected orders cannot be activated", 409, "ORDER_REJECTED");
  }

  if (order.order_type === "purchase") {
    await assertNoOtherActivePurchase({
      customerId: order.customer_id,
      resellerId: order.reseller_id,
      excludeOrderId: order.id,
    });
    await stopActiveTrialsForCustomer({
      customerId: order.customer_id,
      resellerId: order.reseller_id,
      excludeOrderId: order.id,
    });
  }

  const plan = await resolvePlan(order.plan_id, order.plan);
  const result = await provisionOrderAccess({
    order,
    reseller,
    plan,
    mode: "activate",
  });

  if (order.order_type === "purchase") {
    try {
      await assertNoOtherActivePurchase({
        customerId: order.customer_id,
        resellerId: order.reseller_id,
        excludeOrderId: order.id,
      });
    } catch (err) {
      await stopOrderAccess(order.id);
      throw err;
    }
  }

  const now = new Date();
  const { error: updateErr } = await supabase
    .from("vpn_orders")
    .update({
      status: "active",
      activated_at: now.toISOString(),
      start_date: toDateOnly(now),
      expiry_date: result.expiry_date,
      stopped_at: null,
      plan_id: plan.id,
      price_mmk: Number(plan.price_mmk ?? order.price_mmk ?? 0),
    })
    .eq("id", order.id);

  if (updateErr) throw new Error(updateErr.message);
  await ensureCommissionEntry(order);

  return {
    success: true,
    message: "Order activated",
    order_id: order.id,
    review_status: order.review_status || null,
    ...result,
  };
}

export async function extendOrder({ orderId, resellerId, planId }) {
  const order = await getResellerScopedOrder(orderId, resellerId);

  if (order.status !== "active") {
    throw new OrderLifecycleError(
      `Only active orders can be extended. Current status: ${order.status}`,
      409,
      "INVALID_STATUS"
    );
  }

  if (order.review_status === "rejected") {
    throw new OrderLifecycleError("Rejected orders cannot be extended", 409, "ORDER_REJECTED");
  }

  const activeKeyCount = await countActiveKeys(order.id);
  if (activeKeyCount === 0) {
    throw new OrderLifecycleError(
      "Active order has no VPN key. Stop and renew it instead.",
      409,
      "NO_ACTIVE_ACCESS"
    );
  }

  const plan = await resolvePlan(planId, order.plan);
  const baseDate =
    order.expiry_date && new Date(order.expiry_date) > new Date()
      ? new Date(order.expiry_date)
      : new Date();

  const expiryAt = calcExpiryDate(baseDate, plan.duration_days);
  const token = await getTokenByOrderId(order.id);
  let activeToken = token;

  if (token?.id) {
    activeToken = await activateToken(token.id, expiryAt.toISOString());
  }

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

  return {
    success: true,
    message: "Order extended",
    order_id: order.id,
    token: activeToken?.token || null,
    expiry_date: toDateOnly(expiryAt),
    expires_at: expiryAt.toISOString(),
    subscription_url: activeToken?.token ? buildSubscriptionUrl(activeToken.token) : null,
  };
}

export async function renewOrder({ orderId, reseller, planId }) {
  const order = await getResellerScopedOrder(orderId, reseller.id);

  if (!["stopped", "expired"].includes(order.status)) {
    throw new OrderLifecycleError(
      `Only stopped or expired orders can be renewed. Current status: ${order.status}`,
      409,
      "INVALID_STATUS"
    );
  }

  if (order.review_status === "rejected") {
    throw new OrderLifecycleError(
      "Rejected orders cannot be renewed. Create a new order instead.",
      409,
      "ORDER_REJECTED"
    );
  }

  if (order.order_type === "purchase") {
    await assertNoOtherActivePurchase({
      customerId: order.customer_id,
      resellerId: order.reseller_id,
      excludeOrderId: order.id,
    });
    await stopActiveTrialsForCustomer({
      customerId: order.customer_id,
      resellerId: order.reseller_id,
      excludeOrderId: order.id,
    });
  }

  const plan = await resolvePlan(planId, order.plan);
  const result = await provisionOrderAccess({
    order,
    reseller,
    plan,
    mode: "renew",
  });

  if (order.order_type === "purchase") {
    try {
      await assertNoOtherActivePurchase({
        customerId: order.customer_id,
        resellerId: order.reseller_id,
        excludeOrderId: order.id,
      });
    } catch (err) {
      await stopOrderAccess(order.id);
      throw err;
    }
  }

  const now = new Date();
  const { error: updateErr } = await supabase
    .from("vpn_orders")
    .update({
      status: "active",
      payment_status: "paid",
      review_status: order.order_type === "purchase" ? "confirmed" : order.review_status,
      activated_at: now.toISOString(),
      start_date: toDateOnly(now),
      expiry_date: result.expiry_date,
      stopped_at: null,
      plan_id: plan.id,
      price_mmk: Number(plan.price_mmk ?? 0),
      total_paid_mmk:
        Number(order.total_paid_mmk || 0) + Number(plan.price_mmk || 0),
    })
    .eq("id", order.id);

  if (updateErr) throw new Error(updateErr.message);

  await ensureCommissionEntry({
    ...order,
    plan_id: plan.id,
    price_mmk: Number(plan.price_mmk ?? 0),
  });

  return {
    success: true,
    message: "Order renewed",
    order_id: order.id,
    ...result,
  };
}

export async function stopOrder({ orderId, resellerId }) {
  const order = await getResellerScopedOrder(orderId, resellerId);

  if (order.status === "stopped") {
    return {
      success: true,
      already_stopped: true,
      message: "Order is already stopped",
      order_id: order.id,
      status: "stopped",
    };
  }

  await stopOrderAccess(order.id);

  await markOrderStopped(order.id);

  return {
    success: true,
    message: "Order stopped",
    order_id: order.id,
    status: "stopped",
  };
}

export async function confirmPayment({ orderId, resellerId }) {
  const order = await getResellerScopedOrder(orderId, resellerId);

  if (order.order_type !== "purchase") {
    throw new OrderLifecycleError("Only purchase orders can be confirmed", 400, "INVALID_ORDER_TYPE");
  }

  if (order.review_status === "confirmed") {
    return {
      success: true,
      already_confirmed: true,
      message: "Payment already confirmed",
      order_id: order.id,
      review_status: "confirmed",
      payment_status: "paid",
    };
  }

  if (order.review_status === "rejected") {
    throw new OrderLifecycleError("Rejected orders cannot be confirmed", 409, "ORDER_REJECTED");
  }

  if (!["active", "pending"].includes(order.status)) {
    throw new OrderLifecycleError(
      `Only active or pending purchase orders can be confirmed. Current status: ${order.status}`,
      409,
      "INVALID_STATUS"
    );
  }

  const updatePayload = {
    review_status: "confirmed",
    payment_status: "paid",
    total_paid_mmk: Number(order.price_mmk || 0),
  };

  const { data: updated, error: updateErr } = await supabase
    .from("vpn_orders")
    .update(updatePayload)
    .eq("id", order.id)
    .select("*")
    .single();

  if (updateErr || !updated) {
    throw new Error(updateErr?.message || "Failed to confirm payment");
  }

  await ensureCommissionEntry(updated);

  return {
    success: true,
    message: "Payment confirmed",
    order_id: order.id,
    review_status: "confirmed",
    payment_status: "paid",
  };
}

export async function rejectPayment({ orderId, resellerId }) {
  const order = await getResellerScopedOrder(orderId, resellerId);

  if (order.order_type !== "purchase") {
    throw new OrderLifecycleError("Only purchase orders can be rejected", 400, "INVALID_ORDER_TYPE");
  }

  if (order.review_status === "rejected") {
    return {
      success: true,
      already_rejected: true,
      message: "Payment already rejected",
      order_id: order.id,
      review_status: "rejected",
      status: "stopped",
    };
  }

  if (order.review_status === "confirmed") {
    throw new OrderLifecycleError("Confirmed payments cannot be rejected", 409, "PAYMENT_CONFIRMED");
  }

  await stopOrderAccess(order.id);

  await markOrderStopped(order.id, {
      status: "stopped",
      review_status: "rejected",
      payment_status: "unpaid",
      total_paid_mmk: 0,
    });

  return {
    success: true,
    message: "Payment rejected and access removed",
    order_id: order.id,
    review_status: "rejected",
    payment_status: "unpaid",
    status: "stopped",
  };
}

export async function updatePaymentStatus({ orderId, resellerId, paymentStatus }) {
  const order = await getResellerScopedOrder(orderId, resellerId);

  if (order.review_status === "rejected" && paymentStatus === "paid") {
    throw new OrderLifecycleError(
      "Rejected orders cannot be marked paid",
      409,
      "ORDER_REJECTED"
    );
  }

  const { error: updateErr } = await supabase
    .from("vpn_orders")
    .update({ payment_status: paymentStatus })
    .eq("id", order.id);

  if (updateErr) throw new Error(updateErr.message);

  return {
    success: true,
    message: "Payment status updated",
    order_id: order.id,
    payment_status: paymentStatus,
  };
}
