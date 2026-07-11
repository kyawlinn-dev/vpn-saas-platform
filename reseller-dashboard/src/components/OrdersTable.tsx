import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search, Plus, Copy, Info, ChevronLeft, ChevronRight,
  RefreshCw, Ban, KeyRound, Lightbulb,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FilterChips } from "@/components/ui/filter-chips";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { UsageBar } from "@/components/ui/usage-bar";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/ui/action-button";
import {
  Dialog, DialogHeader, DialogTitle, DialogDescription,
  DialogBody, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { api } from "../lib/api";
import {
  formatDate, formatDaysLeft, formatMMK, formatUsageGb, isExpiringSoon,
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

function getPaymentDisplayStatus(order: Order) {
  return order.order_type === "trial" ? "trial" : order.payment_status;
}

function getPreferredAccessUrl(key?: VpnKey | null) {
  return (
    key?.dynamic_access_url ||
    key?.ssconf_url ||
    key?.preferred_access_url ||
    key?.access_url ||
    ""
  );
}

function getPreferredAccessUrlFromPayload(data: any) {
  return (
    data?.key?.dynamic_access_url ||
    data?.key?.ssconf_url ||
    data?.key?.preferred_access_url ||
    data?.vpn_key?.dynamic_access_url ||
    data?.vpn_key?.ssconf_url ||
    data?.vpn_key?.preferred_access_url ||
    data?.dynamic_access_url ||
    data?.ssconf_url ||
    data?.preferred_access_url ||
    data?.data?.dynamic_access_url ||
    data?.data?.ssconf_url ||
    data?.data?.preferred_access_url ||
    data?.key?.access_url ||
    data?.vpn_key?.access_url ||
    data?.access_url ||
    data?.data?.access_url ||
    ""
  );
}

function getOrderUsageGb(key?: VpnKey | null) {
  if (!key) return 0;
  if (typeof key.order_total_used_gb === "number") return key.order_total_used_gb;
  if (typeof key.order_total_used_bytes === "number") {
    return key.order_total_used_bytes / 1024 / 1024 / 1024;
  }
  return Number(key.used_gb_30d || 0);
}

function getOrderRemainingGb(key?: VpnKey | null) {
  if (!key) return null;
  if (typeof key.order_total_remaining_gb === "number") return key.order_total_remaining_gb;
  return key.remaining_gb_30d == null ? null : Number(key.remaining_gb_30d);
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches
  );
  useEffect(() => {
    const m = window.matchMedia(query);
    const handler = () => setMatches(m.matches);
    handler();
    m.addEventListener("change", handler);
    return () => m.removeEventListener("change", handler);
  }, [query]);
  return matches;
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
  const narrow = useMediaQuery("(max-width: 599px)");

  const pages = useMemo(() => {
    if (count <= 1) return [1];
    const siblings = narrow ? 1 : 2;
    const items: (number | "...")[] = [];
    const left = Math.max(2, page - siblings);
    const right = Math.min(count - 1, page + siblings);

    items.push(1);
    if (left > 2) items.push("...");
    for (let i = left; i <= right; i++) items.push(i);
    if (right < count - 1) items.push("...");
    if (count > 1) items.push(count);

    return items;
  }, [page, count, narrow]);

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
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-medium text-foreground">{value}</div>
    </div>
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
  const mobile = useMediaQuery("(max-width: 899px)");

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
      if (key.order_id && key.status === "active" && !map[key.order_id]) {
        map[key.order_id] = key;
      }
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
        String(getPaymentDisplayStatus(order) || "").toLowerCase().includes(query) ||
        String(getPreferredAccessUrl(key) || "").toLowerCase().includes(query) ||
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
      const accessUrl: string = getPreferredAccessUrlFromPayload(data);
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
      const accessUrl: string = getPreferredAccessUrlFromPayload(data);
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
        used={getOrderUsageGb(key)}
        limit={Number(key.data_limit_gb || 0)}
        remaining={getOrderRemainingGb(key)}
        connections={Number(key.recent_connections_24h || 0)}
      />
    );
  };

  const renderAccess = (order: Order) => {
    const key = activeKeyByOrderId[order.id];
    const accessUrl = getPreferredAccessUrl(key);
    if (!accessUrl) return <span className="text-muted-foreground">-</span>;
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm">{key?.dynamic_access_url || key?.ssconf_url ? "Dynamic key" : "Active key"}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title="Copy access key"
          onClick={() => void copyText(accessUrl, "Access key")}
        >
          <Copy size={15} />
        </Button>
      </div>
    );
  };

  const renderActions = (order: Order) => {
    const isTelegramCustomer = order.customer?.customer_type === "telegram";

    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {isTelegramCustomer ? (
          <span className="inline-flex items-center rounded-full border border-border bg-secondary px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
            Telegram
          </span>
        ) : (
          <>
            {order.status === "pending" &&
              order.payment_status === "paid" &&
              order.review_status !== "rejected" && (
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

            {(order.status === "stopped" || order.status === "expired") &&
              order.review_status !== "rejected" && (
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
          </>
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
  };

  if (loading) return <LoadingView />;

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
                        <StatusBadge status={getPaymentDisplayStatus(order)} />
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{formatDate(order.expiry_date)}</div>
                        <div className={`text-xs${expirySoon ? " text-destructive" : " text-muted-foreground"}`}>
                          {formatDaysLeft(order.expiry_date)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {key ? formatUsageGb(getOrderUsageGb(key)) : "-"}
                        </div>
                      </TableCell>
                      <TableCell>
                        {getPreferredAccessUrl(key) ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Copy access key"
                            onClick={() => void copyText(getPreferredAccessUrl(key), "Access key")}
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

      {/* ── Renew / Extend dialog ── */}
      <Dialog
        open={renewDialog.open}
        onClose={() => setRenewDialog({ open: false, order: null, planId: "", action: "renew" })}
        size="sm"
      >
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-[#f5f3ff] text-[#7c3aed]">
              <RefreshCw size={18} />
            </div>
            <div>
              <DialogTitle>
                {renewDialog.action === "extend" ? "Extend Subscription" : "Renew Subscription"}
              </DialogTitle>
              <DialogDescription>
                {renewDialog.order?.customer?.full_name || "Customer"}
                {renewDialog.action === "extend"
                  ? " · extend current active subscription"
                  : " · start a fresh subscription with a new key"}
              </DialogDescription>
            </div>
          </div>
          <DialogClose />
        </DialogHeader>
        <DialogBody className="space-y-4">
          {renewDialog.order?.plan && (
            <div className="rounded-md border border-border bg-secondary/40 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Current plan
              </div>
              <div className="mt-1 text-sm font-semibold">
                {renewDialog.order.plan.name} — {formatMMK(renewDialog.order.plan.price_mmk)} /{" "}
                {renewDialog.order.plan.duration_days} days
              </div>
            </div>
          )}
          <FormField label="Select new plan">
            <Select
              value={renewDialog.planId}
              onChange={(e) => setRenewDialog((p) => ({ ...p, planId: e.target.value }))}
            >
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} — {formatMMK(plan.price_mmk)} · {plan.duration_days}d
                </option>
              ))}
            </Select>
          </FormField>
          {renewError ? (
            <div className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {renewError}
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => setRenewDialog({ open: false, order: null, planId: "", action: "renew" })}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            onClick={() => void confirmRenew()}
            loading={!!renewDialog.order && loadingId === `${renewDialog.order?.id}:${renewDialog.action}`}
            disabled={!renewDialog.order}
          >
            {renewDialog.order && loadingId === `${renewDialog.order.id}:${renewDialog.action}`
              ? renewDialog.action === "extend" ? "Extending…" : "Renewing…"
              : renewDialog.action === "extend" ? "Confirm Extend" : "Confirm Renew"}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* ── Stop dialog ── */}
      <Dialog
        open={stopDialog.open}
        onClose={() => setStopDialog({ open: false, order: null })}
        size="sm"
      >
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-destructive/10 text-destructive">
              <Ban size={18} />
            </div>
            <div>
              <DialogTitle>Stop Subscription</DialogTitle>
              <DialogDescription>This will revoke VPN access immediately</DialogDescription>
            </div>
          </div>
          <DialogClose />
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="rounded-md border border-destructive/25 bg-destructive/10 p-3 text-sm">
            Stop subscription for{" "}
            <span className="font-semibold text-destructive">
              {stopDialog.order?.customer?.full_name || "this customer"}
            </span>
            ? Their VPN key will be deactivated and they will lose access.
          </div>
          {stopError ? (
            <div className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {stopError}
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => setStopDialog({ open: false, order: null })}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            className="flex-1"
            onClick={() => void confirmStop()}
            loading={!!stopDialog.order && loadingId === `${stopDialog.order?.id}:stop`}
            disabled={!stopDialog.order}
          >
            {stopDialog.order && loadingId === `${stopDialog.order.id}:stop`
              ? "Stopping…"
              : "Confirm Stop"}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* ── Details dialog ── */}
      <Dialog
        open={detailsDialog.open}
        onClose={() => setDetailsDialog({ open: false, order: null })}
        size="sm"
      >
        <DialogHeader>
          <DialogTitle>Order Details</DialogTitle>
          <DialogClose />
        </DialogHeader>
        <DialogBody>
          {detailsDialog.open && detailsDialog.order ? (
            <div className="rounded-lg border border-border p-4 space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-base font-semibold">
                    {detailsDialog.order.customer?.full_name || "-"}
                  </div>
                  <div className="text-sm text-muted-foreground mt-0.5">
                    {detailsDialog.order.customer?.phone ||
                      detailsDialog.order.customer?.telegram_username ||
                      "No contact info"}
                  </div>
                </div>
                <StatusBadge status={detailsDialog.order.status} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <DetailItem label="Plan" value={detailsDialog.order.plan?.name || "-"} />
                <DetailItem
                  label="Payment"
                  value={<StatusBadge status={getPaymentDisplayStatus(detailsDialog.order)} />}
                />
                <DetailItem label="Price" value={formatMMK(detailsDialog.order.price_mmk)} />
                <DetailItem label="Expiry" value={formatDate(detailsDialog.order.expiry_date)} />
                <div className="col-span-2">
                  <DetailItem
                    label="Remaining"
                    value={formatDaysLeft(detailsDialog.order.expiry_date)}
                  />
                </div>
              </div>

              <div className="h-px bg-border" />

              <div className="rounded-md bg-secondary/40 p-3">
                <div className="mb-2 text-sm font-semibold">Usage</div>
                {renderUsageCompact(activeKeyByOrderId[detailsDialog.order.id])}
              </div>

              <div className="rounded-md bg-secondary/40 p-3">
                <div className="mb-2 text-sm font-semibold">Access</div>
                {renderAccess(detailsDialog.order)}
              </div>
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setDetailsDialog({ open: false, order: null })}
          >
            Close
          </Button>
        </DialogFooter>
      </Dialog>

      {/* ── Access key dialog ── */}
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
        size="md"
      >
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-[#f5f3ff] text-[#7c3aed]">
              <KeyRound size={18} />
            </div>
            <div>
              <DialogTitle>Access Key Ready!</DialogTitle>
              <DialogDescription>
                {accessKeyDialog.customerName} has been{" "}
                {accessKeyDialog.actionType === "renew" ? "renewed" : "activated"}
              </DialogDescription>
            </div>
          </div>
          <DialogClose />
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="rounded-md border border-primary/20 bg-primary/5 p-4 space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Subscription Details
            </div>
            <div className="space-y-2">
              {accessKeyDialog.token ? (
                <div>
                  <div className="text-xs text-muted-foreground">Access Token</div>
                  <div className="break-all font-mono text-[13px] font-medium text-primary leading-relaxed">
                    {accessKeyDialog.token}
                  </div>
                </div>
              ) : null}
              {accessKeyDialog.subscriptionUrl ? (
                <div>
                  <div className="text-xs text-muted-foreground">Subscription URL</div>
                  <div className="break-all font-mono text-[13px] font-medium text-primary leading-relaxed">
                    {accessKeyDialog.subscriptionUrl}
                  </div>
                </div>
              ) : null}
              {accessKeyDialog.serverCount ? (
                <div className="text-sm text-muted-foreground">
                  Assigned servers: {accessKeyDialog.serverCount}
                </div>
              ) : null}
              {accessKeyDialog.accessUrl ? (
                <div>
                  <div className="text-xs text-muted-foreground">Access key</div>
                  <div className="break-all font-mono text-[13px] font-medium text-primary leading-relaxed">
                    {accessKeyDialog.accessUrl}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="icon"
                title="Copy subscription details"
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
              >
                <Copy size={16} />
              </Button>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-md border border-success/20 bg-success/10 p-3 text-sm text-[color:var(--success)]">
            <Lightbulb size={16} className="mt-0.5 shrink-0" />
            <span>
              Share this URL with the customer. They can import it into their Outline or compatible VPN app.
            </span>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button
            variant="outline"
            className="flex-1"
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
          >
            Close
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            leftIcon={<Copy size={16} />}
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
          >
            Copy & Close
          </Button>
        </DialogFooter>
      </Dialog>

      {/* ── Toast stack ── */}
      <div className="fixed left-1/2 top-20 z-[60] flex w-[min(92vw,420px)] -translate-x-1/2 flex-col gap-2 pointer-events-none">
        {message ? (
          <div className="pointer-events-auto flex items-center justify-between gap-3 rounded-md border border-success/25 bg-[color:var(--success)] px-4 py-2.5 text-sm font-medium text-white shadow-lg">
            {message}
            <button onClick={() => setMessage("")} className="opacity-80 hover:opacity-100">
              ✕
            </button>
          </div>
        ) : null}
        {error ? (
          <div className="pointer-events-auto flex items-center justify-between gap-3 rounded-md border border-destructive/25 bg-destructive px-4 py-2.5 text-sm font-medium text-white shadow-lg">
            {error}
            <button onClick={() => setError("")} className="opacity-80 hover:opacity-100">
              ✕
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}
