export function resolvePaymentStatus(data, checkoutPlan, paymentResult) {
  const submittedOrder = paymentResult?.order ?? null;
  const subscription = submittedOrder ?? data?.subscription ?? null;
  const reviewStatus = subscription?.review_status ?? null;
  const orderStatus = subscription?.status ?? null;
  const isQueued = Boolean(paymentResult?.is_queued);
  const isRejected = reviewStatus === "rejected" ||
    (!subscription && Boolean(data?.recent_rejection));
  const isStopped = ["stopped", "expired"].includes(orderStatus);
  const isPending = !isRejected && !isStopped && reviewStatus === "pending_review";

  return {
    isQueued,
    isRejected,
    isStopped,
    isPending,
    isApproved: !isRejected && !isStopped && orderStatus === "active" &&
      ["confirmed", "approved"].includes(reviewStatus),
    isQueuedConfirmed: isQueued && ["confirmed", "approved"].includes(reviewStatus),
    orderStatus,
    planName: submittedOrder?.plan?.name ?? checkoutPlan?.name ?? subscription?.plan_name ?? null,
    priceMmk: submittedOrder?.price_mmk ?? checkoutPlan?.price_mmk ?? null,
    durationDays: submittedOrder?.plan?.duration_days ?? checkoutPlan?.duration_days ??
      subscription?.duration_days ?? null,
  };
}
