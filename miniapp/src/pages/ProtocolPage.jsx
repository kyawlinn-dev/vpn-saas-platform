import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { GlassCard, PageHeader, PrimaryButton, SecondaryButton } from "../components/ui/primitives";
import { cn } from "@/lib/utils";
import { formatCurrencyMmk } from "../lib/format";
import { TAB_KEYS } from "../constants/routes";
import { useLanguage } from "../i18n/language";

// VLESS Reality is compatible with several client apps.
const VLESS_APPS = [
  { src: "/apps/hiddify.png", name: "Hiddify" },
  { src: "/apps/v2box.png", name: "V2Box" },
  { src: "/apps/v2raytun.png", name: "v2rayTun" },
  { src: "/apps/v2rayng.png", name: "v2rayNG" },
];

function PlanSummaryCard({ plan }) {
  const { language, t } = useLanguage();
  const dataLabel = plan?.data_limit_gb ? `${plan.data_limit_gb} GB` : t("common.unlimited");
  const daysLabel = plan?.duration_days ? t("common.days", { count: plan.duration_days }) : "";

  return (
    <GlassCard glow className="aurora-glow p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            {t("payment.selectedPlan")}
          </p>
          <p className="truncate text-[17px] font-bold leading-tight text-foreground">
            {plan?.name || t("common.premiumPlan")}
          </p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {dataLabel}{daysLabel ? ` · ${daysLabel}` : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[17px] font-black text-warning leading-tight">
            {formatCurrencyMmk(plan?.price_mmk || 0, language)}
          </p>
        </div>
      </div>
    </GlassCard>
  );
}

function ProtocolCard({ selected, onSelect, logo, title, desc, badge, appLogos }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "relative flex w-full flex-col gap-3 rounded-2xl border p-4 text-left transition-all",
        selected
          ? "border-primary bg-primary/10 ring-1 ring-primary/30"
          : "border-border bg-secondary/30 hover:bg-secondary/50",
      )}
    >
      {/* Selected check */}
      <span
        className={cn(
          "absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full border transition-all",
          selected ? "border-primary bg-primary text-white" : "border-border bg-secondary/60 text-transparent",
        )}
      >
        <Check size={14} />
      </span>

      <div className="flex items-center gap-3">
        <img
          src={logo}
          alt={title}
          className="h-12 w-12 shrink-0 rounded-xl object-contain"
        />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-bold text-foreground">{title}</span>
            {badge && (
              <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success">
                {badge}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{desc}</p>
        </div>
      </div>

      {appLogos?.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 pl-1">
          {appLogos.map((app) => (
            <span
              key={app.name}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-black/20 px-2 py-1"
            >
              <img src={app.src} alt={app.name} className="h-4 w-4 rounded object-contain" />
              <span className="text-[10.5px] font-medium text-muted-foreground">{app.name}</span>
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

export default function ProtocolPage({
  data,
  checkoutPlan,
  checkoutProtocol,
  onConfirmProtocol,
  onTabChange,
}) {
  const { t } = useLanguage();
  const [selected, setSelected] = useState(
    checkoutProtocol || data?.protocol_preference || "shadowsocks",
  );

  if (!checkoutPlan) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 px-6 py-20">
        <p className="text-[15px] text-muted-foreground">{t("packages.noPlanSelected")}</p>
        <SecondaryButton onClick={() => onTabChange(TAB_KEYS.PACKAGES)} className="w-auto px-6">
          {t("packages.backToPackages")}
        </SecondaryButton>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-4 pt-4 pb-8">
      <PageHeader
        title={t("protocol.choose")}
        onBack={() => onTabChange(TAB_KEYS.PACKAGES)}
        centerTitle
      />

      <PlanSummaryCard plan={checkoutPlan} />

      <p className="px-1 text-[13px] text-muted-foreground">{t("protocol.subtitle")}</p>

      <div className="flex flex-col gap-2.5">
        <ProtocolCard
          selected={selected === "shadowsocks"}
          onSelect={() => setSelected("shadowsocks")}
          logo="/apps/outline.png"
          title="Outline"
          desc={t("protocol.ssDesc")}
          badge={t("protocol.recommended")}
          appLogos={[{ src: "/apps/outline.png", name: "Outline" }]}
        />

        <ProtocolCard
          selected={selected === "vless"}
          onSelect={() => setSelected("vless")}
          logo="/apps/hiddify.png"
          title="VLESS Reality"
          desc={t("protocol.vlessDesc")}
          appLogos={VLESS_APPS}
        />
      </div>

      <PrimaryButton onClick={() => onConfirmProtocol(selected)} className="mt-2">
        {t("protocol.continue")}
        <ArrowRight size={18} />
      </PrimaryButton>
    </div>
  );
}
