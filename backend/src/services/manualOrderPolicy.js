export function deriveManualOrderPolicy({ plan, requestedPaymentStatus }) {
  const orderType = plan?.is_trial ? "trial" : "purchase";
  const paymentStatus =
    orderType === "trial" ? "paid" : requestedPaymentStatus === "paid" ? "paid" : "unpaid";

  return {
    source: "dashboard",
    orderType,
    paymentStatus,
    reviewStatus: paymentStatus === "paid" ? "confirmed" : "pending_review",
  };
}
