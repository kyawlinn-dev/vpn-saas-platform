import {
  buildDynamicAccessUrl,
  buildSsconfHttpUrl,
} from "./publicAccessUrlService.js";

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
  const keys = (order?.keys ?? []).map((key) => ({
    ...key,
    ssconf_url: ssconfUrl,
    dynamic_access_url: dynamicAccessUrl,
    preferred_access_url: dynamicAccessUrl || ssconfUrl || key.access_url || null,
  }));

  return {
    ...order,
    ssconf_url: ssconfUrl,
    dynamic_access_url: dynamicAccessUrl,
    preferred_access_url: dynamicAccessUrl || ssconfUrl || keys[0]?.access_url || null,
    keys,
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
  const paymentSummary = summarizeOrderPayments(allPayments);
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
