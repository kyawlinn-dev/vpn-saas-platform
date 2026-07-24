import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { useResellerAuth } from "../providers/ResellerAuthProvider";
import type { ResellerOverviewStats } from "../types/api";

const emptyStats: ResellerOverviewStats = {
  active_orders: 0,
  pending_orders: 0,
  total_orders: 0,
  active_keys: 0,
  active_customers: 0,
  today_revenue_mmk: 0,
  month_revenue_mmk: 0,
  telegram_review: { count: 0, recent: [] },
  expiring_soon: { count: 0, recent: [] },
  recent_orders: [],
};

export function useResellerOverviewStats() {
  const { isAuthenticated, initializing } = useResellerAuth();
  const [stats, setStats] = useState<ResellerOverviewStats>(emptyStats);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setStats(emptyStats);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const res = await api.get<ResellerOverviewStats>("/reseller/stats/overview");
      setStats(res.data);
    } catch (err: any) {
      setError(
        err?.response?.data?.error || err.message || "Failed to load overview stats"
      );
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (initializing) return;
    void refresh();
  }, [initializing, refresh]);

  return { stats, loading, error, refresh };
}
