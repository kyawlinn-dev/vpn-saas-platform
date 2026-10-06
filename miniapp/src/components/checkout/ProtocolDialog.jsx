import { useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { ArrowRight, Check, X } from "lucide-react";
import { PrimaryButton } from "../ui/primitives";
import { cn } from "@/lib/utils";
import { formatCurrencyMmk } from "../../lib/format";
import { useLanguage } from "../../i18n/language";

// VLESS Reality is compatible with several client apps.
const VLESS_APPS = [
  { src: "/apps/happ.webp", name: "Happ" },
  { src: "/apps/hiddify.png", name: "Hiddify" },
  { src: "/apps/v2box.png", name: "V2Box" },
  { src: "/apps/v2raytun.png", name: "v2rayTun" },
  { src: "/apps/v2rayng.png", name: "v2rayNG" },
];

function PlanSummary({ plan }) {
  const { language, t } = useLanguage();
  const dataLabel = plan?.data_limit_gb ? `${plan.data_limit_gb} GB` : t("common.unlimited");
  const daysLabel = plan?.duration_days ? t("common.days", { count: plan.duration_days }) : "";

  return (
    <div className="border-b border-border/70 px-1 pb-4">
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
    </div>
  );
}

function ProtocolCard({ selected, onSelect, logo, title, desc, appLogos }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "relative flex w-full flex-col gap-3 rounded-lg border p-4 text-left transition-all",
        selected
          ? "border-primary bg-primary/10 ring-1 ring-primary/30"
          : "border-border bg-secondary/30 hover:bg-secondary/50",
      )}
    >
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

export default function ProtocolDialog({ plan, onClose, onConfirm }) {
  const { t } = useLanguage();
  const [selected, setSelected] = useState(null);

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" />
        <Dialog.Popup className="glass fixed inset-x-3 bottom-[max(12px,var(--app-safe-bottom))] z-50 mx-auto flex max-h-[min(85dvh,680px)] max-w-md flex-col gap-3 overflow-hidden rounded-lg p-4 text-foreground shadow-2xl outline-none">
          <div className="flex items-center justify-between gap-3">
            <Dialog.Title className="text-[18px] font-semibold">{t("protocol.choose")}</Dialog.Title>
            <Dialog.Close className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground" aria-label={t("common.cancel")}>
              <X size={18} />
            </Dialog.Close>
          </div>

          <div className="min-h-0 overflow-y-auto">
            <PlanSummary plan={plan} />
            <Dialog.Description className="my-3 text-[13px] text-muted-foreground">
              {t("protocol.subtitle")}
            </Dialog.Description>
            <div className="flex flex-col gap-2.5">
            <ProtocolCard
              selected={selected === "shadowsocks"}
              onSelect={() => setSelected("shadowsocks")}
              logo="/apps/outline.png"
              title="Outline"
              desc={t("protocol.ssDesc")}
            />
            <ProtocolCard
              selected={selected === "vless"}
              onSelect={() => setSelected("vless")}
              logo="/apps/happ.webp"
              title="Happ / Hiddify"
              desc={t("protocol.vlessDesc")}
              appLogos={VLESS_APPS}
            />
            </div>
          </div>

          <PrimaryButton onClick={() => onConfirm(selected)} disabled={!selected} className="shrink-0 rounded-lg disabled:bg-secondary disabled:opacity-50 disabled:shadow-none">
            {t("protocol.continue")}
            <ArrowRight size={18} />
          </PrimaryButton>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
