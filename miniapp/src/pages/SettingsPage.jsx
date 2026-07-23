import {
  ChevronRight,
  FileText,
  HelpCircle,
  Info,
  Languages,
  Send,
  ShieldCheck,
} from "lucide-react";
import { createElement } from "react";
import { Chip, GlassCard, PageHeader } from "../components/ui/primitives";
import { formatDate } from "../lib/format";
import { TAB_KEYS } from "../constants/routes";
import { useLanguage } from "../i18n/language";

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

export default function SettingsPage({ data, onTabChange, prevTab }) {
  const { currentLanguage, language, setLanguage, t } = useLanguage();
  const sub = data?.subscription || null;
  const brand = data?.config?.brand || null;
  const recentRejection = data?.recent_rejection || null;

  const isPurchase = sub?.type === "purchase";
  const isPending = sub?.review_status === "pending_review";

  // Priority: active > pending > rejected > none
  const planStatus =
    isPurchase && !isPending ? "active"
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

      <SettingsSection
        title={t("common.support")}
        rows={[
          { icon: Send, label: t("common.contactSupport") },
          { icon: HelpCircle, label: t("settings.faq") },
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
          { icon: ShieldCheck, label: t("settings.privacy") },
          { icon: FileText, label: t("settings.terms") },
          { icon: Info, label: t("settings.about") },
        ]}
      />

      {/* Pinned to bottom via mt-auto in the flex-col container */}
      <p className="mt-auto text-center text-[11px] text-muted-foreground">
        {brand?.name || "NovaNet"} · Mini App v1.0.0
      </p>
    </div>
  );
}
