import { AlertCircle, CheckCircle2, Clock, Home, MessageCircle } from "lucide-react";
import { Chip, GlassCard, PrimaryButton, SecondaryButton } from "../components/ui/primitives";
import { cn } from "@/lib/utils";
import { formatCurrencyMmk } from "../lib/format";
import { openTelegramNativeLink } from "../lib/telegram";
import { TAB_KEYS } from "../constants/routes";
import { useLanguage } from "../i18n/language";

export default function PaymentStatusPage({ data, checkoutPlan, onTabChange }) {
  const { language, t } = useLanguage();
  const subscription = data?.subscription ?? null;
  const recentRejection = data?.recent_rejection ?? null;
  const brand = data?.config?.brand ?? null;

  // Derive plan info: prefer live subscription data (refreshed after submit),
  // fall back to the checkoutPlan snapshot carried through navigation.
  const planName =
    subscription?.plan_name ?? checkoutPlan?.name ?? t("common.premiumPlan");
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
    ? t("payment.rejected.title")
    : isStopped
      ? t("payment.stopped")
      : isPending
        ? t("payment.pending.title")
        : isApproved
          ? t("payment.approved.title")
          : t("payment.statusTitle");
  const description = isRejected
    ? t("payment.rejected.description")
    : isStopped
      ? t("payment.stopped.description")
      : isPending
        ? t("payment.pending.description")
        : isApproved
          ? t("payment.approved.description")
          : t("payment.noActiveOrder");
  const chipLabel = isRejected
    ? t("payment.rejected")
    : isStopped
      ? orderStatus === "expired" ? t("payment.expired") : t("payment.stopped")
      : isPending
        ? t("payment.pending")
        : isApproved
          ? t("payment.confirmed")
          : t("payment.noActiveOrder");

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
            <span className="text-[13px] text-muted-foreground">{t("payment.plan")}</span>
            <span className="text-[14px] font-semibold text-foreground">{planName}</span>
          </div>

          {durationDays && (
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-muted-foreground">{t("payment.duration")}</span>
              <span className="text-[14px] font-semibold text-foreground">
                {t("common.days", { count: durationDays })}
              </span>
            </div>
          )}

          {priceMmk != null && (
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-muted-foreground">{t("payment.amountPaid")}</span>
              <span className="text-[14px] font-semibold text-warning">
                {formatCurrencyMmk(priceMmk, language)}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-[13px] text-muted-foreground">{t("payment.status")}</span>
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
              ? t("payment.pending.note")
              : t("payment.renewNote")}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex w-full flex-col gap-3">
        <PrimaryButton onClick={() => onTabChange(TAB_KEYS.HOME)}>
          <Home size={18} />
          {t("common.backToHome")}
        </PrimaryButton>

        {rawHandle && (
          <SecondaryButton
            onClick={() => openTelegramNativeLink(`https://t.me/${rawHandle}`)}
          >
            <MessageCircle size={18} />
            {t("common.contactSupport")}
          </SecondaryButton>
        )}
      </div>
    </div>
  );
}
