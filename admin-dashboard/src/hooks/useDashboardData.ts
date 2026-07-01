import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import type { Customer, Order, Plan, Reseller, VpnKey } from '../types/api';

export interface DashboardDataState {
  customers: Customer[];
  orders: Order[];
  plans: Plan[];
  resellers: Reseller[];
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
  const [keys, setKeys] = useState<VpnKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [customersRes, ordersRes, plansRes, resellersRes, keysRes] = await Promise.all([
        api.get<Customer[]>('/admin/customers'),
        api.get<Order[]>('/admin/orders'),
        api.get<Plan[]>('/admin/plans'),
        api.get<Reseller[]>('/admin/resellers'),
        api.get<VpnKey[]>('/admin/keys'),
      ]);

      setCustomers(customersRes.data);
      setOrders(ordersRes.data);
      setPlans(plansRes.data);
      setResellers(resellersRes.data);
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
    () => ({ customers, orders, plans, resellers, keys, loading, error, refresh }),
    [customers, orders, plans, resellers, keys, loading, error, refresh],
  );
}
