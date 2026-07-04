import { useState } from "react";
import { Plus } from "lucide-react";
import { CreateOrderDialog } from "../components/CreateOrderDialog";
import { OrdersTable } from "../components/OrdersTable";
import { useScopedDashboard } from "../hooks/useScopedDashboard";

export function OrdersPage() {
  const { orders, plans, keys, refresh, error, loading } = useScopedDashboard();
  const [openCreateModal, setOpenCreateModal] = useState(false);
  const [orderResetTrigger, setOrderResetTrigger] = useState(0);

  return (
    <>
      {!loading && plans.length === 0 ? (
        <div className="mb-4 rounded-md border border-warning/25 bg-warning/10 px-4 py-3 text-sm text-[color:var(--warning)]">
          No active plans are available yet. Add plans from the admin side first.
        </div>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-md border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <OrdersTable
        orders={orders}
        plans={plans}
        keys={keys}
        onSuccess={refresh}
        loading={loading && orders.length === 0}
        title="Customer Orders"
        description="Search by customer or plan and filter by pending, active, expiring, overdue, expired, or stopped."
        initialRowsPerPage={10}
        rowsPerPageOptions={[5, 10, 20, 50]}
        showSearch
        showFilters
        compactMobile
        resetTrigger={orderResetTrigger}
        headerAction={{
          label: "Create Order",
          icon: <Plus size={16} />,
          onClick: () => setOpenCreateModal(true),
          disabled: plans.length === 0,
        }}
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
    </>
  );
}
