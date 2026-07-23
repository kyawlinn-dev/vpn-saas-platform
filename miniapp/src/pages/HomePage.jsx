import { ArrowUp, ChevronRight, Download, Package, Send, Server, Share2, Wifi } from "lucide-react";
import {
  BrandBar,
  Chip,
  DataRing,
  GlassCard,
  PrimaryButton,
  QuickAction,
  SecondaryButton,
} from "../components/ui/primitives";
import { cn } from "@/lib/utils";
import { formatDate } from "../lib/format";
import { getShareUrl, openOutlineKey } from "../lib/links";
import {
  isTelegramWebBrowser,
  openTelegramNativeLink,
  openTelegramSharePicker,
} from "../lib/telegram";
import { useLanguage } from "../i18n/language";

// ── Helpers (logic unchanged from MUI version) ────────────────────────────────

function formatGb(value) {
  const number = Number(value || 0);
  if (!number) return "0";
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

function getPlanTitle(subscription, t) {
  const type = String(subscription?.type || "");
  if (
    type === "trial" ||
    String(subscription?.plan_name || "").toLowerCase().includes("trial")
  ) {
    return t("access.trial");
  }
  return subscription?.plan_name || t("access.premiumAccess");
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function AccessHero({ subscription, outlineKey, keyForActions, hasImportLink, onToast }) {
  const { t } = useLanguage();
  const usedGb = Number(outlineKey?.used_bytes || 0) / 1024 / 1024 / 1024;
  const limitGb = Number(subscription?.data_limit_gb || 0);
  const percent = limitGb > 0 ? Math.min(100, (usedGb / limitGb) * 100) : 0;
  const validUntil = subscription?.expiry_date ? formatDate(subscription.expiry_date) : null;
  const secondary = limitGb
    ? `${formatGb(usedGb)} / ${formatGb(limitGb)} GB`
    : `${formatGb(usedGb)} GB`;

  const handleAddKey = () => {
    try {
      openOutlineKey(keyForActions);
    } catch (error) {
      onToast?.(error?.message || t("error.message"), "warning");
    }
  };

  return (
    <GlassCard glow className="aurora-glow">
      {/* Status row */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-success/15 text-success">
            <Wifi size={20} />
          </span>
          <div>
            <p className="text-[15px] font-semibold text-foreground">{t("access.active")}</p>
            <p className="text-[12px] text-muted-foreground">{getPlanTitle(subscription, t)}</p>
          </div>
        </div>
        <Chip tone="success" icon={<span className="h-1.5 w-1.5 rounded-full bg-success" />}>
          {t("common.active")}
        </Chip>
      </div>

      {/* DataRing */}
      <div className="my-4 flex flex-col items-center">
        <DataRing
          percent={percent}
          primary={`${Math.round(percent)}%`}
          secondary={secondary}
          size={136}
        />
        <p className="mt-3 text-[12px] text-muted-foreground">{t("access.dataUsed")}</p>
      </div>

      {/* Expiry */}
      <div className="mb-4 flex items-center justify-center gap-1.5 text-[12px] text-muted-foreground">
        <span className="h-1 w-1 rounded-full bg-muted-foreground" />
        {validUntil ? t("access.validUntil", { date: validUntil }) : t("access.validUntilMissing")}
      </div>

      <PrimaryButton onClick={handleAddKey} disabled={!hasImportLink}>
        <Download size={18} />
        {t("access.addKey")}
      </PrimaryButton>
    </GlassCard>
  );
}

function CurrentServerCard({ server, onChangeServer }) {
  const { t } = useLanguage();
  const location = [server?.country, server?.city || server?.name]
    .filter(Boolean)
    .join(" / ");

  return (
    <GlassCard>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
          {t("servers.currentServer")}
        </span>
        <button
          type="button"
          onClick={onChangeServer}
          className="flex items-center gap-0.5 text-[12px] font-semibold text-primary"
        >
          {t("payment.change")} <ChevronRight size={14} />
        </button>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-2xl" aria-hidden="true">
          {server?.flag_emoji ?? server?.flag ?? "🌐"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-foreground">
            {location || server?.name || "Server"}
          </p>
          <p className="text-[12px] text-muted-foreground">
            {server?.server_number ? `Server #${server.server_number}` : `Server ${t("servers.linked")}`}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Chip tone="violet">{t("common.premium")}</Chip>
        <Chip tone="cyan">{t("common.highSpeed")}</Chip>
      </div>
    </GlassCard>
  );
}

// Inline empty-state card — doesn't touch the shared MUI EmptyState.jsx that
// other pages (Servers, Packages) still use.
// danger=true applies red/destructive coloring for the rejection case.
function EmptyStateCard({ icon, title, description, children, danger = false }) {
  return (
    <GlassCard className="p-5">
      <div className="flex flex-col gap-4">
        <div className={cn(
          "flex h-11 w-11 items-center justify-center rounded-2xl border",
          danger
            ? "border-destructive/15 bg-destructive/12 text-red-400"
            : "border-primary/15 bg-gradient-to-br from-primary/20 to-violet/15 text-primary",
        )}>
          {icon}
        </div>
        <div className="flex flex-col gap-1.5">
          <p className={cn(
            "text-[18px] font-semibold leading-tight",
            danger ? "text-red-400" : "text-foreground",
          )}>
            {title}
          </p>
          {description && (
            <p className="text-[13px] leading-relaxed text-muted-foreground">{description}</p>
          )}
        </div>
        {children && <div className="flex flex-col gap-2">{children}</div>}
      </div>
    </GlassCard>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function HomePage({ data, hasActivePackage, hasLinkedKey, onToast, onTabChange, onOpenSettings }) {
  const { t } = useLanguage();
  const subscription = data?.subscription || null;
  const currentServer = data?.current_server || null;
  const outlineKey = data?.outline_key || null;
  const recentRejection = data?.recent_rejection || null;
  const brand = data?.config?.brand || null;

  const rawSupportHandle = brand?.support_username
    ? String(brand.support_username).replace(/^@/, "")
    : null;
  const handleSupportContact = rawSupportHandle
    ? () => openTelegramNativeLink(`https://t.me/${rawSupportHandle}`)
    : null;

  const keyForActions = outlineKey || currentServer;
  const hasImportLink = Boolean(keyForActions?.dynamic_access_url);

  const handleShare = async () => {
    const shareUrl = getShareUrl(keyForActions);

    if (!shareUrl) {
      onToast(t("access.chooseServer"), "warning");
      return;
    }

    try {
      openTelegramSharePicker(shareUrl);
      return;
    } catch {
      // fallback to clipboard
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      onToast(t("access.shareKey"), "success");
      return;
    } catch {
      if (!isTelegramWebBrowser()) {
        onToast(t("error.message"), "error");
      } else {
        onToast(t("error.message"), "error");
      }
    }
  };

  return (
    <div className="flex flex-col gap-4 px-4 pb-6">
      <div className="sticky top-[var(--app-safe-top)] z-20 -mx-4 px-4 py-3 glass">
        <BrandBar
          brandName={brand?.name || "VPN"}
          subtitle={t("app.subtitle")}
          onOpenSettings={onOpenSettings}
        />
      </div>

      {hasActivePackage ? (
        <>
          <AccessHero
            subscription={subscription}
            outlineKey={outlineKey}
            keyForActions={keyForActions}
            hasImportLink={hasImportLink}
            onToast={onToast}
          />

          <CurrentServerCard
            server={currentServer}
            onChangeServer={() => onTabChange("servers")}
          />

          {hasLinkedKey && currentServer ? (
            <div>
              <p className="mb-3 text-[13px] font-bold text-foreground">{t("access.quickActions")}</p>
              <div className="grid grid-cols-2 gap-3">
                <QuickAction
                  icon={<Share2 size={18} />}
                  label={t("access.shareKey")}
                  onClick={handleShare}
                  disabled={!hasImportLink}
                  trailingIcon={<ArrowUp size={16} className="text-muted-foreground" />}
                />
                {handleSupportContact && (
                  <QuickAction
                    icon={<Send size={18} />}
                    label={t("common.support")}
                    onClick={handleSupportContact}
                  />
                )}
              </div>
            </div>
          ) : (
            <EmptyStateCard
              icon={<Server size={20} />}
              title={t("access.chooseServer")}
              description={t("access.chooseServer.description")}
            >
              <SecondaryButton onClick={() => onTabChange("servers")}>
                {t("access.chooseServer")}
              </SecondaryButton>
              {handleSupportContact && (
                <SecondaryButton onClick={handleSupportContact}>
                  {t("common.contactSupport")}
                </SecondaryButton>
              )}
            </EmptyStateCard>
          )}
        </>
      ) : (
        <EmptyStateCard
          icon={<Package size={20} />}
          title={recentRejection ? t("access.paymentNotConfirmed") : t("access.noActivePackage")}
          description={
            recentRejection
              ? t("access.paymentRejected")
              : t("access.packageLinked")
          }
          danger={Boolean(recentRejection)}
        >
          <SecondaryButton onClick={() => onTabChange("packages")}>
            {t("settings.viewPackages")}
          </SecondaryButton>
          {handleSupportContact && (
            <SecondaryButton onClick={handleSupportContact}>
              {t("common.contactSupport")}
            </SecondaryButton>
          )}
        </EmptyStateCard>
      )}
    </div>
  );
}
