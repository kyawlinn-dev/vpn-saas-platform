import { useMemo, useState } from "react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import BoltRoundedIcon from "@mui/icons-material/BoltRounded";
import AttachMoneyRoundedIcon from "@mui/icons-material/AttachMoneyRounded";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Grid,
  Skeleton,
  Stack,
  Typography,
  alpha,
  useTheme,
} from "@mui/material";
import { useScopedDashboard } from "../hooks/useScopedDashboard";
import { formatMMK, isExpiringSoon } from "../lib/format";
import { CreateOrderDialog } from "../components/CreateOrderDialog";
import { OrdersTable } from "../components/OrdersTable";

const VIOLET = "#7c3aed";
const CYAN = "#06b6d4";
const EMERALD = "#10b981";
const AMBER = "#f59e0b";

function OverviewLoading() {
  return (
    <Stack spacing={2.5}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Skeleton variant="text" width={140} height={44} />
        <Skeleton variant="rounded" width={140} height={40} sx={{ borderRadius: 2 }} />
      </Stack>
      <Grid container spacing={2}>
        {Array.from({ length: 4 }).map((_, idx) => (
          <Grid key={idx} size={{ xs: 6, md: 3 }}>
            <Skeleton variant="rounded" height={130} sx={{ borderRadius: 2 }} />
          </Grid>
        ))}
      </Grid>
      <Skeleton variant="rounded" height={380} sx={{ borderRadius: 2 }} />
    </Stack>
  );
}

const CARD_CONFIGS = [
  {
    key: "active",
    gradient: `linear-gradient(135deg, ${alpha(VIOLET, 0.15)}, ${alpha(VIOLET, 0.05)})`,
    iconBg: alpha(VIOLET, 0.2),
    iconColor: VIOLET,
    icon: <TrendingUpRoundedIcon />,
  },
  {
    key: "pending",
    gradient: `linear-gradient(135deg, ${alpha(AMBER, 0.15)}, ${alpha(AMBER, 0.05)})`,
    iconBg: alpha(AMBER, 0.2),
    iconColor: AMBER,
    icon: <BoltRoundedIcon />,
  },
  {
    key: "expiring",
    gradient: `linear-gradient(135deg, ${alpha(CYAN, 0.15)}, ${alpha(CYAN, 0.05)})`,
    iconBg: alpha(CYAN, 0.2),
    iconColor: CYAN,
    icon: <WarningAmberRoundedIcon />,
  },
  {
    key: "revenue",
    gradient: `linear-gradient(135deg, ${alpha(EMERALD, 0.15)}, ${alpha(EMERALD, 0.05)})`,
    iconBg: alpha(EMERALD, 0.2),
    iconColor: EMERALD,
    icon: <AttachMoneyRoundedIcon />,
  },
];

function StatCard({
  label,
  value,
  caption,
  icon,
  gradient,
  iconBg,
  iconColor,
}: {
  label: string;
  value: string | number;
  caption: string;
  icon: React.ReactNode;
  gradient: string;
  iconBg: string;
  iconColor: string;
}) {
  return (
    <Card
      sx={{
        height: "100%",
        background: gradient,
        border: `1px solid ${alpha(iconColor, 0.15)}`,
        "&:hover": {
          border: `1px solid ${alpha(iconColor, 0.35)}`,
          transform: "translateY(-1px)",
          boxShadow: `0 8px 32px ${alpha(iconColor, 0.15)}`,
        },
        transition: "all 0.2s ease",
        cursor: "default",
      }}
    >
      <CardContent
        sx={{
          p: { xs: 2, md: 2.5 },
          "&:last-child": { pb: { xs: 2, md: 2.5 } },
        }}
      >
        <Stack spacing={1.5}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ fontSize: { xs: "0.78rem", md: "0.82rem" }, fontWeight: 600 }}
            >
              {label}
            </Typography>
            <Box
              sx={{
                width: { xs: 30, md: 34 },
                height: { xs: 30, md: 34 },
                borderRadius: 1.5,
                display: "grid",
                placeItems: "center",
                bgcolor: iconBg,
                "& svg": {
                  fontSize: { xs: "1rem", md: "1.15rem" },
                  color: iconColor,
                },
              }}
            >
              {icon}
            </Box>
          </Stack>

          <Typography
            sx={{
              fontSize: { xs: "1.9rem", md: "2.15rem" },
              fontWeight: 900,
              lineHeight: 1,
              letterSpacing: "-0.03em",
              fontFamily: "'Outfit', sans-serif",
              color: iconColor,
            }}
          >
            {value}
          </Typography>

          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontSize: { xs: "0.75rem", md: "0.8rem" }, fontWeight: 500 }}
          >
            {caption}
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}

export function OverviewPage() {
  const { orders, keys, plans, loading, error, refresh } = useScopedDashboard();
  const [openCreateModal, setOpenCreateModal] = useState(false);
  const [orderResetTrigger, setOrderResetTrigger] = useState(0);
  const theme = useTheme();
  const dark = theme.palette.mode === "dark";

  const initialLoading =
    loading && orders.length === 0 && plans.length === 0 && keys.length === 0;

  const stats = useMemo(() => {
    const activeOrders = orders.filter((item) => item.status === "active").length;
    const pendingOrders = orders.filter((item) => item.status === "pending").length;

    const expiringSoon = orders.filter(
      (item) =>
        ["active", "overdue"].includes(item.status) &&
        isExpiringSoon(item.expiry_date, 7)
    ).length;

    const revenue = orders.reduce(
      (sum, item) => sum + Number(item.total_paid_mmk || 0),
      0
    );

    const totalConnections = keys.reduce(
      (sum, item) => sum + Number(item.recent_connections_24h || 0),
      0
    );

    return { activeOrders, pendingOrders, expiringSoon, revenue, totalConnections };
  }, [orders, keys]);

  if (initialLoading) return <OverviewLoading />;

  const statCards = [
    {
      label: "Active orders",
      value: stats.activeOrders,
      caption: "Running now",
      ...CARD_CONFIGS[0],
    },
    {
      label: "Pending",
      value: stats.pendingOrders,
      caption: "Need attention",
      ...CARD_CONFIGS[1],
    },
    {
      label: "Expire soon",
      value: stats.expiringSoon,
      caption: "Within 7 days",
      ...CARD_CONFIGS[2],
    },
    {
      label: "Order value",
      value: formatMMK(stats.revenue),
      caption: `${stats.totalConnections} connections`,
      ...CARD_CONFIGS[3],
    },
  ];

  return (
    <Stack spacing={2.5}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2}>
        <Box>
          <Typography
            sx={{
              fontSize: { xs: "1.75rem", md: "2.25rem" },
              fontWeight: 900,
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
              fontFamily: "'Outfit', sans-serif",
            }}
          >
            Overview
          </Typography>
        </Box>

        <Button
          variant="contained"
          startIcon={<AddRoundedIcon />}
          onClick={() => setOpenCreateModal(true)}
          disabled={plans.length === 0}
          sx={{
            borderRadius: 2,
            minHeight: { xs: 38, md: 44 },
            px: { xs: 1.5, md: 2.5 },
            whiteSpace: "nowrap",
            fontSize: { xs: "0.82rem", md: "0.9rem" },
            flexShrink: 0,
          }}
        >
          Create Order
        </Button>
      </Stack>

      {error ? <Alert severity="error">{error}</Alert> : null}

      {plans.length === 0 ? (
        <Alert severity="warning">
          No active plans yet — orders cannot be created until plans exist.
        </Alert>
      ) : null}

      <Grid container spacing={2}>
        {statCards.map(({ key, ...card }) => (
          <Grid key={key} size={{ xs: 6, md: 3 }}>
            <StatCard {...card} />
          </Grid>
        ))}
      </Grid>

      <OrdersTable
        orders={orders}
        plans={plans}
        keys={keys}
        onSuccess={refresh}
        loading={loading && orders.length === 0}
        title="Quick Orders"
        description=""
        initialRowsPerPage={5}
        rowsPerPageOptions={[5, 10, 20]}
        showSearch={false}
        showFilters={false}
        compactMobile
        resetTrigger={orderResetTrigger}
      />

      <CreateOrderDialog
        open={openCreateModal}
        plans={plans}
        onClose={() => setOpenCreateModal(false)}
        onCreated={async () => {
          setOpenCreateModal(false);
          await refresh();
          setOrderResetTrigger((n) => n + 1);
        }}
      />
    </Stack>
  );
}