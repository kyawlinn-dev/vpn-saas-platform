const money = (n) => Number.isFinite(Number(n)) ? Math.max(0, Math.round(Number(n))) : 0;
export const isRecognizedPayment = (p) => p?.review_status === "confirmed" && (p.apply_status || "applied") === "applied";
export function isEligibleLegacyOrder(order, { ledgerLoaded = false } = {}) {
  return ledgerLoaded && Array.isArray(order?.payments) && !order.payments.length && order.order_type !== "trial" && (order.payment_status === "paid" || (order.payment_status == null && money(order.total_paid_mmk) > 0)) && (order.review_status || "confirmed") === "confirmed";
}
export function legacyOrderMoney(order) {
  const amount = money(order.total_paid_mmk ?? order.price_mmk);
  const commission = money(order.commission_amount_mmk ?? Math.floor(amount * Number(order.commission_percent ?? order.reseller?.commission_percent ?? 0) / 100));
  return { amount_mmk: amount, commission_amount_mmk: commission, platform_due_mmk: Math.max(0, amount - commission) };
}
const empty = (basis = "ledger") => ({basis, confirmed_mmk:0, recognized_gross_mmk:0, commission_mmk:0, platform_due_mmk:0, awaiting_review_mmk:0, rejected_mmk:0});
function add(summary, p) {
  if (p.review_status === "confirmed") summary.confirmed_mmk += money(p.amount_mmk);
  if (isRecognizedPayment(p)) {
    summary.recognized_gross_mmk += money(p.amount_mmk);
    summary.commission_mmk += money(p.commission_amount_mmk);
    summary.platform_due_mmk += money(p.platform_due_mmk);
  }
  if (p.review_status === "pending_review") summary.awaiting_review_mmk += money(p.amount_mmk);
  if (p.review_status === "rejected") summary.rejected_mmk += money(p.amount_mmk);
  return summary;
}
export function summarizeOrderMoney(order, {paymentsLoaded = Array.isArray(order?.payments)} = {}) {
  if (!paymentsLoaded) return Object.fromEntries(Object.keys(empty()).map((k) => [k, k === "basis" ? "unavailable" : null]));
  const payments = order?.payments || [];
  if (payments.length) return payments.reduce(add, empty());
  if (isEligibleLegacyOrder(order, {ledgerLoaded:true})) return add(empty("legacy"), {...legacyOrderMoney(order), review_status:"confirmed", apply_status:"applied"});
  return empty();
}
export function summarizeMoneyInPeriod({orders = [], payments = [], ledgerOrderIds, startIso, endIso}) {
  const ids = ledgerOrderIds || new Set(payments.map((p) => p.order_id));
  const inPeriod = (date) => date != null && new Date(date).getTime() >= Date.parse(startIso) && new Date(date).getTime() < Date.parse(endIso);
  const summary = payments.filter((p) => inPeriod(p.created_at)).reduce(add, empty());
  for (const o of orders) if (!(o.id && ids.has(o.id)) && inPeriod(o.created_at) && isEligibleLegacyOrder({...o,payments:o.payments || []},{ledgerLoaded:true})) {
    add(summary, {...legacyOrderMoney(o),review_status:"confirmed",apply_status:"applied"});
  }
  return summary;
}
