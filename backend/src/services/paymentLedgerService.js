import { supabase } from "../lib/supabase.js";

function money(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.round(number));
}

function percent(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  return Math.min(100, Math.max(0, number));
}

export function calculatePaymentAmounts({ amountMmk, commissionPercent }) {
  const amount = money(amountMmk);
  const commissionRate = percent(commissionPercent);
  const commissionAmount = Math.floor((amount * commissionRate) / 100);

  return {
    amount_mmk: amount,
    commission_percent: commissionRate,
    commission_amount_mmk: commissionAmount,
    platform_due_mmk: Math.max(0, amount - commissionAmount),
  };
}

export async function createOrderPayment({
  order,
  amountMmk,
  commissionPercent = null,
  reviewStatus = "pending_review",
  source,
  paymentType = "initial",
  applyStatus = null,
  plan = null,
  planId = null,
  packageDurationDays = null,
  packageDataLimitGb = null,
  idempotencyKey = null,
  paymentMethod = null,
  paymentNote = null,
  paymentScreenshotUrl = null,
}) {
  if (!order?.id) throw new Error("order is required");

  const amounts = calculatePaymentAmounts({
    amountMmk,
    commissionPercent: commissionPercent ?? order.commission_percent,
  });

  if (amounts.amount_mmk <= 0) return null;

  const now = new Date().toISOString();
  const reviewed =
    reviewStatus === "confirmed" || reviewStatus === "rejected";
  const normalizedApplyStatus =
    applyStatus ||
    (reviewStatus === "confirmed"
      ? "applied"
      : reviewStatus === "rejected"
        ? "reversed"
        : "pending");

  const { data, error } = await supabase
    .from("order_payments")
    .insert({
      order_id: order.id,
      customer_id: order.customer_id,
      reseller_id: order.reseller_id,
      ...amounts,
      payment_method: paymentMethod,
      payment_note: paymentNote,
      payment_screenshot_url: paymentScreenshotUrl,
      review_status: reviewStatus,
      payment_type: paymentType,
      apply_status: normalizedApplyStatus,
      plan_id: planId || plan?.id || order.plan_id || null,
      package_duration_days:
        packageDurationDays ?? plan?.duration_days ?? null,
      package_data_limit_gb:
        packageDataLimitGb ?? plan?.data_limit_gb ?? null,
      applied_at: normalizedApplyStatus === "applied" ? now : null,
      idempotency_key: idempotencyKey || null,
      source,
      submitted_at: now,
      reviewed_at: reviewed ? now : null,
      reviewed_by_reseller_id: reviewed ? order.reseller_id : null,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error?.code === "23505" && idempotencyKey) {
    const existing = await findOrderPaymentByIdempotencyKey({
      resellerId: order.reseller_id,
      idempotencyKey,
    });
    if (existing) return existing;
  }

  if (error || !data) {
    throw new Error(error?.message || "Failed to create order payment");
  }

  return data;
}

export async function findOrderPaymentByIdempotencyKey({ resellerId, idempotencyKey }) {
  if (!resellerId || !idempotencyKey) return null;

  const { data, error } = await supabase
    .from("order_payments")
    .select("*")
    .eq("reseller_id", resellerId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data || null;
}

export async function loadOrderPayments(orderId) {
  const { data, error } = await supabase
    .from("order_payments")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return data || [];
}

export function summarizePayments(payments) {
  const rows = Array.isArray(payments) ? payments : [];
  const confirmed = rows.filter(
    (row) =>
      row.review_status === "confirmed" &&
      (!row.apply_status || row.apply_status === "applied")
  );
  const pending = rows.filter((row) => row.review_status === "pending_review");
  const rejected = rows.filter((row) => row.review_status === "rejected");

  return {
    confirmed_count: confirmed.length,
    pending_count: pending.length,
    rejected_count: rejected.length,
    confirmed_amount_mmk: confirmed.reduce((sum, row) => sum + money(row.amount_mmk), 0),
    confirmed_commission_mmk: confirmed.reduce(
      (sum, row) => sum + money(row.commission_amount_mmk),
      0
    ),
    confirmed_platform_due_mmk: confirmed.reduce(
      (sum, row) => sum + money(row.platform_due_mmk),
      0
    ),
    pending_amount_mmk: pending.reduce((sum, row) => sum + money(row.amount_mmk), 0),
    rejected_amount_mmk: rejected.reduce((sum, row) => sum + money(row.amount_mmk), 0),
  };
}

export async function markOrderPaymentApplyStatus({ paymentId, applyStatus, applyError = null }) {
  if (!paymentId) return null;

  const now = new Date().toISOString();
  const patch = {
    apply_status: applyStatus,
    apply_error: applyError,
    applied_at: applyStatus === "applied" ? now : null,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from("order_payments")
    .update(patch)
    .eq("id", paymentId)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Failed to update payment apply status");
  }

  return data;
}

export async function syncOrderPaymentSummary(orderId) {
  const payments = await loadOrderPayments(orderId);
  const summary = summarizePayments(payments);

  let reviewStatus = null;
  if (summary.pending_count > 0) reviewStatus = "pending_review";
  else if (summary.confirmed_count > 0) reviewStatus = "confirmed";
  else if (summary.rejected_count > 0) reviewStatus = "rejected";

  const update = {
    total_paid_mmk: summary.confirmed_amount_mmk,
    commission_amount_mmk: summary.confirmed_commission_mmk,
    payment_status: summary.confirmed_amount_mmk > 0 ? "paid" : "unpaid",
    updated_at: new Date().toISOString(),
  };

  if (reviewStatus) update.review_status = reviewStatus;

  const { data, error } = await supabase
    .from("vpn_orders")
    .update(update)
    .eq("id", orderId)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Failed to sync order payment summary");
  }

  return { order: data, payments, summary };
}

export async function confirmOrderPayments({ order, reviewerResellerId, reviewerAdminId = null }) {
  if (!order?.id) throw new Error("order is required");

  const existing = await loadOrderPayments(order.id);
  if (!existing.length) {
    await createOrderPayment({
      order,
      amountMmk: order.total_paid_mmk || order.price_mmk,
      reviewStatus: "pending_review",
      source: order.source,
      paymentNote: order.payment_note,
      paymentScreenshotUrl: order.payment_screenshot_url,
    });
  }

  const pending = await loadOrderPayments(order.id);
  const now = new Date().toISOString();

  for (const payment of pending.filter((row) => row.review_status === "pending_review")) {
    const amounts = calculatePaymentAmounts({
      amountMmk: payment.amount_mmk,
      commissionPercent: payment.commission_percent ?? order.commission_percent,
    });

    const { error } = await supabase
      .from("order_payments")
      .update({
        ...amounts,
        review_status: "confirmed",
        apply_status: "applied",
        applied_at: now,
        apply_error: null,
        reviewed_at: now,
        reviewed_by_reseller_id: reviewerResellerId || null,
        reviewed_by_admin_id: reviewerAdminId,
        updated_at: now,
      })
      .eq("id", payment.id);

    if (error) throw new Error(error.message);
  }

  return syncOrderPaymentSummary(order.id);
}

export async function rejectOrderPayments({ order, reviewerResellerId, reviewerAdminId = null }) {
  if (!order?.id) throw new Error("order is required");

  const payments = await loadOrderPayments(order.id);
  if (!payments.length) {
    await createOrderPayment({
      order,
      amountMmk: order.total_paid_mmk || order.price_mmk,
      reviewStatus: "pending_review",
      source: order.source,
      paymentNote: order.payment_note,
      paymentScreenshotUrl: order.payment_screenshot_url,
    });
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("order_payments")
    .update({
      review_status: "rejected",
      apply_status: "reversed",
      applied_at: null,
      reviewed_at: now,
      reviewed_by_reseller_id: reviewerResellerId || null,
      reviewed_by_admin_id: reviewerAdminId,
      updated_at: now,
    })
    .eq("order_id", order.id)
    .eq("review_status", "pending_review");

  if (error) throw new Error(error.message);

  return syncOrderPaymentSummary(order.id);
}
