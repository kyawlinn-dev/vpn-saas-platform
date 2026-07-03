import { Check, Database, Sparkles, Timer } from "lucide-react";
import { Chip, GlassCard, PrimaryButton, SecondaryButton } from "../../components/ui/primitives";
import { cn } from "@/lib/utils";
import { formatCurrencyMmk } from "../../lib/format";

function getFeatures(plan) {
  if (Array.isArray(plan?.features) && plan.features.length > 0) {
    return plan.features;
  }
  const maxDevices = Number(plan?.max_devices || 1);
  return [
    "Premium servers",
    "No-log policy",
    `Up to ${maxDevices} device${maxDevices === 1 ? "" : "s"}`,
    "High speed connection",
  ];
}

export default function PackageCard({ plan, onBuy, active }) {
  const dataLimit = plan?.data_limit_gb ? `${plan.data_limit_gb} GB` : "Unlimited";
  const duration = plan?.duration_days ? `${plan.duration_days} Days` : "Flexible";
  const features = getFeatures(plan);
  const highlighted = active || Boolean(plan?.is_popular || plan?.popular);

  return (
    <GlassCard
      glow={highlighted}
      className={cn("p-4", highlighted && "border-primary/40 aurora-glow")}
    >
      {/* Header row: plan name + price */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-1.5">
            {active && <Chip tone="success">Active</Chip>}
            {highlighted && !active && (
              <Chip tone="primary" icon={<Sparkles size={12} />}>
                Popular
              </Chip>
            )}
            <span className="text-[13px] font-bold text-muted-foreground">Premium VPN</span>
          </div>
          <p className="truncate text-[17px] font-bold text-foreground">
            {plan?.name || "Premium Plan"}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[18px] font-bold leading-none text-foreground">
            {Number(plan?.price_mmk || 0).toLocaleString("en-US")}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">MMK</p>
        </div>
      </div>

      {/* Data / duration meta */}
      <div className="mb-4 flex items-center gap-4 text-[12px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Database size={13} />
          {dataLimit}
        </span>
        <span className="inline-flex items-center gap-1">
          <Timer size={13} />
          {duration}
        </span>
      </div>

      {/* Feature list */}
      <ul className="mb-4 space-y-2">
        {features.slice(0, 4).map((feature) => (
          <li key={feature} className="flex items-center gap-2 text-[13px] text-foreground/90">
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
              <Check size={11} strokeWidth={3} />
            </span>
            {feature}
          </li>
        ))}
      </ul>

      {/* CTA button — gradient for popular/active, ghost for others */}
      {highlighted ? (
        <PrimaryButton onClick={() => onBuy?.(plan)} disabled={active}>
          {active ? "Current Plan" : `Buy Now · ${formatCurrencyMmk(plan?.price_mmk)}`}
        </PrimaryButton>
      ) : (
        <SecondaryButton onClick={() => onBuy?.(plan)} disabled={active}>
          {active ? "Current Plan" : `Buy Now · ${formatCurrencyMmk(plan?.price_mmk)}`}
        </SecondaryButton>
      )}
    </GlassCard>
  );
}
