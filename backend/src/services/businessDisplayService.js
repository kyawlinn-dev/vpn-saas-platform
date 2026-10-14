import { expiryBusinessState } from "../utils/businessTime.js";

const numeric = (value) => value != null && Number.isFinite(Number(value)) ? Number(value) : null;
const startedAt = (order) => order.activated_at || order.start_date || null;
const newest = (a, b) => String(startedAt(b) || b.created_at || "").localeCompare(String(startedAt(a) || a.created_at || "")) || String(b.id || "").localeCompare(String(a.id || ""));

export function selectCustomerPackages(orders = [], { now = new Date() } = {}) {
  const rows = [...orders].sort(newest);
  const current = rows.filter((o) => o.status === "active" && expiryBusinessState(o.expiry_date, now).expired !== true);
  return {
    current_order: current.find((o) => o.order_type !== "trial") || current[0] || null,
    queued_order: rows.find((o) => o.status === "scheduled") || null,
    last_order: rows.find((o) => startedAt(o) && (["expired", "stopped"].includes(o.status) || (o.status === "active" && expiryBusinessState(o.expiry_date, now).expired === true))) || null,
  };
}

export function toQuotaPayload(quota) {
  if (!quota) return null;
  const limit = numeric(quota.totalAllowanceBytes ?? quota.limit_bytes);
  const used = numeric(quota.totalUsedBytes ?? quota.used_bytes);
  const remaining = numeric(quota.remainingBytes ?? quota.remaining_bytes);
  const gb = (n) => n == null ? null : Number((n / 1024 ** 3).toFixed(2));
  return { limit_bytes: limit, used_bytes: used, remaining_bytes: remaining,
    limit_gb: gb(limit), used_gb: gb(used), remaining_gb: gb(remaining),
    is_unlimited: quota.isUnlimited === true || quota.is_unlimited === true };
}

const oneOrMixed = (values) => {
  const unique = [...new Set(values.filter(Boolean))];
  return unique.length > 1 ? "mixed" : unique[0] || "unknown";
};

export function summarizeOrderBusiness(order, { quota = order?.quota || null, freshness, now = new Date(), paymentsLoaded = Array.isArray(order?.payments) } = {}) {
  const expiry = expiryBusinessState(order?.expiry_date, now);
  const payments = paymentsLoaded ? order?.payments || [] : [];
  const plan = order?.plan || order?.vpn_plans;
  const recordedDuration = payments.length === 1 && (!payments[0].plan_id || payments[0].plan_id === order?.plan_id)
    ? numeric(payments[0].package_duration_days) : null;
  const review = (v) => ({pending_review: "awaiting_review", confirmed: "confirmed", rejected: "rejected"}[v] || "unknown");
  const state = order?.status;
  const setup = Array.isArray(order?.dashboard_setup) ? order.dashboard_setup[0] : order?.dashboard_setup;
  const manualPending = order?.source === "dashboard" && order?.order_type === "purchase" && state === "pending" && order?.payment_status === "paid" && order?.review_status === "confirmed" && Object.hasOwn(order,"dashboard_setup") && !setup;
  return {
    access_status: state === "scheduled" ? "queued" : state === "active" && expiry.expired ? "expired" : ["active", "pending", "stopped", "expired"].includes(state) ? state : "unknown",
    payment_review_status: order?.order_type === "trial" ? "no_payment_required" : payments.length ? oneOrMixed(payments.map((p) => review(p.review_status))) : paymentsLoaded ? order?.payment_status === "unpaid" ? "unpaid" : review(order?.review_status) : "unknown",
    application_status: payments.length ? oneOrMixed(payments.map((p) => p.apply_status || (p.review_status === "confirmed" ? "applied" : "pending"))) : "unknown",
    pending_review_count: payments.filter((p) => p.review_status === "pending_review").length,
    has_active_key: (order?.keys || []).some((k) => k.status === "active"),
    is_expiring_soon: state === "active" && expiry.is_expiring_soon,
    quota: toQuotaPayload(quota),
    duration_days: recordedDuration ?? numeric(plan?.duration_days),
    usage_freshness: freshness || { last_synced_at: null, state: "unknown" },
    snapshot_basis: { quota: order?.quota_limit_bytes != null || order?.quota_is_unlimited === true ? "order_snapshot" : quota ? "derived" : "unavailable", duration: recordedDuration != null ? "payment_snapshot" : plan?.duration_days != null ? "catalogue" : "unavailable" },
    setup_in_progress: setup?.state === "running",
    setup_status: manualPending ? "not_started" : state === "active" && (order?.keys || []).some(k=>k.status === "active") ? "ready" : setup?.state === "failed" ? "failed" : setup?.state === "not_started" || setup?.state === "awaiting_payment" ? "not_started" : "unknown",
    can_retry_setup: (manualPending || ["failed","not_started"].includes(setup?.state)) && order?.source === "dashboard" && order?.payment_status === "paid" && order?.review_status === "confirmed" && ["pending","scheduled"].includes(state),
  };
}

export function toPublicBusinessSummary(summary) {
  if (!summary) return null;
  const { access_status, payment_review_status, application_status, pending_review_count,
    has_active_key, is_expiring_soon, quota, duration_days, usage_freshness, snapshot_basis } = summary;
  return { access_status, payment_review_status, application_status, pending_review_count,
    has_active_key, is_expiring_soon, quota, duration_days, usage_freshness, snapshot_basis };
}
