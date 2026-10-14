import { summarizeUsageFreshness } from "./usageFreshnessService.js";
import { selectCustomerPackages, summarizeOrderBusiness, toQuotaPayload } from "./businessDisplayService.js";
import { summarizeOrderMoney } from "./paymentSummaryService.js";
import { isRecognizedPayment, legacyOrderMoney } from "./paymentSummaryService.js";
import { buildAccessUrlForProtocol } from "./publicAccessUrlService.js";
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
  return isRecognizedPayment(payment);
}

export function addPaymentToBucket(bucket, payment) {
  bucket.gross_mmk += toNumber(payment.amount_mmk);
  bucket.commission_mmk += toNumber(payment.commission_amount_mmk);
  bucket.platform_due_mmk += toNumber(payment.platform_due_mmk);
  bucket.payment_count += 1;
}

export function enrichOrderAccess(order, req, { now = new Date(), freshness, paymentsLoaded = Array.isArray(order?.payments) } = {}) {
  const customerToken = order?.customer?.ssconf_token;
  const label = order?.reseller?.name || "NovaNet MM";

  // Access-URL shape is protocol-specific: Shadowsocks customers use the
  // ssconf token portal (ssconf/dynamic URL); VLESS & Hysteria2 customers use
  // the Marzneshin subscription URL directly (key.access_url). Showing an
  // ssconf link to a VLESS customer is wrong — the app can't import it.
  //
  // Derive protocol from the active key's own field first. protocol_preference
  // can diverge from the key when switch-protocol is called while a trial order
  // is active (trial keys are never re-provisioned, only the preference is saved
  // for the next paid purchase). The key's protocol is the ground truth.
  const _activeKeyForProtocol =
    (order?.keys ?? []).find((k) => k.status === "active") || (order?.keys ?? [])[0] || null;
  const protocol =
    _activeKeyForProtocol?.protocol || order?.customer?.protocol_preference || "shadowsocks";
  const pickUrls = (subscriptionUrl) =>
    buildAccessUrlForProtocol({ protocol, ssconfToken: customerToken, subscriptionUrl, label, req });
  const preferredOf = (urls, fallbackAccessUrl) =>
    urls.dynamic_access_url || urls.subscription_url || urls.ssconf_url || fallbackAccessUrl || null;

  // Historical key rows remain immutable. The order baseline excludes usage
  // from an earlier package period while retaining it for audit/history.
  const quota = buildOrderQuotaSnapshot(order?.keys ?? [], order);
  const quotaPayload = toQuotaPayload(quota);
  if (freshness instanceof Map) freshness = summarizeUsageFreshness((order?.keys || []).filter(k=>k.status === "active").map(k=>({last_usage_sync_at:freshness.get(k.server_id)?.last_synced_at})),{now});

  const keys = (order?.keys ?? []).map((key) => {
    const urls = pickUrls(key.access_url || null);
    return {
      ...key,
      protocol,
      ssconf_url: urls.ssconf_url,
      dynamic_access_url: urls.dynamic_access_url,
      subscription_url: urls.subscription_url,
      preferred_access_url: preferredOf(urls, key.access_url),
      order_total_used_bytes: quota.totalUsedBytes,
      order_total_used_gb: bytesToGb(quota.totalUsedBytes),
      order_total_remaining_gb:
        typeof quota.remainingBytes === "number" ? bytesToGb(quota.remainingBytes) : null,
      quota: quotaPayload,
    };
  });

  // Order-level URLs resolve against the currently active key (falling back to
  // the most recent), so a VLESS order surfaces its live subscription URL.
  const activeKey =
    (order?.keys ?? []).find((key) => key.status === "active") || (order?.keys ?? [])[0] || null;
  const orderUrls = pickUrls(activeKey?.access_url || null);

  return {
    ...order,
    business_summary: summarizeOrderBusiness(order, {quota:quotaPayload,now,freshness,paymentsLoaded}),
    money_summary: summarizeOrderMoney(order, {paymentsLoaded}),
    protocol,
    ssconf_url: orderUrls.ssconf_url,
    dynamic_access_url: orderUrls.dynamic_access_url,
    subscription_url: orderUrls.subscription_url,
    preferred_access_url: preferredOf(orderUrls, activeKey?.access_url),
    keys,
    quota: quotaPayload,
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

function paidOrderAmount(order) { return legacyOrderMoney(order).amount_mmk; }
function legacyOrderCommission(order) { return legacyOrderMoney(order).commission_amount_mmk; }

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

export function getCustomerActiveOrder(orders) { return selectCustomerPackages(orders).current_order; }

export function enrichCustomer(customer, { orders = [], telegramLink = null, req, now = new Date(), freshness } = {}) {
  const customerOrders = orders
    .filter((order) => order.customer_id === customer.id && (!customer.reseller_id || order.reseller_id === customer.reseller_id))
    .map((order) => enrichOrderAccess({ ...order, customer, reseller: customer.reseller || order.reseller }, req, {now, freshness}))
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  const selection = selectCustomerPackages(customerOrders, {now});
  const activeOrder = selection.current_order;
  const allPayments = customerOrders.flatMap((order) => order.payments ?? []);
  const paymentSummary = addLegacyOrderSummary(summarizeOrderPayments(allPayments), customerOrders);
  const label = customer.reseller?.name || "NovaNet MM";

  // Protocol-aware customer-level access URL: SS → ssconf token portal,
  // VLESS/Hysteria2 → the active order's subscription URL (never ssconf).
  const protocol = customer.protocol_preference || "shadowsocks";
  const activeKey =
    (activeOrder?.keys ?? []).find((key) => key.status === "active") ||
    (activeOrder?.keys ?? [])[0] ||
    null;
  const urls = buildAccessUrlForProtocol({
    protocol,
    ssconfToken: customer.ssconf_token,
    subscriptionUrl: activeKey?.access_url || null,
    label,
    req,
  });

  return {
    ...customer,
    customer_type: telegramLink ? "telegram" : "normal",
    telegram_link: telegramLink,
    orders: customerOrders,
    active_order: activeOrder,
    ...selection,
    keys: customerOrders.flatMap((order) => order.keys ?? []),
    payment_summary: paymentSummary,
    protocol,
    ssconf_url: urls.ssconf_url,
    dynamic_access_url: urls.dynamic_access_url,
    subscription_url: urls.subscription_url,
    preferred_access_url:
      urls.dynamic_access_url || urls.subscription_url || urls.ssconf_url || activeKey?.access_url || null,
  };
}
