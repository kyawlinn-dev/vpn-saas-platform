export function resolvePaymentStatus(data, checkoutPlan, paymentResult) {
 const submittedOrder=paymentResult?.order ?? null;
 const id=submittedOrder?.id ?? submittedOrder?.order_id;
 const refreshed=id ? [data?.subscription,data?.queued_subscription,data?.last_subscription,...(data?.purchase_receipts || [])].find(o=>(o?.order_id ?? o?.id)===id) : null;
 const subscription=refreshed ?? submittedOrder ?? data?.subscription ?? null;
 const review=subscription?.business_summary?.payment_review_status;
 const reviewStatus=subscription?.review_status ?? null;
 const orderStatus=subscription?.status ?? null;
 const accessStatus=subscription?.business_summary?.access_status ?? (orderStatus==='scheduled'?'queued':orderStatus);
 const isQueued=accessStatus==='queued' || (!orderStatus && Boolean(paymentResult?.is_queued));
 const isRejected=review==='rejected' || reviewStatus==='rejected' || (!subscription && Boolean(data?.recent_rejection));
 const isStopped=['stopped','expired'].includes(accessStatus);
 const isPending=!isRejected && !isStopped && (review==='awaiting_review' || reviewStatus==='pending_review');
 const confirmed=review==='confirmed' || ['confirmed','approved'].includes(reviewStatus);
 return {isQueued,isRejected,isStopped,isPending,isApproved:!isRejected&&!isStopped&&accessStatus==='active'&&confirmed,isQueuedConfirmed:isQueued&&confirmed,orderStatus,accessStatus,
 reviewStatus:review ?? ({pending_review:'awaiting_review',confirmed:'confirmed',approved:'confirmed',rejected:'rejected'}[reviewStatus] || 'unknown'),
 applicationStatus:subscription?.business_summary?.application_status ?? 'unknown',
 planName:submittedOrder?.plan?.name ?? subscription?.plan_name ?? checkoutPlan?.name ?? null,
 priceMmk:paymentResult?.payment?.amount_mmk ?? submittedOrder?.amount_mmk ?? submittedOrder?.price_mmk ?? subscription?.amount_mmk ?? checkoutPlan?.price_mmk ?? null,
 durationDays:submittedOrder?.plan?.duration_days ?? subscription?.duration_days ?? checkoutPlan?.duration_days ?? null};
}
