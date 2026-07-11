import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog, DialogHeader, DialogTitle, DialogBody, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Pagination } from '@/components/ui/pagination';
import { Search } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate, formatMMK } from '@/lib/format';
import { usePaginatedTable } from '@/hooks/usePaginatedTable';
import type { Order, Plan, Reseller } from '@/types/api';

interface Props {
  plans: Plan[];
  resellers: Reseller[];
  onSuccess: () => Promise<void>;
}

export function OrdersPage({ plans, resellers, onSuccess }: Props) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [resellerFilter, setResellerFilter] = useState('all');
  const [loadingId, setLoadingId] = useState('');
  const [confirmStop, setConfirmStop] = useState<Order | null>(null);
  const [extendPlanByOrder, setExtendPlanByOrder] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const filters = useMemo(() => {
    const f: Record<string, string> = {};
    if (statusFilter !== 'all') f.status = statusFilter;
    if (resellerFilter !== 'all') f.reseller_id = resellerFilter;
    return f;
  }, [statusFilter, resellerFilter]);

  const { data: orders, total, page, totalPages, loading, setPage, refresh } =
    usePaginatedTable<Order>('/admin/orders', filters, 20);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) =>
      (o.customer?.full_name ?? '').toLowerCase().includes(q) ||
      (o.reseller?.name ?? '').toLowerCase().includes(q) ||
      (o.plan?.name ?? '').toLowerCase().includes(q) ||
      o.status.includes(q),
    );
  }, [orders, search]);

  const runAction = async (order: Order, action: 'activate' | 'extend' | 'stop') => {
    try {
      setLoadingId(`${order.id}:${action}`);
      setError(''); setMessage('');
      if (action === 'extend') {
        await api.post(`/admin/order-actions/${order.id}/extend`, { plan_id: extendPlanByOrder[order.id] || order.plan_id });
      } else {
        await api.post(`/admin/order-actions/${order.id}/${action}`);
      }
      setMessage(`${action.charAt(0).toUpperCase() + action.slice(1)} completed.`);
      setTimeout(() => setMessage(''), 5000);
      refresh();
      await onSuccess();
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || `Failed to ${action}`);
      setTimeout(() => setError(''), 6000);
    } finally {
      setLoadingId('');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Orders</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{total.toLocaleString()} total orders</p>
      </div>

      {message && <div className="rounded-md border border-success/25 bg-success/10 px-4 py-2 text-sm text-success">{message}</div>}
      {error && <div className="rounded-md border border-destructive/25 bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</div>}

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input className="pl-8" placeholder="Search customer, reseller, plan…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setSearch(''); }} className="w-40">
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="active">Active</option>
          <option value="expired">Expired</option>
          <option value="stopped">Stopped</option>
        </Select>
        <Select value={resellerFilter} onChange={(e) => { setResellerFilter(e.target.value); setSearch(''); }} className="w-48">
          <option value="all">All resellers</option>
          {resellers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
      </div>

      <Card>
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
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">Loading…</TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">No orders found.</TableCell>
              </TableRow>
            ) : (
              filtered.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-medium">{order.customer?.full_name || '—'}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{order.reseller?.name || '—'}</TableCell>
                  <TableCell>{order.plan?.name || '—'}</TableCell>
                  <TableCell><StatusBadge status={order.status} /></TableCell>
                  <TableCell><StatusBadge status={order.payment_status} /></TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(order.expiry_date)}</TableCell>
                  <TableCell className="text-right font-medium">{formatMMK(order.price_mmk)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1.5">
                      {order.status === 'pending' && (
                        <Button variant="primary" size="sm" loading={loadingId === `${order.id}:activate`} onClick={() => void runAction(order, 'activate')}>
                          Activate
                        </Button>
                      )}
                      {(['active', 'expired', 'stopped'] as string[]).includes(order.status) && (
                        <>
                          <Select
                            className="h-8 w-32 text-xs"
                            value={extendPlanByOrder[order.id] || order.plan_id}
                            onChange={(e) => setExtendPlanByOrder((p) => ({ ...p, [order.id]: e.target.value }))}
                          >
                            {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </Select>
                          <Button variant="secondary" size="sm" loading={loadingId === `${order.id}:extend`} onClick={() => void runAction(order, 'extend')}>
                            Extend
                          </Button>
                        </>
                      )}
                      {(['active', 'expired'] as string[]).includes(order.status) && (
                        <Button variant="destructiveOutline" size="sm" onClick={() => setConfirmStop(order)}>
                          Stop
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <Pagination page={page} totalPages={totalPages} total={total} label="orders" onPageChange={setPage} loading={loading} />
      </Card>

      <Dialog open={!!confirmStop} onClose={() => setConfirmStop(null)} size="sm">
        <DialogHeader>
          <DialogTitle>Stop Order?</DialogTitle>
          <DialogClose onClose={() => setConfirmStop(null)} />
        </DialogHeader>
        <DialogBody>
          <p className="text-sm text-muted-foreground">
            This will permanently delete the VPN key for{' '}
            <span className="font-semibold text-foreground">{confirmStop?.customer?.full_name ?? 'this customer'}</span>{' '}
            and cut their access immediately.
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setConfirmStop(null)}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={!!loadingId}
            onClick={() => { const o = confirmStop!; setConfirmStop(null); void runAction(o, 'stop'); }}
          >
            Stop &amp; Delete Key
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
