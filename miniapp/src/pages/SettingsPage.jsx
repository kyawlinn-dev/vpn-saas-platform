import {
  ChevronRight,
  Clock,
  HelpCircle,
  Info,
  Languages,
  Send,
  X,
  Zap,
} from "lucide-react";
import { createElement, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Chip, GlassCard, PageHeader } from "../components/ui/primitives";
import { formatDate } from "../lib/format";
import { TAB_KEYS } from "../constants/routes";
import { useLanguage } from "../i18n/language";
import { openTelegramNativeLink } from "../lib/telegram";

// ── Section ────────────────────────────────────────────────────────────────────

function SettingsSection({ title, rows }) {
  return (
    <section>
      <h4 className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      <div className="glass divide-y divide-border overflow-hidden rounded-[20px]">
        {rows.map(({ icon, label, value, onClick }) => (
          <button
            key={label}
            type="button"
            onClick={onClick}
            className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/40 active:bg-secondary/60"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
              {createElement(icon, { size: 16 })}
            </span>
            <span className="flex-1 text-[13.5px] font-medium text-foreground">{label}</span>
            {value && <span className="mr-1 text-[12px] text-muted-foreground">{value}</span>}
            <ChevronRight size={15} className="shrink-0 text-muted-foreground" />
          </button>
        ))}
      </div>
    </section>
  );
}

// Inline-styled rejected chip — no destructive tone in chipTones, so styled directly.
function RejectedChip() {
  const { t } = useLanguage();

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-destructive/25 bg-destructive/15 px-2 py-0.5 text-[11px] font-medium text-red-400">
      {t("payment.rejected.title")}
    </span>
  );
}

// Right-aligned "View Packages >" link used in rejected and none states.
function ViewPackagesLink({ onTabChange }) {
  const { t } = useLanguage();

  return (
    <div className="mt-2 flex justify-end">
      <button
        type="button"
        onClick={() => onTabChange(TAB_KEYS.PACKAGES)}
        className="flex items-center gap-0.5 text-[13px] font-semibold text-primary"
      >
        {t("settings.viewPackages")}
        <ChevronRight size={14} />
      </button>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

function protocolLabel(protocol) {
  if (!protocol || protocol === "shadowsocks") return "Outline";
  if (protocol === "vless") return "VLESS Reality";
  if (protocol === "hysteria2") return "Hysteria2";
  return protocol;
}

export default function SettingsPage({ data, onTabChange, prevTab }) {
  const { currentLanguage, language, setLanguage, t } = useLanguage();
  const [infoOpen, setInfoOpen] = useState(null);
  const sub = data?.subscription || null;
  const brand = data?.config?.brand || null;
  const supportHandle = String(brand?.support_username || "").trim().replace(/^@/, "");
  const hasSupport = /^[A-Za-z0-9_]{5,32}$/.test(supportHandle);
  const recentRejection = data?.recent_rejection || null;
  const activeProtocol = data?.vpn_key?.protocol || data?.protocol_preference || null;

  const queuedSub = data?.queued_subscription || null;

  const isPurchase = sub?.type === "purchase";
  const isTrial = sub?.type === "trial";
  const isPending = sub?.review_status === "pending_review";

  // Priority: active (purchase or trial) > pending > rejected > none
  const planStatus =
    isTrial && sub?.status === "active" ? "active"
    : isPurchase && !isPending ? "active"
    : isPending ? "pending"
    : recentRejection ? "rejected"
    : "none";

  const handleBack = () => onTabChange(prevTab || TAB_KEYS.HOME);
  const toggleLanguage = () => setLanguage(language === "MM" ? "EN" : "MM");

  return (
    <div
      className="flex flex-col gap-3 px-4 pt-4 pb-4"
      style={{ minHeight: "calc(100vh - var(--app-safe-top) - var(--app-safe-bottom))" }}
    >
      <PageHeader title={t("settings.title")} onBack={handleBack} centerTitle />

      {/* Current Plan — status-aware */}
      <GlassCard className="aurora-glow p-3">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            {t("common.currentPlan")}
          </span>
          {planStatus === "active" && (
            <Chip tone="success" icon={<span className="h-1.5 w-1.5 rounded-full bg-success" />}>
              {t("common.active")}
            </Chip>
          )}
          {planStatus === "pending" && (
            <Chip tone="warning">{t("payment.pending")}</Chip>
          )}
          {planStatus === "rejected" && <RejectedChip />}
        </div>

        {planStatus === "active" && (
          <>
            <p className="text-[15px] font-semibold text-foreground">
              {sub.plan_name || t("common.premiumPlan")}
            </p>
            <p className="text-[12px] text-muted-foreground">
              {sub.expiry_date
                ? t("access.validUntil", { date: formatDate(sub.expiry_date) })
                : t("common.active")}
            </p>
            {activeProtocol && (
              <div className="mt-2 flex items-center gap-1.5">
                <Zap size={12} className="text-primary" />
                <span className="text-[12px] font-medium text-primary">
                  {protocolLabel(activeProtocol)}
                </span>
              </div>
            )}
          </>
        )}

        {planStatus === "pending" && (
          <>
            <p className="text-[15px] font-semibold text-foreground">
              {sub.plan_name || t("common.premiumPlan")}
            </p>
            <p className="text-[12px] text-muted-foreground">{t("payment.pending")}</p>
          </>
        )}

        {planStatus === "rejected" && (
          <>
            {recentRejection.plan_name && (
              <p className="text-[15px] font-semibold text-foreground">
                {recentRejection.plan_name}
              </p>
            )}
            <p className="text-[12px] text-muted-foreground">
              {t("payment.rejected.description")}
            </p>
            <ViewPackagesLink onTabChange={onTabChange} />
          </>
        )}

        {planStatus === "none" && (
          <>
            <p className="text-[14px] text-muted-foreground">{t("access.noActivePackage")}</p>
            <ViewPackagesLink onTabChange={onTabChange} />
          </>
        )}
      </GlassCard>

      {/* Queued Plan — shown if customer has a scheduled order waiting to activate */}
      {queuedSub && (
        <GlassCard className="border-cyan/25 bg-cyan/5 p-3">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wide text-cyan-400">
              {t("settings.queuedPlan")}
            </span>
            <Chip tone="cyan" icon={<Clock size={11} className="text-cyan" />}>
              {t("settings.queuedBadge")}
            </Chip>
          </div>
          <p className="text-[15px] font-semibold text-foreground">
            {queuedSub.plan_name || t("common.premiumPlan")}
          </p>
          <div className="mt-0.5 flex items-center gap-2 text-[12px] text-muted-foreground">
            {queuedSub.duration_days && (
              <span>{t("common.days", { count: queuedSub.duration_days })}</span>
            )}
            {queuedSub.data_limit_gb && (
              <>
                <span className="h-1 w-1 rounded-full bg-muted-foreground/60" />
                <span>{queuedSub.data_limit_gb} GB</span>
              </>
            )}
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
            {t("settings.queuedDesc")}
          </p>
        </GlassCard>
      )}

      <SettingsSection
        title={t("common.support")}
        rows={[
          ...(hasSupport ? [{
            icon: Send,
            label: t("common.contactSupport"),
            onClick: () => openTelegramNativeLink(`https://t.me/${supportHandle}`),
          }] : []),
          { icon: HelpCircle, label: t("settings.faq"), onClick: () => setInfoOpen("faq") },
        ]}
      />

      <SettingsSection
        title={t("settings.general")}
        rows={[
          {
            icon: Languages,
            label: t("common.language"),
            value: `${currentLanguage.emoji} ${currentLanguage.code}`,
            onClick: toggleLanguage,
          },
          { icon: Info, label: t("settings.about"), onClick: () => setInfoOpen("about") },
        ]}
      />

      <Dialog.Root open={infoOpen !== null} onOpenChange={(open) => !open && setInfoOpen(null)}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/60" />
          <Dialog.Popup className="glass fixed inset-x-4 bottom-4 z-50 max-h-[80vh] overflow-y-auto rounded-lg p-5 text-foreground shadow-2xl outline-none">
            <div className="flex items-center justify-between gap-3">
              <Dialog.Title className="text-[17px] font-semibold">
                {infoOpen === "faq" ? t("settings.faq") : t("settings.about")}
              </Dialog.Title>
              <Dialog.Close className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground" aria-label={t("common.cancel")}>
                <X size={18} />
              </Dialog.Close>
            </div>
            {infoOpen === "faq" ? (
              <div className="mt-4 space-y-4 text-[13px] leading-relaxed">
                {[1, 2, 3].map((number) => (
                  <div key={number}>
                    <p className="font-semibold">{t(`settings.faq.q${number}`)}</p>
                    <p className="mt-1 text-muted-foreground">{t(`settings.faq.a${number}`)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <Dialog.Description className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
                {t("settings.aboutDescription", { brand: brand?.name || "NovaNet" })}
              </Dialog.Description>
            )}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Pinned to bottom via mt-auto in the flex-col container */}
      <p className="mt-auto text-center text-[11px] text-muted-foreground">
        {brand?.name || "NovaNet"} · Mini App v1.0.0
      </p>
    </div>
  );
}
