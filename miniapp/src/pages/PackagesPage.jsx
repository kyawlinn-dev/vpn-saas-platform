import { useMemo } from "react";
import { Hourglass, Package } from "lucide-react";
import {
  BrandBar,
  Chip,
  GlassCard,
  PrimaryButton,
} from "../components/ui/primitives";
import { openTelegramNativeLink } from "../lib/telegram";
import { formatDate } from "../lib/format";
import PackageCard from "../features/packages/PackageCard";
import SupportCard from "../features/support/SupportCard";

// ── Inline sub-components ──────────────────────────────────────────────────────

function PendingReviewCard() {
  return (
    <GlassCard className="border-warning/30 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning">
          <Hourglass size={16} />
        </div>
        <div>
          <p className="text-[15px] font-semibold text-foreground">
            Purchase waiting for review
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            Premium access is active. Your reseller will review the payment screenshot.
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
  const planName = subscription?.plan_name || "Premium Plan";
  const expiry = subscription?.expiry_date ? formatDate(subscription.expiry_date) : null;

  return (
    <GlassCard className="flex items-center justify-between p-3.5">
      <div>
        <p className="text-[14px] font-semibold text-foreground">{planName}</p>
        {expiry && (
          <p className="text-[12px] text-muted-foreground">Valid until {expiry}</p>
        )}
      </div>
      <Chip tone="success" icon={<span className="h-1.5 w-1.5 rounded-full bg-success" />}>
        Active
      </Chip>
    </GlassCard>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function PackagesPage({
  data,
  onToast,
  onTabChange,
  onNavigateToCheckout,
}) {
  const plans = useMemo(() => data?.plans || [], [data?.plans]);
  const subscription = data?.subscription || null;
  const brand = data?.config?.brand || null;

  const rawSupportHandle = brand?.support_username
    ? String(brand.support_username).replace(/^@/, "")
    : null;
  const supportUsername = rawSupportHandle ? `@${rawSupportHandle}` : "";
  const handleSupportContact = rawSupportHandle
    ? () => openTelegramNativeLink(`https://t.me/${rawSupportHandle}`)
    : null;

  const pendingReviewOrder =
    subscription?.type === "purchase" && subscription?.review_status === "pending_review"
      ? subscription
      : null;

  const confirmedActivePurchase =
    subscription?.type === "purchase" && subscription?.review_status !== "pending_review"
      ? subscription
      : null;

  // ── Plan grouping (unchanged) ──────────────────────────────────────────────
  const visiblePlans = useMemo(
    () => (plans || []).filter((p) => !String(p?.name || "").toLowerCase().includes("trial")),
    [plans],
  );

  const groupedPlans = useMemo(() => {
    const sorted = [...visiblePlans].sort((a, b) => {
      const orderDiff = (a.sort_order ?? 999) - (b.sort_order ?? 999);
      if (orderDiff !== 0) return orderDiff;
      return (a.price_mmk ?? 0) - (b.price_mmk ?? 0);
    });
    const map = new Map();
    for (const plan of sorted) {
      const days = plan.duration_days ?? 30;
      if (!map.has(days)) map.set(days, []);
      map.get(days).push(plan);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a - b);
  }, [visiblePlans]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const isActivePlan = (plan) => {
    if (!subscription || subscription?.type !== "purchase") return false;
    return (
      plan?.id === subscription?.plan_id ||
      (plan?.name &&
        subscription?.plan_name &&
        String(plan.name) === String(subscription.plan_name))
    );
  };

  const handleBuy = (plan) => {
    if (!data?.user?.telegram_user_id) {
      onToast("Telegram user is not ready yet", "warning");
      return;
    }
    if (subscription?.type === "purchase") {
      onToast("You already have an active package", "warning");
      return;
    }
    onNavigateToCheckout(plan);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4 px-4 pt-2 pb-6">
      <BrandBar brandName={brand?.name || "VPN"} subtitle="Secure private access" />

      <div>
        <h2 className="text-[18px] font-semibold text-foreground">Choose Your Plan</h2>
        <p className="text-[13px] text-muted-foreground">
          Secure private access with this reseller
        </p>
      </div>

      <SupportCard supportUsername={supportUsername} onContact={handleSupportContact} />

      {confirmedActivePurchase && (
        <CurrentPlanCard subscription={confirmedActivePurchase} />
      )}

      {pendingReviewOrder && <PendingReviewCard />}

      {visiblePlans.length > 0 ? (
        groupedPlans.map(([days, groupPlans]) => (
          <div key={days} className="flex flex-col gap-3">
            <p className="px-0.5 text-[15px] font-bold text-foreground">{days} Days</p>
            {groupPlans.map((plan) => (
              <PackageCard
                key={plan.id}
                plan={plan}
                onBuy={handleBuy}
                active={isActivePlan(plan)}
              />
            ))}
          </div>
        ))
      ) : (
        <EmptyStateCard
          icon={<Package size={20} />}
          title="No packages available"
          description="Please check back later or contact support for manual activation."
        />
      )}
    </div>
  );
}
