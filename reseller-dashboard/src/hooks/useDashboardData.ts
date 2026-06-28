import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useResellerAuth } from "../providers/ResellerAuthProvider";
import type {
  Order,
  Plan,
  Reseller,
  ServerInventoryCounts,
  VpnKey,
  VpnServer,
} from "../types/api";

export interface DashboardDataState {
  orders: Order[];
  plans: Plan[];
  resellers: Reseller[];
  keys: VpnKey[];
  servers: VpnServer[];
  serverCounts: ServerInventoryCounts;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
}

const emptyServerCounts: ServerInventoryCounts = {
  total: 0,
  available: 0,
  provisioning: 0,
  active_configured: 0,
  active_not_ready: 0,
  full: 0,
  failed: 0,
};

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
    if (Array.isArray(d.orders)) return d.orders as T[];
    if (Array.isArray(d.plans)) return d.plans as T[];
    if (Array.isArray(d.keys)) return d.keys as T[];
    if (Array.isArray(d.customers)) return d.customers as T[];
  }
  return [];
}

export function useDashboardData(): DashboardDataState {
  const { isAuthenticated, initializing, logout } = useResellerAuth();

  const [orders, setOrders] = useState<Order[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [keys, setKeys] = useState<VpnKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const clearData = useCallback(() => {
    setOrders([]);
    setPlans([]);
    setKeys([]);
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

    const results = await Promise.allSettled([
      api.get<Order[]>("/reseller/orders"),
      api.get<Plan[]>("/public/plans"),
      api.get<VpnKey[]>("/reseller/keys"),
    ]);

    const [ordersResult, plansResult, keysResult] = results;
    const errors: string[] = [];

    if (ordersResult.status === "fulfilled") {
      setOrders(readArrayPayload<Order>(ordersResult.value.data));
    } else {
      errors.push(
        extractErrorMessage(ordersResult.reason, "Failed to load orders")
      );
    }

    if (plansResult.status === "fulfilled") {
      setPlans(readArrayPayload<Plan>(plansResult.value.data));
    } else {
      errors.push(
        extractErrorMessage(plansResult.reason, "Failed to load plans")
      );
    }

    if (keysResult.status === "fulfilled") {
      setKeys(readArrayPayload<VpnKey>(keysResult.value.data));
    } else {
      errors.push(
        extractErrorMessage(keysResult.reason, "Failed to load keys")
      );
    }

    const authFailed = results.some(
      (r) =>
        r.status === "rejected" &&
        (r.reason?.response?.status === 401 || r.reason?.response?.status === 403)
    );

    if (authFailed) {
      await logout();
      return;
    }

    setError(errors.join(" • "));
    setLoading(false);
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
      orders,
      plans,
      resellers: [],
      keys,
      servers: [],
      serverCounts: emptyServerCounts,
      loading,
      error,
      refresh,
    }),
    [orders, plans, keys, loading, error, refresh]
  );
}