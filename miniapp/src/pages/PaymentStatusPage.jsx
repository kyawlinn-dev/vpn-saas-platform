import { CheckCircle2, Clock, Home, MessageCircle } from "lucide-react";
import { Chip, GlassCard, PrimaryButton, SecondaryButton } from "../components/ui/primitives";
import { cn } from "@/lib/utils";
import { formatCurrencyMmk } from "../lib/format";
import { openTelegramNativeLink } from "../lib/telegram";
import { TAB_KEYS } from "../constants/routes";

export default function PaymentStatusPage({ data, checkoutPlan, onTabChange }) {
  const subscription = data?.subscription ?? null;
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
  const isApproved =
    subscription?.review_status === "approved" ||
    subscription?.type === "purchase" && subscription?.review_status !== "pending_review";
  const isPending = !isApproved;

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
            isPending ? "bg-warning" : "bg-success",
          )}
        />
        <div
          className={cn(
            "relative flex h-20 w-20 items-center justify-center rounded-full border-2",
            isPending
              ? "border-warning/40 bg-warning/10 text-warning"
              : "border-success/40 bg-success/10 text-success",
          )}
        >
          {isPending ? <Clock size={36} strokeWidth={1.8} /> : <CheckCircle2 size={36} strokeWidth={1.8} />}
        </div>
      </div>

      {/* Title */}
      <div className="text-center">
        <h1 className="text-[24px] font-bold text-foreground">
          {isPending ? "Payment Submitted!" : "Access Activated!"}
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
          {isPending
            ? "Your payment is being reviewed. Premium access will be activated shortly."
            : "Your premium access is now active. Enjoy secure private browsing."}
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
            <Chip tone={isPending ? "warning" : "success"}>
              {isPending ? "Pending Review" : "Active"}
            </Chip>
          </div>
        </div>
      </GlassCard>

      {/* Info note */}
      {isPending && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-primary/15 bg-primary/8 px-4 py-3">
          <Clock size={15} className="mt-0.5 shrink-0 text-primary/70" />
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">
            Your reseller will review your payment screenshot and activate access manually.
            This usually takes a few minutes to a few hours.
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
