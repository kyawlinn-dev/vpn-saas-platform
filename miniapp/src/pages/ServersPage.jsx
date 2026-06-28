import { useMemo, useState } from "react";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import KeyboardArrowRightRoundedIcon from "@mui/icons-material/KeyboardArrowRightRounded";
import SignalCellularAltRoundedIcon from "@mui/icons-material/SignalCellularAltRounded";
import CrownIcon from "@mui/icons-material/WorkspacePremiumRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import {
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Typography,
} from "@mui/material";
import PageContainer from "../components/layout/PageContainer";
import EmptyState from "../components/common/EmptyState";
import { useLinkServer } from "../features/access/hooks";

function pingFor(server) {
  const seed = String(server?.id || server?.server_number || server?.name || "").length;
  return 18 + ((seed * 7) % 42);
}

function groupServers(servers) {
  const groups = new Map();

  for (const server of servers || []) {
    const country = server?.country || server?.region || "Servers";
    const key = `${server?.flag || "🌐"} ${country}`;

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        country,
        flag: server?.flag || "🌐",
        servers: [],
      });
    }

    groups.get(key).servers.push(server);
  }

  return Array.from(groups.values());
}

function ServerRow({ server, linking, onSelect }) {
  const isCurrent = Boolean(server?.is_current);
  const canAccess = Boolean(server?.can_access);

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
        display: "flex",
        alignItems: "center",
        gap: 1.25,
        px: 1,
        py: 1.1,
        borderRadius: 3,
        opacity: canAccess ? 1 : 0.5,
        cursor: canAccess ? "pointer" : "not-allowed",
        bgcolor: isCurrent ? "rgba(59,130,246,0.12)" : "transparent",
      }}
    >
      <Typography sx={{ fontSize: 26 }}>{server?.flag || "🌐"}</Typography>

      <Box minWidth={0} flex={1}>
        <Typography fontWeight={850} noWrap>
          {server?.city || server?.name || server?.region}
          {server?.server_number ? (
            <Box component="span" sx={{ color: "#facc15", ml: 0.8 }}>
              #{server.server_number}
            </Box>
          ) : null}
        </Typography>
        <Stack direction="row" spacing={0.8} alignItems="center">
          <SignalCellularAltRoundedIcon sx={{ fontSize: 16, color: "#22c55e" }} />
          <Typography variant="caption" color="text.secondary">
            {pingFor(server)}ms
          </Typography>
          {isCurrent ? (
            <Typography variant="caption" sx={{ color: "#3b82f6", fontWeight: 900 }}>
              Current
            </Typography>
          ) : null}
        </Stack>
      </Box>

      <IconButton
        size="small"
        disabled={!canAccess || linking}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(server);
        }}
        sx={{
          width: 36,
          height: 36,
          bgcolor: canAccess ? "#1d4ed8" : "rgba(148,163,184,0.16)",
          color: "#fff",
          "&:hover": { bgcolor: "#2563eb" },
        }}
      >
        <ArrowForwardRoundedIcon fontSize="small" />
      </IconButton>
    </Box>
  );
}

export default function ServersPage({ data, onToast, onRefreshAuth, onTabChange }) {
  const servers = data?.servers || [];
  const telegramUserId = data?.user?.telegram_user_id;
  const hasActivePackage = Boolean(data?.subscription);
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
          action={<Button variant="contained" onClick={() => onTabChange?.("packages")}>View Packages</Button>}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <Typography variant="h4" fontWeight={950} sx={{ color: "#facc15", px: 0.4 }}>
        Premium
      </Typography>

      <Stack spacing={1.25}>
        {groups.map((group, index) => {
          const isOpen = openGroups[group.key] ?? index === 0;

          return (
            <Card key={group.key}>
              <CardContent sx={{ p: 1.35 }}>
                <Box
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleGroup(group.key)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") toggleGroup(group.key);
                  }}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.25,
                    px: 0.7,
                    py: 0.8,
                    cursor: "pointer",
                  }}
                >
                  <Typography sx={{ fontSize: 30 }}>{group.flag}</Typography>
                  <Box flex={1} minWidth={0}>
                    <Typography fontWeight={900} noWrap>
                      {group.country}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {group.servers.length} server{group.servers.length === 1 ? "" : "s"}
                    </Typography>
                  </Box>
                  <CrownIcon sx={{ color: "#facc15" }} />
                  {isOpen ? <KeyboardArrowDownRoundedIcon /> : <KeyboardArrowRightRoundedIcon />}
                </Box>

                {isOpen ? (
                  <Stack spacing={0.25} sx={{ mt: 0.5 }}>
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
            </Card>
          );
        })}
      </Stack>

      <Dialog
        open={Boolean(selectedServer)}
        onClose={linkMutation.isPending ? undefined : () => setSelectedServer(null)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle fontWeight={900}>Link Key?</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary">
            Do you want to link your key to this server?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button
            fullWidth
            variant="contained"
            color="error"
            onClick={() => setSelectedServer(null)}
            disabled={linkMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            fullWidth
            variant="contained"
            onClick={() => linkMutation.mutate({ server_id: selectedServer.id, telegram_user_id: telegramUserId })}
            disabled={linkMutation.isPending}
            sx={{ bgcolor: "#1d4ed8", "&:hover": { bgcolor: "#2563eb" } }}
          >
            {linkMutation.isPending ? "Connecting..." : "Connect"}
          </Button>
        </DialogActions>
      </Dialog>
    </PageContainer>
  );
}
