import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  Clock3,
  ClipboardList,
  CreditCard,
  ExternalLink,
  Plus,
  ReceiptText,
  Send,
  Settings,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { useScopedDashboard } from "../hooks/useScopedDashboard";
import { formatDate, formatDaysLeft, formatMMK, isExpiringSoon } from "../lib/format";
import { CreateOrderDialog } from "../components/CreateOrderDialog";
import { OrdersTable } from "../components/OrdersTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import type { Order } from "../types/api";
import type { OrderPayment } from "../types/api";

function OverviewLoading() {
  return (
    <div className="space-y-2.5">
      <div className="flex justify-between items-center gap-3">
        <div className="h-6 w-28 rounded-md bg-secondary animate-pulse" />
        <div className="h-8 w-28 rounded-md bg-secondary animate-pulse" />
      </div>
      <div className="grid gap-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 rounded-lg bg-secondary animate-pulse" />
        ))}
      </div>
      <div className="grid gap-2 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="h-44 rounded-lg bg-secondary animate-pulse" />
        <div className="h-44 rounded-lg bg-secondary animate-pulse" />
      </div>
    </div>
  );
}

function isToday(value?: string | null) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return date.toDateString() === now.toDateString();
}

function isThisMonth(value?: string | null) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function isConfirmedAppliedPayment(payment: OrderPayment) {
  return (
    payment.review_status === "confirmed" &&
    (!payment.apply_status || payment.apply_status === "applied")
  );
}

function getConfirmedAppliedPayments(orders: Order[]) {
  return orders.flatMap((order) => order.payments || []).filter(isConfirmedAppliedPayment);
}

function revenueFromPayments(payments: OrderPayment[], predicate: (value?: string | null) => boolean) {
  return payments.reduce(
    (sum, payment) => sum + (predicate(payment.created_at) ? Number(payment.amount_mmk || 0) : 0),
    0
  );
}

function legacyRevenueFromOrders(orders: Order[], predicate: (value?: string | null) => boolean) {
  return orders.reduce((sum, order) => {
    const hasLedgerRows = Boolean(order.payments?.length);
    if (hasLedgerRows || order.order_type !== "purchase" || order.review_status !== "confirmed") {
      return sum;
    }
    return sum + (predicate(order.created_at) ? Number(order.total_paid_mmk || 0) : 0);
  }, 0);
}

function isTelegramManagedOrder(order: Order) {
  const source = String(order.source || "").toLowerCase();
  return (
    order.customer?.customer_type === "telegram" ||
    source === "miniapp" ||
    source === "bot"
  );
}

function sortNewest(a: Order, b: Order) {
  return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
}

function getInitials(value?: string | null) {
  const source = value?.trim() || "Customer";
  const letters = source
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .join("")
    .toUpperCase()
    .slice(0, 2);
  return letters || "C";
}

function KpiCard({
  label,
  value,
  caption,
  icon,
  tone = "violet",
}: {
  label: string;
  value: string | number;
  caption: string;
  icon: ReactNode;
  tone?: "violet" | "cyan" | "emerald" | "amber" | "rose";
}) {
  const styles = {
    violet: "bg-primary/15 text-primary",
    cyan: "bg-[#161616]/8 text-[#161616]",
    emerald: "bg-success/10 text-[color:var(--success)]",
    amber: "bg-warning/10 text-[color:var(--warning)]",
    rose: "bg-destructive/10 text-destructive",
  };

  return (
    <Card className="p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-1.5 truncate font-display text-[17px] font-black leading-none text-foreground">
            {value}
          </p>
        </div>
        <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-md", styles[tone])}>
          {icon}
        </span>
      </div>
      <p className="mt-1.5 truncate text-[10px] text-muted-foreground">{caption}</p>
    </Card>
  );
}

function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h2 className="font-display text-[13px] font-black tracking-tight text-foreground">
        {title}
      </h2>
      {action}
    </div>
  );
}

function EmptyPanel({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-muted/55 px-3 py-3.5 text-center text-[11px] text-muted-foreground">
      {children}
    </div>
  );
}

export function OverviewPage() {
  const navigate = useNavigate();
  const { orders, keys, plans, loading, error, refresh } = useScopedDashboard();
  const [openCreateModal, setOpenCreateModal] = useState(false);
  const [orderResetTrigger, setOrderResetTrigger] = useState(0);

  const initialLoading =
    loading && orders.length === 0 && plans.length === 0 && keys.length === 0;

  const overview = useMemo(() => {
    const activeOrders = orders.filter((item) => item.status === "active");
    const pendingOrders = orders.filter((item) => item.status === "pending");
    const telegramReviewOrders = orders
      .filter(
        (item) =>
          isTelegramManagedOrder(item) &&
          item.order_type === "purchase" &&
          item.review_status === "pending_review"
      )
      .sort(sortNewest);
    const expiringOrders = orders
      .filter(
        (item) =>
          ["active", "overdue"].includes(item.status) &&
          isExpiringSoon(item.expiry_date, 7)
      )
      .sort((a, b) => new Date(a.expiry_date || 0).getTime() - new Date(b.expiry_date || 0).getTime());
    const overdueOrders = orders
      .filter((item) => item.status === "overdue")
      .sort((a, b) => new Date(a.expiry_date || 0).getTime() - new Date(b.expiry_date || 0).getTime());
    const confirmedPayments = getConfirmedAppliedPayments(orders);
    const todayRevenue =
      revenueFromPayments(confirmedPayments, isToday) +
      legacyRevenueFromOrders(orders, isToday);
    const monthRevenue =
      revenueFromPayments(confirmedPayments, isThisMonth) +
      legacyRevenueFromOrders(orders, isThisMonth);
    const activeCustomerIds = new Set(activeOrders.map((item) => item.customer_id).filter(Boolean));
    const totalConnections = keys.reduce(
      (sum, item) => sum + Number(item.recent_connections_24h || 0),
      0
    );
    const recentOrders = [...orders].sort(sortNewest).slice(0, 5);
    const attentionRows = [
      ...telegramReviewOrders.slice(0, 3).map((order) => ({
        id: `review:${order.id}`,
        order,
        label: "Review Telegram payment",
        caption: `${order.customer?.full_name || "Customer"} · ${formatMMK(order.price_mmk)}`,
        tone: "warning" as const,
      })),
      ...expiringOrders.slice(0, 3).map((order) => ({
        id: `expiry:${order.id}`,
        order,
        label: "Expires soon",
        caption: `${order.customer?.full_name || "Customer"} · ${formatDaysLeft(order.expiry_date)}`,
        tone: "info" as const,
      })),
      ...overdueOrders.slice(0, 2).map((order) => ({
        id: `overdue:${order.id}`,
        order,
        label: "Overdue order",
        caption: `${order.customer?.full_name || "Customer"} · ${formatDate(order.expiry_date)}`,
        tone: "destructive" as const,
      })),
    ].slice(0, 6);

    return {
      activeOrders,
      pendingOrders,
      telegramReviewOrders,
      expiringOrders,
      todayRevenue,
      monthRevenue,
      activeCustomers: activeCustomerIds.size,
      totalConnections,
      recentOrders,
      attentionRows,
    };
  }, [orders, keys]);

  if (initialLoading) return <OverviewLoading />;

  return (
    <div className="space-y-2.5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-[18px] font-black tracking-tight text-foreground">
            Overview
          </h1>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Revenue, payment reviews, expiries, and daily operations.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Send size={13} />}
            onClick={() => navigate("/app/telegram-orders")}
          >
            Review
          </Button>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus size={13} />}
            disabled={plans.length === 0}
            onClick={() => setOpenCreateModal(true)}
          >
            Create Order
          </Button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {error}
        </div>
      )}
      {plans.length === 0 && (
        <div className="rounded-md border border-warning/25 bg-warning/10 px-3 py-2 text-xs text-[color:var(--warning)]">
          No active plans yet. Orders cannot be created until plans exist.
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        <KpiCard
          label="Today revenue"
          value={formatMMK(overview.todayRevenue)}
          caption="Paid orders today"
          icon={<Wallet size={14} />}
          tone="emerald"
        />
        <KpiCard
          label="Month revenue"
          value={formatMMK(overview.monthRevenue)}
          caption="Current month"
          icon={<TrendingUp size={14} />}
          tone="violet"
        />
        <KpiCard
          label="Active customers"
          value={overview.activeCustomers}
          caption={`${overview.totalConnections} live connections`}
          icon={<Users size={14} />}
          tone="cyan"
        />
        <KpiCard
          label="Pending reviews"
          value={overview.telegramReviewOrders.length}
          caption="Telegram payments"
          icon={<CreditCard size={14} />}
          tone="amber"
        />
        <KpiCard
          label="Expire soon"
          value={overview.expiringOrders.length}
          caption="Within 7 days"
          icon={<Clock3 size={14} />}
          tone="rose"
        />
      </div>

      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.78fr)]">
        <Card className="p-2.5">
          <SectionHeader
            title="Attention Queue"
            action={
              <Badge variant={overview.attentionRows.length ? "warning" : "success"}>
                {overview.attentionRows.length ? `${overview.attentionRows.length} open` : "Clear"}
              </Badge>
            }
          />
          {overview.attentionRows.length === 0 ? (
            <EmptyPanel>No urgent payment reviews or expiring orders right now.</EmptyPanel>
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-md border border-border">
              {overview.attentionRows.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() =>
                    navigate(
                      item.label.includes("Telegram")
                        ? "/app/telegram-orders"
                        : "/app/orders"
                    )
                  }
                  className="flex w-full items-center justify-between gap-2.5 bg-card px-2.5 py-2 text-left transition-colors hover:bg-secondary/55"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant={item.tone}>{item.label}</Badge>
                      <span className="truncate text-xs font-semibold text-foreground">
                        {item.order.plan?.name || "Plan"}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-[11px] text-muted-foreground">
                      {item.caption}
                    </p>
                  </div>
                  <ExternalLink size={13} className="shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-2.5">
          <SectionHeader title="Quick Actions" />
          <div className="grid grid-cols-2 gap-1.5">
            <Button
              variant="primary"
              size="sm"
              className="justify-start"
              leftIcon={<Plus size={13} />}
              disabled={plans.length === 0}
              onClick={() => setOpenCreateModal(true)}
            >
              Create Order
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="justify-start"
              leftIcon={<Send size={13} />}
              onClick={() => navigate("/app/telegram-orders")}
            >
              Review Payments
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="justify-start"
              leftIcon={<ReceiptText size={13} />}
              onClick={() => navigate("/app/orders")}
            >
              Orders
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="justify-start"
              leftIcon={<Settings size={13} />}
              onClick={() => navigate("/app/settings")}
            >
              Settings
            </Button>
          </div>

          <div className="mt-2 rounded-md border border-border bg-muted/55 px-2.5 py-2">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <ClipboardList size={13} />
              Daily Snapshot
            </div>
            <div className="grid grid-cols-3 gap-1.5 text-center">
              <div>
                <p className="text-sm font-black text-foreground">{overview.activeOrders.length}</p>
                <p className="text-[10px] text-muted-foreground">Active</p>
              </div>
              <div>
                <p className="text-sm font-black text-foreground">{overview.pendingOrders.length}</p>
                <p className="text-[10px] text-muted-foreground">Pending</p>
              </div>
              <div>
                <p className="text-sm font-black text-foreground">{orders.length}</p>
                <p className="text-[10px] text-muted-foreground">Total</p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-2.5">
        <SectionHeader
          title="Recent Activity"
          action={
            <Button variant="ghost" size="sm" onClick={() => navigate("/app/orders")}>
              View all
            </Button>
          }
        />
        {overview.recentOrders.length === 0 ? (
          <EmptyPanel>No orders yet.</EmptyPanel>
        ) : (
          <div className="overflow-hidden rounded-md border border-border bg-card">
            <div className="grid grid-cols-[1.35fr_0.9fr_82px_82px_116px] items-center gap-2 border-b border-border bg-muted/65 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              <span>Customer</span>
              <span>Plan</span>
              <span>Status</span>
              <span>Payment</span>
              <span className="text-right">Amount</span>
            </div>
            <div className="divide-y divide-border">
              {overview.recentOrders.map((order) => {
                const customerName = order.customer?.full_name || "Unknown customer";
                return (
                  <div
                    key={order.id}
                    className="grid grid-cols-[1.35fr_0.9fr_82px_82px_116px] items-center gap-2 px-2.5 py-2 text-[12px] transition-colors hover:bg-secondary/45"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-primary/12 text-[10px] font-black text-primary">
                        {getInitials(customerName)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold leading-tight text-foreground">
                          {customerName}
                        </p>
                        <p className="truncate text-[10px] leading-tight text-muted-foreground">
                          {order.customer?.telegram_username || order.customer?.phone || "-"}
                        </p>
                      </div>
                    </div>

                    <div className="min-w-0">
                      <span className="inline-flex max-w-full rounded-full border border-border bg-muted/70 px-2 py-0.5 text-[11px] font-medium text-foreground">
                        <span className="truncate">{order.plan?.name || "-"}</span>
                      </span>
                    </div>

                    <div className="[&>span]:px-1.5 [&>span]:py-0.5 [&>span]:text-[10px]">
                      <StatusBadge status={order.status} />
                    </div>
                    <div className="[&>span]:px-1.5 [&>span]:py-0.5 [&>span]:text-[10px]">
                      <StatusBadge status={order.order_type === "trial" ? "trial" : order.payment_status} />
                    </div>

                    <div className="min-w-0 text-right">
                      <p className="truncate font-bold text-foreground">{formatMMK(order.price_mmk)}</p>
                      <p className="truncate text-[10px] text-muted-foreground">
                        {formatDate(order.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      <OrdersTable
        orders={orders}
        plans={plans}
        keys={keys}
        onSuccess={refresh}
        loading={loading && orders.length === 0}
        title="Order Workbench"
        description=""
        initialRowsPerPage={5}
        rowsPerPageOptions={[5, 10, 20]}
        showSearch={false}
        showFilters={false}
        compactMobile
        compact
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
    </div>
  );
}
