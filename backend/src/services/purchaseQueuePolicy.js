export function getPurchaseBlockReason(activeOrder, queuedOrder) {
  if (queuedOrder) return "QUEUED_PACKAGE_EXISTS";
  if (activeOrder && activeOrder.review_status !== "confirmed") return "PURCHASE_UNDER_REVIEW";
  return null;
}
