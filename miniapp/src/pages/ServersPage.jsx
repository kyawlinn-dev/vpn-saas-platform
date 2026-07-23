import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Crown, Timer, Zap } from "lucide-react";
import { Dialog } from "@base-ui/react/dialog";
import {
  BrandBar,
  Chip,
  GlassCard,
  LatencyBadge,
  PrimaryButton,
} from "../components/ui/primitives";
import { cn } from "@/lib/utils";
import { useLinkServer } from "../features/access/hooks";
import { getTelegramInitData } from "../lib/telegram";
import { attachKeyToServer } from "../hooks/useMiniAppAuth";
import { useLanguage } from "../i18n/language";

// ── Helpers (logic unchanged from MUI version) ────────────────────────────────

function groupServers(servers) {
  const groups = new Map();

  for (const server of servers || []) {
    const country = server?.country || server?.region || "Servers";
    const key = `${server?.flag_emoji ?? server?.flag ?? "🌐"} ${country}`;

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        country,
        flag: server?.flag_emoji ?? server?.flag ?? "🌐",
        servers: [],
      });
    }

    groups.get(key).servers.push(server);
  }

  return Array.from(groups.values());
}

function getLatencyMs(server) {
  const value = server?.latency_ms ?? server?.latency ?? server?.ping_ms ?? null;
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function getBestLatencyMs(servers) {
  const latencies = (servers || [])
    .map((s) => Number(s?.latency_ms ?? s?.latency ?? s?.ping_ms))
    .filter((v) => Number.isFinite(v));
  if (!latencies.length) return null;
  return Math.round(Math.min(...latencies));
}

function getServerTier(server) {
  return String(server?.server_tier || "").toLowerCase() === "trial" ? "trial" : "premium";
}

function getTierSections(servers) {
  return [
    {
      key: "premium",
      tier: "premium",
      Icon: Crown,
      tone: "violet",
      servers: (servers || []).filter((server) => getServerTier(server) === "premium"),
    },
    {
      key: "trial",
      tier: "trial",
      Icon: Timer,
      tone: "warning",
      servers: (servers || []).filter((server) => getServerTier(server) === "trial"),
    },
  ].filter((section) => section.servers.length > 0);
}

function getBlockedServerCopy(server, t) {
  switch (server?.access_reason) {
    case "TRIAL_CANNOT_USE_PREMIUM":
      return {
        title: t("servers.restrictedPremiumTitle"),
        description: t("servers.restrictedPremiumDescription"),
        primary: t("payment.buyPackage"),
        goPackages: true,
      };
    case "PREMIUM_CANNOT_USE_TRIAL":
      return {
        title: t("servers.restrictedTrialTitle"),
        description: t("servers.restrictedTrialDescription"),
        primary: t("common.cancel"),
        goPackages: false,
      };
    case "REGION_NOT_ALLOWED":
      return {
        title: t("servers.regionRestrictedTitle"),
        description: t("servers.regionRestrictedDescription"),
        primary: t("common.cancel"),
        goPackages: false,
      };
    default:
      return {
        title: t("servers.restrictedTitle"),
        description: t("servers.restrictedDescription"),
        primary: t("common.cancel"),
        goPackages: false,
      };
  }
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function CurrentServerSummary({ server }) {
  const { t } = useLanguage();
  if (!server) return null;

  const location = [server?.country, server?.city || server?.name]
    .filter(Boolean)
    .join(" / ");
  const ms = getLatencyMs(server);

  return (
    <GlassCard glow className="aurora-glow p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {t("common.current")}
        </span>
        {ms !== null && <LatencyBadge ms={ms} />}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-2xl" aria-hidden="true">
          {server?.flag_emoji ?? server?.flag ?? "🌐"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-foreground">
            {location || server?.region || t("servers.currentServer")}
          </p>
          <p className="text-[12px] text-muted-foreground">
            Server {server?.server_number ? `#${server.server_number}` : t("servers.linked")}
          </p>
        </div>
      </div>
    </GlassCard>
  );
}

function ServerRow({ server, linking, onSelect, locked = false }) {
  const { t } = useLanguage();
  const isCurrent = !locked && Boolean(server?.is_current);
  const canAccess = locked || Boolean(server?.can_access);
  const ms = getLatencyMs(server);
  const serverLabel = server?.city || server?.name || server?.region || t("nav.servers");

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border border-transparent px-2.5 py-2.5 transition-colors",
        isCurrent && "border-primary/35 bg-primary/10",
        !canAccess && "bg-secondary/20",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[14px] font-medium text-foreground">
            {serverLabel}
            {server?.server_number ? (
              <span className="ml-1 text-[12px] font-bold text-warning">
                #{server.server_number}
              </span>
            ) : null}
          </p>
          {ms !== null && <LatencyBadge ms={ms} />}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {ms !== null ? (
            <Chip tone="cyan" icon={<Zap size={10} />}>
              {ms} ms
            </Chip>
          ) : (
            <Chip tone="cyan">{t("common.highSpeed")}</Chip>
          )}
        </div>
      </div>

      {isCurrent ? (
        <span className="flex shrink-0 items-center gap-1 rounded-md bg-primary/20 px-2.5 py-1 text-[11px] font-semibold text-primary">
          <Check size={13} /> {t("servers.connected")}
        </span>
      ) : (
        <button
          type="button"
          onClick={() => !linking && onSelect(server)}
          disabled={linking}
          className={cn(
            "shrink-0 rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition-colors active:scale-95 disabled:cursor-wait disabled:opacity-60",
            canAccess
              ? "border-border bg-secondary/60 text-foreground hover:bg-secondary"
              : "border-warning/25 bg-warning/10 text-warning hover:bg-warning/15",
          )}
        >
          {t("servers.select")}
        </button>
      )}
    </div>
  );
}

function CountryGroup({ group, expanded, onToggle, linking, onSelect, locked = false }) {
  const { t } = useLanguage();
  const best = getBestLatencyMs(group.servers);
  // In locked mode there is no current server — suppress the green indicator.
  const hasCurrentServer = !locked && group.servers.some((s) => s?.is_current);

  return (
    <div className="glass overflow-hidden rounded-[20px]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
      >
        <span className="text-2xl" aria-hidden="true">
          {group.flag}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-foreground">{group.country}</p>
          <p className="text-[12px] text-muted-foreground">
            {t("servers.count", { count: group.servers.length })}
            {best !== null ? ` · ${t("servers.bestMs", { ms: best })}` : ""}
          </p>
        </div>
        {hasCurrentServer && (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success/20 text-success">
            <Check size={12} strokeWidth={2.5} />
          </span>
        )}
        {best !== null && <LatencyBadge ms={best} />}
        <ChevronDown
          size={18}
          className={cn(
            "shrink-0 text-muted-foreground transition-transform duration-200",
            expanded && "rotate-180",
          )}
        />
      </button>

      {expanded && (
        <div className="space-y-1 border-t border-border px-2 pb-2 pt-2">
          {group.servers.map((server) => (
            <ServerRow
              key={server.id || `${server.region}-${server.server_number}`}
              server={server}
              linking={linking}
              onSelect={onSelect}
              locked={locked}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

function ServerTierSection({ section, openGroupKey, onToggleGroup, linking, onSelect, locked }) {
  const { t } = useLanguage();
  const Icon = section.Icon;
  const groups = groupServers(section.servers);
  const count = section.servers.length;

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <span
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-2xl border",
            section.tone === "warning"
              ? "border-warning/30 bg-warning/15 text-warning"
              : "border-violet/30 bg-violet/15 text-violet",
          )}
        >
          <Icon size={16} strokeWidth={2.4} />
        </span>
        <div>
          <h3 className="text-[14px] font-semibold text-foreground">
            {section.tier === "trial" ? t("servers.trialServers") : t("servers.premiumServers")}
          </h3>
          <p className="text-[11px] text-muted-foreground">
            {t("servers.count", { count })}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {groups.map((group) => {
          const openKey = `${section.key}:${group.key}`;
          const isOpen = openGroupKey === openKey;
          return (
            <CountryGroup
              key={openKey}
              group={group}
              expanded={isOpen}
              onToggle={() => onToggleGroup(openKey)}
              linking={linking}
              onSelect={onSelect}
              locked={locked}
            />
          );
        })}
      </div>
    </section>
  );
}

export default function ServersPage({
  data,
  initData: initDataProp = "",
  onToast,
  onRefreshAuth,
  onTabChange,
  onOpenSettings,
}) {
  const { t } = useLanguage();
  const servers = useMemo(() => data?.servers || [], [data?.servers]);
  const telegramUserId = data?.user?.telegram_user_id;
  const initData = initDataProp || data?.init_data || "";
  const subscription = data?.subscription || null;
  const hasActivePackage =
    subscription?.status === "active" &&
    (
      subscription?.type === "trial" ||
      ["pending_review", "confirmed", "approved"].includes(subscription?.review_status)
    );
  const currentServer = data?.current_server || null;
  const brand = data?.config?.brand || null;

  const queryClient = useQueryClient();
  const [openGroupKey, setOpenGroupKey] = useState("");
  const [selectedServer, setSelectedServer] = useState(null);
  const [blockedServer, setBlockedServer] = useState(null);
  const [noPackageDialogOpen, setNoPackageDialogOpen] = useState(false);

  // When no active package: show the full server list but gate linking behind
  // the upgrade dialog instead of running the mutation.
  const lockedMode = !hasActivePackage;

  const filteredSections = useMemo(() => getTierSections(servers), [servers]);

  // ── Mutation ──────────────────────────────────────────────────────────────────
  const linkMutation = useLinkServer({
    onSuccess: (responseData) => {
      const newServer = responseData?.current_server;
      const newKey = responseData?.outline_key;

      setSelectedServer(null);

      if (newServer && newKey) {
        // Patch the cache directly from the link response — avoids 4 sequential
        // HTTP round trips on mobile (config + auth + plans + servers refetch).
        queryClient.setQueryData(["miniapp-dashboard"], (old) => {
          if (!old) return old;
          return {
            ...old,
            current_server: attachKeyToServer(newServer, newKey),
            outline_key: newKey,
            servers: (old.servers || []).map((s) => ({
              ...s,
              is_current: s.id === newServer.id,
            })),
          };
        });
      } else if (onRefreshAuth) {
        onRefreshAuth();
      }

      onToast(t("servers.linkSuccess"), "success");
      onTabChange?.("home");
    },
    onError: (error) => {
      onToast(error?.message || t("servers.failedLink"), "error");
    },
  });

  const toggleGroup = (key) => {
    setOpenGroupKey((current) => (current === key ? "" : key));
  };

  const handleSelectServer = (server) => {
    if (lockedMode) {
      setNoPackageDialogOpen(true);
      return;
    }

    if (!server?.can_access) {
      setBlockedServer(server);
      return;
    }

    setSelectedServer(server);
  };

  const handleConnectSelectedServer = () => {
    const authInitData = initData || getTelegramInitData();

    if (!authInitData) {
      onToast(t("servers.openTelegramAgain"), "error");
      return;
    }

    linkMutation.mutate({
      server_id: selectedServer.id,
      telegram_user_id: telegramUserId,
      init_data: authInitData,
    });
  };

  const blockedCopy = blockedServer ? getBlockedServerCopy(blockedServer, t) : null;

  return (
    <>
      <div className="flex flex-col gap-4 px-4 pb-6">
        <div className="sticky top-[var(--app-safe-top)] z-20 -mx-4 px-4 py-3 glass">
          <BrandBar brandName={brand?.name || "VPN"} subtitle={t("app.subtitle")} onOpenSettings={onOpenSettings} />
        </div>

        {/* Current server summary — only visible with an active package */}
        {!lockedMode && <CurrentServerSummary server={currentServer} />}

        {/* Server tier sections */}
        <div className="flex flex-col gap-5">
          {filteredSections.map((section) => (
            <ServerTierSection
              key={section.key}
              section={section}
              openGroupKey={openGroupKey}
              onToggleGroup={toggleGroup}
              linking={lockedMode ? false : linkMutation.isPending}
              onSelect={handleSelectServer}
              locked={lockedMode}
            />
          ))}
          {filteredSections.length === 0 && (
            <p className="py-8 text-center text-[13px] text-muted-foreground">
              {t("servers.noneFound")}
            </p>
          )}
        </div>
      </div>

      {/* ── Link confirmation dialog (active package only) ────────────────────── */}
      <Dialog.Root
        open={!lockedMode && Boolean(selectedServer)}
        onOpenChange={(open) => {
          if (!open && !linkMutation.isPending) setSelectedServer(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
          <Dialog.Popup className="glass fixed inset-x-4 bottom-8 z-50 rounded-3xl p-6 shadow-2xl outline-none">
            <Dialog.Title className="text-[18px] font-semibold text-foreground">
              {t("payment.linkTitle")}
            </Dialog.Title>
            <Dialog.Description className="mt-2 mb-6 text-[13px] text-muted-foreground">
              {t("payment.linkDescription", {
                server: selectedServer?.city || selectedServer?.name || t("servers.currentServer"),
              })}
            </Dialog.Description>

            <div className="flex flex-col gap-2">
              <PrimaryButton
                onClick={handleConnectSelectedServer}
                disabled={linkMutation.isPending}
              >
                {linkMutation.isPending ? t("payment.connecting") : t("payment.connect")}
              </PrimaryButton>
              <Dialog.Close
                className={cn(
                  "flex h-12 w-full items-center justify-center gap-2 rounded-2xl",
                  "border border-border bg-secondary/60 text-[15px] font-semibold text-foreground",
                  "transition-all hover:bg-secondary active:scale-[0.98]",
                  linkMutation.isPending && "pointer-events-none opacity-50",
                )}
                disabled={linkMutation.isPending}
              >
                {t("common.cancel")}
              </Dialog.Close>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ── No active package upgrade dialog ─────────────────────────────────── */}
      <Dialog.Root
        open={Boolean(blockedServer)}
        onOpenChange={(open) => {
          if (!open) setBlockedServer(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
          <Dialog.Popup className="glass fixed inset-x-4 bottom-8 z-50 rounded-3xl p-6 shadow-2xl outline-none">
            <Dialog.Title className="text-[18px] font-semibold text-foreground">
              {blockedCopy?.title}
            </Dialog.Title>
            <Dialog.Description className="mt-2 mb-6 text-[13px] text-muted-foreground">
              {blockedCopy?.description}
            </Dialog.Description>
            <div className="flex flex-col gap-2">
              <PrimaryButton
                onClick={() => {
                  const goPackages = blockedCopy?.goPackages;
                  setBlockedServer(null);
                  if (goPackages) onTabChange?.("packages");
                }}
              >
                {blockedCopy?.primary || t("common.cancel")}
              </PrimaryButton>
              {blockedCopy?.goPackages && (
                <Dialog.Close
                  className={cn(
                    "flex h-12 w-full items-center justify-center gap-2 rounded-2xl",
                    "border border-border bg-secondary/60 text-[15px] font-semibold text-foreground",
                    "transition-all hover:bg-secondary active:scale-[0.98]",
                  )}
                >
                  {t("common.cancel")}
                </Dialog.Close>
              )}
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={noPackageDialogOpen} onOpenChange={setNoPackageDialogOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
          <Dialog.Popup className="glass fixed inset-x-4 bottom-8 z-50 rounded-3xl p-6 shadow-2xl outline-none">
            <Dialog.Title className="text-[18px] font-semibold text-foreground">
              {t("payment.noPackage.title")}
            </Dialog.Title>
            <Dialog.Description className="mt-2 mb-6 text-[13px] text-muted-foreground">
              {t("payment.noPackage.description")}
            </Dialog.Description>
            <div className="flex flex-col gap-2">
              <PrimaryButton
                onClick={() => {
                  setNoPackageDialogOpen(false);
                  onTabChange?.("packages");
                }}
              >
                {t("payment.buyPackage")}
              </PrimaryButton>
              <Dialog.Close
                className={cn(
                  "flex h-12 w-full items-center justify-center gap-2 rounded-2xl",
                  "border border-border bg-secondary/60 text-[15px] font-semibold text-foreground",
                  "transition-all hover:bg-secondary active:scale-[0.98]",
                )}
              >
                {t("common.cancel")}
              </Dialog.Close>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
