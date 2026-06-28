import { useState } from "react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import { Alert } from "@mui/material";
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
        <Alert severity="warning" sx={{ mb: 2 }}>
          No active plans are available yet. Add plans from the admin side first.
        </Alert>
      ) : null}

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
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
          icon: <AddRoundedIcon />,
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