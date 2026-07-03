import { useMemo, useState } from "react";
import { Check, ChevronDown, Search, Zap } from "lucide-react";
import { Dialog } from "@base-ui/react/dialog";
import {
  BrandBar,
  Chip,
  GlassCard,
  LatencyBadge,
  PrimaryButton,
  SecondaryButton,
} from "../components/ui/primitives";
import { cn } from "@/lib/utils";
import { useLinkServer } from "../features/access/hooks";

// ── Helpers (logic unchanged from MUI version) ────────────────────────────────

function groupServers(servers) {
  const groups = new Map();

  for (const server of servers || []) {
    const country = server?.country || server?.region || "Servers";
    // flag_emoji is the real column name; flag is a fallback alias some API shapes use
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

// Returns raw ms number (or null if not available) — used for LatencyBadge.
function getLatencyMs(server) {
  const value = server?.latency_ms ?? server?.latency ?? server?.ping_ms ?? null;
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

// Returns the lowest latency across a group's servers, or null if none have data.
function getBestLatencyMs(servers) {
  const latencies = (servers || [])
    .map((s) => Number(s?.latency_ms ?? s?.latency ?? s?.ping_ms))
    .filter((v) => Number.isFinite(v));
  if (!latencies.length) return null;
  return Math.round(Math.min(...latencies));
}

// ── Filter constants ───────────────────────────────────────────────────────────

const FILTERS = ["All", "Premium", "Low Latency"];

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
        <Chip tone="success">Current</Chip>
      </div>
    </GlassCard>
  );
}

function ServerRow({ server, linking, onSelect }) {
  const isCurrent = Boolean(server?.is_current);
  const canAccess = Boolean(server?.can_access);
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
        <div className="flex items-center gap-2 flex-wrap">
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
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary/20 px-2.5 py-1 text-[11px] font-semibold text-primary">
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

function CountryGroup({ group, expanded, onToggle, linking, onSelect }) {
  const best = getBestLatencyMs(group.servers);
  const hasCurrentServer = group.servers.some((s) => s?.is_current);

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
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Inline empty-state — doesn't touch the shared MUI EmptyState.jsx
function EmptyStateCard({ icon, title, description, children }) {
  return (
    <GlassCard className="p-5">
      <div className="flex flex-col gap-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/20 to-violet/15 text-primary">
          {icon}
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="text-[18px] font-semibold leading-tight text-foreground">{title}</p>
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

export default function ServersPage({ data, onToast, onRefreshAuth, onTabChange }) {
  // ── Data (unchanged from MUI version) ──────────────────────────────────────
  const servers = useMemo(() => data?.servers || [], [data?.servers]);
  const telegramUserId = data?.user?.telegram_user_id;
  const hasActivePackage = Boolean(data?.subscription);
  const currentServer = data?.current_server || null;
  const brand = data?.config?.brand || null;

  // ── UI state ───────────────────────────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [openGroups, setOpenGroups] = useState({});
  const [selectedServer, setSelectedServer] = useState(null);

  // ── Derived data (unchanged grouping logic + new filter layer) ─────────────
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
          if (filter === "Premium") return Boolean(s.can_access);
          if (filter === "Low Latency") {
            const ms = Number(s?.latency_ms ?? s?.latency ?? s?.ping_ms ?? Infinity);
            return Number.isFinite(ms) && ms <= 30;
          }
          return true;
        }),
      }))
      .filter((g) => g.servers.length > 0);
  }, [groups, query, filter]);

  // ── Mutation (payload and callbacks UNCHANGED — these touch key provisioning)
  const linkMutation = useLinkServer({
    onSuccess: async () => {
      onToast("Server linked successfully", "success");
      setSelectedServer(null);
      if (onRefreshAuth) {
        await onRefreshAuth();
      }
      onTabChange?.("home");
    },
    onError: (error) => {
      onToast(error?.message || "Failed to link server", "error");
    },
  });

  const toggleGroup = (key) => {
    setOpenGroups((prev) => ({ ...prev, [key]: !(prev[key] ?? false) }));
  };

  // ── Empty state (no active package) ───────────────────────────────────────
  if (!hasActivePackage) {
    return (
      <div className="flex flex-col gap-4 px-4 pt-2 pb-6">
        <BrandBar brandName={brand?.name || "VPN"} subtitle="Secure private access" />
        <EmptyStateCard
          icon={<Search size={20} />}
          title="No active package"
          description="Buy a package or use your trial before connecting a server."
        >
          <PrimaryButton onClick={() => onTabChange?.("packages")}>
            View Packages
          </PrimaryButton>
        </EmptyStateCard>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4 px-4 pt-2 pb-6">
        <BrandBar brandName={brand?.name || "VPN"} subtitle="Secure private access" />

        <div>
          <h2 className="text-[18px] font-semibold text-foreground">Choose Server</h2>
          <p className="text-[13px] text-muted-foreground">Select the best server for you</p>
        </div>

        <CurrentServerSummary server={currentServer} />

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

        {/* Filter chips */}
        <div className="flex gap-2">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-[12px] font-medium transition-colors",
                filter === f
                  ? "border-primary/40 bg-primary/15 text-primary"
                  : "border-border bg-secondary/50 text-muted-foreground",
              )}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Country groups */}
        <div className="flex flex-col gap-3">
          {filteredGroups.map((group, index) => {
            const isOpen = openGroups[group.key] ?? index === 0;
            return (
              <CountryGroup
                key={group.key}
                group={group}
                expanded={isOpen}
                onToggle={() => toggleGroup(group.key)}
                linking={linkMutation.isPending}
                onSelect={setSelectedServer}
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

      {/* Confirmation dialog — @base-ui/react Dialog for correct focus trapping */}
      <Dialog.Root
        open={Boolean(selectedServer)}
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
                onClick={() =>
                  linkMutation.mutate({
                    server_id: selectedServer.id,
                    telegram_user_id: telegramUserId,
                  })
                }
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
    </>
  );
}
