import { useMemo, useState } from "react";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import KeyboardArrowRightRoundedIcon from "@mui/icons-material/KeyboardArrowRightRounded";
import BoltRoundedIcon from "@mui/icons-material/BoltRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import WorkspacePremiumRoundedIcon from "@mui/icons-material/WorkspacePremiumRounded";
import {
  Box,
  Button,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  Typography,
} from "@mui/material";
import PageContainer from "../components/layout/PageContainer";
import EmptyState from "../components/common/EmptyState";
import { AuroraButton, GhostButton, GlassCard, SectionTitle } from "../components/ui/vpnPrimitives";
import { useLinkServer } from "../features/access/hooks";

function groupServers(servers) {
  const groups = new Map();

  for (const server of servers || []) {
    const country = server?.country || server?.region || "Servers";
    const key = `${server?.flag || "VPN"} ${country}`;

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        country,
        flag: server?.flag || "VPN",
        servers: [],
      });
    }

    groups.get(key).servers.push(server);
  }

  return Array.from(groups.values());
}

function getLatency(server) {
  const value = server?.latency_ms ?? server?.latency ?? server?.ping_ms ?? null;
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number)} ms` : String(value);
}

function getBestLatency(servers) {
  const latencies = (servers || [])
    .map((server) => Number(server?.latency_ms ?? server?.latency ?? server?.ping_ms))
    .filter((value) => Number.isFinite(value));
  if (!latencies.length) return "Ready";
  return `${Math.min(...latencies)} ms best`;
}

function CurrentServerSummary({ server }) {
  if (!server) return null;

  const location = [server?.country, server?.city || server?.name].filter(Boolean).join(" / ");

  return (
    <GlassCard
      glow
      sx={{
        background:
          "radial-gradient(circle at 100% 0%, rgba(34,211,238,0.14), transparent 34%), linear-gradient(180deg, rgba(15,23,42,0.86), rgba(8,13,28,0.92))",
      }}
    >
      <CardContent sx={{ p: 1.45 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1.2}>
          <Stack direction="row" spacing={1} alignItems="center" minWidth={0}>
            <Stack
              alignItems="center"
              justifyContent="center"
              sx={{
                width: 42,
                height: 42,
                borderRadius: 3,
                bgcolor: "rgba(148,163,184,0.1)",
                border: "1px solid rgba(148,163,184,0.14)",
                fontSize: 23,
              }}
            >
              {server?.flag || "VPN"}
            </Stack>
            <Box minWidth={0}>
              <Typography fontWeight={950} noWrap sx={{ fontSize: 14.5 }}>
                {location || server?.region || "Current server"}
              </Typography>
              <Typography color="text.secondary" sx={{ fontSize: 11.5 }}>
                Server {server?.server_number ? `#${server.server_number}` : "linked"}
              </Typography>
            </Box>
          </Stack>

          <Chip
            label="Current"
            size="small"
            sx={{
              height: 25,
              color: "#86efac",
              bgcolor: "rgba(34,197,94,0.12)",
              border: "1px solid rgba(34,197,94,0.2)",
              "& .MuiChip-label": { fontSize: 11, fontWeight: 900 },
            }}
          />
        </Stack>
      </CardContent>
    </GlassCard>
  );
}

function ServerRow({ server, linking, onSelect }) {
  const isCurrent = Boolean(server?.is_current);
  const canAccess = Boolean(server?.can_access);
  const latency = getLatency(server);
  const serverLabel = server?.city || server?.name || server?.region || "Server";

  return (
    <Box
      role="button"
      tabIndex={0}
      onClick={() => canAccess && onSelect(server)}
      onKeyDown={(event) => {
        if ((event.key === "Enter" || event.key === " ") && canAccess) {
          onSelect(server);
        }
      }}
      sx={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        alignItems: "center",
        gap: 1,
        px: 1,
        py: 1,
        borderRadius: 3,
        opacity: canAccess ? 1 : 0.48,
        cursor: canAccess ? "pointer" : "not-allowed",
        bgcolor: isCurrent ? "rgba(37,99,235,0.16)" : "rgba(148,163,184,0.06)",
        border: isCurrent ? "1px solid rgba(96,165,250,0.24)" : "1px solid transparent",
      }}
    >
      <Box minWidth={0}>
        <Stack direction="row" spacing={0.7} alignItems="center" minWidth={0}>
          <Typography fontWeight={900} noWrap sx={{ fontSize: 14.5 }}>
            {serverLabel}
          </Typography>
          {server?.server_number ? (
            <Typography sx={{ color: "#facc15", fontSize: 12, fontWeight: 900 }}>
              #{server.server_number}
            </Typography>
          ) : null}
        </Stack>

        <Stack direction="row" spacing={0.6} alignItems="center" sx={{ mt: 0.7, flexWrap: "wrap" }}>
          <Chip
            icon={<WorkspacePremiumRoundedIcon sx={{ color: "inherit !important" }} />}
            label="Premium"
            size="small"
            sx={{
              height: 23,
              color: "#ddd6fe",
              bgcolor: "rgba(124,58,237,0.14)",
              "& .MuiChip-label": { fontSize: 10.5, px: 0.75 },
            }}
          />
          <Chip
            icon={<BoltRoundedIcon sx={{ color: "inherit !important" }} />}
            label={latency || "High-speed"}
            size="small"
            sx={{
              height: 23,
              color: "#a5f3fc",
              bgcolor: "rgba(6,182,212,0.12)",
              "& .MuiChip-label": { fontSize: 10.5, px: 0.75 },
            }}
          />
        </Stack>
      </Box>

      <Button
        size="small"
        disabled={!canAccess || linking || isCurrent}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(server);
        }}
        sx={{
          minHeight: 34,
          px: 1.1,
          borderRadius: 999,
          color: isCurrent ? "#86efac" : "#fff",
          bgcolor: isCurrent ? "rgba(34,197,94,0.12)" : "var(--brand-primary, #2563eb)",
          "&:hover": { bgcolor: isCurrent ? "rgba(34,197,94,0.16)" : "#2563eb" },
          "&.Mui-disabled": {
            color: isCurrent ? "#86efac" : "rgba(255,255,255,0.46)",
            bgcolor: isCurrent ? "rgba(34,197,94,0.12)" : "rgba(148,163,184,0.12)",
          },
        }}
      >
        {isCurrent ? "Current" : "Select"}
      </Button>
    </Box>
  );
}

export default function ServersPage({ data, onToast, onRefreshAuth, onTabChange }) {
  const servers = useMemo(() => data?.servers || [], [data?.servers]);
  const telegramUserId = data?.user?.telegram_user_id;
  const hasActivePackage = Boolean(data?.subscription);
  const currentServer = data?.current_server || null;
  const groups = useMemo(() => groupServers(servers), [servers]);
  const [openGroups, setOpenGroups] = useState({});
  const [selectedServer, setSelectedServer] = useState(null);

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
    setOpenGroups((prev) => {
      const current = prev[key] ?? false;
      return {
        ...prev,
        [key]: !current,
      };
    });
  };

  if (!hasActivePackage) {
    return (
      <PageContainer>
        <EmptyState
          title="No active package"
          description="Buy a package or use your trial before connecting a server."
          action={<AuroraButton onClick={() => onTabChange?.("packages")}>View Packages</AuroraButton>}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <SectionTitle title="Choose Server" subtitle="Select the best server for you" />

      <CurrentServerSummary server={currentServer} />

      <Stack spacing={1.1}>
        {groups.map((group, index) => {
          const isOpen = openGroups[group.key] ?? index === 0;
          const currentCount = group.servers.filter((server) => server?.is_current).length;

          return (
            <GlassCard key={group.key}>
              <CardContent sx={{ p: 1.15 }}>
                <Box
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleGroup(group.key)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") toggleGroup(group.key);
                  }}
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr auto",
                    alignItems: "center",
                    gap: 1,
                    px: 0.7,
                    py: 0.65,
                    cursor: "pointer",
                  }}
                >
                  <Stack
                    alignItems="center"
                    justifyContent="center"
                    sx={{
                      width: 42,
                      height: 42,
                      borderRadius: 3,
                      bgcolor: "rgba(148,163,184,0.1)",
                      border: "1px solid rgba(148,163,184,0.14)",
                      fontSize: 24,
                    }}
                  >
                    {group.flag}
                  </Stack>

                  <Box minWidth={0}>
                    <Typography fontWeight={950} noWrap sx={{ fontSize: 15 }}>
                      {group.country}
                    </Typography>
                    <Typography color="text.secondary" sx={{ fontSize: 12 }}>
                      {group.servers.length} server{group.servers.length === 1 ? "" : "s"} · {getBestLatency(group.servers)}
                    </Typography>
                  </Box>

                  <Stack direction="row" spacing={0.4} alignItems="center">
                    {currentCount ? (
                      <CheckCircleRoundedIcon sx={{ color: "#22c55e", fontSize: 18 }} />
                    ) : null}
                    {isOpen ? <KeyboardArrowDownRoundedIcon /> : <KeyboardArrowRightRoundedIcon />}
                  </Stack>
                </Box>

                {isOpen ? (
                  <Stack spacing={0.75} sx={{ mt: 0.85 }}>
                    <Divider />
                    {group.servers.map((server) => (
                      <ServerRow
                        key={server.id || `${server.region}-${server.server_number}`}
                        server={server}
                        linking={linkMutation.isPending}
                        onSelect={setSelectedServer}
                      />
                    ))}
                  </Stack>
                ) : null}
              </CardContent>
            </GlassCard>
          );
        })}
      </Stack>

      <Dialog
        open={Boolean(selectedServer)}
        onClose={linkMutation.isPending ? undefined : () => setSelectedServer(null)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle fontWeight={950} sx={{ fontSize: 18, pb: 0.5 }}>
          Link this server?
        </DialogTitle>
        <DialogContent>
          <Typography color="text.secondary" sx={{ fontSize: 13.5 }}>
            Your Outline key will be connected to {selectedServer?.city || selectedServer?.name || "this server"}.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <GhostButton
            onClick={() => setSelectedServer(null)}
            disabled={linkMutation.isPending}
          >
            Cancel
          </GhostButton>
          <AuroraButton
            onClick={() => linkMutation.mutate({ server_id: selectedServer.id, telegram_user_id: telegramUserId })}
            disabled={linkMutation.isPending}
          >
            {linkMutation.isPending ? "Connecting..." : "Connect"}
          </AuroraButton>
        </DialogActions>
      </Dialog>
    </PageContainer>
  );
}
