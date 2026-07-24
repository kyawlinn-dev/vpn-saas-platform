import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { AdminResellerWorkspace, AdminResellerWorkspacePatch } from '@/types/api';

export function useResellerWorkspace(resellerId: string | null) {
  const [workspace, setWorkspace] = useState<AdminResellerWorkspace | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!resellerId) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.get<AdminResellerWorkspace>(`/admin/resellers/${resellerId}/workspace`);
      setWorkspace(res.data);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load mini app settings');
    } finally {
      setLoading(false);
    }
  }, [resellerId]);

  useEffect(() => {
    setWorkspace(null);
    void refresh();
  }, [refresh]);

  const patch = async (data: AdminResellerWorkspacePatch): Promise<Record<string, unknown>> => {
    if (!resellerId) throw new Error('No reseller selected');
    const res = await api.patch(`/admin/resellers/${resellerId}/workspace`, data);
    return res.data as Record<string, unknown>;
  };

  return { workspace, loading, error, patch, refresh };
}
