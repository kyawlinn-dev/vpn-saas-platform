import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import type { Plan, Reseller, Server } from '../types/api';

export interface DashboardDataState {
  plans: Plan[];
  resellers: Reseller[];
  servers: Server[];
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
}

export function useDashboardData(): DashboardDataState {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [resellers, setResellers] = useState<Reseller[]>([]);
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [plansRes, resellersRes, serversRes] = await Promise.all([
        api.get<Plan[]>('/admin/plans'),
        api.get<Reseller[]>('/admin/resellers?all=1'),
        api.get<{ success: boolean; servers: Server[] }>('/admin/servers'),
      ]);
      setPlans(plansRes.data);
      setResellers(resellersRes.data);
      setServers(serversRes.data.servers ?? []);
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
    () => ({ plans, resellers, servers, loading, error, refresh }),
    [plans, resellers, servers, loading, error, refresh],
  );
}
