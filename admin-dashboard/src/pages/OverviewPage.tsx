import { useEffect, useState } from 'react';
import { ShoppingCart, Activity, XCircle, Key, DollarSign } from 'lucide-react';
import { StatCard } from '@/components/ui/stat-card';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { formatDate, formatMMK } from '@/lib/format';
import { api } from '@/lib/api';
import type { OverviewStats } from '@/types/api';

export function OverviewPage() {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    api.get<OverviewStats>('/admin/overview')
      .then((res) => setStats(res.data))
      .catch((err: any) => setError(err?.response?.data?.error || err.message || 'Failed to load overview'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Platform-wide snapshot across all resellers</p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/25 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading && !stats ? (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 rounded-lg bg-secondary animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard label="Active Orders" value={stats?.active_orders ?? 0} accent="success" icon={<Activity size={16} />} />
          <StatCard label="Pending Orders" value={stats?.pending_orders ?? 0} accent="warning" icon={<ShoppingCart size={16} />} />
          <StatCard label="Stopped" value={stats?.stopped_orders ?? 0} accent="default" icon={<XCircle size={16} />} />
          <StatCard label="Active Keys" value={stats?.active_keys ?? 0} accent="info" icon={<Key size={16} />} />
          <StatCard label="Total Value" value={formatMMK(stats?.total_value_mmk ?? 0)} accent="default" icon={<DollarSign size={16} />} className="col-span-2 lg:col-span-1" />
        </div>
      )}

      <Card>
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">Recent Orders</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Customer</TableHead>
              <TableHead>Reseller</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Expiry</TableHead>
              <TableHead className="text-right">Price</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!stats || stats.recent_orders.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  {loading ? 'Loading…' : 'No orders yet.'}
                </TableCell>
              </TableRow>
            ) : (
              stats.recent_orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>
                    <div className="font-medium">{order.customer?.full_name || '—'}</div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{order.reseller?.name || '—'}</TableCell>
                  <TableCell>{order.plan?.name || '—'}</TableCell>
                  <TableCell><StatusBadge status={order.status} /></TableCell>
                  <TableCell><StatusBadge status={order.payment_status} /></TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(order.expiry_date)}</TableCell>
                  <TableCell className="text-right font-medium">{formatMMK(order.price_mmk)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
