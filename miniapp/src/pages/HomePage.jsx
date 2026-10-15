import {PackageSummary} from "../components/business/PackageSummary";
import { ArrowUp, ChevronRight, Copy, Package, Send, Server, Share2 } from "lucide-react";
import {
  BrandBar,
  Chip,
  GlassCard,
  PrimaryButton,
  QuickAction,
  SecondaryButton,
} from "../components/ui/primitives";
import { cn } from "@/lib/utils";
import { getShareUrl, getImportUrl } from "../lib/links";
import { copyText } from "../lib/clipboard";
import {
  openTelegramNativeLink,
  openTelegramSharePicker,
} from "../lib/telegram";
import { useLanguage } from "../i18n/language";

// ── Helpers (logic unchanged from MUI version) ────────────────────────────────



// ── Sub-components ─────────────────────────────────────────────────────────────

function AccessHero({ subscription, keyForActions, hasImportLink, onToast }) {
  const { t } = useLanguage();
  // All protocols (SS, VLESS, Hysteria2) use a Marzneshin subscription URL.
  // Copy to clipboard — user pastes into Hiddify or Xray.
  const handleCopySubscription = async () => {
    const subUrl = getImportUrl(keyForActions);
    if (!subUrl) {
      onToast?.(t("access.chooseServer"), "warning");
      return;
    }
    const ok = await copyText(subUrl);
    onToast?.(
      ok ? t("access.subscriptionCopied") : t("payment.copyFailed"),
      ok ? "success" : "warning",
    );
  };

  return (
    <GlassCard glow className="aurora-glow">
      <PackageSummary subscription={subscription} />

      <PrimaryButton onClick={handleCopySubscription} disabled={!hasImportLink}>
        <Copy size={18} />
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
  const vpnKey = data?.vpn_key || data?.outline_key || null;
  const protocol = vpnKey?.protocol || data?.protocol_preference;
  const isMultiNodeProtocol = protocol === "vless" || protocol === "hysteria2";
  const recentRejection = data?.recent_rejection || null;
  const brand = data?.config?.brand || null;

  const rawSupportHandle = brand?.support_username
    ? String(brand.support_username).replace(/^@/, "")
    : null;
  const handleSupportContact = rawSupportHandle
    ? () => openTelegramNativeLink(`https://t.me/${rawSupportHandle}`)
    : null;

  const keyForActions = vpnKey || currentServer;
  const hasImportLink = Boolean(getImportUrl(keyForActions));

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

    const ok = await copyText(shareUrl);
    onToast(
      ok ? t("access.shareKey") : t("payment.copyFailed"),
      ok ? "success" : "warning",
    );
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

      {!hasActivePackage && data?.last_subscription && <GlassCard className="p-3"><PackageSummary subscription={data.last_subscription} mode="last" /></GlassCard>}
      {data?.queued_subscription && <GlassCard className="p-3"><PackageSummary subscription={data.queued_subscription} mode="queued" /></GlassCard>}
      {hasActivePackage ? (
        <>
          <AccessHero
            subscription={subscription}
            keyForActions={keyForActions}
            hasImportLink={hasImportLink}
            onToast={onToast}
          />

          {!isMultiNodeProtocol && currentServer && (
            <CurrentServerCard
              server={currentServer}
              onChangeServer={() => onTabChange("servers")}
            />
          )}

          {hasLinkedKey ? (
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
