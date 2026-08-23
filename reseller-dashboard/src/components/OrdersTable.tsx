import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search, Plus, Copy, Info, Loader2, Crown, Gift,
  RefreshCw, Ban, KeyRound, Lightbulb, Send, UserRound, Server as ServerIcon,
} from "lucide-react";
import { ServerSwitchDialog } from "./ServerSwitchDialog";
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
import { ActionMenu, type ActionMenuItem } from "@/components/ui/action-menu";
import {
  Dialog, DialogHeader, DialogTitle, DialogDescription,
  DialogBody, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { TablePagination } from "@/components/ui/table-pagination";
import { cn } from "@/lib/utils";
import { FlagIcon } from "@/lib/flag";
import { api } from "../lib/api";
import { usePaginatedTable } from "../hooks/usePaginatedTable";
import {
  formatDate, formatDaysLeft, formatMMK, formatUsageGb, isExpiringSoon,
} from "../lib/format";
import type { Order, Plan, VpnKey } from "../types/api";

interface Props {
  plans: Plan[];
  scopeFilters?: Record<string, string>;
  title?: string;
  description?: string;
  initialRowsPerPage?: number;
  rowsPerPageOptions?: number[];
  showSearch?: boolean;
  showFilters?: boolean;
  compactMobile?: boolean;
  compact?: boolean;
  showCustomerTypeFilter?: boolean;
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

type CustomerTypeFilter = "all" | "normal" | "telegram";

type PlanTypeFilter = "all" | "trial" | "paid";

type RenewDialogState = {
  open: boolean;
  order: Order | null;
  planId: string;
  action: "extend" | "renew";
  idempotencyKey: string;
};
type StopDialogState = { open: boolean; order: Order | null };
type DetailsDialogState = { open: false; order: null } | { open: true; order: Order };
type AccessKeyDialogState = {
  open: boolean;
  customerName: string;
  accessUrl: string;
  ssconfUrl?: string;
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

function isTelegramManagedOrder(order: Order) {
  const source = String(order.source || "").toLowerCase();
  return source === "miniapp" || source === "bot";
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
  if (typeof key.used_gb_30d === "number") return key.used_gb_30d;
  // Orders now embed keys straight from the DB (no live Prometheus fetch on
  // every list load) — used_bytes is the cumulative usage kept in sync by
  // syncUsageJob, the best available figure without a live metrics call.
  if (typeof key.used_bytes === "number") return key.used_bytes / 1024 / 1024 / 1024;
  return 0;
}

function getOrderRemainingGb(key?: VpnKey | null) {
  if (!key) return null;
  if (typeof key.order_total_remaining_gb === "number") return key.order_total_remaining_gb;
  if (key.remaining_gb_30d != null) return Number(key.remaining_gb_30d);
  if (typeof key.data_limit_bytes === "number" && typeof key.used_bytes === "number") {
    return Math.max((key.data_limit_bytes - key.used_bytes) / 1024 / 1024 / 1024, 0);
  }
  return null;
}

function getOrderLimitGb(key?: VpnKey | null) {
  if (!key) return 0;
  if (typeof key.data_limit_gb === "number") return key.data_limit_gb;
  if (typeof key.data_limit_bytes === "number") return key.data_limit_bytes / 1024 / 1024 / 1024;
  return 0;
}

function getActiveKeyForOrder(order: Order): VpnKey | undefined {
  return order.keys?.find((key) => key.status === "active");
}

function getAnyKeyForOrder(order: Order): VpnKey | undefined {
  return getActiveKeyForOrder(order) ?? order.keys?.[0];
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
    <div className="rounded-md border border-border bg-card px-2.5 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-xs font-semibold text-foreground">{value}</div>
    </div>
  );
}

export function OrdersTable({
  plans,
  scopeFilters = {},
  title = "Orders",
  description = "",
  initialRowsPerPage = 10,
  rowsPerPageOptions = [5, 10, 20, 50],
  showSearch = true,
  showFilters = true,
  compactMobile = false,
  compact = false,
  showCustomerTypeFilter = false,
  resetTrigger,
  headerAction,
}: Props) {
  const mobile = useMediaQuery("(max-width: 899px)");

  const [loadingId, setLoadingId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filter, setFilter] = useState<OrderFilter>("all");
  const [customerTypeFilter, setCustomerTypeFilter] = useState<CustomerTypeFilter>("all");
  const [planTypeFilter, setPlanTypeFilter] = useState<PlanTypeFilter>("all");
  const [rowsPerPage, setRowsPerPage] = useState(initialRowsPerPage);
  const [filterCounts, setFilterCounts] = useState({
    all: 0,
    pending: 0,
    active: 0,
    expiring: 0,
    overdue: 0,
    expired: 0,
    stopped: 0,
  });
  const [countsRefreshKey, setCountsRefreshKey] = useState(0);

  // Debounce search so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const scopeFiltersKey = JSON.stringify(scopeFilters);
  const queryFilters = useMemo(() => {
    const params: Record<string, string> = { ...scopeFilters };
    if (filter !== "all") params.status = filter;
    if (customerTypeFilter !== "all") params.customer_type = customerTypeFilter;
    // Backend order_type column is "trial" | "purchase" — "paid" here is a
    // dashboard-only label for "purchase" (anything that isn't a trial).
    if (planTypeFilter !== "all") params.order_type = planTypeFilter === "paid" ? "purchase" : "trial";
    if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
    return params;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeFiltersKey, filter, customerTypeFilter, planTypeFilter, debouncedSearch]);

  const {
    data: pagedOrders,
    total,
    page,
    totalPages,
    loading,
    error: loadError,
    setPage,
    refresh,
  } = usePaginatedTable<Order>("/reseller/orders", queryFilters, rowsPerPage);

  useEffect(() => {
    if (loadError) setError(loadError);
  }, [loadError]);

  const [renewDialog, setRenewDialog] = useState<RenewDialogState>({
    open: false,
    order: null,
    planId: "",
    action: "renew",
    idempotencyKey: "",
  });
  const [stopDialog, setStopDialog] = useState<StopDialogState>({ open: false, order: null });
  const [serverSwitchDialog, setServerSwitchDialog] = useState<{ open: boolean; order: Order | null }>({
    open: false,
    order: null,
  });
  const [renewError, setRenewError] = useState("");
  const [stopError, setStopError] = useState("");
  const [detailsDialog, setDetailsDialog] = useState<DetailsDialogState>({ open: false, order: null });
  // The details dialog captures `order` once when opened. If the underlying
  // order changes afterward (e.g. a server switch retires the old key and
  // provisions a new one), that snapshot goes stale — the dialog would keep
  // showing the pre-switch key. Always re-resolve against the freshest
  // fetched data so the dialog can never show outdated key/server info.
  const liveDetailsOrder = useMemo(() => {
    if (!detailsDialog.order) return null;
    return pagedOrders.find((o) => o.id === detailsDialog.order!.id) ?? detailsDialog.order;
  }, [detailsDialog.order, pagedOrders]);
  const [accessKeyDialog, setAccessKeyDialog] = useState<AccessKeyDialogState>({
    open: false,
    customerName: "",
    accessUrl: "",
    ssconfUrl: "",
    serverCount: 0,
    actionType: "activate",
  });

  const tableRef = useRef<HTMLDivElement>(null);

  const scrollToTableTop = useCallback(() => {
    setTimeout(() => {
      tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }, []);

  const openRenewDialog = useCallback(
    (order: Order, action: "extend" | "renew") => {
      setRenewDialog({
        open: true,
        order,
        planId: order.plan_id,
        action,
        idempotencyKey: crypto.randomUUID(),
      });
    },
    []
  );

  const closeRenewDialog = useCallback(() => {
    setRenewDialog({
      open: false,
      order: null,
      planId: "",
      action: "renew",
      idempotencyKey: "",
    });
  }, []);

  const handlePageChange = useCallback(
    (newPage: number) => {
      setPage(newPage);
      scrollToTableTop();
    },
    [scrollToTableTop, setPage]
  );

  const refreshAll = useCallback(async () => {
    await refresh();
    setCountsRefreshKey((n) => n + 1);
  }, [refresh]);

  useEffect(() => {
    if (!resetTrigger) return;
    setPage(1);
    setCountsRefreshKey((n) => n + 1);
    scrollToTableTop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetTrigger]);

  // Filter-tab counts span every status, independent of the currently
  // selected tab/search, so they're fetched separately from the paginated
  // list — via one consolidated /counts request rather than one request per
  // tab, which was enough concurrent load to saturate the connection pool.
  useEffect(() => {
    if (!showFilters) return;
    let cancelled = false;

    async function loadCounts() {
      try {
        const res = await api.get("/reseller/orders/counts", { params: scopeFilters });
        if (cancelled) return;
        setFilterCounts(res.data.status);
      } catch {
        // Tab counts are a convenience summary — a failure here shouldn't block the list.
      }
    }

    void loadCounts();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showFilters, scopeFiltersKey, countsRefreshKey]);

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
      await refreshAll();

      const data = res?.data;
      const accessUrl: string = getPreferredAccessUrlFromPayload(data);
      const customerName = order.customer?.full_name || "Customer";

      if (accessUrl) {
        setAccessKeyDialog({
          open: true,
          customerName,
          accessUrl,
          ssconfUrl: data?.ssconf_url || "",
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

    const { order, action, planId, idempotencyKey } = renewDialog;
    const endpoint = action === "extend" ? "extend" : "renew";

    try {
      setLoadingId(`${order.id}:${action}`);
      setError("");
      setMessage("");

      const res = await api.post(`/reseller/order-actions/${order.id}/${endpoint}`, {
        plan_id: planId || order.plan_id,
        idempotency_key: idempotencyKey || crypto.randomUUID(),
      });

      closeRenewDialog();
      await refreshAll();

      const data = res?.data;
      const accessUrl: string = getPreferredAccessUrlFromPayload(data);
      const customerName = order.customer?.full_name || "Customer";

      if (action === "renew" && accessUrl) {
        setAccessKeyDialog({
          open: true,
          customerName,
          accessUrl,
          ssconfUrl: data?.ssconf_url || "",
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
      await refreshAll();
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
        limit={getOrderLimitGb(key)}
        remaining={getOrderRemainingGb(key)}
        connections={Number(key.recent_connections_24h || 0)}
      />
    );
  };

  const renderAccessDetails = (order: Order) => {
    const key = getAnyKeyForOrder(order);
    const dynamicUrl =
      key?.dynamic_access_url ||
      key?.ssconf_url ||
      key?.preferred_access_url ||
      "";
    const items = [
      dynamicUrl
        ? {
            label: key?.dynamic_access_url ? "Dynamic access key" : "Subscription endpoint",
            value: dynamicUrl,
          }
        : null,
      key?.access_url && key.access_url !== dynamicUrl
        ? { label: "Original Outline key", value: key.access_url }
        : null,
    ].filter(Boolean) as Array<{ label: string; value: string }>;

    if (items.length === 0) {
      return (
        <div className="rounded-md border border-dashed border-border bg-muted/55 px-2.5 py-3 text-xs text-muted-foreground">
          No access key is linked to this order yet.
        </div>
      );
    }

    return (
      <div className="space-y-1.5">
        {items.map((item) => (
          <div key={item.label} className="rounded-md border border-border bg-card p-2">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  {item.label}
                </div>
                <div className="break-all rounded-md bg-muted/65 px-2 py-1.5 font-mono text-[10px] leading-snug text-foreground">
                  {item.value}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                title={`Copy ${item.label.toLowerCase()}`}
                onClick={() => void copyText(item.value, item.label)}
              >
                <Copy size={13} />
              </Button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderAccessCell = (order: Order) => {
    const key = getAnyKeyForOrder(order);
    const accessUrl = getPreferredAccessUrl(key);

    if (!accessUrl) {
      return <span className="text-muted-foreground">-</span>;
    }

    return (
      <div className="flex items-center justify-center">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          title="Copy access key"
          onClick={() => void copyText(accessUrl, "Access key")}
        >
          <Copy size={12} />
        </Button>
      </div>
    );
  };

  const renderActions = (order: Order) => {
    const isTelegramCustomer = isTelegramManagedOrder(order);
    const key = getAnyKeyForOrder(order);
    const accessUrl = getPreferredAccessUrl(key);
    const actions: ActionMenuItem[] = [
      {
        label: "View details",
        icon: <Info size={14} />,
        onSelect: () => setDetailsDialog({ open: true, order }),
      },
    ];

    if (accessUrl) {
      actions.push({
        label: "Copy dynamic key",
        icon: <Copy size={14} />,
        onSelect: () => void copyText(accessUrl, "Access key"),
      });
    }

    if (!isTelegramCustomer) {
      if (
        order.status === "pending" &&
        order.payment_status === "paid" &&
        order.review_status !== "rejected"
      ) {
        actions.push({
          label: loadingId === `${order.id}:activate` ? "Activating..." : "Activate",
          icon: <KeyRound size={14} />,
          disabled: loadingId === `${order.id}:activate`,
          onSelect: () => void runActivate(order),
        });
      }

      if (order.status === "active") {
        actions.push(
          {
            label: loadingId === `${order.id}:extend` ? "Extending..." : "Extend",
            icon: <RefreshCw size={14} />,
            disabled: loadingId === `${order.id}:extend`,
            onSelect: () => openRenewDialog(order, "extend"),
          },
          {
            label: "Stop",
            icon: <Ban size={14} />,
            destructive: true,
            onSelect: () => setStopDialog({ open: true, order }),
          }
        );
      }

      if (
        (order.status === "stopped" || order.status === "expired") &&
        order.review_status !== "rejected"
      ) {
        actions.push({
          label: loadingId === `${order.id}:renew` ? "Renewing..." : "Renew",
          icon: <RefreshCw size={14} />,
          disabled: loadingId === `${order.id}:renew`,
          onSelect: () => openRenewDialog(order, "renew"),
        });
      }
    }

    // Server switching is a reseller-initiated emergency action, independent
    // of whether the order is self-service (miniapp/bot) or manually
    // managed — only paid, currently-active orders are eligible. Trial
    // customers stay on trial-tier servers via the normal miniapp flow.
    // Backend enforces this too; the button is just hidden here to avoid a
    // guaranteed-to-fail click.
    if (order.status === "active" && order.order_type !== "trial" && !order.plan?.is_trial) {
      actions.push({
        label: "Switch Server",
        icon: <ServerIcon size={14} />,
        onSelect: () => setServerSwitchDialog({ open: true, order }),
      });
    }

    return (
      <div className="flex items-center justify-end">
        <ActionMenu items={actions} className={compact ? "h-6 w-6" : "h-7 w-7"} />
      </div>
    );

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
                    openRenewDialog(order, "extend")
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
                  openRenewDialog(order, "renew")
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
          className={compact ? "h-6 w-6" : "h-8 w-8"}
          title="Details"
          onClick={() => setDetailsDialog({ open: true, order })}
        >
          <Info size={compact ? 13 : 18} />
        </Button>
      </div>
    );
  };

  // Full skeleton only on the true first load (no rows yet at all) — matching
  // CustomersPage's pattern. A later refetch (debounced search, filter tab,
  // pagination) keeps the existing rows and the search input mounted instead
  // of unmounting the whole card, which was making every search keystroke
  // (after the debounce settled) look like the page reloaded and dropping
  // focus out of the search box mid-type.
  if (loading && pagedOrders.length === 0) return <LoadingView />;

  return (
    <>
      <Card
        ref={tableRef}
        className={compact ? "scroll-mt-14 p-2.5 space-y-2" : "scroll-mt-16 p-3 md:p-4 space-y-3"}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className={compact ? "text-[13px] font-bold font-display tracking-tight text-foreground" : "font-display text-[18px] font-black tracking-tight text-foreground"}>
              {title}
            </h2>
            {!compactMobile && description ? (
              <p className="mt-0.5 text-[11px] text-muted-foreground">{description}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {showFilters ? (
              <div className="inline-flex rounded-md border border-border bg-muted/55 p-0.5">
                <button
                  type="button"
                  onClick={() => setPlanTypeFilter("all")}
                  className={cn(
                    "h-7 rounded px-2 text-[11px] font-semibold transition-colors",
                    planTypeFilter === "all"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  All plans
                </button>
                <button
                  type="button"
                  onClick={() => setPlanTypeFilter("paid")}
                  className={cn(
                    "inline-flex h-7 items-center gap-1 rounded px-2 text-[11px] font-semibold transition-colors",
                    planTypeFilter === "paid"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Crown size={12} />
                  Paid
                </button>
                <button
                  type="button"
                  onClick={() => setPlanTypeFilter("trial")}
                  className={cn(
                    "inline-flex h-7 items-center gap-1 rounded px-2 text-[11px] font-semibold transition-colors",
                    planTypeFilter === "trial"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Gift size={12} />
                  Trial
                </button>
              </div>
            ) : null}
            {showCustomerTypeFilter ? (
              <div className="inline-flex rounded-md border border-border bg-muted/55 p-0.5">
                <button
                  type="button"
                  onClick={() => setCustomerTypeFilter("all")}
                  className={cn(
                    "h-7 rounded px-2 text-[11px] font-semibold transition-colors",
                    customerTypeFilter === "all"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setCustomerTypeFilter("normal")}
                  className={cn(
                    "inline-flex h-7 items-center gap-1 rounded px-2 text-[11px] font-semibold transition-colors",
                    customerTypeFilter === "normal"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <UserRound size={12} />
                  Normal
                </button>
                <button
                  type="button"
                  onClick={() => setCustomerTypeFilter("telegram")}
                  className={cn(
                    "inline-flex h-7 items-center gap-1 rounded px-2 text-[11px] font-semibold transition-colors",
                    customerTypeFilter === "telegram"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Send size={12} />
                  Telegram
                </button>
              </div>
            ) : null}
            {headerAction ? (
              <Button
                variant="primary"
                size="sm"
                leftIcon={headerAction.icon ?? <Plus size={14} />}
                onClick={headerAction.onClick}
                disabled={headerAction.disabled}
              >
                {headerAction.label}
              </Button>
            ) : null}
          </div>
        </div>

        {/* Search */}
        {showSearch ? (
          <div className="relative">
            {loading && pagedOrders.length > 0 ? (
              <Loader2
                size={14}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground"
              />
            ) : (
              <Search
                size={14}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
            )}
            <Input
              className="h-8 pl-8 text-xs"
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
          <div className={cn("space-y-2 transition-opacity", loading && pagedOrders.length > 0 && "opacity-60")}>
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
          <Table className={cn("table-fixed text-xs transition-opacity", loading && pagedOrders.length > 0 && "opacity-60")}>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-8 px-2 text-[10px]" style={{ width: "20%" }}>Customer</TableHead>
                <TableHead className="h-8 px-2 text-[10px]" style={{ width: "12%" }}>Plan</TableHead>
                <TableHead className="h-8 px-2 text-[10px]" style={{ width: "9%" }}>Status</TableHead>
                <TableHead className="h-8 px-2 text-[10px]" style={{ width: "8%" }}>Payment</TableHead>
                <TableHead className="h-8 px-2 text-[10px]" style={{ width: "12%" }}>Expiry</TableHead>
                <TableHead className="h-8 px-2 text-[10px]" style={{ width: "9%" }}>Usage</TableHead>
                <TableHead className="h-8 px-2 text-[10px]" style={{ width: "13%" }}>Access</TableHead>
                <TableHead className="h-8 px-2 text-[10px]" style={{ width: "13%" }}>Price</TableHead>
                <TableHead className="h-8 px-1 text-[10px]" style={{ width: "2%" }} aria-label="Actions" />
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
                  const key = getActiveKeyForOrder(order);
                  const expirySoon = isExpiringSoon(order.expiry_date, 7) && order.status === "active";
                  return (
                    <TableRow key={order.id}>
                      <TableCell className="px-2 py-2 text-xs">
                        <div className="truncate text-xs font-medium">
                          {order.customer?.full_name || "Unknown"}
                        </div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          {order.customer?.telegram_username || order.customer?.phone || "-"}
                        </div>
                      </TableCell>
                      <TableCell className="px-2 py-2 text-xs">
                        <div className="truncate text-xs font-medium">{order.plan?.name || "-"}</div>
                      </TableCell>
                      <TableCell className="px-2 py-2 text-xs">
                        <StatusBadge status={order.status} />
                      </TableCell>
                      <TableCell className="px-2 py-2 text-xs">
                        <StatusBadge status={getPaymentDisplayStatus(order)} />
                      </TableCell>
                      <TableCell className="px-2 py-2 text-xs">
                        <div className="text-xs">{formatDate(order.expiry_date)}</div>
                        <div className={`text-[11px]${expirySoon ? " text-destructive" : " text-muted-foreground"}`}>
                          {formatDaysLeft(order.expiry_date)}
                        </div>
                      </TableCell>
                      <TableCell className="px-2 py-2 text-xs">
                        <div className="text-xs">
                          {key ? formatUsageGb(getOrderUsageGb(key)) : "-"}
                        </div>
                      </TableCell>
                      <TableCell className="px-2 py-2 text-xs">
                        {renderAccessCell(order)}
                      </TableCell>
                      <TableCell className="px-2 py-2 text-xs">
                        <div className="whitespace-nowrap text-xs font-bold">{formatMMK(order.price_mmk)}</div>
                      </TableCell>
                      <TableCell className="px-2 py-2 text-xs">{renderActions(order)}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        )}

        {/* Pagination footer */}
        <div className="h-px bg-border" />
        <div className={compact ? "flex flex-col sm:flex-row items-center justify-between gap-2" : "flex flex-col sm:flex-row items-center justify-between gap-3"}>
          <div className={compact ? "flex items-center gap-1.5 text-xs text-muted-foreground" : "flex items-center gap-2 text-sm text-muted-foreground"}>
            <span>Rows</span>
            <div className={compact ? "w-[62px] shrink-0" : "w-[72px] shrink-0"}>
              <Select
                value={rowsPerPage}
                onChange={(e) => setRowsPerPage(Number(e.target.value))}
                className={compact ? "h-7 text-xs" : "h-8"}
              >
                {rowsPerPageOptions.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </Select>
            </div>
            <span>
              {total === 0
                ? "0–0"
                : `${(page - 1) * rowsPerPage + 1}–${Math.min(page * rowsPerPage, total)}`}{" "}
              of {total}
            </span>
          </div>
          <TablePagination page={page} count={totalPages} onChange={handlePageChange} />
        </div>
      </Card>

      {/* ── Renew / Extend dialog ── */}
      <Dialog
        open={renewDialog.open}
        onClose={closeRenewDialog}
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
            onClick={closeRenewDialog}
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

      {/* ── Switch server dialog ── */}
      <ServerSwitchDialog
        order={serverSwitchDialog.order}
        open={serverSwitchDialog.open}
        onClose={() => setServerSwitchDialog({ open: false, order: null })}
        onSwitched={(order, server) => {
          setMessage(
            `Switched ${order.customer?.full_name || "customer"} to ${server.display_city || server.name}.`
          );
          void refreshAll();
        }}
      />

      {/* ── Details dialog ── */}
      <Dialog
        open={detailsDialog.open}
        onClose={() => setDetailsDialog({ open: false, order: null })}
        size="lg"
      >
        <DialogHeader className="px-4 py-3 pb-2">
          <DialogTitle className="text-base">Order Details</DialogTitle>
          <DialogClose className="right-3 top-3" />
        </DialogHeader>
        <DialogBody className="max-h-none overflow-visible px-4 py-2">
          {detailsDialog.open && liveDetailsOrder ? (
            <div className="rounded-lg border border-border bg-muted/35 p-3 shadow-[0_10px_28px_rgba(16,24,40,0.08)]">
              <div className="mb-2.5 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-sm font-black text-primary-foreground">
                    {(liveDetailsOrder.customer?.full_name || "C").slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold">
                      {liveDetailsOrder.customer?.full_name || "-"}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {liveDetailsOrder.customer?.phone ||
                        liveDetailsOrder.customer?.telegram_username ||
                        "No contact info"}
                    </div>
                  </div>
                </div>
                <StatusBadge status={liveDetailsOrder.status} />
              </div>

              <div className="grid gap-2 lg:grid-cols-[0.82fr_1.18fr]">
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <DetailItem label="Plan" value={liveDetailsOrder.plan?.name || "-"} />
                    <DetailItem
                      label="Payment"
                      value={<StatusBadge status={getPaymentDisplayStatus(liveDetailsOrder)} />}
                    />
                    <DetailItem label="Price" value={formatMMK(liveDetailsOrder.price_mmk)} />
                    <DetailItem label="Expiry" value={formatDate(liveDetailsOrder.expiry_date)} />
                    <DetailItem
                      label="Server"
                      value={
                        (() => {
                          const server = getActiveKeyForOrder(liveDetailsOrder)?.server;
                          if (!server) return "-";
                          return (
                            <span className="inline-flex items-center gap-1.5">
                              <FlagIcon flagEmoji={server.flag_emoji} size={16} />
                              <span className="truncate">
                                {server.display_city || server.display_country || server.name}
                              </span>
                            </span>
                          );
                        })()
                      }
                    />
                    <div className="col-span-2">
                      <DetailItem
                        label="Remaining"
                        value={formatDaysLeft(liveDetailsOrder.expiry_date)}
                      />
                    </div>
                  </div>

                  <div className="rounded-md border border-border bg-card p-2.5">
                    <div className="mb-1.5 text-xs font-bold">Usage</div>
                    {renderUsageCompact(getActiveKeyForOrder(liveDetailsOrder))}
                  </div>
                </div>

                <div className="rounded-md border border-border bg-card p-2.5">
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold">
                    <KeyRound size={13} />
                    Dynamic Access
                  </div>
                  {renderAccessDetails(liveDetailsOrder)}
                </div>
              </div>

              <div className="mt-2 flex items-center justify-end gap-2">
                {liveDetailsOrder.status === "active" &&
                liveDetailsOrder.order_type !== "trial" &&
                !liveDetailsOrder.plan?.is_trial ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDetailsDialog({ open: false, order: null });
                      setServerSwitchDialog({ open: true, order: liveDetailsOrder });
                    }}
                  >
                    <ServerIcon size={14} className="mr-1.5" />
                    Switch Server
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDetailsDialog({ open: false, order: null })}
                >
                  Close
                </Button>
              </div>
            </div>
          ) : null}
        </DialogBody>
      </Dialog>
      {/* ── Access key dialog ── */}
      <Dialog
        open={accessKeyDialog.open}
        onClose={() =>
          setAccessKeyDialog({
            open: false,
            customerName: "",
            accessUrl: "",
            ssconfUrl: "",
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
              {accessKeyDialog.serverCount ? (
                <div className="text-sm text-muted-foreground">
                  Assigned servers: {accessKeyDialog.serverCount}
                </div>
              ) : null}
              {accessKeyDialog.accessUrl ? (
                <div>
                  <div className="text-xs text-muted-foreground">Dynamic Outline key</div>
                  <div className="break-all font-mono text-[13px] font-medium text-primary leading-relaxed">
                    {accessKeyDialog.accessUrl}
                  </div>
                </div>
              ) : null}
              {accessKeyDialog.ssconfUrl ? (
                <div>
                  <div className="text-xs text-muted-foreground">Dynamic JSON endpoint</div>
                  <div className="break-all font-mono text-[13px] font-medium text-primary leading-relaxed">
                    {accessKeyDialog.ssconfUrl}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="icon"
                title="Copy dynamic key"
                onClick={() =>
                  void copyText(
                    accessKeyDialog.accessUrl || accessKeyDialog.ssconfUrl || "",
                    "Dynamic key"
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
              Share the dynamic key with the customer. It keeps working when their active server changes.
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
                ssconfUrl: "",
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
                accessKeyDialog.accessUrl || accessKeyDialog.ssconfUrl || "",
                "Dynamic key"
              );
              setAccessKeyDialog({
                open: false,
                customerName: "",
                accessUrl: "",
                ssconfUrl: "",
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
