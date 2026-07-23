import { useMemo, useState } from "react";
import { CalendarDays, Hourglass, Package } from "lucide-react";
import {
  BrandBar,
  Chip,
  GlassCard,
  PrimaryButton,
} from "../components/ui/primitives";
import { formatDate } from "../lib/format";
import { cn } from "@/lib/utils";
import PackageCard from "../features/packages/PackageCard";
import { useLanguage } from "../i18n/language";

// ── Inline sub-components ──────────────────────────────────────────────────────

function PendingReviewCard() {
  const { t } = useLanguage();

  return (
    <GlassCard className="border-warning/30 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning">
          <Hourglass size={16} />
        </div>
        <div>
          <p className="text-[15px] font-semibold text-foreground">
            {t("packages.waitingReview.title")}
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            {t("packages.waitingReview.description")}
          </p>
        </div>
      </div>
    </GlassCard>
  );
}

function EmptyStateCard({ icon, title, description }) {
  return (
    <GlassCard className="p-5">
      <div className="flex flex-col gap-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/20 to-violet/15 text-primary">
          {icon}
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="text-[18px] font-semibold leading-tight text-foreground">{title}</p>
          {description && (
            <p className="text-[13px] leading-relaxed text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
    </GlassCard>
  );
}

function CurrentPlanCard({ subscription }) {
  const { t } = useLanguage();
  const planName = subscription?.plan_name || "Premium Plan";
  const expiry = subscription?.expiry_date ? formatDate(subscription.expiry_date) : null;

  return (
    <GlassCard className="flex items-center justify-between p-3.5">
      <div>
        <p className="text-[14px] font-semibold text-foreground">{planName}</p>
        {expiry && (
          <p className="text-[12px] text-muted-foreground">
            {t("access.validUntil", { date: expiry })}
          </p>
        )}
      </div>
      <Chip tone="success" icon={<span className="h-1.5 w-1.5 rounded-full bg-success" />}>
        {t("common.active")}
      </Chip>
    </GlassCard>
  );
}

function BuyGuide() {
  const { t } = useLanguage();
  const steps = [
    t("packages.buyGuide.step1"),
    t("packages.buyGuide.step2"),
    t("packages.buyGuide.step3"),
    t("packages.buyGuide.step4"),
  ];

  return (
    <ol className="mt-2 grid gap-1.5 text-[12px] leading-relaxed text-muted-foreground">
      {steps.map((step, index) => (
        <li key={step} className="flex gap-2">
          <span className="w-4 shrink-0 font-semibold text-primary">{index + 1}.</span>
          <span>{step}</span>
        </li>
      ))}
    </ol>
  );
}

function DurationSelector({ durations, selectedDuration, onChange }) {
  const { t } = useLanguage();
  const activeIndex = Math.max(0, durations.indexOf(selectedDuration));

  if (durations.length <= 1) return null;

  return (
    <div className="sticky top-[calc(var(--app-safe-top)+72px)] z-10 -mx-1 rounded-xl border border-border/80 bg-background/85 p-1.5 shadow-[0_12px_30px_-24px_rgb(0_0_0)] backdrop-blur-xl">
      <div
        className="relative grid gap-1.5 overflow-hidden rounded-lg"
        style={{ gridTemplateColumns: `repeat(${durations.length}, minmax(0, 1fr))` }}
        role="tablist"
        aria-label={t("payment.duration")}
      >
        <span
          className="absolute inset-y-0 left-0 rounded-lg border border-primary/45 bg-primary shadow-[0_10px_24px_-16px_var(--primary)] transition-transform duration-300 ease-out"
          style={{
            width: `calc((100% - ${(durations.length - 1) * 6}px) / ${durations.length})`,
            transform: `translateX(calc(${activeIndex * 100}% + ${activeIndex * 6}px))`,
          }}
          aria-hidden="true"
        />
        {durations.map((days) => {
          const active = selectedDuration === days;
          return (
            <button
              key={days}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(days)}
              className={cn(
                "relative z-10 flex h-11 items-center justify-center gap-1.5 rounded-lg border text-[13px] font-semibold transition-colors duration-300 active:scale-[0.98]",
                active
                  ? "border-transparent text-primary-foreground"
                  : "border-border/70 bg-secondary/45 text-muted-foreground hover:border-primary/30 hover:bg-secondary hover:text-foreground",
              )}
            >
              <CalendarDays size={15} strokeWidth={2.3} />
              {t("common.days", { count: days })}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function PackagesPage({
  data,
  onToast,
  onNavigateToCheckout,
  onOpenSettings,
}) {
  const { t } = useLanguage();
  const plans = useMemo(() => data?.plans || [], [data?.plans]);
  const subscription = data?.subscription || null;
  const brand = data?.config?.brand || null;

  // ── Plan grouping (unchanged) ──────────────────────────────────────────────
  const visiblePlans = useMemo(
    () => (plans || []).filter((p) => !String(p?.name || "").toLowerCase().includes("trial")),
    [plans],
  );

  const availableDurations = useMemo(() => {
    const durations = new Set();
    for (const plan of visiblePlans) {
      durations.add(Number(plan.duration_days ?? 30));
    }
    return Array.from(durations).sort((a, b) => a - b);
  }, [visiblePlans]);

  const [preferredDuration, setPreferredDuration] = useState(30);
  const selectedDuration = availableDurations.includes(preferredDuration)
    ? preferredDuration
    : availableDurations.includes(30)
      ? 30
      : availableDurations[0] ?? null;

  const selectedPlans = useMemo(() => {
    return visiblePlans
      .filter((plan) => Number(plan.duration_days ?? 30) === selectedDuration)
      .sort((a, b) => {
        const orderDiff = (a.sort_order ?? 999) - (b.sort_order ?? 999);
        if (orderDiff !== 0) return orderDiff;
        return (a.price_mmk ?? 0) - (b.price_mmk ?? 0);
      });
  }, [selectedDuration, visiblePlans]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const isActivePlan = (plan) => {
    if (!subscription || subscription?.type !== "purchase") return false;
    return plan?.id === subscription?.plan_id;
  };

  const handleBuy = (plan) => {
    if (!data?.user?.telegram_user_id) {
      onToast("Telegram user is not ready yet", "warning");
      return;
    }
    onNavigateToCheckout(plan);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4 px-4 pb-6">
      <div className="sticky top-[var(--app-safe-top)] z-20 -mx-4 px-4 py-3 glass">
        <BrandBar brandName={brand?.name || "VPN"} subtitle={t("app.subtitle")} onOpenSettings={onOpenSettings} />
      </div>

      <div>
        <h2 className="text-[18px] font-semibold text-foreground">{t("packages.choosePlan")}</h2>
        <p className="mt-1 text-[12px] font-semibold text-foreground/80">{t("packages.subtitle")}</p>
        <BuyGuide />
      </div>

      <DurationSelector
        durations={availableDurations}
        selectedDuration={selectedDuration}
        onChange={setPreferredDuration}
      />

      {visiblePlans.length > 0 ? (
        <div className="flex flex-col gap-3">
          {selectedPlans.map((plan) => (
            <PackageCard
              key={plan.id}
              plan={plan}
              onBuy={handleBuy}
              active={isActivePlan(plan)}
            />
          ))}
        </div>
      ) : (
        <EmptyStateCard
          icon={<Package size={20} />}
          title={t("packages.empty.title")}
          description={t("packages.empty.description")}
        />
      )}
    </div>
  );
}
