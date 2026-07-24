import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router";
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
import { useResellerOverviewStats } from "../hooks/useResellerOverviewStats";
import { formatDate, formatDaysLeft, formatMMK } from "../lib/format";
import { CreateOrderDialog } from "../components/CreateOrderDialog";
import { OrdersTable } from "../components/OrdersTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { GlowStatCard } from "@/components/ui/glow-stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Order } from "../types/api";

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
  const { plans } = useScopedDashboard();
  const { stats, loading, error, refresh } = useResellerOverviewStats();
  const [openCreateModal, setOpenCreateModal] = useState(false);
  const [orderResetTrigger, setOrderResetTrigger] = useState(0);

  const initialLoading = loading && stats.total_orders === 0;

  const attentionRows = useMemo(() => {
    const rows = [
      ...stats.telegram_review.recent.slice(0, 3).map((order) => ({
        id: `review:${order.id}`,
        order,
        label: "Review Telegram payment",
        caption: `${order.customer?.full_name || "Customer"} · ${formatMMK(order.price_mmk)}`,
        tone: "warning" as const,
      })),
      ...stats.expiring_soon.recent.slice(0, 3).map((order) => ({
        id: `expiry:${order.id}`,
        order,
        label: "Expires soon",
        caption: `${order.customer?.full_name || "Customer"} · ${formatDaysLeft(order.expiry_date)}`,
        tone: "info" as const,
      })),
    ];
    return rows;
  }, [stats.telegram_review.recent, stats.expiring_soon.recent]);

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
        <GlowStatCard
          label="Today revenue"
          value={formatMMK(stats.today_revenue_mmk)}
          caption="Paid orders today"
          icon={<Wallet size={12} />}
          tone="success"
        />
        <GlowStatCard
          label="Month revenue"
          value={Number(stats.month_revenue_mmk || 0).toLocaleString("en-US")}
          unit="MMK"
          caption="Current month"
          icon={<TrendingUp size={12} />}
          tone="cyan"
        />
        <GlowStatCard
          label="Active customers"
          value={stats.active_customers}
          caption={`${stats.active_keys} active keys`}
          icon={<Users size={12} />}
          tone="blue"
        />
        <GlowStatCard
          label="Pending reviews"
          value={stats.telegram_review.count}
          caption="Telegram payments"
          icon={<CreditCard size={12} />}
          tone="warning"
        />
        <GlowStatCard
          label="Expire soon"
          value={stats.expiring_soon.count}
          caption="Within 7 days"
          icon={<Clock3 size={12} />}
          tone="rose"
        />
      </div>

      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.78fr)]">
        <Card className="p-2.5">
          <SectionHeader
            title="Attention Queue"
            action={
              <Badge variant={attentionRows.length ? "warning" : "success"}>
                {attentionRows.length ? `${attentionRows.length} open` : "Clear"}
              </Badge>
            }
          />
          {attentionRows.length === 0 ? (
            <EmptyPanel>No urgent payment reviews or expiring orders right now.</EmptyPanel>
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-md border border-border">
              {attentionRows.map((item) => (
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
                <p className="text-sm font-black text-foreground">{stats.active_orders}</p>
                <p className="text-[10px] text-muted-foreground">Active</p>
              </div>
              <div>
                <p className="text-sm font-black text-foreground">{stats.pending_orders}</p>
                <p className="text-[10px] text-muted-foreground">Pending</p>
              </div>
              <div>
                <p className="text-sm font-black text-foreground">{stats.total_orders}</p>
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
        {stats.recent_orders.length === 0 ? (
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
              {stats.recent_orders.map((order: Order) => {
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
                      <StatusBadge
                        status={
                          order.order_type === "trial"
                            ? "trial"
                            : order.review_status === "rejected"
                              ? "rejected"
                              : order.payment_status
                        }
                      />
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
        plans={plans}
        title="Order Workbench"
        description=""
        initialRowsPerPage={5}
        rowsPerPageOptions={[5, 10, 20]}
        showSearch={false}
        showFilters={false}
        compactMobile
        compact
        resetTrigger={orderResetTrigger}
        scopeFilters={{ hide_unconfirmed_telegram: "true" }}
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
