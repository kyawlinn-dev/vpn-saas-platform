import { useMemo } from "react";
import { useDashboardContext } from "../providers/DashboardDataProvider";
import type { Order, VpnServer } from "../types/api";

export function useScopedDashboard() {
  const dashboard = useDashboardContext();

  return useMemo(() => {
    return {
      ...dashboard,
      reseller: null,
      allResellers: dashboard.resellers,
      orders: dashboard.orders
        .slice()
        .sort(
          (a: Order, b: Order) =>
            new Date(b.created_at || 0).getTime() -
            new Date(a.created_at || 0).getTime()
        ),
      keys: dashboard.keys,
      servers: dashboard.servers
        .slice()
        .sort(
          (a: VpnServer, b: VpnServer) =>
            new Date(b.created_at || 0).getTime() -
            new Date(a.created_at || 0).getTime()
        ),
      serverCounts: dashboard.serverCounts,
    };
  }, [dashboard]);
}