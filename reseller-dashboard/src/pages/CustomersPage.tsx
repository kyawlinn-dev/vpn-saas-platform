import { useEffect, useMemo, useState } from "react";
import {
  Copy,
  ExternalLink,
  Info,
  Search,
  Send,
  UserRound,
  Users,
} from "lucide-react";
import { useNavigate } from "react-router";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/action-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogBody, DialogClose, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "../lib/api";
import { usePaginatedTable } from "../hooks/usePaginatedTable";
import { formatDate, formatDaysLeft, formatMMK, isExpiringSoon } from "../lib/format";
import type { EnrichedCustomer, Order, VpnKey } from "../types/api";

type CustomerFilter = "all" | "normal" | "telegram" | "active" | "expiring" | "inactive";

interface CustomerSummary {
  customer: EnrichedCustomer;
  orders: Order[];
  activeOrder?: Order;
  latestOrder?: Order;
  activeKey?: VpnKey;
  totalPaid: number;
  totalOrders: number;
  status: "active" | "expiring" | "inactive";
  customerType: "normal" | "telegram";
}

function getAccessUrl(key?: VpnKey | null) {
  return key?.dynamic_access_url || key?.ssconf_url || key?.preferred_access_url || key?.access_url || "";
}

function toSummary(customer: EnrichedCustomer): CustomerSummary {
  const orders = customer.orders ?? [];
  const activeOrder = customer.active_order ?? undefined;
  const latestOrder = orders[0];
  const activeKey =
    (customer.keys ?? []).find((key) => key.status === "active") || customer.keys?.[0];
  const totalPaid = orders.reduce((sum, order) => sum + Number(order.total_paid_mmk || 0), 0);
  const status: CustomerSummary["status"] = activeOrder
    ? isExpiringSoon(activeOrder.expiry_date, 7)
      ? "expiring"
      : "active"
    : "inactive";

  return {
    customer,
    orders,
    activeOrder,
    latestOrder,
    activeKey,
    totalPaid,
    totalOrders: orders.length,
    status,
    customerType: customer.customer_type,
  };
}

function initials(name?: string | null) {
  const letters = String(name || "C")
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  return letters || "C";
}

function TypeBadge({ type }: { type: "normal" | "telegram" }) {
  return type === "telegram" ? (
    <Badge variant="info" className="gap-1">
      <Send size={12} />
      Telegram
    </Badge>
  ) : (
    <Badge variant="default" className="gap-1">
      <UserRound size={12} />
      Normal
    </Badge>
  );
}

function CustomerStatusBadge({ status }: { status: CustomerSummary["status"] }) {
  if (status === "active") return <Badge variant="success">Active</Badge>;
  if (status === "expiring") return <Badge variant="warning">Expiring</Badge>;
  return <Badge variant="default">Inactive</Badge>;
}

const FILTER_TO_PARAMS: Record<CustomerFilter, Record<string, string>> = {
  all: {},
  normal: { customer_type: "normal" },
  telegram: { customer_type: "telegram" },
  active: { status: "active" },
  expiring: { status: "expiring" },
  inactive: { status: "inactive" },
};

export function CustomersPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [filter, setFilter] = useState<CustomerFilter>("all");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSummary | null>(null);
  const [message, setMessage] = useState("");
  const [counts, setCounts] = useState({
    total: 0,
    normal: 0,
    telegram: 0,
    active: 0,
    expiring: 0,
    inactive: 0,
  });

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const queryFilters = useMemo(() => {
    const params: Record<string, string> = { ...FILTER_TO_PARAMS[filter] };
    if (debouncedQuery.trim()) params.search = debouncedQuery.trim();
    return params;
  }, [filter, debouncedQuery]);

  const {
    data: customers,
    total,
    page,
    totalPages,
    loading,
    setPage,
  } = usePaginatedTable<EnrichedCustomer>("/reseller/customers", queryFilters, 20);

  const summaries = useMemo(() => customers.map(toSummary), [customers]);

  useEffect(() => {
    let cancelled = false;

    async function loadCounts() {
      try {
        const res = await api.get("/reseller/customers/counts");
        if (cancelled) return;
        setCounts(res.data);
      } catch {
        // Tab counts are a convenience summary — a failure here shouldn't block the list.
      }
    }

    void loadCounts();
    return () => {
      cancelled = true;
    };
  }, []);

  const copyText = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    setMessage(`${label} copied.`);
    setTimeout(() => setMessage(""), 2500);
  };

  const filterItems: Array<{ value: CustomerFilter; label: string; count: number }> = [
    { value: "all", label: "All", count: counts.total },
    { value: "normal", label: "Normal", count: counts.normal },
    { value: "telegram", label: "Telegram", count: counts.telegram },
    { value: "active", label: "Active", count: counts.active },
    { value: "expiring", label: "Expiring", count: counts.expiring },
    { value: "inactive", label: "Inactive", count: counts.inactive },
  ];

  const actionsFor = (item: CustomerSummary): ActionMenuItem[] => {
    const accessUrl = getAccessUrl(item.activeKey);
    return [
      {
        label: "View customer",
        icon: <Info size={14} />,
        onSelect: () => setSelectedCustomer(item),
      },
      {
        label: "Copy active key",
        icon: <Copy size={14} />,
        disabled: !accessUrl,
        onSelect: () => void copyText(accessUrl, "Active key"),
      },
      {
        label: "Open orders",
        icon: <ExternalLink size={14} />,
        onSelect: () => navigate("/app/orders"),
      },
    ];
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-[18px] font-black tracking-tight text-foreground">
            Customers
          </h1>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Customer profiles derived from orders, payment history, subscriptions, and active keys.
          </p>
        </div>
        <Badge variant="default" className="w-fit gap-1">
          <Users size={13} />
          {total} total
        </Badge>
      </div>

      {message ? (
        <div className="rounded-md border border-success/25 bg-success/10 px-3 py-2 text-xs text-[color:var(--success)]">
          {message}
        </div>
      ) : null}

      <Card className="space-y-3 p-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-[420px]">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              className="h-8 pl-8 text-xs"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search customer, Telegram, phone..."
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {filterItems.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setFilter(item.value)}
                className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  filter === item.value
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:bg-secondary"
                }`}
              >
                {item.label} <span className="text-[11px] opacity-70">{item.count}</span>
              </button>
            ))}
          </div>
        </div>

        {loading && summaries.length === 0 ? (
          <div className="h-64 rounded-md bg-secondary animate-pulse" />
        ) : summaries.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-muted/55 px-4 py-8 text-center text-sm text-muted-foreground">
            No customers match this filter.
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <Table className="table-fixed text-xs">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-8 px-2 text-[10px]" style={{ width: "24%" }}>Customer</TableHead>
                    <TableHead className="h-8 px-2 text-[10px]" style={{ width: "10%" }}>Type</TableHead>
                    <TableHead className="h-8 px-2 text-[10px]" style={{ width: "10%" }}>Status</TableHead>
                    <TableHead className="h-8 px-2 text-[10px]" style={{ width: "16%" }}>Latest plan</TableHead>
                    <TableHead className="h-8 px-2 text-[10px]" style={{ width: "13%" }}>Expiry</TableHead>
                    <TableHead className="h-8 px-2 text-[10px]" style={{ width: "10%" }}>Orders</TableHead>
                    <TableHead className="h-8 px-2 text-[10px]" style={{ width: "13%" }}>Total paid</TableHead>
                    <TableHead className="h-8 px-1" style={{ width: "4%" }} aria-label="Actions" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summaries.map((item) => (
                    <TableRow key={item.customer.id}>
                      <TableCell className="px-2 py-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-primary text-[10px] font-black text-primary-foreground">
                            {initials(item.customer.full_name)}
                          </span>
                          <div className="min-w-0">
                            <div className="truncate text-xs font-semibold text-foreground">
                              {item.customer.full_name}
                            </div>
                            <div className="truncate text-[11px] text-muted-foreground">
                              {item.customer.telegram_username || item.customer.phone || "-"}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="px-2 py-2"><TypeBadge type={item.customerType} /></TableCell>
                      <TableCell className="px-2 py-2"><CustomerStatusBadge status={item.status} /></TableCell>
                      <TableCell className="px-2 py-2">
                        <div className="truncate text-xs font-medium">{item.latestOrder?.plan?.name || "-"}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {item.latestOrder ? formatMMK(item.latestOrder.price_mmk) : "-"}
                        </div>
                      </TableCell>
                      <TableCell className="px-2 py-2">
                        <div>{formatDate(item.activeOrder?.expiry_date || item.latestOrder?.expiry_date)}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {formatDaysLeft(item.activeOrder?.expiry_date || item.latestOrder?.expiry_date)}
                        </div>
                      </TableCell>
                      <TableCell className="px-2 py-2">{item.totalOrders}</TableCell>
                      <TableCell className="px-2 py-2">
                        <span className="whitespace-nowrap font-bold">{formatMMK(item.totalPaid)}</span>
                      </TableCell>
                      <TableCell className="px-2 py-2">
                        <div className="flex justify-end">
                          <ActionMenu items={actionsFor(item)} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile cards */}
            <div className="space-y-2 md:hidden">
              {summaries.map((item) => (
                <div key={item.customer.id} className="rounded-lg border border-border bg-card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary text-[11px] font-black text-primary-foreground">
                        {initials(item.customer.full_name)}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-foreground">
                          {item.customer.full_name}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {item.customer.telegram_username || item.customer.phone || "-"}
                        </div>
                      </div>
                    </div>
                    <ActionMenu items={actionsFor(item)} />
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <TypeBadge type={item.customerType} />
                    <CustomerStatusBadge status={item.status} />
                  </div>

                  <div className="mt-2.5 grid grid-cols-3 gap-2 border-t border-border pt-2.5 text-xs">
                    <div>
                      <div className="text-[10px] text-muted-foreground">Latest plan</div>
                      <div className="truncate font-medium">{item.latestOrder?.plan?.name || "-"}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground">Expiry</div>
                      <div>{formatDaysLeft(item.activeOrder?.expiry_date || item.latestOrder?.expiry_date) || "-"}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground">Total paid</div>
                      <div className="whitespace-nowrap font-bold">{formatMMK(item.totalPaid)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-center pt-1">
              <TablePagination page={page} count={totalPages} onChange={setPage} />
            </div>
          </>
        )}
      </Card>

      <Dialog open={Boolean(selectedCustomer)} onClose={() => setSelectedCustomer(null)} size="lg">
        <DialogHeader className="px-4 py-3 pb-2">
          <DialogTitle className="text-base">Customer Profile</DialogTitle>
          <DialogClose className="right-3 top-3" />
        </DialogHeader>
        <DialogBody className="max-h-none overflow-visible px-4 py-3">
          {selectedCustomer ? (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/45 p-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary text-sm font-black text-primary-foreground">
                    {initials(selectedCustomer.customer.full_name)}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold">{selectedCustomer.customer.full_name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {selectedCustomer.customer.telegram_username || selectedCustomer.customer.phone || "No contact"}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap justify-end gap-1.5">
                  <TypeBadge type={selectedCustomer.customerType} />
                  <CustomerStatusBadge status={selectedCustomer.status} />
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-4">
                <Card className="p-2.5">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Orders</div>
                  <div className="mt-1 text-base font-black">{selectedCustomer.totalOrders}</div>
                </Card>
                <Card className="p-2.5">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Total paid</div>
                  <div className="mt-1 text-base font-black">{formatMMK(selectedCustomer.totalPaid)}</div>
                </Card>
                <Card className="p-2.5">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Latest plan</div>
                  <div className="mt-1 truncate text-sm font-bold">{selectedCustomer.latestOrder?.plan?.name || "-"}</div>
                </Card>
                <Card className="p-2.5">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Expiry</div>
                  <div className="mt-1 text-sm font-bold">
                    {formatDaysLeft(selectedCustomer.activeOrder?.expiry_date || selectedCustomer.latestOrder?.expiry_date)}
                  </div>
                </Card>
              </div>

              <Card className="p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-xs font-black">Active Access</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!getAccessUrl(selectedCustomer.activeKey)}
                    leftIcon={<Copy size={13} />}
                    onClick={() => void copyText(getAccessUrl(selectedCustomer.activeKey), "Active key")}
                  >
                    Copy
                  </Button>
                </div>
                {getAccessUrl(selectedCustomer.activeKey) ? (
                  <div className="break-all rounded-md bg-muted/65 px-2 py-1.5 font-mono text-[10px] leading-snug">
                    {getAccessUrl(selectedCustomer.activeKey)}
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-border bg-muted/55 px-3 py-3 text-xs text-muted-foreground">
                    No active key available.
                  </div>
                )}
              </Card>

              <Card className="p-3">
                <h3 className="mb-2 text-xs font-black">Order History</h3>
                <div className="divide-y divide-border rounded-md border border-border">
                  {selectedCustomer.orders.map((order) => (
                    <div key={order.id} className="grid grid-cols-[1fr_90px_90px_110px] items-center gap-2 px-2.5 py-2 text-xs">
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{order.plan?.name || "-"}</div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          {formatDate(order.created_at)} - {formatDaysLeft(order.expiry_date)}
                        </div>
                      </div>
                      <StatusBadge status={order.status} />
                      <StatusBadge status={order.order_type === "trial" ? "trial" : order.payment_status} />
                      <div className="whitespace-nowrap text-right font-bold">{formatMMK(order.price_mmk)}</div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          ) : null}
        </DialogBody>
      </Dialog>
    </div>
  );
}
