import { currentBusinessMonth, parseBusinessMonth } from "../utils/businessTime.js";

function money(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.round(number));
}

function integer(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.trunc(number));
}

function isPurchase(order) {
  return String(order.order_type || "purchase").toLowerCase() !== "trial";
}

function isPaid(order) {
  return String(order.payment_status || "").toLowerCase() === "paid";
}

function reviewStatus(order) {
  return String(order.review_status || "confirmed").toLowerCase();
}

function isConfirmedPaidPurchase(order) {
  return isPurchase(order) && isPaid(order) && reviewStatus(order) === "confirmed";
}

function isPendingReview(order) {
  return isPurchase(order) && reviewStatus(order) === "pending_review";
}

function isRejected(order) {
  return isPurchase(order) && reviewStatus(order) === "rejected";
}

function amountPaid(order) {
  const totalPaid = money(order.total_paid_mmk);
  if (totalPaid > 0) return totalPaid;
  return isPaid(order) ? money(order.price_mmk) : 0;
}

function amountExpected(order) {
  return money(order.price_mmk);
}

export function normalizeAccountingMonth(month) {
  const raw = String(month || "").trim();
  if (!raw) return parseBusinessMonth(currentBusinessMonth());
  return parseBusinessMonth(raw);
}

export function settlementMonthDate(period) {
  return `${period.month}-01`;
}

export function normalizeSettlementText(value, maxLength = 500) {
  const text = String(value || "").trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

export function serializeSettlement(row) {
  if (!row) return null;

  return {
    id: row.id,
    reseller_id: row.reseller_id,
    settlement_month: row.settlement_month,
    status: row.status,
    gross_paid_mmk: integer(row.gross_paid_mmk),
    reseller_commission_mmk: integer(row.reseller_commission_mmk),
    platform_due_mmk: integer(row.platform_due_mmk),
    pending_review_mmk: integer(row.pending_review_mmk),
    unpaid_mmk: integer(row.unpaid_mmk),
    rejected_mmk: integer(row.rejected_mmk),
    confirmed_order_count: integer(row.confirmed_order_count),
    pending_review_count: integer(row.pending_review_count),
    unpaid_order_count: integer(row.unpaid_order_count),
    rejected_order_count: integer(row.rejected_order_count),
    total_order_count: integer(row.total_order_count),
    transfer_note: row.transfer_note ?? null,
    transfer_reference: row.transfer_reference ?? null,
    transfer_proof_url: row.transfer_proof_url ?? null,
    submitted_at: row.submitted_at ?? null,
    confirmed_at: row.confirmed_at ?? null,
    confirmed_by_admin_id: row.confirmed_by_admin_id ?? null,
    reopened_at: row.reopened_at ?? null,
    admin_note: row.admin_note ?? null,
    snapshot_basis: row.snapshot_basis ?? {},
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
    reseller: row.reseller ?? null,
    confirmed_by: row.confirmed_by ?? null,
  };
}

export function buildSettlementPayload({ snapshot, transferNote, transferReference, transferProofUrl }) {
  const summary = snapshot.summary;

  return {
    reseller_id: snapshot.reseller.id,
    settlement_month: settlementMonthDate(snapshot.period),
    status: "submitted",
    gross_paid_mmk: summary.gross_paid_mmk,
    reseller_commission_mmk: summary.reseller_commission_mmk,
    platform_due_mmk: summary.platform_due_mmk,
    pending_review_mmk: summary.pending_review_mmk,
    unpaid_mmk: summary.unpaid_mmk,
    rejected_mmk: summary.rejected_mmk,
    confirmed_order_count: summary.confirmed_order_count,
    pending_review_count: summary.pending_review_count,
    unpaid_order_count: summary.unpaid_order_count,
    rejected_order_count: summary.rejected_order_count,
    total_order_count: summary.total_order_count,
    transfer_note: normalizeSettlementText(transferNote),
    transfer_reference: normalizeSettlementText(transferReference, 160),
    transfer_proof_url: normalizeSettlementText(transferProofUrl, 1000),
    submitted_at: new Date().toISOString(),
    confirmed_at: null,
    confirmed_by_admin_id: null,
    admin_note: null,
    snapshot_basis: {
      ...snapshot.basis,
      period: snapshot.period,
      settlement_orders: snapshot.settlement_orders,
    },
    updated_at: new Date().toISOString(),
  };
}

export function buildMonthlyAccountingSnapshot({ reseller, orders, period }) {
  return buildMonthlyAccountingSnapshotFromOrders({ reseller, orders, period });
}

export function buildMonthlyAccountingSnapshotFromPayments({ reseller, payments, period }) {
  const sourcePayments = Array.isArray(payments) ? payments : [];
  const confirmedPayments = sourcePayments.filter(
    (payment) =>
      reviewStatus(payment) === "confirmed" &&
      (!payment.apply_status || payment.apply_status === "applied")
  );
  const pendingPayments = sourcePayments.filter((payment) => reviewStatus(payment) === "pending_review");
  const rejectedPayments = sourcePayments.filter((payment) => reviewStatus(payment) === "rejected");
  const orderIds = new Set(sourcePayments.map((payment) => payment.order_id).filter(Boolean));

  const grossPaidMmk = confirmedPayments.reduce((sum, payment) => sum + money(payment.amount_mmk), 0);
  const resellerCommissionMmk = confirmedPayments.reduce(
    (sum, payment) => sum + money(payment.commission_amount_mmk),
    0
  );
  const platformDueMmk = confirmedPayments.reduce(
    (sum, payment) => sum + money(payment.platform_due_mmk),
    0
  );
  const pendingReviewMmk = pendingPayments.reduce((sum, payment) => sum + money(payment.amount_mmk), 0);
  const rejectedMmk = rejectedPayments.reduce((sum, payment) => sum + money(payment.amount_mmk), 0);

  const settlementOrders = confirmedPayments.map((payment) => {
    const order = payment.order || {};
    const customer = order.customer || payment.customer || {};
    const plan = order.plan || payment.plan || {};

    return {
      id: payment.id,
      payment_id: payment.id,
      order_id: payment.order_id,
      created_at: payment.created_at ?? payment.submitted_at ?? null,
      customer_name: customer.full_name ?? "Unknown customer",
      telegram_username: customer.telegram_username ?? null,
      plan_name: plan.name ?? "Plan",
      source: payment.source ?? order.source ?? null,
      status: order.status ?? null,
      payment_status: order.payment_status ?? "paid",
      review_status: payment.review_status ?? "confirmed",
      price_mmk: money(order.price_mmk),
      total_paid_mmk: money(payment.amount_mmk),
      commission_percent: Number(payment.commission_percent || reseller?.commission_percent || 0),
      commission_amount_mmk: money(payment.commission_amount_mmk),
      platform_due_mmk: money(payment.platform_due_mmk),
    };
  });

  return {
    period,
    reseller: {
      id: reseller.id,
      name: reseller.name,
      commission_percent: Number(reseller.commission_percent || 0),
    },
    summary: {
      gross_paid_mmk: grossPaidMmk,
      reseller_commission_mmk: resellerCommissionMmk,
      platform_due_mmk: platformDueMmk,
      pending_review_mmk: pendingReviewMmk,
      unpaid_mmk: 0,
      rejected_mmk: rejectedMmk,
      confirmed_order_count: confirmedPayments.length,
      pending_review_count: pendingPayments.length,
      unpaid_order_count: 0,
      rejected_order_count: rejectedPayments.length,
      total_order_count: orderIds.size || sourcePayments.length,
    },
    settlement_orders: settlementOrders,
    basis: {
      period_field: "order_payments.created_at",
      included_orders: "confirmed order_payments rows",
      platform_due_formula: "order_payments.platform_due_mmk = amount_mmk - commission_amount_mmk",
    },
    settlement: null,
  };
}

export function buildMonthlyAccountingSnapshotFromOrders({ reseller, orders, period }) {
  const sourceOrders = Array.isArray(orders) ? orders : [];
  const confirmedOrders = sourceOrders.filter(isConfirmedPaidPurchase);
  const pendingReviewOrders = sourceOrders.filter(isPendingReview);
  const rejectedOrders = sourceOrders.filter(isRejected);
  const unpaidOrders = sourceOrders.filter(
    (order) =>
      isPurchase(order) &&
      !isPaid(order) &&
      !isRejected(order)
  );

  const grossPaidMmk = confirmedOrders.reduce((sum, order) => sum + amountPaid(order), 0);
  const resellerCommissionMmk = confirmedOrders.reduce(
    (sum, order) => sum + money(order.commission_amount_mmk),
    0
  );
  const platformDueMmk = Math.max(0, grossPaidMmk - resellerCommissionMmk);
  const pendingReviewMmk = pendingReviewOrders.reduce((sum, order) => sum + amountExpected(order), 0);
  const unpaidMmk = unpaidOrders.reduce((sum, order) => sum + amountExpected(order), 0);
  const rejectedMmk = rejectedOrders.reduce((sum, order) => sum + amountExpected(order), 0);

  const settlementOrders = confirmedOrders.map((order) => ({
    id: order.id,
    created_at: order.created_at ?? null,
    customer_name: order.customer?.full_name ?? "Unknown customer",
    telegram_username: order.customer?.telegram_username ?? null,
    plan_name: order.plan?.name ?? "Plan",
    source: order.source ?? null,
    status: order.status,
    payment_status: order.payment_status,
    review_status: order.review_status ?? "confirmed",
    price_mmk: money(order.price_mmk),
    total_paid_mmk: amountPaid(order),
    commission_percent: Number(order.commission_percent || reseller?.commission_percent || 0),
    commission_amount_mmk: money(order.commission_amount_mmk),
    platform_due_mmk: Math.max(0, amountPaid(order) - money(order.commission_amount_mmk)),
  }));

  return {
    period,
    reseller: {
      id: reseller.id,
      name: reseller.name,
      commission_percent: Number(reseller.commission_percent || 0),
    },
    summary: {
      gross_paid_mmk: grossPaidMmk,
      reseller_commission_mmk: resellerCommissionMmk,
      platform_due_mmk: platformDueMmk,
      pending_review_mmk: pendingReviewMmk,
      unpaid_mmk: unpaidMmk,
      rejected_mmk: rejectedMmk,
      confirmed_order_count: confirmedOrders.length,
      pending_review_count: pendingReviewOrders.length,
      unpaid_order_count: unpaidOrders.length,
      rejected_order_count: rejectedOrders.length,
      total_order_count: sourceOrders.length,
    },
    settlement_orders: settlementOrders,
    basis: {
      period_field: "created_at",
      included_orders: "paid purchase orders whose review_status is confirmed",
      platform_due_formula: "total_paid_mmk - commission_amount_mmk",
    },
    settlement: null,
  };
}
