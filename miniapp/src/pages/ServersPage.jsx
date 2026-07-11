import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Search, Zap } from "lucide-react";
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

// ── Sub-components ─────────────────────────────────────────────────────────────

function CurrentServerSummary({ server }) {
  if (!server) return null;

  const location = [server?.country, server?.city || server?.name]
    .filter(Boolean)
    .join(" / ");
  const ms = getLatencyMs(server);

  return (
    <GlassCard glow className="aurora-glow p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Current
        </span>
        {ms !== null && <LatencyBadge ms={ms} />}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-2xl" aria-hidden="true">
          {server?.flag_emoji ?? server?.flag ?? "🌐"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-foreground">
            {location || server?.region || "Current server"}
          </p>
          <p className="text-[12px] text-muted-foreground">
            Server {server?.server_number ? `#${server.server_number}` : "linked"}
          </p>
        </div>
      </div>
    </GlassCard>
  );
}

// locked=true: bypass can_access gating and hide the "Current" chip so every
// row shows an enabled Select button that opens the upgrade dialog instead of
// triggering the link mutation.
function ServerRow({ server, linking, onSelect, locked = false }) {
  const isCurrent = !locked && Boolean(server?.is_current);
  const canAccess = locked || Boolean(server?.can_access);
  const ms = getLatencyMs(server);
  const serverLabel = server?.city || server?.name || server?.region || "Server";

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl px-2.5 py-2.5 transition-colors",
        isCurrent && "bg-primary/10",
        !canAccess && "opacity-50",
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
          <Chip tone="violet">Premium</Chip>
          {ms !== null ? (
            <Chip tone="cyan" icon={<Zap size={10} />}>
              {ms} ms
            </Chip>
          ) : (
            <Chip tone="cyan">High-speed</Chip>
          )}
        </div>
      </div>

      {isCurrent ? (
        <span className="flex shrink-0 items-center gap-1 rounded-xl bg-primary/20 px-2.5 py-1 text-[11px] font-semibold text-primary">
          <Check size={13} /> Current
        </span>
      ) : (
        <button
          type="button"
          onClick={() => canAccess && !linking && onSelect(server)}
          disabled={!canAccess || linking}
          className="shrink-0 rounded-full border border-border bg-secondary/60 px-3.5 py-1.5 text-[12px] font-semibold text-foreground transition-colors hover:bg-secondary active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Select
        </button>
      )}
    </div>
  );
}

function CountryGroup({ group, expanded, onToggle, linking, onSelect, locked = false }) {
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
            {group.servers.length} server{group.servers.length === 1 ? "" : "s"}
            {best !== null ? ` · ${best} ms best` : ""}
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

export default function ServersPage({
  data,
  initData: initDataProp = "",
  onToast,
  onRefreshAuth,
  onTabChange,
  onOpenSettings,
}) {
  const servers = useMemo(() => data?.servers || [], [data?.servers]);
  const telegramUserId = data?.user?.telegram_user_id;
  const initData = initDataProp || data?.init_data || "";
  const hasActivePackage = Boolean(data?.subscription);
  const currentServer = data?.current_server || null;
  const brand = data?.config?.brand || null;

  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [openGroups, setOpenGroups] = useState({});
  const [selectedServer, setSelectedServer] = useState(null);
  const [noPackageDialogOpen, setNoPackageDialogOpen] = useState(false);

  // When no active package: show the full server list but gate linking behind
  // the upgrade dialog instead of running the mutation.
  const lockedMode = !hasActivePackage;

  const groups = useMemo(() => groupServers(servers), [servers]);

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups
      .map((group) => ({
        ...group,
        servers: group.servers.filter((s) => {
          if (q) {
            const label = (s.city || s.name || s.region || "").toLowerCase();
            const country = group.country.toLowerCase();
            const num = String(s.server_number || "");
            if (!country.includes(q) && !label.includes(q) && !num.includes(q)) {
              return false;
            }
          }
          return true;
        }),
      }))
      .filter((g) => g.servers.length > 0);
  }, [groups, query]);

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

      onToast("Server linked successfully", "success");
      onTabChange?.("home");
    },
    onError: (error) => {
      onToast(error?.message || "Failed to link server", "error");
    },
  });

  const toggleGroup = (key) => {
    setOpenGroups((prev) => ({ ...prev, [key]: !(prev[key] ?? false) }));
  };

  const handleConnectSelectedServer = () => {
    const authInitData = initData || getTelegramInitData();

    if (!authInitData) {
      onToast("Open from Telegram bot again.", "error");
      return;
    }

    linkMutation.mutate({
      server_id: selectedServer.id,
      telegram_user_id: telegramUserId,
      init_data: authInitData,
    });
  };

  return (
    <>
      <div className="flex flex-col gap-4 px-4 pb-6">
        <div className="sticky top-[var(--app-safe-top)] z-20 -mx-4 px-4 py-3 glass">
          <BrandBar brandName={brand?.name || "VPN"} subtitle="Secure private access" onOpenSettings={onOpenSettings} />
        </div>

        <div>
          <h2 className="text-[18px] font-semibold text-foreground">Choose Server</h2>
          <p className="text-[13px] text-muted-foreground">Select the best server for you</p>
        </div>

        {/* Current server summary — only visible with an active package */}
        {!lockedMode && <CurrentServerSummary server={currentServer} />}

        {/* Search */}
        <div className="relative">
          <Search
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search country or server"
            className="h-11 w-full rounded-2xl border border-border bg-secondary/50 pl-10 pr-4 text-[14px] text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
          />
        </div>

        {/* Country groups */}
        <div className="flex flex-col gap-3">
          {filteredGroups.map((group) => {
            const isOpen = openGroups[group.key] ?? false;
            return (
              <CountryGroup
                key={group.key}
                group={group}
                expanded={isOpen}
                onToggle={() => toggleGroup(group.key)}
                linking={lockedMode ? false : linkMutation.isPending}
                onSelect={lockedMode ? () => setNoPackageDialogOpen(true) : setSelectedServer}
                locked={lockedMode}
              />
            );
          })}
          {filteredGroups.length === 0 && (
            <p className="py-8 text-center text-[13px] text-muted-foreground">
              No servers found
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
              Link this server?
            </Dialog.Title>
            <Dialog.Description className="mt-2 mb-6 text-[13px] text-muted-foreground">
              Your Outline key will be connected to{" "}
              <strong className="font-semibold text-foreground">
                {selectedServer?.city || selectedServer?.name || "this server"}
              </strong>
              . Your existing key usage is preserved.
            </Dialog.Description>

            <div className="flex flex-col gap-2">
              <PrimaryButton
                onClick={handleConnectSelectedServer}
                disabled={linkMutation.isPending}
              >
                {linkMutation.isPending ? "Connecting…" : "Connect"}
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
                Cancel
              </Dialog.Close>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ── No active package upgrade dialog ─────────────────────────────────── */}
      <Dialog.Root open={noPackageDialogOpen} onOpenChange={setNoPackageDialogOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
          <Dialog.Popup className="glass fixed inset-x-4 bottom-8 z-50 rounded-3xl p-6 shadow-2xl outline-none">
            <Dialog.Title className="text-[18px] font-semibold text-foreground">
              No active package
            </Dialog.Title>
            <Dialog.Description className="mt-2 mb-6 text-[13px] text-muted-foreground">
              You need an active package to connect to a server. Choose a package to get started.
            </Dialog.Description>
            <div className="flex flex-col gap-2">
              <PrimaryButton
                onClick={() => {
                  setNoPackageDialogOpen(false);
                  onTabChange?.("packages");
                }}
              >
                Buy Package
              </PrimaryButton>
              <Dialog.Close
                className={cn(
                  "flex h-12 w-full items-center justify-center gap-2 rounded-2xl",
                  "border border-border bg-secondary/60 text-[15px] font-semibold text-foreground",
                  "transition-all hover:bg-secondary active:scale-[0.98]",
                )}
              >
                Cancel
              </Dialog.Close>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
