import { AlertCircle, CheckCircle2, Clock, Home, MessageCircle } from "lucide-react";
import { Chip, GlassCard, PrimaryButton, SecondaryButton } from "../components/ui/primitives";
import { cn } from "@/lib/utils";
import { formatCurrencyMmk } from "../lib/format";
import { openTelegramNativeLink } from "../lib/telegram";
import { TAB_KEYS } from "../constants/routes";

export default function PaymentStatusPage({ data, checkoutPlan, onTabChange }) {
  const subscription = data?.subscription ?? null;
  const recentRejection = data?.recent_rejection ?? null;
  const brand = data?.config?.brand ?? null;

  // Derive plan info: prefer live subscription data (refreshed after submit),
  // fall back to the checkoutPlan snapshot carried through navigation.
  const planName =
    subscription?.plan_name ?? checkoutPlan?.name ?? "Premium Plan";
  const priceMmk =
    checkoutPlan?.price_mmk ?? null;
  const durationDays =
    subscription?.duration_days ?? checkoutPlan?.duration_days ?? null;

  // "approved" vs "pending_review" — handle both gracefully.
  const reviewStatus = subscription?.review_status || null;
  const orderStatus = subscription?.status || null;
  const isRejected = reviewStatus === "rejected" || (!subscription && Boolean(recentRejection));
  const isStopped = ["stopped", "expired"].includes(orderStatus);
  const isPending = !isRejected && !isStopped && reviewStatus === "pending_review";
  const isApproved =
    !isRejected &&
    !isStopped &&
    orderStatus === "active" &&
    ["confirmed", "approved"].includes(reviewStatus);
  const tone = isRejected || isStopped ? "destructive" : isPending ? "warning" : "success";
  const title = isRejected
    ? "Payment Rejected"
    : isStopped
      ? "Access Stopped"
      : isPending
        ? "Payment Submitted!"
        : isApproved
          ? "Access Activated!"
          : "Payment Status";
  const description = isRejected
    ? "Your reseller could not confirm this payment. VPN access has been removed."
    : isStopped
      ? "This order is no longer active. Choose a package to renew access."
      : isPending
        ? "Your payment is being reviewed. Temporary premium access is active while your reseller checks the screenshot."
        : isApproved
          ? "Your premium access is confirmed and active."
          : "No active payment review is available right now.";
  const chipLabel = isRejected
    ? "Rejected"
    : isStopped
      ? orderStatus === "expired" ? "Expired" : "Stopped"
      : isPending
        ? "Pending Review"
        : isApproved
          ? "Confirmed"
          : "No Active Order";

  const rawHandle = brand?.support_username
    ? String(brand.support_username).replace(/^@/, "")
    : null;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 py-10">

      {/* Status icon */}
      <div className="relative flex items-center justify-center">
        {/* Outer glow ring */}
        <div
          className={cn(
            "absolute h-28 w-28 rounded-full opacity-20 blur-2xl",
            tone === "destructive" ? "bg-destructive" : isPending ? "bg-warning" : "bg-success",
          )}
        />
        <div
          className={cn(
            "relative flex h-20 w-20 items-center justify-center rounded-full border-2",
            tone === "destructive"
              ? "border-destructive/40 bg-destructive/10 text-red-400"
              : isPending
              ? "border-warning/40 bg-warning/10 text-warning"
              : "border-success/40 bg-success/10 text-success",
          )}
        >
          {tone === "destructive" ? (
            <AlertCircle size={36} strokeWidth={1.8} />
          ) : isPending ? (
            <Clock size={36} strokeWidth={1.8} />
          ) : (
            <CheckCircle2 size={36} strokeWidth={1.8} />
          )}
        </div>
      </div>

      {/* Title */}
      <div className="text-center">
        <h1 className="text-[24px] font-bold text-foreground">
          {title}
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>

      {/* Order summary card */}
      <GlassCard className="w-full p-4">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-muted-foreground">Plan</span>
            <span className="text-[14px] font-semibold text-foreground">{planName}</span>
          </div>

          {durationDays && (
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-muted-foreground">Duration</span>
              <span className="text-[14px] font-semibold text-foreground">{durationDays} days</span>
            </div>
          )}

          {priceMmk != null && (
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-muted-foreground">Amount paid</span>
              <span className="text-[14px] font-semibold text-warning">{formatCurrencyMmk(priceMmk)}</span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-[13px] text-muted-foreground">Status</span>
            <Chip tone={tone === "destructive" ? "danger" : isPending ? "warning" : "success"}>
              {chipLabel}
            </Chip>
          </div>
        </div>
      </GlassCard>

      {/* Info note */}
      {(isPending || isRejected || isStopped) && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-primary/15 bg-primary/8 px-4 py-3">
          {isPending ? (
            <Clock size={15} className="mt-0.5 shrink-0 text-primary/70" />
          ) : (
            <AlertCircle size={15} className="mt-0.5 shrink-0 text-red-400" />
          )}
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">
            {isPending
              ? "Your reseller will review your payment screenshot. Access remains pending review."
              : "Open Packages to submit a new order, or contact support if this looks wrong."}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex w-full flex-col gap-3">
        <PrimaryButton onClick={() => onTabChange(TAB_KEYS.HOME)}>
          <Home size={18} />
          Back to Home
        </PrimaryButton>

        {rawHandle && (
          <SecondaryButton
            onClick={() => openTelegramNativeLink(`https://t.me/${rawHandle}`)}
          >
            <MessageCircle size={18} />
            Contact Support
          </SecondaryButton>
        )}
      </div>
    </div>
  );
}
