import { useMemo, useState } from "react";
import { Plus, TrendingUp, Zap, Clock, Wallet } from "lucide-react";
import { useScopedDashboard } from "../hooks/useScopedDashboard";
import { formatMMK, isExpiringSoon } from "../lib/format";
import { CreateOrderDialog } from "../components/CreateOrderDialog";
import { OrdersTable } from "../components/OrdersTable";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";

function OverviewLoading() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center gap-4">
        <div className="h-9 w-40 rounded-md bg-secondary animate-pulse" />
        <div className="h-9 w-36 rounded-md bg-secondary animate-pulse" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 rounded-lg bg-secondary animate-pulse" />
        ))}
      </div>
      <div className="h-96 rounded-lg bg-secondary animate-pulse" />
    </div>
  );
}

export function OverviewPage() {
  const { orders, keys, plans, loading, error, refresh } = useScopedDashboard();
  const [openCreateModal, setOpenCreateModal] = useState(false);
  const [orderResetTrigger, setOrderResetTrigger] = useState(0);

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight font-display text-foreground">
          Overview
        </h1>
        <Button
          variant="primary"
          leftIcon={<Plus size={16} />}
          disabled={plans.length === 0}
          onClick={() => setOpenCreateModal(true)}
        >
          Create Order
        </Button>
      </div>

      {/* Alerts */}
      {error && (
        <div
          role="alert"
          className="rounded-md border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}
      {plans.length === 0 && (
        <div className="rounded-md border border-warning/25 bg-warning/10 px-4 py-3 text-sm text-[color:var(--warning)]">
          No active plans yet — orders cannot be created until plans exist.
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Active orders"
          value={stats.activeOrders}
          caption="Running now"
          icon={<TrendingUp size={18} />}
          accent="violet"
        />
        <StatCard
          label="Pending"
          value={stats.pendingOrders}
          caption="Need attention"
          icon={<Zap size={18} />}
          accent="amber"
        />
        <StatCard
          label="Expire soon"
          value={stats.expiringSoon}
          caption="Within 7 days"
          icon={<Clock size={18} />}
          accent="blue"
        />
        <StatCard
          label="Order value"
          value={formatMMK(stats.revenue)}
          caption={`${stats.totalConnections} connections`}
          icon={<Wallet size={18} />}
          accent="emerald"
        />
      </div>

      {/* Quick Orders table (stays MUI until Phase 5) */}
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
    </div>
  );
}
