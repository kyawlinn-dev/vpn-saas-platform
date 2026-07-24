import { useDashboardContext } from "../providers/DashboardDataProvider";

export function useScopedDashboard() {
  return useDashboardContext();
}
