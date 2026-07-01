import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import type { Customer, Order, Plan, Reseller, Server, VpnKey } from '../types/api';

export interface DashboardDataState {
  customers: Customer[];
  orders: Order[];
  plans: Plan[];
  resellers: Reseller[];
  servers: Server[];
  keys: VpnKey[];
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
}

export function useDashboardData(): DashboardDataState {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [resellers, setResellers] = useState<Reseller[]>([]);
  const [servers, setServers] = useState<Server[]>([]);
  const [keys, setKeys] = useState<VpnKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [customersRes, ordersRes, plansRes, resellersRes, serversRes, keysRes] =
        await Promise.all([
          api.get<Customer[]>('/admin/customers'),
          api.get<Order[]>('/admin/orders'),
          api.get<Plan[]>('/admin/plans'),
          api.get<Reseller[]>('/admin/resellers'),
          api.get<{ success: boolean; servers: Server[] }>('/admin/servers'),
          api.get<VpnKey[]>('/admin/keys'),
        ]);

      setCustomers(customersRes.data);
      setOrders(ordersRes.data);
      setPlans(plansRes.data);
      setResellers(resellersRes.data);
      setServers(serversRes.data.servers ?? []);
      setKeys(keysRes.data);
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return useMemo(
    () => ({ customers, orders, plans, resellers, servers, keys, loading, error, refresh }),
    [customers, orders, plans, resellers, servers, keys, loading, error, refresh],
  );
}
