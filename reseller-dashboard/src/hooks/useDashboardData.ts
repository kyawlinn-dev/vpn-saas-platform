import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useResellerAuth } from "../providers/ResellerAuthProvider";
import type { Plan } from "../types/api";

export interface DashboardDataState {
  plans: Plan[];
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
}

function extractErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    if (e.response && typeof e.response === "object") {
      const r = e.response as Record<string, unknown>;
      if (r.data && typeof r.data === "object") {
        const d = r.data as Record<string, unknown>;
        if (typeof d.error === "string") return d.error;
      }
    }
    if (typeof e.message === "string") return e.message;
  }
  return fallback;
}

function readArrayPayload<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    if (Array.isArray(d.data)) return d.data as T[];
    if (Array.isArray(d.plans)) return d.plans as T[];
  }
  return [];
}

// Plans are a small, bounded catalogue shared across a reseller's whole
// workspace, so they're still fetched in full here. Orders/customers/keys
// scale with usage and are fetched per-page by the pages that need them
// (usePaginatedTable against /reseller/orders, /reseller/customers) instead
// of being loaded wholesale on every dashboard mount.
export function useDashboardData(): DashboardDataState {
  const { isAuthenticated, initializing, logout } = useResellerAuth();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const clearData = useCallback(() => {
    setPlans([]);
    setError("");
    setLoading(false);
  }, []);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      clearData();
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await api.get<Plan[]>("/reseller/plans");
      setPlans(readArrayPayload<Plan>(res.data));
    } catch (err: any) {
      if (err?.response?.status === 401 || err?.response?.status === 403) {
        await logout();
        return;
      }
      setError(extractErrorMessage(err, "Failed to load plans"));
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, clearData, logout]);

  useEffect(() => {
    if (initializing) return;

    if (!isAuthenticated) {
      clearData();
      return;
    }

    void refresh();
  }, [initializing, isAuthenticated, refresh, clearData]);

  return useMemo(
    () => ({
      plans,
      loading,
      error,
      refresh,
    }),
    [plans, loading, error, refresh]
  );
}
