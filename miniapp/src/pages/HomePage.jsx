import { ArrowUp, ChevronRight, Download, Package, RefreshCw, Send, Server, Share2, Wifi, X } from "lucide-react";
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

// ── Helpers (logic unchanged from MUI version) ────────────────────────────────

function formatGb(value) {
  const number = Number(value || 0);
  if (!number) return "0";
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

function getPlanTitle(subscription) {
  const type = String(subscription?.type || "");
  if (
    type === "trial" ||
    String(subscription?.plan_name || "").toLowerCase().includes("trial")
  ) {
    return "Trial Access";
  }
  return subscription?.plan_name || "Premium Access";
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function AccessHero({ subscription, outlineKey, keyForActions, hasImportLink, onToast }) {
  const usedGb = Number(outlineKey?.used_bytes || 0) / 1024 / 1024 / 1024;
  const limitGb = Number(subscription?.data_limit_gb || 0);
  const percent = limitGb > 0 ? Math.min(100, (usedGb / limitGb) * 100) : 0;
  const validUntil = subscription?.expiry_date
    ? formatDate(subscription.expiry_date)
    : "No expiry shown";
  const secondary = limitGb
    ? `${formatGb(usedGb)} / ${formatGb(limitGb)} GB`
    : `${formatGb(usedGb)} GB`;

  const handleAddKey = () => {
    try {
      openOutlineKey(keyForActions);
    } catch (error) {
      onToast?.(error?.message || "Failed to open Outline key", "warning");
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
            <p className="text-[15px] font-semibold text-foreground">VPN Access Active</p>
            <p className="text-[12px] text-muted-foreground">{getPlanTitle(subscription)}</p>
          </div>
        </div>
        <Chip tone="success" icon={<span className="h-1.5 w-1.5 rounded-full bg-success" />}>
          Active
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
        <p className="mt-3 text-[12px] text-muted-foreground">Data used this month</p>
      </div>

      {/* Expiry */}
      <div className="mb-4 flex items-center justify-center gap-1.5 text-[12px] text-muted-foreground">
        <span className="h-1 w-1 rounded-full bg-muted-foreground" />
        Valid until {validUntil}
      </div>

      <PrimaryButton onClick={handleAddKey} disabled={!hasImportLink}>
        <Download size={18} />
        Add Key to Outline
      </PrimaryButton>
    </GlassCard>
  );
}

function CurrentServerCard({ server, onChangeServer }) {
  const location = [server?.country, server?.city || server?.name]
    .filter(Boolean)
    .join(" / ");

  return (
    <GlassCard>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
          Current Server
        </span>
        <button
          type="button"
          onClick={onChangeServer}
          className="flex items-center gap-0.5 text-[12px] font-semibold text-primary"
        >
          Change <ChevronRight size={14} />
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
            {server?.server_number ? `Server #${server.server_number}` : "Server linked"}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Chip tone="violet">Premium</Chip>
        <Chip tone="cyan">High Speed</Chip>
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

function ReconnectBanner({ server, onDismiss }) {
  const label = server?.city || server?.country || "new server";
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/8 p-4">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-400/15 text-amber-400">
        <RefreshCw size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-amber-400">Reconnect your VPN</p>
        <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
          Server switched to <strong className="font-semibold text-foreground">{label}</strong>.
          Disconnect and reconnect in the Outline app to use the new server.
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
      >
        <X size={16} />
      </button>
    </div>
  );
}

export default function HomePage({ data, hasActivePackage, hasLinkedKey, onToast, onTabChange, onOpenSettings, switchedServer, onClearSwitchedServer }) {
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
      onToast("Please choose server first.", "warning");
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
      onToast("Key copied", "success");
      return;
    } catch {
      if (!isTelegramWebBrowser()) {
        onToast("Unable to open Telegram share. Key copy failed too.", "error");
      } else {
        onToast("Unable to share key", "error");
      }
    }
  };

  return (
    <div className="flex flex-col gap-4 px-4 pb-6">
      <div className="sticky top-[var(--app-safe-top)] z-20 -mx-4 px-4 py-3 glass">
        <BrandBar
          brandName={brand?.name || "VPN"}
          subtitle="Secure private access"
          onOpenSettings={onOpenSettings}
        />
      </div>

      {switchedServer && (
        <ReconnectBanner server={switchedServer} onDismiss={onClearSwitchedServer} />
      )}

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
              <p className="mb-3 text-[13px] font-bold text-foreground">Quick Actions</p>
              <div className="grid grid-cols-2 gap-3">
                <QuickAction
                  icon={<Share2 size={18} />}
                  label="Share Key"
                  onClick={handleShare}
                  disabled={!hasImportLink}
                  trailingIcon={<ArrowUp size={16} className="text-muted-foreground" />}
                />
                {handleSupportContact && (
                  <QuickAction
                    icon={<Send size={18} />}
                    label="Support"
                    onClick={handleSupportContact}
                  />
                )}
              </div>
            </div>
          ) : (
            <EmptyStateCard
              icon={<Server size={20} />}
              title="Choose server"
              description="Your package is active. Select one premium server to create your Outline key."
            >
              <SecondaryButton onClick={() => onTabChange("servers")}>
                Choose Server
              </SecondaryButton>
              {handleSupportContact && (
                <SecondaryButton onClick={handleSupportContact}>
                  Contact Support
                </SecondaryButton>
              )}
            </EmptyStateCard>
          )}
        </>
      ) : (
        <EmptyStateCard
          icon={<Package size={20} />}
          title={recentRejection ? "Payment not confirmed" : "No active package"}
          description={
            recentRejection
              ? `Your${recentRejection.plan_name ? ` ${recentRejection.plan_name}` : ""} payment was rejected. Please contact support or submit a new payment.`
              : "Your account is linked. Choose a package to start secure VPN access."
          }
          danger={Boolean(recentRejection)}
        >
          <SecondaryButton onClick={() => onTabChange("packages")}>
            View Packages
          </SecondaryButton>
          {handleSupportContact && (
            <SecondaryButton onClick={handleSupportContact}>
              Contact Support
            </SecondaryButton>
          )}
        </EmptyStateCard>
      )}
    </div>
  );
}
