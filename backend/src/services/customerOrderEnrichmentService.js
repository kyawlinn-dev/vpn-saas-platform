import {
  buildDynamicAccessUrl,
  buildSsconfHttpUrl,
} from "./publicAccessUrlService.js";
import { buildOrderQuotaSnapshot } from "./subscriptionProvisionService.js";

function bytesToGb(bytes) {
  const value = Number(bytes || 0);
  return value > 0 ? Number((value / 1024 / 1024 / 1024).toFixed(2)) : 0;
}

export function toNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

export function isConfirmedAppliedPayment(payment) {
  return payment?.review_status === "confirmed" && String(payment?.apply_status || "applied") === "applied";
}

export function addPaymentToBucket(bucket, payment) {
  bucket.gross_mmk += toNumber(payment.amount_mmk);
  bucket.commission_mmk += toNumber(payment.commission_amount_mmk);
  bucket.platform_due_mmk += toNumber(payment.platform_due_mmk);
  bucket.payment_count += 1;
}

export function enrichOrderAccess(order, req) {
  const customerToken = order?.customer?.ssconf_token;
  const label = order?.reseller?.name || "NovaNet MM";
  const ssconfUrl = buildSsconfHttpUrl(customerToken, { req });
  const dynamicAccessUrl = buildDynamicAccessUrl(customerToken, label, { req });

  // Usage shown to resellers/admins must reflect the order's LIFETIME total
  // across every key it has ever had — not just whatever key happens to be
  // active right now. A server switch (see resellerServerSwitchRouter.js)
  // retires the old key and provisions a new one; without this, the
  // dashboard would silently "forget" all usage accrued before the switch.
  // order.keys already contains every key for this order (active + deleted,
  // no status filter in the callers' select), so no extra query needed.
  const quota = buildOrderQuotaSnapshot(order?.keys ?? []);

  const keys = (order?.keys ?? []).map((key) => ({
    ...key,
    ssconf_url: ssconfUrl,
    dynamic_access_url: dynamicAccessUrl,
    preferred_access_url: dynamicAccessUrl || ssconfUrl || key.access_url || null,
    order_total_used_bytes: quota.totalUsedBytes,
    order_total_used_gb: bytesToGb(quota.totalUsedBytes),
    order_total_remaining_gb:
      typeof quota.remainingBytes === "number" ? bytesToGb(quota.remainingBytes) : null,
  }));

  return {
    ...order,
    ssconf_url: ssconfUrl,
    dynamic_access_url: dynamicAccessUrl,
    preferred_access_url: dynamicAccessUrl || ssconfUrl || keys[0]?.access_url || null,
    keys,
    // Also surface at the order level — some UIs (e.g. admin OrdersPage)
    // read usage off the order directly rather than digging into .keys[].
    total_used_gb: bytesToGb(quota.totalUsedBytes),
    total_used_bytes: quota.totalUsedBytes,
    total_remaining_gb:
      typeof quota.remainingBytes === "number" ? bytesToGb(quota.remainingBytes) : null,
    is_unlimited: quota.isUnlimited,
  };
}

export function summarizeOrderPayments(payments) {
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

function isLegacyConfirmedPaidOrder(order) {
  return (
    !order?.payments?.length &&
    String(order?.order_type || "purchase").toLowerCase() !== "trial" &&
    String(order?.payment_status || "").toLowerCase() === "paid" &&
    String(order?.review_status || "confirmed").toLowerCase() === "confirmed"
  );
}

function paidOrderAmount(order) {
  const totalPaid = toNumber(order?.total_paid_mmk);
  if (totalPaid > 0) return totalPaid;
  return String(order?.payment_status || "").toLowerCase() === "paid" ? toNumber(order?.price_mmk) : 0;
}

function legacyOrderCommission(order, amount) {
  const cachedCommission = toNumber(order?.commission_amount_mmk);
  if (cachedCommission > 0) return cachedCommission;
  const percent = toNumber(order?.commission_percent ?? order?.reseller?.commission_percent);
  return Math.floor((amount * percent) / 100);
}

export function addLegacyOrderSummary(paymentSummary, orders) {
  const summary = { ...paymentSummary };

  for (const order of Array.isArray(orders) ? orders : []) {
    if (!isLegacyConfirmedPaidOrder(order)) continue;

    const amount = paidOrderAmount(order);
    if (amount <= 0) continue;

    const commission = legacyOrderCommission(order, amount);
    summary.gross_mmk += amount;
    summary.commission_mmk += commission;
    summary.platform_due_mmk += Math.max(0, amount - commission);
    summary.confirmed_count += 1;
  }

  return summary;
}

export function getCustomerActiveOrder(orders) {
  const rows = Array.isArray(orders) ? orders : [];
  return (
    rows.find((order) => order.status === "active" && String(order.order_type || "purchase") === "purchase") ||
    rows.find((order) => order.status === "active") ||
    rows[0] ||
    null
  );
}

export function enrichCustomer(customer, { orders = [], telegramLink = null, req } = {}) {
  const customerOrders = orders
    .filter((order) => order.customer_id === customer.id)
    .map((order) => enrichOrderAccess({ ...order, customer, reseller: customer.reseller || order.reseller }, req))
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  const activeOrder = getCustomerActiveOrder(customerOrders);
  const allPayments = customerOrders.flatMap((order) => order.payments ?? []);
  const paymentSummary = addLegacyOrderSummary(summarizeOrderPayments(allPayments), customerOrders);
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
