import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import {
  Alert,
  Box,
  Button as MuiButton,
  Card as MuiCard,
  CardContent as MuiCardContent,
  Snackbar,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
  alpha,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { Search, Plus, Copy, Info, ChevronLeft, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FilterChips } from "@/components/ui/filter-chips";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { UsageBar } from "@/components/ui/usage-bar";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/ui/action-button";
import { api } from "../lib/api";
import {
  formatDate,
  formatDaysLeft,
  formatMMK,
  formatUsageGb,
  isExpiringSoon,
} from "../lib/format";
import type { Order, Plan, VpnKey } from "../types/api";

interface Props {
  orders: Order[];
  plans: Plan[];
  keys: VpnKey[];
  onSuccess: () => Promise<void>;
  title?: string;
  description?: string;
  initialRowsPerPage?: number;
  rowsPerPageOptions?: number[];
  showSearch?: boolean;
  showFilters?: boolean;
  loading?: boolean;
  compactMobile?: boolean;
  resetTrigger?: number;
  headerAction?: {
    label: string;
    icon?: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
  };
}

type OrderFilter =
  | "all"
  | "pending"
  | "active"
  | "expiring"
  | "overdue"
  | "expired"
  | "stopped";

type RenewDialogState = {
  open: boolean;
  order: Order | null;
  planId: string;
  action: "extend" | "renew";
};
type StopDialogState = { open: boolean; order: Order | null };
type DetailsDialogState = { open: false; order: null } | { open: true; order: Order };
type AccessKeyDialogState = {
  open: boolean;
  customerName: string;
  accessUrl: string;
  token?: string;
  subscriptionUrl?: string;
  serverCount?: number;
  actionType: "activate" | "renew";
};

function mapActionError(errorData?: { error?: string; code?: string }) {
  if (!errorData?.code) return errorData?.error || "Request failed";
  switch (errorData.code) {
    case "ALL_SERVERS_FULL":
      return "No server available. Please contact admin.";
    case "SERVER_PROVISIONING":
      return "Server being prepared. Try again soon.";
    case "SERVER_NOT_READY":
      return "Service being prepared. Try again shortly.";
    case "SERVER_PROVISION_FAILED":
      return "Service temporarily unavailable. Contact admin.";
    case "NO_SERVER_FOUND":
      return "No server available yet. Contact admin.";
    case "CUSTOMER_ALREADY_ACTIVE":
      return "Customer already has an active key. Use Renew instead.";
    default:
      return errorData.error || "Request failed";
  }
}

function TablePagination({
  page,
  count,
  onChange,
}: {
  page: number;
  count: number;
  onChange: (page: number) => void;
}) {
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down("sm"));

  const pages = useMemo(() => {
    if (count <= 1) return [1];
    const siblings = mobile ? 1 : 2;
    const items: (number | "...")[] = [];
    const left = Math.max(2, page - siblings);
    const right = Math.min(count - 1, page + siblings);

    items.push(1);
    if (left > 2) items.push("...");
    for (let i = left; i <= right; i++) items.push(i);
    if (right < count - 1) items.push("...");
    if (count > 1) items.push(count);

    return items;
  }, [page, count, mobile]);

  return (
    <div className="flex items-center gap-1 overflow-x-auto">
      <Button
        variant="outline"
        size="sm"
        disabled={page === 1}
        onClick={() => onChange(page - 1)}
      >
        <ChevronLeft size={16} />
        Prev
      </Button>

      {pages.map((p, i) =>
        p === "..." ? (
          <span key={`dots-${i}`} className="px-1 text-sm text-muted-foreground select-none">
            …
          </span>
        ) : (
          <Button
            key={p}
            size="sm"
            variant={page === p ? "primary" : "outline"}
            className="min-w-9"
            onClick={() => onChange(p as number)}
          >
            {p}
          </Button>
        )
      )}

      <Button
        variant="outline"
        size="sm"
        disabled={page === count || count <= 1}
        onClick={() => onChange(page + 1)}
      >
        Next
        <ChevronRight size={16} />
      </Button>
    </div>
  );
}

function LoadingView() {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="h-8 w-44 rounded bg-secondary animate-pulse" />
        <div className="h-9 w-32 rounded-md bg-secondary animate-pulse" />
      </div>
      <div className="h-10 rounded-md bg-secondary animate-pulse" />
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-8 w-20 rounded-full bg-secondary animate-pulse" />
        ))}
      </div>
      <div className="h-80 rounded-md bg-secondary animate-pulse" />
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Box>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{
          fontWeight: 600,
          fontSize: "0.72rem",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {label}
      </Typography>
      <Typography component="div" sx={{ mt: 0.3, fontWeight: 700, fontSize: "0.9rem" }}>
        {value}
      </Typography>
    </Box>
  );
}

export function OrdersTable({
  orders,
  plans,
  keys,
  onSuccess,
  title = "Orders",
  description = "",
  initialRowsPerPage = 10,
  rowsPerPageOptions = [5, 10, 20, 50],
  showSearch = true,
  showFilters = true,
  loading = false,
  compactMobile = false,
  resetTrigger,
  headerAction,
}: Props) {
  const theme = useTheme();
  const dark = theme.palette.mode === "dark";
  const mobile = useMediaQuery(theme.breakpoints.down("md"));

  const [loadingId, setLoadingId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<OrderFilter>("all");
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(initialRowsPerPage);

  const [renewDialog, setRenewDialog] = useState<RenewDialogState>({
    open: false,
    order: null,
    planId: "",
    action: "renew",
  });
  const [stopDialog, setStopDialog] = useState<StopDialogState>({ open: false, order: null });
  const [renewError, setRenewError] = useState("");
  const [stopError, setStopError] = useState("");
  const [detailsDialog, setDetailsDialog] = useState<DetailsDialogState>({ open: false, order: null });
  const [accessKeyDialog, setAccessKeyDialog] = useState<AccessKeyDialogState>({
    open: false,
    customerName: "",
    accessUrl: "",
    token: "",
    subscriptionUrl: "",
    serverCount: 0,
    actionType: "activate",
  });

  const tableRef = useRef<HTMLDivElement>(null);

  const scrollToTableTop = useCallback(() => {
    setTimeout(() => {
      tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }, []);

  const handlePageChange = useCallback(
    (newPage: number) => {
      setPage(newPage);
      scrollToTableTop();
    },
    [scrollToTableTop]
  );

  useEffect(() => {
    if (!resetTrigger) return;
    setPage(1);
    scrollToTableTop();
  }, [resetTrigger, scrollToTableTop]);

  useEffect(() => {
    setPage(1);
  }, [search, filter, rowsPerPage]);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(""), 7000);
    return () => clearTimeout(t);
  }, [message]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(""), 7000);
    return () => clearTimeout(t);
  }, [error]);

  useEffect(() => {
    if (!renewError) return;
    const t = setTimeout(() => setRenewError(""), 5000);
    return () => clearTimeout(t);
  }, [renewError]);

  useEffect(() => {
    if (!stopError) return;
    const t = setTimeout(() => setStopError(""), 5000);
    return () => clearTimeout(t);
  }, [stopError]);

  const activeKeyByOrderId = useMemo(() => {
    const map: Record<string, VpnKey> = {};
    for (const key of keys) {
      if (key.order_id && key.status === "active") map[key.order_id] = key;
    }
    return map;
  }, [keys]);

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase();
    return orders.filter((order) => {
      const key = activeKeyByOrderId[order.id];
      const matchesSearch =
        !query ||
        String(order.customer?.full_name || "").toLowerCase().includes(query) ||
        String(order.customer?.telegram_username || "").toLowerCase().includes(query) ||
        String(order.customer?.phone || "").toLowerCase().includes(query) ||
        String(order.plan?.name || "").toLowerCase().includes(query) ||
        String(order.status || "").toLowerCase().includes(query) ||
        String(order.payment_status || "").toLowerCase().includes(query) ||
        String(key?.access_url || "").toLowerCase().includes(query) ||
        String(order.access_tokens?.[0]?.token || "").toLowerCase().includes(query);

      if (!matchesSearch) return false;

      switch (filter) {
        case "pending":
          return order.status === "pending";
        case "active":
          return order.status === "active";
        case "expiring":
          return order.status === "active" && isExpiringSoon(order.expiry_date, 7);
        case "overdue":
          return order.status === "overdue";
        case "expired":
          return order.status === "expired";
        case "stopped":
          return order.status === "stopped";
        default:
          return true;
      }
    });
  }, [orders, filter, search, activeKeyByOrderId]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / rowsPerPage));
  const currentPage = Math.min(page, totalPages);

  const pagedOrders = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredOrders.slice(start, start + rowsPerPage);
  }, [filteredOrders, currentPage, rowsPerPage]);

  const filterCounts = useMemo(
    () => ({
      all: orders.length,
      pending: orders.filter((i) => i.status === "pending").length,
      active: orders.filter((i) => i.status === "active").length,
      expiring: orders.filter((i) => i.status === "active" && isExpiringSoon(i.expiry_date, 7)).length,
      overdue: orders.filter((i) => i.status === "overdue").length,
      expired: orders.filter((i) => i.status === "expired").length,
      stopped: orders.filter((i) => i.status === "stopped").length,
    }),
    [orders]
  );

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setError("");
      setMessage(`${label} copied.`);
    } catch {
      setError(`Failed to copy ${label.toLowerCase()}.`);
    }
  };

  const runActivate = async (order: Order) => {
    try {
      setLoadingId(`${order.id}:activate`);
      setError("");
      setMessage("");
      const res = await api.post(`/reseller/order-actions/${order.id}/activate`);
      await onSuccess();

      const data = res?.data;
      const accessUrl: string =
        data?.key?.access_url || data?.vpn_key?.access_url || data?.access_url || data?.data?.access_url || "";
      const customerName = order.customer?.full_name || "Customer";

      if (accessUrl || data?.token || data?.subscription_url) {
        setAccessKeyDialog({
          open: true,
          customerName,
          accessUrl,
          token: data?.token || "",
          subscriptionUrl: data?.subscription_url || "",
          serverCount: Number(data?.server_count || 0),
          actionType: "activate",
        });
      } else {
        setMessage(`Activated ${customerName}. Subscription is now active.`);
      }
    } catch (err: any) {
      setError(mapActionError(err?.response?.data) || err.message || "Failed to activate");
    } finally {
      setLoadingId("");
    }
  };

  const confirmRenew = async () => {
    if (!renewDialog.order) return;

    const { order, action, planId } = renewDialog;
    const endpoint = action === "extend" ? "extend" : "renew";

    try {
      setLoadingId(`${order.id}:${action}`);
      setError("");
      setMessage("");

      const res = await api.post(`/reseller/order-actions/${order.id}/${endpoint}`, {
        plan_id: planId || order.plan_id,
      });

      setRenewDialog({ open: false, order: null, planId: "", action: "renew" });
      await onSuccess();

      const data = res?.data;
      const accessUrl: string = data?.key?.access_url || data?.access_url || "";
      const customerName = order.customer?.full_name || "Customer";

      if (action === "renew" && (accessUrl || data?.token || data?.subscription_url)) {
        setAccessKeyDialog({
          open: true,
          customerName,
          accessUrl,
          token: data?.token || "",
          subscriptionUrl: data?.subscription_url || "",
          serverCount: Number(data?.server_count || 0),
          actionType: "renew",
        });
      } else {
        setMessage(`${action === "extend" ? "Extended" : "Renewed"} ${customerName}.`);
      }
    } catch (err: any) {
      setRenewError(mapActionError(err?.response?.data) || err.message || `Failed to ${action}`);
      setError(mapActionError(err?.response?.data) || err.message || `Failed to ${action}`);
    } finally {
      setLoadingId("");
    }
  };

  const confirmStop = async () => {
    if (!stopDialog.order) return;
    try {
      setLoadingId(`${stopDialog.order.id}:stop`);
      setError("");
      setMessage("");
      await api.post(`/reseller/order-actions/${stopDialog.order.id}/stop`);
      setStopDialog({ open: false, order: null });
      setMessage(`Stopped ${stopDialog.order.customer?.full_name || "order"}.`);
      await onSuccess();
    } catch (err: any) {
      setStopError(mapActionError(err?.response?.data) || err.message || "Failed to stop");
      setError(mapActionError(err?.response?.data) || err.message || "Failed to stop");
    } finally {
      setLoadingId("");
    }
  };

  const renderUsageCompact = (key?: VpnKey) => {
    if (!key) return <span className="text-muted-foreground">-</span>;
    return (
      <UsageBar
        used={Number(key.used_gb_30d || 0)}
        limit={Number(key.data_limit_gb || 0)}
        remaining={key.remaining_gb_30d == null ? null : Number(key.remaining_gb_30d)}
        connections={Number(key.recent_connections_24h || 0)}
      />
    );
  };

  const renderAccess = (order: Order) => {
    const key = activeKeyByOrderId[order.id];
    if (!key?.access_url) return <span className="text-muted-foreground">-</span>;
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm">Active key</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title="Copy access URL"
          onClick={() => void copyText(key.access_url!, "Access URL")}
        >
          <Copy size={15} />
        </Button>
      </div>
    );
  };

  const renderActions = (order: Order) => (
    <div className="flex flex-wrap items-center gap-1.5">
      {order.status === "pending" && (
        <ActionButton
          variant="secondary"
          onClick={() => void runActivate(order)}
          loading={loadingId === `${order.id}:activate`}
          loadingText="Activating…"
        >
          Activate
        </ActionButton>
      )}

      {order.status === "active" && (
        <>
          <ActionButton
            variant="primary"
            onClick={() =>
              setRenewDialog({ open: true, order, planId: order.plan_id, action: "extend" })
            }
            loading={loadingId === `${order.id}:extend`}
            loadingText="Extending…"
          >
            Extend
          </ActionButton>
          <ActionButton
            variant="destructiveOutline"
            onClick={() => setStopDialog({ open: true, order })}
          >
            Stop
          </ActionButton>
        </>
      )}

      {(order.status === "stopped" || order.status === "expired") && (
        <ActionButton
          variant="primary"
          onClick={() =>
            setRenewDialog({ open: true, order, planId: order.plan_id, action: "renew" })
          }
          loading={loadingId === `${order.id}:renew`}
          loadingText="Renewing…"
        >
          Renew
        </ActionButton>
      )}

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        title="Details"
        onClick={() => setDetailsDialog({ open: true, order })}
      >
        <Info size={18} />
      </Button>
    </div>
  );

  if (loading) return <LoadingView />;

  const VIOLET = "#7c3aed";

  return (
    <>
      <Card ref={tableRef} className="scroll-mt-20 p-4 md:p-6 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl md:text-2xl font-bold font-display tracking-tight text-foreground">
              {title}
            </h2>
            {!compactMobile && description ? (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {headerAction ? (
            <Button
              variant="primary"
              leftIcon={headerAction.icon ?? <Plus size={16} />}
              onClick={headerAction.onClick}
              disabled={headerAction.disabled}
            >
              {headerAction.label}
            </Button>
          ) : null}
        </div>

        {/* Search */}
        {showSearch ? (
          <div className="relative">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              className="pl-9"
              placeholder="Search customer, plan, phone, Telegram…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        ) : null}

        {/* Filter chips */}
        {showFilters ? (
          <FilterChips
            value={filter}
            onChange={(v) => setFilter(v as OrderFilter)}
            options={[
              { value: "all", label: "All", count: filterCounts.all },
              { value: "pending", label: "Pending", count: filterCounts.pending },
              { value: "active", label: "Active", count: filterCounts.active },
              { value: "expiring", label: "Expire soon", count: filterCounts.expiring },
              { value: "overdue", label: "Overdue", count: filterCounts.overdue },
              { value: "expired", label: "Expired", count: filterCounts.expired },
              { value: "stopped", label: "Stopped", count: filterCounts.stopped },
            ]}
          />
        ) : null}

        {/* Mobile cards / Desktop table */}
        {mobile ? (
          <div className="space-y-2">
            {pagedOrders.length === 0 ? (
              <div className="rounded-md border border-border bg-secondary/40 px-4 py-6 text-center text-sm text-muted-foreground">
                No matching orders found.
              </div>
            ) : (
              pagedOrders.map((order) => {
                const expirySoon = isExpiringSoon(order.expiry_date, 7) && order.status === "active";
                return (
                  <div key={order.id} className="rounded-lg border border-border bg-card p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">
                          {order.customer?.full_name || "Unknown"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {order.customer?.telegram_username || order.customer?.phone || "-"}
                        </div>
                      </div>
                      <StatusBadge status={order.status} />
                    </div>

                    <div className="mt-3 flex gap-6">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Plan
                        </div>
                        <div className="text-sm font-medium">{order.plan?.name || "-"}</div>
                      </div>
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Expiry
                        </div>
                        <div className={`text-sm font-medium${expirySoon ? " text-destructive" : ""}`}>
                          {formatDaysLeft(order.expiry_date) || "-"}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Price
                        </div>
                        <div className="text-sm font-medium">{formatMMK(order.price_mmk)}</div>
                      </div>
                    </div>

                    <div className="my-3 h-px bg-border" />
                    {renderActions(order)}
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <Table className="table-fixed">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead style={{ width: "22%" }}>Customer</TableHead>
                <TableHead style={{ width: "13%" }}>Plan</TableHead>
                <TableHead style={{ width: "10%" }}>Status</TableHead>
                <TableHead style={{ width: "9%" }}>Payment</TableHead>
                <TableHead style={{ width: "13%" }}>Expiry</TableHead>
                <TableHead style={{ width: "12%" }}>Usage</TableHead>
                <TableHead style={{ width: "8%" }}>Access</TableHead>
                <TableHead style={{ width: "8%" }}>Price</TableHead>
                <TableHead style={{ width: "15%" }}>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedOrders.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={9}>
                    <div className="py-4 text-center text-sm text-muted-foreground">
                      No matching orders found.
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                pagedOrders.map((order) => {
                  const key = activeKeyByOrderId[order.id];
                  const expirySoon = isExpiringSoon(order.expiry_date, 7) && order.status === "active";
                  return (
                    <TableRow key={order.id}>
                      <TableCell>
                        <div className="text-sm font-medium">
                          {order.customer?.full_name || "Unknown"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {order.customer?.telegram_username || order.customer?.phone || "-"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">{order.plan?.name || "-"}</div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={order.status} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={order.payment_status} />
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{formatDate(order.expiry_date)}</div>
                        <div className={`text-xs${expirySoon ? " text-destructive" : " text-muted-foreground"}`}>
                          {formatDaysLeft(order.expiry_date)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {key ? formatUsageGb(Number(key.used_gb_30d || 0)) : "-"}
                        </div>
                      </TableCell>
                      <TableCell>
                        {key?.access_url ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Copy access URL"
                            onClick={() => void copyText(key.access_url!, "Access URL")}
                          >
                            <Copy size={15} />
                          </Button>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-semibold">{formatMMK(order.price_mmk)}</div>
                      </TableCell>
                      <TableCell>{renderActions(order)}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        )}

        {/* Pagination footer */}
        <div className="h-px bg-border" />
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Rows</span>
            <div className="w-[72px] shrink-0">
              <Select
                value={rowsPerPage}
                onChange={(e) => setRowsPerPage(Number(e.target.value))}
                className="h-8"
              >
                {rowsPerPageOptions.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </Select>
            </div>
            <span>
              {filteredOrders.length === 0
                ? "0–0"
                : `${(currentPage - 1) * rowsPerPage + 1}–${Math.min(
                    currentPage * rowsPerPage,
                    filteredOrders.length
                  )}`}{" "}
              of {filteredOrders.length}
            </span>
          </div>
          <TablePagination page={currentPage} count={totalPages} onChange={handlePageChange} />
        </div>
      </Card>

      {/* ── Renew / Extend dialog (still MUI) ── */}
      <Dialog
        open={renewDialog.open}
        onClose={() => setRenewDialog({ open: false, order: null, planId: "", action: "renew" })}
        fullWidth
        maxWidth="xs"
        PaperProps={{
          sx: {
            borderRadius: 3,
            background: dark
              ? "linear-gradient(145deg, #0c0e1c 0%, #10123a 100%)"
              : "linear-gradient(145deg, #ffffff 0%, #f3f0ff 100%)",
            border: `1px solid ${alpha(VIOLET, dark ? 0.25 : 0.18)}`,
            overflow: "hidden",
          },
        }}
      >
        <Box
          sx={{
            height: 4,
            background: `linear-gradient(90deg, ${VIOLET}, #06b6d4)`,
            boxShadow: `0 0 20px ${alpha(VIOLET, 0.5)}`,
          }}
        />
        <DialogContent sx={{ pt: 3, pb: 2, px: 3 }}>
          <Stack spacing={2.5}>
            <Stack direction="row" spacing={2} alignItems="center">
              <Box
                sx={{
                  width: 46,
                  height: 46,
                  borderRadius: 2.5,
                  flexShrink: 0,
                  background: `linear-gradient(135deg, ${VIOLET}, #06b6d4)`,
                  display: "grid",
                  placeItems: "center",
                  boxShadow: `0 6px 18px ${alpha(VIOLET, 0.4)}`,
                }}
              >
                <Typography sx={{ fontSize: "1.3rem" }}>🔄</Typography>
              </Box>
              <Box>
                <Typography
                  sx={{
                    fontWeight: 800,
                    fontSize: "1.1rem",
                    lineHeight: 1.2,
                    fontFamily: "'Outfit', sans-serif",
                  }}
                >
                  {renewDialog.action === "extend" ? "Extend Subscription" : "Renew Subscription"}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {renewDialog.order?.customer?.full_name || "Customer"}
                  {renewDialog.action === "extend"
                    ? " · extend current active subscription"
                    : " · start a fresh subscription with a new key"}
                </Typography>
              </Box>
            </Stack>

            {renewDialog.order?.plan && (
              <Box
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  bgcolor: dark ? alpha("#fff", 0.04) : alpha(VIOLET, 0.04),
                  border: `1px solid ${alpha(VIOLET, dark ? 0.15 : 0.1)}`,
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    fontSize: "0.68rem",
                    fontWeight: 700,
                    letterSpacing: "0.07em",
                    textTransform: "uppercase",
                    color: "text.secondary",
                  }}
                >
                  Current plan
                </Typography>
                <Typography sx={{ fontWeight: 700, fontSize: "0.9rem", mt: 0.4 }}>
                  {renewDialog.order.plan.name} — {formatMMK(renewDialog.order.plan.price_mmk)} /{" "}
                  {renewDialog.order.plan.duration_days} days
                </Typography>
              </Box>
            )}

            <TextField
              select
              fullWidth
              label="Select new plan"
              value={renewDialog.planId}
              onChange={(e) => setRenewDialog((p) => ({ ...p, planId: e.target.value }))}
            >
              {plans.map((plan) => (
                <MenuItem key={plan.id} value={plan.id}>
                  <Stack>
                    <Typography sx={{ fontWeight: 700, fontSize: "0.88rem" }}>{plan.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {formatMMK(plan.price_mmk)} · {plan.duration_days} days
                    </Typography>
                  </Stack>
                </MenuItem>
              ))}
            </TextField>

            {renewError ? <Alert severity="error" sx={{ borderRadius: 2 }}>{renewError}</Alert> : null}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, pt: 0.5, gap: 1 }}>
          <MuiButton
            variant="outlined"
            color="inherit"
            onClick={() => setRenewDialog({ open: false, order: null, planId: "", action: "renew" })}
            sx={{ borderRadius: 2, flex: 1, fontWeight: 700, whiteSpace: "nowrap" }}
          >
            Cancel
          </MuiButton>
          <MuiButton
            variant="contained"
            onClick={() => void confirmRenew()}
            disabled={!renewDialog.order || loadingId === `${renewDialog.order?.id}:${renewDialog.action}`}
            sx={{ borderRadius: 2, flex: 1, fontWeight: 700, whiteSpace: "nowrap" }}
          >
            {renewDialog.order && loadingId === `${renewDialog.order.id}:${renewDialog.action}`
              ? renewDialog.action === "extend"
                ? "Extending…"
                : "Renewing…"
              : renewDialog.action === "extend"
                ? "Confirm Extend"
                : "Confirm Renew"}
          </MuiButton>
        </DialogActions>
      </Dialog>

      {/* ── Stop dialog (still MUI) ── */}
      <Dialog
        open={stopDialog.open}
        onClose={() => setStopDialog({ open: false, order: null })}
        fullWidth
        maxWidth="xs"
        PaperProps={{
          sx: {
            borderRadius: 3,
            background: dark
              ? "linear-gradient(145deg, #0c0e1c 0%, #1c0a0a 100%)"
              : "linear-gradient(145deg, #ffffff 0%, #fff5f5 100%)",
            border: `1px solid ${alpha("#ef4444", dark ? 0.25 : 0.18)}`,
            overflow: "hidden",
          },
        }}
      >
        <Box
          sx={{
            height: 4,
            background: "linear-gradient(90deg, #ef4444, #f97316)",
            boxShadow: `0 0 20px ${alpha("#ef4444", 0.5)}`,
          }}
        />
        <DialogContent sx={{ pt: 3, pb: 2, px: 3 }}>
          <Stack spacing={2}>
            <Stack direction="row" spacing={2} alignItems="center">
              <Box
                sx={{
                  width: 46,
                  height: 46,
                  borderRadius: 2.5,
                  flexShrink: 0,
                  background: "linear-gradient(135deg, #ef4444, #f97316)",
                  display: "grid",
                  placeItems: "center",
                  boxShadow: `0 6px 18px ${alpha("#ef4444", 0.4)}`,
                }}
              >
                <Typography sx={{ fontSize: "1.3rem" }}>⛔</Typography>
              </Box>
              <Box>
                <Typography
                  sx={{
                    fontWeight: 800,
                    fontSize: "1.1rem",
                    lineHeight: 1.2,
                    fontFamily: "'Outfit', sans-serif",
                  }}
                >
                  Stop Subscription
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.3, fontSize: "0.82rem" }}>
                  This will revoke VPN access immediately
                </Typography>
              </Box>
            </Stack>

            <Box
              sx={{
                p: 1.75,
                borderRadius: 2,
                bgcolor: dark ? alpha("#ef4444", 0.08) : alpha("#ef4444", 0.05),
                border: `1px solid ${alpha("#ef4444", 0.2)}`,
              }}
            >
              <Typography sx={{ fontSize: "0.88rem", lineHeight: 1.6 }}>
                Stop subscription for{" "}
                <Box component="span" sx={{ fontWeight: 800, color: dark ? "#fca5a5" : "#dc2626" }}>
                  {stopDialog.order?.customer?.full_name || "this customer"}
                </Box>
                ? Their VPN key will be deactivated and they will lose access.
              </Typography>
            </Box>

            {stopError ? <Alert severity="error" sx={{ borderRadius: 2 }}>{stopError}</Alert> : null}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, pt: 0.5, gap: 1 }}>
          <MuiButton
            variant="outlined"
            color="inherit"
            onClick={() => setStopDialog({ open: false, order: null })}
            sx={{ borderRadius: 2, flex: 1, fontWeight: 700, whiteSpace: "nowrap" }}
          >
            Cancel
          </MuiButton>
          <MuiButton
            variant="contained"
            color="error"
            onClick={() => void confirmStop()}
            disabled={!stopDialog.order || loadingId === `${stopDialog.order?.id}:stop`}
            sx={{
              borderRadius: 2,
              flex: 1,
              fontWeight: 700,
              whiteSpace: "nowrap",
              background: "linear-gradient(135deg, #ef4444, #dc2626)",
              "&:hover": { background: "linear-gradient(135deg, #f87171, #ef4444)" },
              boxShadow: `0 4px 14px ${alpha("#ef4444", 0.4)}`,
            }}
          >
            {stopDialog.order && loadingId === `${stopDialog.order.id}:stop` ? "Stopping…" : "Confirm Stop"}
          </MuiButton>
        </DialogActions>
      </Dialog>

      {/* ── Details dialog (still MUI) ── */}
      <Dialog
        open={detailsDialog.open}
        onClose={() => setDetailsDialog({ open: false, order: null })}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle sx={{ pb: 1 }}>Order Details</DialogTitle>
        <DialogContent>
          {detailsDialog.order ? (
            <MuiCard variant="outlined" sx={{ borderRadius: 2 }}>
              <MuiCardContent sx={{ p: 2 }}>
                <Stack spacing={2}>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                    <Box>
                      <Typography sx={{ fontWeight: 800, fontSize: "1.05rem" }}>
                        {detailsDialog.order.customer?.full_name || "-"}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.3 }}>
                        {detailsDialog.order.customer?.phone ||
                          detailsDialog.order.customer?.telegram_username ||
                          "No contact info"}
                      </Typography>
                    </Box>
                    <StatusBadge status={detailsDialog.order.status} />
                  </Stack>

                  <Grid container spacing={2}>
                    <Grid size={6}>
                      <DetailItem label="Plan" value={detailsDialog.order.plan?.name || "-"} />
                    </Grid>
                    <Grid size={6}>
                      <DetailItem
                        label="Payment"
                        value={<StatusBadge status={detailsDialog.order.payment_status} />}
                      />
                    </Grid>
                    <Grid size={6}>
                      <DetailItem label="Price" value={formatMMK(detailsDialog.order.price_mmk)} />
                    </Grid>
                    <Grid size={6}>
                      <DetailItem label="Expiry" value={formatDate(detailsDialog.order.expiry_date)} />
                    </Grid>
                    <Grid size={12}>
                      <DetailItem label="Remaining" value={formatDaysLeft(detailsDialog.order.expiry_date)} />
                    </Grid>
                  </Grid>

                  <Divider />

                  <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: "action.hover" }}>
                    <Typography sx={{ fontWeight: 700, mb: 1, fontSize: "0.88rem" }}>Usage</Typography>
                    {renderUsageCompact(activeKeyByOrderId[detailsDialog.order.id])}
                  </Box>

                  <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: "action.hover" }}>
                    <Typography sx={{ fontWeight: 700, mb: 1, fontSize: "0.88rem" }}>Access</Typography>
                    {renderAccess(detailsDialog.order)}
                  </Box>
                </Stack>
              </MuiCardContent>
            </MuiCard>
          ) : null}
        </DialogContent>
        <DialogActions>
          <MuiButton onClick={() => setDetailsDialog({ open: false, order: null })} sx={{ borderRadius: 2 }}>
            Close
          </MuiButton>
        </DialogActions>
      </Dialog>

      {/* ── Access key dialog (still MUI) ── */}
      <Dialog
        open={accessKeyDialog.open}
        onClose={() =>
          setAccessKeyDialog({
            open: false,
            customerName: "",
            accessUrl: "",
            token: "",
            subscriptionUrl: "",
            serverCount: 0,
            actionType: "activate",
          })
        }
        fullWidth
        maxWidth="sm"
        PaperProps={{
          sx: {
            borderRadius: 3,
            background: dark
              ? "linear-gradient(145deg, #0c0e1c 0%, #10123a 100%)"
              : "linear-gradient(145deg, #ffffff 0%, #f3f0ff 100%)",
            border: `1px solid ${alpha(VIOLET, dark ? 0.25 : 0.2)}`,
            overflow: "hidden",
          },
        }}
      >
        <Box
          sx={{
            height: 4,
            background: `linear-gradient(90deg, ${VIOLET}, #06b6d4)`,
            boxShadow: `0 0 24px ${alpha(VIOLET, 0.6)}`,
          }}
        />

        <DialogContent sx={{ pt: 3, pb: 2, px: 3 }}>
          <Stack spacing={2.5}>
            <Stack direction="row" spacing={2} alignItems="center">
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: 2.5,
                  flexShrink: 0,
                  background: `linear-gradient(135deg, ${VIOLET}, #06b6d4)`,
                  display: "grid",
                  placeItems: "center",
                  boxShadow: `0 6px 20px ${alpha(VIOLET, 0.45)}`,
                }}
              >
                <Typography sx={{ fontSize: "1.4rem" }}>🔑</Typography>
              </Box>

              <Box>
                <Typography
                  sx={{
                    fontWeight: 800,
                    fontSize: "1.15rem",
                    lineHeight: 1.2,
                    fontFamily: "'Outfit', sans-serif",
                  }}
                >
                  Access Key Ready!
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 0.3, fontSize: "0.83rem" }}
                >
                  {accessKeyDialog.customerName} has been{" "}
                  {accessKeyDialog.actionType === "renew" ? "renewed" : "activated"}
                </Typography>
              </Box>
            </Stack>

            <Box
              sx={{
                borderRadius: 2,
                border: `1.5px solid ${alpha(VIOLET, dark ? 0.3 : 0.2)}`,
                bgcolor: dark ? alpha(VIOLET, 0.07) : alpha(VIOLET, 0.04),
                p: 2,
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  fontSize: "0.68rem",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: dark ? alpha("#e8eaf6", 0.45) : alpha("#0f0f23", 0.4),
                  display: "block",
                  mb: 1,
                }}
              >
                Subscription Details
              </Typography>

              <Stack spacing={1.25}>
                {accessKeyDialog.token ? (
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Access Token
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: "0.78rem",
                        fontFamily: "monospace",
                        wordBreak: "break-all",
                        color: dark ? "#c4b5fd" : VIOLET,
                        fontWeight: 600,
                        lineHeight: 1.6,
                      }}
                    >
                      {accessKeyDialog.token}
                    </Typography>
                  </Box>
                ) : null}

                {accessKeyDialog.subscriptionUrl ? (
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Subscription URL
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: "0.78rem",
                        fontFamily: "monospace",
                        wordBreak: "break-all",
                        color: dark ? "#c4b5fd" : VIOLET,
                        fontWeight: 600,
                        lineHeight: 1.6,
                      }}
                    >
                      {accessKeyDialog.subscriptionUrl}
                    </Typography>
                  </Box>
                ) : null}

                {accessKeyDialog.serverCount ? (
                  <Typography variant="body2" color="text.secondary">
                    Assigned servers: {accessKeyDialog.serverCount}
                  </Typography>
                ) : null}

                {accessKeyDialog.accessUrl ? (
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Fallback raw access URL
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: "0.78rem",
                        fontFamily: "monospace",
                        wordBreak: "break-all",
                        color: dark ? "#c4b5fd" : VIOLET,
                        fontWeight: 600,
                        lineHeight: 1.6,
                      }}
                    >
                      {accessKeyDialog.accessUrl}
                    </Typography>
                  </Box>
                ) : null}

                <Stack direction="row" justifyContent="flex-end">
                  <Tooltip title="Copy subscription details">
                    <IconButton
                      onClick={() =>
                        void copyText(
                          accessKeyDialog.subscriptionUrl ||
                            accessKeyDialog.token ||
                            accessKeyDialog.accessUrl,
                          accessKeyDialog.subscriptionUrl
                            ? "Subscription URL"
                            : accessKeyDialog.token
                              ? "Access Token"
                              : "Access URL"
                        )
                      }
                      sx={{
                        flexShrink: 0,
                        borderRadius: 1.5,
                        width: 36,
                        height: 36,
                        bgcolor: alpha(VIOLET, 0.12),
                        color: VIOLET,
                        "&:hover": {
                          bgcolor: alpha(VIOLET, 0.22),
                          transform: "scale(1.08)",
                        },
                        transition: "all 0.15s ease",
                      }}
                    >
                      <ContentCopyIcon sx={{ fontSize: 17 }} />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Stack>
            </Box>

            <Stack
              direction="row"
              spacing={1}
              alignItems="flex-start"
              sx={{
                p: 1.5,
                borderRadius: 1.5,
                bgcolor: dark ? alpha("#10b981", 0.08) : alpha("#10b981", 0.06),
                border: `1px solid ${alpha("#10b981", 0.2)}`,
              }}
            >
              <Typography sx={{ fontSize: "0.95rem", lineHeight: 1 }}>💡</Typography>
              <Typography
                variant="caption"
                sx={{
                  fontSize: "0.78rem",
                  color: dark ? "#6ee7b7" : "#065f46",
                  lineHeight: 1.5,
                }}
              >
                Share this URL with the customer. They can import it into their Outline or compatible VPN app.
              </Typography>
            </Stack>
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2.5, pt: 0, gap: 1 }}>
          <MuiButton
            variant="outlined"
            color="inherit"
            onClick={() =>
              setAccessKeyDialog({
                open: false,
                customerName: "",
                accessUrl: "",
                token: "",
                subscriptionUrl: "",
                serverCount: 0,
                actionType: "activate",
              })
            }
            sx={{ borderRadius: 2, flex: 1, fontWeight: 700 }}
          >
            Close
          </MuiButton>

          <MuiButton
            variant="contained"
            onClick={async () => {
              await copyText(
                accessKeyDialog.subscriptionUrl ||
                  accessKeyDialog.token ||
                  accessKeyDialog.accessUrl,
                accessKeyDialog.subscriptionUrl
                  ? "Subscription URL"
                  : accessKeyDialog.token
                    ? "Access Token"
                    : "Access URL"
              );

              setAccessKeyDialog({
                open: false,
                customerName: "",
                accessUrl: "",
                token: "",
                subscriptionUrl: "",
                serverCount: 0,
                actionType: "activate",
              });
            }}
            startIcon={<ContentCopyIcon sx={{ fontSize: "1rem !important" }} />}
            sx={{ borderRadius: 2, flex: 1, fontWeight: 700 }}
          >
            Copy & Close
          </MuiButton>
        </DialogActions>
      </Dialog>

      {/* ── Success snackbar ── */}
      <Snackbar
        open={Boolean(message)}
        autoHideDuration={3000}
        onClose={() => setMessage("")}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        sx={{
          top: { xs: 72, sm: 88 },
          left: { xs: 12, sm: "50%" },
          right: { xs: 12, sm: "auto" },
          transform: { xs: "none", sm: "translateX(-50%)" },
        }}
      >
        <Alert
          onClose={() => setMessage("")}
          severity="success"
          variant="filled"
          sx={{
            width: { xs: "100%", sm: "auto" },
            minWidth: { sm: 320 },
            maxWidth: { xs: "100%", sm: 520 },
            alignItems: "center",
            boxShadow: "0 10px 30px rgba(0,0,0,0.28)",
          }}
        >
          {message}
        </Alert>
      </Snackbar>

      {/* ── Error snackbar ── */}
      <Snackbar
        open={Boolean(error)}
        autoHideDuration={4000}
        onClose={() => setError("")}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        sx={{
          top: { xs: 72, sm: 88 },
          left: { xs: 12, sm: "50%" },
          right: { xs: 12, sm: "auto" },
          transform: { xs: "none", sm: "translateX(-50%)" },
        }}
      >
        <Alert
          onClose={() => setError("")}
          severity="error"
          variant="filled"
          sx={{
            width: { xs: "100%", sm: "auto" },
            minWidth: { sm: 320 },
            maxWidth: { xs: "100%", sm: 520 },
            alignItems: "center",
            boxShadow: "0 10px 30px rgba(0,0,0,0.28)",
          }}
        >
          {error}
        </Alert>
      </Snackbar>
    </>
  );
}
