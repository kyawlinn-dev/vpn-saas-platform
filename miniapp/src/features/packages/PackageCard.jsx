import { Check, Database, Sparkles, Timer } from "lucide-react";
import { Chip, GlassCard, PrimaryButton, SecondaryButton } from "../../components/ui/primitives";
import { cn } from "@/lib/utils";
import { formatCurrencyMmk } from "../../lib/format";
import { useLanguage } from "../../i18n/language";

function getFeatures(plan, t) {
  if (Array.isArray(plan?.features) && plan.features.length > 0) {
    return plan.features;
  }
  const maxDevices = Number(plan?.max_devices || 1);
  return [
    t("common.premium"),
    t("features.noLog"),
    t("features.devices", { count: maxDevices }),
    t("common.highSpeed"),
  ];
}

export default function PackageCard({ plan, onBuy, active }) {
  const { language, t } = useLanguage();
  const dataLimitValue = plan?.data_limit_gb ? String(plan.data_limit_gb) : t("common.unlimited");
  const dataLimitUnit = plan?.data_limit_gb ? "GB" : "";
  const durationValue = plan?.duration_days ? String(plan.duration_days) : t("common.flexible");
  const durationUnit = plan?.duration_days ? t("common.daysUnit") : "";
  const features = getFeatures(plan, t);
  const highlighted = active || Boolean(plan?.is_popular || plan?.popular);
  const buyLabel = t("packages.buyNow", { price: formatCurrencyMmk(plan?.price_mmk, language) });
  const ctaLabel = active
    ? t("packages.buyAgain", { price: formatCurrencyMmk(plan?.price_mmk, language) })
    : buyLabel;

  return (
    <GlassCard
      glow={highlighted}
      className={cn("overflow-hidden p-0", highlighted && "border-primary/40 aurora-glow")}
    >
      <div className="p-4">
        {/* Header row: plan name + duration */}
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-1.5">
              {active && <Chip tone="success">{t("common.active")}</Chip>}
              {highlighted && !active && (
                <Chip tone="primary" icon={<Sparkles size={12} />}>
                  {t("packages.popular")}
                </Chip>
              )}
              <span className="text-[12px] font-bold uppercase text-muted-foreground">
                {t("common.premiumVpn")}
              </span>
            </div>
            <p className="truncate text-[20px] font-black leading-tight text-foreground">
              {plan?.name || t("common.premiumPlan")}
            </p>
          </div>
          <div className="shrink-0 rounded-full border border-border bg-secondary/55 px-3 py-1.5">
            <span className="flex items-center gap-1.5 text-[12px] font-bold text-foreground">
              <Timer size={13} className="text-muted-foreground" />
              {durationValue}
              {durationUnit && <span className="text-muted-foreground">{durationUnit}</span>}
            </span>
          </div>
        </div>

        {/* Hero spec */}
        <div className="mb-4 overflow-hidden rounded-[26px] border border-cyan/20 bg-[radial-gradient(circle_at_18%_20%,rgba(6,182,212,0.22),transparent_42%),linear-gradient(135deg,rgba(8,145,178,0.16),rgba(15,23,42,0.78))] px-4 py-4">
          <span className="mb-1.5 flex items-center gap-2 text-[11px] font-bold uppercase text-cyan/80">
            <Database size={14} />
            {t("common.data")}
          </span>
          <div className="flex items-end justify-between gap-3">
            <p className="flex items-baseline gap-1 leading-none">
              <span className="text-[48px] font-black tracking-normal text-cyan">
                {dataLimitValue}
              </span>
              {dataLimitUnit && (
                <span className="text-[18px] font-black text-cyan/90">{dataLimitUnit}</span>
              )}
            </p>
          </div>
        </div>

        {/* Feature list */}
        <ul className="mb-4 grid gap-2">
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
          <PrimaryButton onClick={() => onBuy?.(plan)}>
            {ctaLabel}
          </PrimaryButton>
        ) : (
          <SecondaryButton onClick={() => onBuy?.(plan)}>
            {ctaLabel}
          </SecondaryButton>
        )}
      </div>
    </GlassCard>
  );
}
