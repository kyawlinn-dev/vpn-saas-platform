import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clipboard,
  Copy,
  Eye,
  Loader2,
  PackagePlus,
  Play,
  Search,
  ShieldX,
  XCircle,
} from 'lucide-react';
import { ActionMenu, type ActionMenuItem } from '@/components/ui/action-menu';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogBody, DialogClose, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { formatBytes, formatDate, formatMMK } from '@/lib/format';
import { usePaginatedTable } from '@/hooks/usePaginatedTable';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import type { Order, OrderPayment, Plan, Reseller, VpnKey } from '@/types/api';

interface Props {
  plans: Plan[];
  resellers: Reseller[];
  onSuccess: () => Promise<void>;
}

function sourceLabel(source?: string | null) {
  if (!source) return 'dashboard';
  return source.replace(/_/g, ' ');
}

function getActiveKey(order: Order): VpnKey | null {
  return order.keys?.find((key) => key.status === 'active') ?? order.keys?.[0] ?? null;
}

// Lifetime usage across every key the order has ever had — a server switch
// retires the old key and provisions a new one, so the current key's own
// used_bytes alone understates true usage. Backend attaches this total to
// both the order and each key (customerOrderEnrichmentService.js); prefer
// whichever is present, falling back to the single-key value only if the
// backend hasn't been redeployed with the total yet.
function getOrderUsageBytes(order: Order, activeKey: VpnKey | null): number {
  if (typeof order.total_used_bytes === 'number') return order.total_used_bytes;
  if (typeof activeKey?.order_total_used_bytes === 'number') return activeKey.order_total_used_bytes;
  return activeKey?.used_bytes ?? 0;
}

function getAccessUrl(order: Order) {
  const key = getActiveKey(order);
  return (
    order.dynamic_access_url ||
    order.ssconf_url ||
    order.preferred_access_url ||
    key?.dynamic_access_url ||
    key?.ssconf_url ||
    key?.preferred_access_url ||
    key?.access_url ||
    ''
  );
}

function confirmedApplied(payment: OrderPayment) {
  return payment.review_status === 'confirmed' && String(payment.apply_status || 'applied') === 'applied';
}

function summarizePayments(order: Order) {
  const payments = order.payments ?? [];
  return payments.reduce(
    (acc, payment) => {
      if (confirmedApplied(payment)) {
        acc.gross += Number(payment.amount_mmk || 0);
        acc.commission += Number(payment.commission_amount_mmk || 0);
        acc.platformDue += Number(payment.platform_due_mmk || 0);
      }
      if (payment.review_status === 'pending_review') {
        acc.pending += Number(payment.amount_mmk || 0);
        acc.pendingCount += 1;
      }
      return acc;
    },
    { gross: 0, commission: 0, platformDue: 0, pending: 0, pendingCount: 0 },
  );
}

function remainingDays(expiryDate?: string | null) {
  if (!expiryDate) return '-';
  const end = new Date(`${expiryDate}T23:59:59`);
  if (Number.isNaN(end.getTime())) return '-';
  const days = Math.ceil((end.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return `${Math.abs(days)} days overdue`;
  if (days === 0) return 'expires today';
  return `${days} days left`;
}

function truncateMiddle(value: string, head = 18, tail = 8) {
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

function useClipboard() {
  const [copiedId, setCopiedId] = useState('');

  const copy = async (id: string, value: string) => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopiedId(id);
    setTimeout(() => setCopiedId(''), 1800);
  };

  return { copiedId, copy };
}

export function OrdersPage({ plans, resellers, onSuccess }: Props) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [statusFilter, setStatusFilter] = useState('all');
  const [resellerFilter, setResellerFilter] = useState('all');
  const [orderTypeFilter, setOrderTypeFilter] = useState<'all' | 'trial' | 'purchase'>('all');
  const [loadingId, setLoadingId] = useState('');
  const [confirmStop, setConfirmStop] = useState<Order | null>(null);
  const [confirmReject, setConfirmReject] = useState<Order | null>(null);
  const [extendTarget, setExtendTarget] = useState<Order | null>(null);
  const [extendPlanId, setExtendPlanId] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const { copiedId, copy } = useClipboard();

  const filters = useMemo(() => {
    const f: Record<string, string> = {};
    if (statusFilter !== 'all') f.status = statusFilter;
    if (resellerFilter !== 'all') f.reseller_id = resellerFilter;
    if (orderTypeFilter !== 'all') f.order_type = orderTypeFilter;
    if (debouncedSearch.trim()) f.search = debouncedSearch.trim();
    return f;
  }, [statusFilter, resellerFilter, orderTypeFilter, debouncedSearch]);

  const { data: orders, total, page, totalPages, loading, setPage, refresh } =
    usePaginatedTable<Order>('/admin/orders', filters, 20);

  const runAction = async (order: Order, action: 'activate' | 'extend' | 'stop' | 'confirm-payment' | 'reject-payment', planId?: string) => {
    try {
      setLoadingId(`${order.id}:${action}`);
      setError('');
      setMessage('');

      const body =
        action === 'extend'
          ? { plan_id: planId || order.plan_id, idempotency_key: crypto.randomUUID() }
          : undefined;

      await api.post(`/admin/order-actions/${order.id}/${action}`, body);
      setMessage(`${action.replace(/-/g, ' ')} completed.`);
      setTimeout(() => setMessage(''), 5000);
      refresh();
      await onSuccess();
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || `Failed to ${action}`);
      setTimeout(() => setError(''), 7000);
    } finally {
      setLoadingId('');
    }
  };

  const openExtend = (order: Order) => {
    setExtendTarget(order);
    setExtendPlanId(order.plan_id);
  };

  const getActions = (order: Order): ActionMenuItem[] => {
    const summary = summarizePayments(order);
    const hasPendingPayment = summary.pendingCount > 0;
    const busy = loadingId.startsWith(`${order.id}:`);

    return [
      {
        label: 'View details',
        icon: <Eye size={14} />,
        onSelect: () => setSelectedOrder(order),
      },
      {
        label: 'Copy access key',
        icon: <Copy size={14} />,
        disabled: !getAccessUrl(order),
        onSelect: () => void copy(order.id, getAccessUrl(order)),
      },
      {
        label: 'Confirm payment',
        icon: <CheckCircle2 size={14} />,
        disabled: busy || !hasPendingPayment,
        onSelect: () => void runAction(order, 'confirm-payment'),
      },
      {
        label: 'Reject payment',
        icon: <XCircle size={14} />,
        disabled: busy || !hasPendingPayment,
        destructive: true,
        onSelect: () => setConfirmReject(order),
      },
      {
        label: 'Activate',
        icon: <Play size={14} />,
        disabled: busy || order.status !== 'pending',
        onSelect: () => void runAction(order, 'activate'),
      },
      {
        label: order.status === 'active' ? 'Extend package' : 'Renew package',
        icon: <PackagePlus size={14} />,
        disabled: busy || !['active', 'expired', 'stopped'].includes(order.status),
        onSelect: () => openExtend(order),
      },
      {
        label: 'Stop access',
        icon: <ShieldX size={14} />,
        disabled: busy || !['active', 'expired', 'pending'].includes(order.status),
        destructive: true,
        onSelect: () => setConfirmStop(order),
      },
    ];
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Orders</h1>
        <p className="text-sm text-muted-foreground">
          {total.toLocaleString()} total orders with payment ledger and access visibility.
        </p>
      </div>

      {message && <div className="rounded-md border border-success/25 bg-success/10 px-4 py-2 text-sm text-success">{message}</div>}
      {error && <div className="rounded-md border border-destructive/25 bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</div>}

      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-48 flex-1">
            {loading && orders.length > 0 ? (
              <Loader2 size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
            ) : (
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            )}
            <Input className="pl-8" placeholder="Search customer, reseller, plan..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full lg:w-40">
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="stopped">Stopped</option>
          </Select>
          <Select value={orderTypeFilter} onChange={(e) => setOrderTypeFilter(e.target.value as typeof orderTypeFilter)} className="w-full lg:w-36">
            <option value="all">All plans</option>
            <option value="purchase">Paid</option>
            <option value="trial">Trial</option>
          </Select>
          <Select value={resellerFilter} onChange={(e) => setResellerFilter(e.target.value)} className="w-full lg:w-52">
            <option value="all">All resellers</option>
            {resellers.map((reseller) => <option key={reseller.id} value={reseller.id}>{reseller.name}</option>)}
          </Select>
        </div>
      </Card>

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
              <TableHead>Usage</TableHead>
              <TableHead>Access</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={loading && orders.length > 0 ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
            {loading && orders.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={10} className="py-10 text-center text-muted-foreground">Loading...</TableCell>
              </TableRow>
            ) : orders.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={10} className="py-10 text-center text-muted-foreground">No orders found.</TableCell>
              </TableRow>
            ) : (
              orders.map((order) => {
                const summary = summarizePayments(order);
                const activeKey = getActiveKey(order);
                const accessUrl = getAccessUrl(order);
                const busy = loadingId.startsWith(`${order.id}:`);

                return (
                  <TableRow key={order.id}>
                    <TableCell>
                      <div className="font-medium text-foreground">{order.customer?.full_name || '-'}</div>
                      <div className="text-xs text-muted-foreground">{order.customer?.telegram_username || sourceLabel(order.source)}</div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{order.reseller?.name || '-'}</TableCell>
                    <TableCell>
                      <div className="font-medium text-foreground">{order.plan?.name || '-'}</div>
                      <div className="text-xs text-muted-foreground">{sourceLabel(order.source)}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        <StatusBadge status={order.status} />
                        {order.order_type ? <Badge variant="outline">{order.order_type}</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        <StatusBadge status={order.payment_status} />
                        {order.review_status ? <StatusBadge status={order.review_status} /> : null}
                      </div>
                      {summary.pendingCount > 0 ? (
                        <div className="mt-1 text-xs text-warning">{formatMMK(summary.pending)} pending</div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <div className="text-foreground">{formatDate(order.expiry_date)}</div>
                      <div className="text-xs text-muted-foreground">{remainingDays(order.expiry_date)}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-foreground">{formatBytes(getOrderUsageBytes(order, activeKey))}</div>
                      <div className="text-xs text-muted-foreground">{activeKey?.status || '-'}</div>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={!accessUrl}
                        title={accessUrl ? 'Copy access key' : 'No access key'}
                        onClick={() => void copy(order.id, accessUrl)}
                      >
                        {copiedId === order.id ? <CheckCircle2 size={15} className="text-success" /> : <Clipboard size={15} />}
                      </Button>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="font-semibold text-foreground">{formatMMK(summary.gross || order.total_paid_mmk || 0)}</div>
                      <div className="text-xs text-muted-foreground">{formatMMK(summary.platformDue)} due</div>
                    </TableCell>
                    <TableCell className="text-right">
                      <ActionMenu
                        items={getActions(order)}
                        label={busy ? 'Working...' : 'Order actions'}
                        className={busy ? 'animate-pulse' : undefined}
                      />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        <Pagination page={page} totalPages={totalPages} total={total} label="orders" onPageChange={setPage} loading={loading} />
      </Card>

      {selectedOrder && (
        <OrderDetailDialog
          order={selectedOrder}
          copiedId={copiedId}
          onCopy={(id, value) => void copy(id, value)}
          onClose={() => setSelectedOrder(null)}
        />
      )}

      <Dialog open={!!extendTarget} onClose={() => setExtendTarget(null)} size="sm">
        <DialogHeader>
          <DialogTitle>{extendTarget?.status === 'active' ? 'Extend Package' : 'Renew Package'}</DialogTitle>
          <DialogClose onClose={() => setExtendTarget(null)} />
        </DialogHeader>
        <DialogBody className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Choose the package to apply for {extendTarget?.customer?.full_name ?? 'this customer'}.
          </p>
          <Select value={extendPlanId} onChange={(event) => setExtendPlanId(event.target.value)}>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name} - {formatMMK(plan.price_mmk)} - {plan.duration_days} days
              </option>
            ))}
          </Select>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setExtendTarget(null)}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!extendTarget || !!loadingId}
            onClick={() => {
              const order = extendTarget;
              if (!order) return;
              setExtendTarget(null);
              void runAction(order, 'extend', extendPlanId || order.plan_id);
            }}
          >
            Apply Package
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={!!confirmStop} onClose={() => setConfirmStop(null)} size="sm">
        <DialogHeader>
          <DialogTitle>Stop Order?</DialogTitle>
          <DialogClose onClose={() => setConfirmStop(null)} />
        </DialogHeader>
        <DialogBody>
          <p className="text-sm text-muted-foreground">
            This will delete active VPN access for{' '}
            <span className="font-semibold text-foreground">{confirmStop?.customer?.full_name ?? 'this customer'}</span>.
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setConfirmStop(null)}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={!!loadingId}
            onClick={() => { const order = confirmStop; setConfirmStop(null); if (order) void runAction(order, 'stop'); }}
          >
            Stop Access
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={!!confirmReject} onClose={() => setConfirmReject(null)} size="sm">
        <DialogHeader>
          <DialogTitle>Reject Payment?</DialogTitle>
          <DialogClose onClose={() => setConfirmReject(null)} />
        </DialogHeader>
        <DialogBody>
          <p className="text-sm text-muted-foreground">
            Rejecting a pending payment may reverse a top-up or stop access for an initial purchase.
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setConfirmReject(null)}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={!!loadingId}
            onClick={() => { const order = confirmReject; setConfirmReject(null); if (order) void runAction(order, 'reject-payment'); }}
          >
            Reject Payment
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

function OrderDetailDialog({
  order,
  copiedId,
  onCopy,
  onClose,
}: {
  order: Order;
  copiedId: string;
  onCopy: (id: string, value: string) => void;
  onClose: () => void;
}) {
  const activeKey = getActiveKey(order);
  const accessUrl = getAccessUrl(order);
  const summary = summarizePayments(order);
  const payments = [...(order.payments ?? [])].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <Dialog open onClose={onClose} size="lg">
      <DialogHeader>
        <DialogTitle>Order Details</DialogTitle>
        <DialogClose onClose={onClose} />
      </DialogHeader>
      <DialogBody className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-lg border border-border p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-lg font-semibold text-foreground">{order.customer?.full_name || '-'}</div>
                <div className="text-sm text-muted-foreground">{order.customer?.telegram_username || sourceLabel(order.source)}</div>
              </div>
              <div className="flex flex-wrap justify-end gap-1.5">
                <StatusBadge status={order.status} />
                <StatusBadge status={order.payment_status} />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <Info label="Reseller" value={order.reseller?.name || '-'} />
              <Info label="Plan" value={order.plan?.name || '-'} />
              <Info label="Expiry" value={`${formatDate(order.expiry_date)} (${remainingDays(order.expiry_date)})`} />
              <Info label="Source" value={sourceLabel(order.source)} />
              <Info label="Usage" value={formatBytes(getOrderUsageBytes(order, activeKey))} />
              <Info label="Key Status" value={activeKey?.status || '-'} />
            </div>
          </div>

          <div className="rounded-lg border border-border p-4">
            <div className="text-xs uppercase text-muted-foreground">Money</div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Money label="Gross paid" value={summary.gross || order.total_paid_mmk || 0} />
              <Money label="Owner due" value={summary.platformDue} />
              <Money label="Commission" value={summary.commission} />
              <Money label="Pending" value={summary.pending} />
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border p-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-foreground">Dynamic Access Key</h3>
              <p className="text-xs text-muted-foreground">Shown here for inspection; table keeps only copy action.</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              leftIcon={copiedId === `${order.id}:detail` ? <CheckCircle2 size={14} /> : <Copy size={14} />}
              disabled={!accessUrl}
              onClick={() => onCopy(`${order.id}:detail`, accessUrl)}
            >
              Copy
            </Button>
          </div>
          <div className="rounded-md bg-secondary/40 px-3 py-2 font-mono text-xs text-muted-foreground break-all">
            {accessUrl || 'No access key available'}
          </div>
          {accessUrl ? <div className="mt-1 text-xs text-muted-foreground">{truncateMiddle(accessUrl, 42, 18)}</div> : null}
        </div>

        <div className="rounded-lg border border-border">
          <div className="border-b border-border px-4 py-3 font-semibold text-foreground">Payment Timeline</div>
          <div className="divide-y divide-border">
            {payments.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">No payment ledger rows yet.</div>
            ) : (
              payments.map((payment) => (
                <div key={payment.id} className="grid gap-3 px-4 py-3 md:grid-cols-[1fr_auto]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline">{payment.payment_type}</Badge>
                      <StatusBadge status={payment.review_status} />
                      <StatusBadge status={payment.apply_status} />
                      <Badge variant="default">{sourceLabel(payment.source)}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Submitted {formatDate(payment.submitted_at || payment.created_at)}
                      {payment.reviewed_at ? ` - reviewed ${formatDate(payment.reviewed_at)}` : ''}
                    </div>
                    {payment.payment_note ? <div className="mt-1 text-xs text-muted-foreground">{payment.payment_note}</div> : null}
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-foreground">{formatMMK(payment.amount_mmk)}</div>
                    <div className="text-xs text-muted-foreground">{formatMMK(payment.platform_due_mmk)} due</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="primary" onClick={onClose}>Close</Button>
      </DialogFooter>
    </Dialog>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 font-medium text-foreground">{value}</div>
    </div>
  );
}

function Money({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-secondary/35 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-semibold text-foreground">{formatMMK(value)}</div>
    </div>
  );
}
