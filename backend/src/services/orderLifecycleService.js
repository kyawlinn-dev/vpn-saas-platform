import crypto from "node:crypto";
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
  buildOrderQuotaSnapshot,
} from "./subscriptionProvisionService.js";
import {
  confirmOrderPayments,
  createOrderPayment,
  findOrderPaymentByIdempotencyKey,
  loadOrderPayments,
  markOrderPaymentApplyStatus,
  rejectOrderPayments,
  syncOrderPaymentSummary,
} from "./paymentLedgerService.js";
import {
  buildDynamicAccessUrl,
  buildSsconfHttpUrl,
} from "./publicAccessUrlService.js";
import { businessDateOnly } from "../utils/businessTime.js";

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

async function ensureCustomerSsconfToken(customerId, existingToken) {
  if (existingToken) return existingToken;

  const { data: existing, error: readErr } = await supabase
    .from("vpn_customers")
    .select("ssconf_token")
    .eq("id", customerId)
    .single();

  if (readErr) throw new Error(readErr.message);
  if (existing?.ssconf_token) return existing.ssconf_token;

  const newToken = crypto.randomUUID().replaceAll("-", "");

  const { error: updateErr } = await supabase
    .from("vpn_customers")
    .update({ ssconf_token: newToken })
    .eq("id", customerId)
    .is("ssconf_token", null);

  if (updateErr) throw new Error(updateErr.message);

  const { data: updated, error: refetchErr } = await supabase
    .from("vpn_customers")
    .select("ssconf_token")
    .eq("id", customerId)
    .single();

  if (refetchErr || !updated?.ssconf_token) {
    throw new Error("Failed to ensure customer ssconf token");
  }

  return updated.ssconf_token;
}

async function getAccessLabel({ order, reseller }) {
  const customerName = order?.customer?.full_name || "Customer";

  const { data: miniapp, error } = await supabase
    .from("reseller_miniapps")
    .select("brand_name")
    .eq("reseller_id", order.reseller_id || reseller?.id)
    .maybeSingle();

  if (error) {
    console.warn("[orderLifecycle] Failed to load reseller brand for dynamic key:", error.message);
  }

  const brandName = miniapp?.brand_name || reseller?.name || "NovaNet MM";
  return [brandName, customerName].filter(Boolean).join("-");
}

async function buildOrderAccessLinks({ order, reseller }) {
  const ssconfToken = await ensureCustomerSsconfToken(
    order.customer_id,
    order.customer?.ssconf_token
  );
  const label = await getAccessLabel({ order, reseller });
  const ssconfUrl = buildSsconfHttpUrl(ssconfToken);
  const dynamicAccessUrl = buildDynamicAccessUrl(ssconfToken, label);

  return {
    ssconf_token: ssconfToken,
    ssconf_url: ssconfUrl,
    dynamic_access_url: dynamicAccessUrl,
    preferred_access_url: dynamicAccessUrl || ssconfUrl,
    // Backward-compatible field name for dashboard clients while the old
    // /t and /sub token portal routes are retired.
    subscription_url: dynamicAccessUrl || ssconfUrl,
  };
}

function getPlanRegions(plan) {
  if (!Array.isArray(plan?.allowed_regions)) return [];
  return plan.allowed_regions.filter(Boolean);
}

function isTrialPlan(plan) {
  return plan?.is_trial === true;
}

function getPackageOrderType(plan) {
  return isTrialPlan(plan) ? "trial" : "purchase";
}

export function getPackageServerTier({ order, plan }) {
  if (plan?.is_trial === true) return "trial";
  if (plan?.is_trial === false) return "premium";
  return order?.order_type === "trial" ? "trial" : "premium";
}

function normalizeCommissionPercent(value) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) return 0;
  return Math.min(100, Math.max(0, number));
}

export function getPackageCommissionPercent({ order, reseller, plan }) {
  if (isTrialPlan(plan)) return 0;
  return normalizeCommissionPercent(reseller?.commission_percent ?? order?.commission_percent);
}

async function loadResellerForLifecycle(reseller) {
  if (!reseller?.id) {
    throw new OrderLifecycleError("Missing reseller ID", 401, "MISSING_RESELLER_ID");
  }

  if (reseller.commission_percent != null) {
    return {
      ...reseller,
      commission_percent: normalizeCommissionPercent(reseller.commission_percent),
    };
  }

  const { data, error } = await supabase
    .from("resellers")
    .select("id, name, commission_percent")
    .eq("id", reseller.id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) {
    throw new OrderLifecycleError("Reseller not found", 404, "RESELLER_NOT_FOUND");
  }

  return {
    ...reseller,
    ...data,
    commission_percent: normalizeCommissionPercent(data.commission_percent),
  };
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
      customer:vpn_customers!vpn_orders_customer_id_fkey(id, full_name, reseller_id, telegram_username, phone, ssconf_token),
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
  if (existing) {
    const { error: updateErr } = await supabase
      .from("commission_ledger")
      .update({
        amount_mmk: order.commission_amount_mmk,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (updateErr) throw new Error(updateErr.message);
    return;
  }

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
  const serverTier = getPackageServerTier({ order, plan });

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
    serverTier,
  });

  if (!selectedServers.length) {
    throw new ServerAvailabilityError(
      `No active ${serverTier} server available`,
      serverTier === "trial" ? "NO_TRIAL_SERVER" : "NO_PREMIUM_SERVER"
    );
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
      serverTier === "trial" ? "MISSING_TRIAL_REGION_CAPACITY" : "MISSING_PREMIUM_REGION_CAPACITY"
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

  // Fetch the customer's protocol preference for service ID selection
  let customerProtocol = "shadowsocks";
  if (order.customer_id) {
    const { data: custRow } = await supabase
      .from("vpn_customers")
      .select("protocol_preference")
      .eq("id", order.customer_id)
      .maybeSingle();
    if (custRow?.protocol_preference) {
      customerProtocol = custRow.protocol_preference;
    }
  }

  const configs = await provisionServersForToken({
    token,
    order,
    customer: order.customer,
    reseller,
    plan,
    servers: selectedServers,
    protocol: customerProtocol,
  });
  const accessLinks = await buildOrderAccessLinks({ order, reseller });

  return {
    expires_at: expiryAt.toISOString(),
    expiry_date: toDateOnly(expiryAt),
    server_count: configs.length,
    servers: configs,
    ...accessLinks,
  };
}

async function beginPackagePayment({
  order,
  plan,
  resellerId,
  commissionPercent = null,
  paymentType,
  source = "dashboard",
  idempotencyKey = null,
}) {
  if (idempotencyKey) {
    const existing = await findOrderPaymentByIdempotencyKey({ resellerId, idempotencyKey });
    if (existing) {
      if (existing.order_id !== order.id || existing.payment_type !== paymentType) {
        throw new OrderLifecycleError(
          "Duplicate package payment request key",
          409,
          "DUPLICATE_IDEMPOTENCY_KEY"
        );
      }

      if (existing.apply_status === "applied") {
        return { payment: existing, alreadyApplied: true };
      }

      if (existing.apply_status === "pending") {
        throw new OrderLifecycleError(
          "This package payment is already being processed",
          409,
          "PAYMENT_APPLY_PENDING"
        );
      }

      throw new OrderLifecycleError(
        "This package payment request was already used",
        409,
        "PAYMENT_REQUEST_ALREADY_USED"
      );
    }
  }

  const payment = await createOrderPayment({
    order: {
      ...order,
      reseller_id: resellerId,
      plan_id: plan.id,
    },
    amountMmk: plan.price_mmk,
    commissionPercent,
    reviewStatus: "confirmed",
    applyStatus: "pending",
    paymentType,
    source,
    plan,
    idempotencyKey,
  });

  return { payment, alreadyApplied: false };
}

async function finishAppliedPackagePayment({ payment, orderId }) {
  if (payment?.id) {
    await markOrderPaymentApplyStatus({
      paymentId: payment.id,
      applyStatus: "applied",
    });
  }

  const synced = await syncOrderPaymentSummary(orderId);
  await ensureCommissionEntry(synced.order);
  return synced;
}

async function failPackagePayment(payment, err) {
  if (!payment?.id) return;

  try {
    await markOrderPaymentApplyStatus({
      paymentId: payment.id,
      applyStatus: "failed",
      applyError: err?.message || "Package application failed",
    });
  } catch (markErr) {
    console.error("[orderLifecycle] Failed to mark package payment failed:", markErr.message);
  }
}

function buildPlanSnapshotFromPayment({ order, payment }) {
  return {
    id: payment.plan_id || order.plan_id,
    name: order.plan?.name || "Package",
    price_mmk: Number(payment.amount_mmk || order.price_mmk || 0),
    duration_days: Number(payment.package_duration_days || order.plan?.duration_days || 0),
    data_limit_gb: Number(payment.package_data_limit_gb || order.plan?.data_limit_gb || 0),
    max_devices: order.plan?.max_devices || 1,
    allowed_regions: order.plan?.allowed_regions || [],
    is_active: true,
    is_trial: false,
  };
}

async function applyPendingPackagePayments({ order }) {
  const payments = await loadOrderPayments(order.id);
  const pendingPackagePayments = payments.filter(
    (payment) =>
      payment.review_status === "pending_review" &&
      payment.apply_status === "pending" &&
      ["extend"].includes(payment.payment_type)
  );

  let workingOrder = order;

  for (const payment of pendingPackagePayments) {
    try {
      const planSnapshot = buildPlanSnapshotFromPayment({
        order: workingOrder,
        payment,
      });

      if (planSnapshot.duration_days <= 0) {
        throw new OrderLifecycleError(
          "Package duration snapshot is missing",
          409,
          "PACKAGE_SNAPSHOT_MISSING"
        );
      }

      if (workingOrder.status !== "active") {
        throw new OrderLifecycleError(
          `Only active orders can receive a top-up. Current status: ${workingOrder.status}`,
          409,
          "INVALID_STATUS"
        );
      }

      const activeKeyCount = await countActiveKeys(workingOrder.id);
      if (activeKeyCount === 0) {
        throw new OrderLifecycleError(
          "Active order has no VPN key. Stop and renew it instead.",
          409,
          "NO_ACTIVE_ACCESS"
        );
      }

      const baseDate =
        workingOrder.expiry_date && new Date(workingOrder.expiry_date) > new Date()
          ? new Date(workingOrder.expiry_date)
          : new Date();
      const expiryAt = calcExpiryDate(baseDate, planSnapshot.duration_days);
      const token = await getTokenByOrderId(workingOrder.id);

      if (token?.id) {
        await activateToken(token.id, expiryAt.toISOString());
      }

      await updateProvisionedKeyLimitsForOrder({
        orderId: workingOrder.id,
        plan: planSnapshot,
      });

      const { error: updateErr } = await supabase
        .from("vpn_orders")
        .update({
          status: "active",
          expiry_date: toDateOnly(expiryAt),
          plan_id: planSnapshot.id,
          price_mmk: planSnapshot.price_mmk,
          updated_at: new Date().toISOString(),
        })
        .eq("id", workingOrder.id);

      if (updateErr) throw new Error(updateErr.message);

      workingOrder = await getResellerScopedOrder(workingOrder.id, workingOrder.reseller_id);
    } catch (err) {
      await failPackagePayment(payment, err);
      throw err;
    }
  }
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
      const accessLinks = await buildOrderAccessLinks({ order, reseller });
      return {
        success: true,
        already_active: true,
        message: "Order already has active access",
        order_id: order.id,
        expiry_date: order.expiry_date,
        expires_at: null,
        ...accessLinks,
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
    const accessLinks = await buildOrderAccessLinks({ order, reseller });
    return {
      success: true,
      already_active: true,
      message: "Order is already active",
      order_id: order.id,
      expiry_date: order.expiry_date,
      review_status: order.review_status || null,
      ...accessLinks,
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

// Queued-plan model: extending an ACTIVE subscription creates a NEW independent
// plan in the 'scheduled' state (a fresh sale row) that activates automatically
// when the current plan ends — by time OR data, whichever comes first. Nothing
// about the current plan changes and no usage/data carries over. Multiple
// extends stack FIFO (oldest scheduled activates first).
export async function extendOrder({ orderId, resellerId, planId, idempotencyKey = null, source = "dashboard" }) {
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

  const plan = await resolvePlan(planId, order.plan);
  const reseller = await loadResellerForLifecycle({ id: resellerId });
  const commissionPercent = getPackageCommissionPercent({ order, reseller, plan });

  // Idempotency pre-check: because extend now inserts a queued row, a naive
  // retry would create a duplicate. Return the already-queued plan instead.
  if (idempotencyKey) {
    const existing = await findOrderPaymentByIdempotencyKey({ resellerId, idempotencyKey });
    if (existing) {
      if (existing.payment_type !== "extend") {
        throw new OrderLifecycleError("Duplicate package payment request key", 409, "DUPLICATE_IDEMPOTENCY_KEY");
      }
      if (existing.apply_status === "applied") {
        return { success: true, already_processed: true, message: "Extension already queued", order_id: existing.order_id, queued: true };
      }
      if (existing.apply_status === "pending") {
        throw new OrderLifecycleError("This package payment is already being processed", 409, "PAYMENT_APPLY_PENDING");
      }
      throw new OrderLifecycleError("This package payment request was already used", 409, "PAYMENT_REQUEST_ALREADY_USED");
    }
  }

  // Insert the queued plan. It holds no keys and no server capacity until it
  // activates; start/expiry dates are set at activation time.
  const { data: inserted, error: insertErr } = await supabase
    .from("vpn_orders")
    .insert({
      customer_id: order.customer_id,
      reseller_id: order.reseller_id,
      plan_id: plan.id,
      status: "scheduled",
      price_mmk: Number(plan.price_mmk ?? 0),
      commission_percent: commissionPercent,
      commission_amount_mmk: 0,
      total_paid_mmk: 0,
      start_date: null,
      expiry_date: null,
      payment_status: "paid",
      review_status: "confirmed",
      order_type: "purchase",
      source,
    })
    .select("*")
    .single();

  if (insertErr || !inserted) {
    throw new Error(insertErr?.message || "Failed to queue extension plan");
  }

  const scheduledOrder = { ...inserted, customer: order.customer, plan };

  const { payment } = await beginPackagePayment({
    order: scheduledOrder,
    plan,
    resellerId,
    commissionPercent,
    paymentType: "extend",
    source,
    idempotencyKey,
  });

  try {
    // The sale is complete now (money in, plan queued). No provisioning here —
    // keys are created when the lifecycle job activates this plan.
    await finishAppliedPackagePayment({ payment, orderId: scheduledOrder.id });
  } catch (err) {
    await failPackagePayment(payment, err);
    try {
      await supabase.from("vpn_orders").delete().eq("id", scheduledOrder.id);
    } catch {}
    throw err;
  }

  return {
    success: true,
    message: "Extension queued",
    order_id: scheduledOrder.id,
    queued: true,
  };
}

// --- Queued-plan activation (lifecycle job) -------------------------------

async function getOldestScheduledOrder(customerId, resellerId) {
  const { data, error } = await supabase
    .from("vpn_orders")
    .select(`
      *,
      customer:vpn_customers!vpn_orders_customer_id_fkey(id, full_name, reseller_id, telegram_username, phone, ssconf_token),
      plan:vpn_plans(id, name, price_mmk, duration_days, data_limit_gb, allowed_regions, is_trial)
    `)
    .eq("customer_id", customerId)
    .eq("reseller_id", resellerId)
    .eq("status", "scheduled")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data || null;
}

// Bring a queued plan online: set its dates active-from-now and provision fresh
// keys. On provisioning failure it reverts to 'scheduled' so the next job run
// retries rather than leaving an active-but-keyless order.
export async function activateScheduledOrder(scheduledOrder) {
  const reseller = await loadResellerForLifecycle({ id: scheduledOrder.reseller_id });
  const plan = scheduledOrder.plan || (await resolvePlan(scheduledOrder.plan_id, null));
  const now = new Date();
  const expiryAt = calcExpiryDate(now, plan.duration_days);

  await supabase
    .from("vpn_orders")
    .update({
      status: "active",
      start_date: toDateOnly(now),
      expiry_date: toDateOnly(expiryAt),
      activated_at: now.toISOString(),
      stopped_at: null,
    })
    .eq("id", scheduledOrder.id);

  const orderForProvision = {
    ...scheduledOrder,
    status: "active",
    start_date: toDateOnly(now),
    expiry_date: toDateOnly(expiryAt),
  };

  try {
    await provisionOrderAccess({ order: orderForProvision, reseller, plan, mode: "activate" });
  } catch (err) {
    await supabase
      .from("vpn_orders")
      .update({ status: "scheduled", start_date: null, expiry_date: null, activated_at: null })
      .eq("id", scheduledOrder.id);
    throw err;
  }

  return { order_id: scheduledOrder.id, expiry_date: toDateOnly(expiryAt) };
}

// Activate the customer's oldest queued plan, if any. Returns the promoted
// order id or null. Shared by the expiry sweep and manual stop.
async function promoteNextScheduledPlan(customerId, resellerId) {
  const next = await getOldestScheduledOrder(customerId, resellerId);
  if (!next) return null;
  await activateScheduledOrder(next);
  return next.id;
}

// End a spent active order (time or data exhausted) and promote the customer's
// next queued plan, if any.
async function endOrderAndPromoteNext(order) {
  await stopOrderAccess(order.id);
  await supabase
    .from("vpn_orders")
    .update({ status: "expired", stopped_at: new Date().toISOString() })
    .eq("id", order.id);

  const promoted = await promoteNextScheduledPlan(order.customer_id, order.reseller_id);
  return { ended: order.id, promoted };
}

// Lifecycle sweep (run by autoStopJob): expire active orders that have run out
// of time OR data, and promote the next queued plan for each. Returns a summary
// of what changed. Errors on one order don't abort the sweep.
export async function processExpiredOrdersAndQueue() {
  const today = businessDateOnly();

  const { data: activeOrders, error } = await supabase
    .from("vpn_orders")
    .select(`
      id, customer_id, reseller_id, expiry_date, order_type,
      keys:vpn_keys!vpn_keys_order_tenant_fk(id, status, deleted_at, data_limit_bytes, used_bytes)
    `)
    .eq("status", "active");

  if (error) throw new Error(error.message);

  const results = [];
  for (const order of activeOrders || []) {
    try {
      const quota = buildOrderQuotaSnapshot(order.keys || []);
      const timeExpired = Boolean(order.expiry_date) && order.expiry_date < today;
      const dataExhausted =
        !quota.isUnlimited && quota.remainingBytes !== null && quota.remainingBytes <= 0;

      if (timeExpired || dataExhausted) {
        const r = await endOrderAndPromoteNext(order);
        results.push({ ...r, reason: timeExpired ? "time" : "data" });
      }
    } catch (err) {
      results.push({ ended: order.id, error: err.message });
    }
  }
  return results;
}

// Sale-record model: a renewal is a NEW sale, so it INSERTS a fresh order row
// (its own created_at, so it sorts to the top) and leaves the old order frozen
// in place with its final status. It does not mutate the old row. The customer
// ends up with one active order (the newest) plus a history of expired ones.
export async function renewOrder({ orderId, reseller, planId, idempotencyKey = null, source = "dashboard" }) {
  const oldOrder = await getResellerScopedOrder(orderId, reseller.id);

  if (!["stopped", "expired"].includes(oldOrder.status)) {
    throw new OrderLifecycleError(
      `Only stopped or expired orders can be renewed. Current status: ${oldOrder.status}`,
      409,
      "INVALID_STATUS"
    );
  }

  if (oldOrder.review_status === "rejected") {
    throw new OrderLifecycleError(
      "Rejected orders cannot be renewed. Create a new order instead.",
      409,
      "ORDER_REJECTED"
    );
  }

  const resolvedReseller = await loadResellerForLifecycle(reseller);
  const plan = await resolvePlan(planId, oldOrder.plan);
  const targetOrderType = getPackageOrderType(plan);
  const commissionPercent = getPackageCommissionPercent({
    order: oldOrder,
    reseller: resolvedReseller,
    plan,
  });

  // Idempotency pre-check: because a renewal now inserts a row, a naive retry
  // would create a duplicate. If this key already produced a renewal payment,
  // return the order it created instead of inserting again.
  if (idempotencyKey) {
    const existing = await findOrderPaymentByIdempotencyKey({
      resellerId: resolvedReseller.id,
      idempotencyKey,
    });
    if (existing) {
      if (existing.payment_type !== "renew") {
        throw new OrderLifecycleError("Duplicate package payment request key", 409, "DUPLICATE_IDEMPOTENCY_KEY");
      }
      if (existing.apply_status === "applied") {
        const renewedOrder = await getResellerScopedOrder(existing.order_id, resolvedReseller.id);
        return {
          success: true,
          already_processed: true,
          message: "Order renewal already applied",
          order_id: existing.order_id,
          expiry_date: renewedOrder.expiry_date,
          ...(await buildOrderAccessLinks({ order: renewedOrder, reseller })),
        };
      }
      if (existing.apply_status === "pending") {
        throw new OrderLifecycleError("This package payment is already being processed", 409, "PAYMENT_APPLY_PENDING");
      }
      throw new OrderLifecycleError("This package payment request was already used", 409, "PAYMENT_REQUEST_ALREADY_USED");
    }
  }

  // The old order is stopped/expired (not active), so the only active-purchase
  // that could exist is a newer renewal — block renewing superseded history.
  // (excludeOrderId is the old row; it's not active anyway, so this checks for
  // any OTHER active purchase.)
  if (targetOrderType === "purchase") {
    await assertNoOtherActivePurchase({
      customerId: oldOrder.customer_id,
      resellerId: oldOrder.reseller_id,
      excludeOrderId: oldOrder.id,
    });
    await stopActiveTrialsForCustomer({
      customerId: oldOrder.customer_id,
      resellerId: oldOrder.reseller_id,
      excludeOrderId: oldOrder.id,
    });
  }

  const now = new Date();
  const expiryAt = calcExpiryDate(now, plan.duration_days);

  // Insert the new sale/period row.
  const { data: inserted, error: insertErr } = await supabase
    .from("vpn_orders")
    .insert({
      customer_id: oldOrder.customer_id,
      reseller_id: oldOrder.reseller_id,
      plan_id: plan.id,
      status: "active",
      price_mmk: Number(plan.price_mmk ?? 0),
      commission_percent: commissionPercent,
      commission_amount_mmk: 0,
      total_paid_mmk: 0,
      start_date: toDateOnly(now),
      expiry_date: toDateOnly(expiryAt),
      payment_status: "paid",
      review_status: targetOrderType === "purchase" ? "confirmed" : oldOrder.review_status,
      order_type: targetOrderType,
      activated_at: now.toISOString(),
      source,
    })
    .select("*")
    .single();

  if (insertErr || !inserted) {
    throw new Error(insertErr?.message || "Failed to create renewal order");
  }

  // Provisioning + key naming reads order.customer / order.plan.
  const newOrder = { ...inserted, customer: oldOrder.customer, plan };

  const { payment } = await beginPackagePayment({
    order: newOrder,
    plan,
    resellerId: resolvedReseller.id,
    commissionPercent,
    paymentType: "renew",
    source,
    idempotencyKey,
  });

  try {
    const result = await provisionOrderAccess({
      order: newOrder,
      reseller: resolvedReseller,
      plan,
      mode: "renew",
    });

    if (result.expiry_date && result.expiry_date !== toDateOnly(expiryAt)) {
      await supabase
        .from("vpn_orders")
        .update({ expiry_date: result.expiry_date })
        .eq("id", newOrder.id);
    }

    await finishAppliedPackagePayment({ payment, orderId: newOrder.id });

    return {
      success: true,
      message: "Order renewed",
      order_id: newOrder.id,
      ...result,
    };
  } catch (err) {
    await failPackagePayment(payment, err);
    try {
      await stopOrderAccess(newOrder.id);
    } catch {}
    // Roll back the row so a failed renewal doesn't leave a ghost active order.
    try {
      await supabase.from("vpn_orders").delete().eq("id", newOrder.id);
    } catch {}
    throw err;
  }
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

  // Queued-plan model (user decision 2026-09-05): stopping the current plan
  // ends it now and the customer's next queued plan takes over immediately —
  // Stop means "switch to the next plan now", not "suspend everything".
  const promoted = await promoteNextScheduledPlan(order.customer_id, order.reseller_id);

  return {
    success: true,
    message: promoted ? "Order stopped; next queued plan activated" : "Order stopped",
    order_id: order.id,
    status: "stopped",
    promoted,
  };
}

// Cancel a queued ("scheduled") plan before it activates. A queued plan holds
// no keys and delivered no service, so it's removed cleanly along with its
// (not-yet-delivered) payment + commission records, keeping accounting correct
// and the Orders list free of phantom rows. Only 'scheduled' orders qualify —
// an active/expired order with real keys can never be cancelled this way.
export async function cancelScheduledOrder({ orderId, resellerId }) {
  const order = await getResellerScopedOrder(orderId, resellerId);

  if (order.status !== "scheduled") {
    throw new OrderLifecycleError(
      `Only queued plans can be cancelled. Current status: ${order.status}`,
      409,
      "NOT_SCHEDULED"
    );
  }

  // Remove dependent records first (FKs point at the order), then the order.
  await supabase.from("commission_ledger").delete().eq("order_id", order.id);
  await supabase.from("order_payments").delete().eq("order_id", order.id);

  const { error: delErr } = await supabase.from("vpn_orders").delete().eq("id", order.id);
  if (delErr) throw new Error(delErr.message);

  return {
    success: true,
    message: "Queued plan cancelled",
    order_id: order.id,
  };
}

export async function confirmPayment({ orderId, resellerId, reviewerAdminId = null }) {
  const order = await getResellerScopedOrder(orderId, resellerId);
  const payments = await loadOrderPayments(order.id);
  const pendingPayments = payments.filter((row) => row.review_status === "pending_review");

  if (order.order_type !== "purchase") {
    throw new OrderLifecycleError("Only purchase orders can be confirmed", 400, "INVALID_ORDER_TYPE");
  }

  if (order.review_status === "confirmed" && pendingPayments.length === 0) {
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

  await applyPendingPackagePayments({ order });

  const { order: updated } = await confirmOrderPayments({
    order,
    reviewerResellerId: reviewerAdminId ? null : resellerId,
    reviewerAdminId,
  });

  await ensureCommissionEntry(updated);

  return {
    success: true,
    message: "Payment confirmed",
    order_id: order.id,
    review_status: "confirmed",
    payment_status: "paid",
  };
}

export async function rejectPayment({ orderId, resellerId, reviewerAdminId = null }) {
  const order = await getResellerScopedOrder(orderId, resellerId);
  const payments = await loadOrderPayments(order.id);
  const pendingPayments = payments.filter((row) => row.review_status === "pending_review");
  const hasConfirmedAppliedPayment = payments.some(
    (row) =>
      row.review_status === "confirmed" &&
      (!row.apply_status || row.apply_status === "applied")
  );
  const isTopUpOnlyRejection =
    hasConfirmedAppliedPayment &&
    pendingPayments.length > 0 &&
    pendingPayments.every((row) => ["extend"].includes(row.payment_type));

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

  if (order.review_status === "confirmed" && pendingPayments.length === 0) {
    throw new OrderLifecycleError("Confirmed payments cannot be rejected", 409, "PAYMENT_CONFIRMED");
  }

  const { order: syncedOrder } = await rejectOrderPayments({
    order,
    reviewerResellerId: reviewerAdminId ? null : resellerId,
    reviewerAdminId,
  });

  if (isTopUpOnlyRejection) {
    return {
      success: true,
      message: "Top-up payment rejected",
      order_id: order.id,
      review_status: syncedOrder.review_status,
      status: syncedOrder.status,
    };
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
