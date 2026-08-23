import { useEffect, useMemo, useState } from 'react';
import { Bot, Check, Copy, Eye, Loader2, Plus, Search, Store, ToggleLeft, ToggleRight, Wallet } from 'lucide-react';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogBody, DialogClose, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { StatCard } from '@/components/ui/stat-card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { formatDate, formatMMK } from '@/lib/format';
import { usePaginatedTable } from '@/hooks/usePaginatedTable';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { ResellerWorkspaceDialog } from '@/components/ResellerWorkspaceDialog';
import type { AdminAnalytics, AdminResellerBreakdown, OrderPayment, Reseller } from '@/types/api';

interface Props {
  onSuccess: () => Promise<void>;
}

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 63);
}

function sanitizeSlug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-+|-+$/g, '').slice(0, 63);
}

function getInitials(name?: string | null) {
  return String(name || 'R')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'R';
}

function findMetric(metrics: Map<string, AdminResellerBreakdown>, resellerId: string) {
  return (
    metrics.get(resellerId) ?? {
      reseller_id: resellerId,
      reseller_name: '',
      gross_mmk: 0,
      commission_mmk: 0,
      platform_due_mmk: 0,
      payment_count: 0,
    }
  );
}

function paymentCustomer(payment: OrderPayment) {
  return payment.order?.customer?.full_name || 'Unknown customer';
}

function paymentPlan(payment: OrderPayment) {
  return payment.order?.plan?.name || 'Unknown plan';
}

export function ResellersPage({ onSuccess }: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', miniapp_slug: '', commission_percent: '20' });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [tempPassword, setTempPassword] = useState<{ password: string; email: string; onDone: () => void } | null>(null);
  const [togglingId, setTogglingId] = useState('');
  const [month, setMonth] = useState(currentMonthValue);
  const [search, setSearch] = useState('');
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [analyticsError, setAnalyticsError] = useState('');
  const [selectedReseller, setSelectedReseller] = useState<Reseller | null>(null);
  const [configuringReseller, setConfiguringReseller] = useState<Reseller | null>(null);

  const debouncedSearch = useDebouncedValue(search, 300);
  const resellerFilters = useMemo(() => {
    const f: Record<string, string> = {};
    if (debouncedSearch.trim()) f.search = debouncedSearch.trim();
    return f;
  }, [debouncedSearch]);

  const { data: resellers, total, page, totalPages, loading, error, setPage, refresh } =
    usePaginatedTable<Reseller>('/admin/resellers', resellerFilters, 20);

  useEffect(() => {
    setAnalyticsError('');
    api
      .get<AdminAnalytics>('/admin/analytics', { params: { month } })
      .then((res) => setAnalytics(res.data))
      .catch((err: any) => setAnalyticsError(err?.response?.data?.error || err.message || 'Failed to load reseller analytics'));
  }, [month]);

  const slugPreview = form.miniapp_slug.trim()
    ? sanitizeSlug(form.miniapp_slug)
    : slugify(form.name);

  const metricsByReseller = useMemo(
    () => new Map((analytics?.reseller_breakdown ?? []).map((metric) => [metric.reseller_id, metric])),
    [analytics],
  );

  const recentPaymentsByReseller = useMemo(() => {
    const next = new Map<string, OrderPayment[]>();
    for (const payment of analytics?.recent_payments ?? []) {
      if (!payment.reseller_id) continue;
      const list = next.get(payment.reseller_id) ?? [];
      list.push(payment);
      next.set(payment.reseller_id, list);
    }
    return next;
  }, [analytics]);

  const pageTotals = useMemo(
    () =>
      resellers.reduce(
        (acc, reseller) => {
          const metric = findMetric(metricsByReseller, reseller.id);
          acc.gross += metric.gross_mmk;
          acc.due += metric.platform_due_mmk;
          acc.commission += metric.commission_mmk;
          if (reseller.status === 'active') acc.active += 1;
          return acc;
        },
        { gross: 0, due: 0, commission: 0, active: 0 },
      ),
    [metricsByReseller, resellers],
  );

  const handleCreate = async () => {
    setCreating(true);
    setCreateError('');
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        email: form.email.trim(),
        commission_percent: Number(form.commission_percent),
      };
      if (form.miniapp_slug.trim()) body.miniapp_slug = form.miniapp_slug.trim();
      const res = await api.post('/admin/resellers', body);
      setForm({ name: '', email: '', miniapp_slug: '', commission_percent: '20' });
      setShowCreate(false);
      setTempPassword({
        password: res.data.temp_password as string,
        email: form.email.trim(),
        onDone: async () => { refresh(); await onSuccess(); },
      });
    } catch (err: any) {
      setCreateError(err?.response?.data?.error ?? err?.message ?? 'Failed to create reseller');
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (reseller: Reseller) => {
    setTogglingId(reseller.id);
    try {
      await api.patch(`/admin/resellers/${reseller.id}`, { enabled: reseller.status !== 'active' });
      refresh();
      await onSuccess();
    } catch {
      // Keep the existing page behavior: errors surface on the next refresh/global banner.
    } finally {
      setTogglingId('');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Resellers</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Manage seller accounts, mini app access, and monthly business performance.
          </p>
        </div>
        <Button variant="primary" size="md" leftIcon={<Plus size={15} />} onClick={() => setShowCreate(true)}>
          Add Reseller
        </Button>
      </div>

      {(error || analyticsError) && (
        <div className="rounded-md border border-destructive/25 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error || analyticsError}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Active Resellers" value={pageTotals.active} accent="success" icon={<Store size={16} />} />
        <StatCard label="Page Gross" value={formatMMK(pageTotals.gross)} accent="info" icon={<Wallet size={16} />} />
        <StatCard label="Platform Due" value={formatMMK(pageTotals.due)} icon={<Wallet size={16} />} />
        <StatCard label="Commission" value={formatMMK(pageTotals.commission)} accent="warning" icon={<Wallet size={16} />} />
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-md">
            {loading && resellers.length > 0 ? (
              <Loader2 size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
            ) : (
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            )}
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search reseller or email..."
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="w-44" />
            <Badge variant="outline">{total.toLocaleString()} total</Badge>
          </div>
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Reseller</TableHead>
              <TableHead>Mini App</TableHead>
              <TableHead>Commission</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Gross</TableHead>
              <TableHead className="text-right">Owner Due</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={loading && resellers.length > 0 ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
            {loading && resellers.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">Loading...</TableCell>
              </TableRow>
            ) : resellers.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  No resellers match this view.
                </TableCell>
              </TableRow>
            ) : (
              resellers.map((reseller) => {
                const metric = findMetric(metricsByReseller, reseller.id);
                return (
                  <TableRow key={reseller.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">
                          {getInitials(reseller.name)}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-medium text-foreground">{reseller.name}</div>
                          <div className="truncate text-xs text-muted-foreground">{reseller.email ?? '-'}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-mono text-xs text-muted-foreground">{reseller.miniapp_slug ?? '-'}</div>
                      <Badge variant={reseller.miniapp_enabled === false ? 'destructive' : 'success'} className="mt-1">
                        {reseller.miniapp_enabled === false ? 'mini app off' : 'mini app on'}
                      </Badge>
                    </TableCell>
                    <TableCell>{reseller.commission_percent ?? 0}%</TableCell>
                    <TableCell><StatusBadge status={reseller.status ?? 'unknown'} /></TableCell>
                    <TableCell className="text-right">
                      <div className="font-semibold text-foreground">{formatMMK(metric.gross_mmk)}</div>
                      <div className="text-xs text-muted-foreground">{metric.payment_count} payments</div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="font-semibold text-foreground">{formatMMK(metric.platform_due_mmk)}</div>
                      <div className="text-xs text-muted-foreground">{formatMMK(metric.commission_mmk)} kept</div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" leftIcon={<Eye size={14} />} onClick={() => setSelectedReseller(reseller)}>
                          View
                        </Button>
                        <Button variant="outline" size="sm" leftIcon={<Bot size={14} />} onClick={() => setConfiguringReseller(reseller)}>
                          Mini App
                        </Button>
                        <Button
                          variant={reseller.status === 'active' ? 'destructiveOutline' : 'success'}
                          size="sm"
                          leftIcon={reseller.status === 'active' ? <ToggleLeft size={14} /> : <ToggleRight size={14} />}
                          disabled={togglingId === reseller.id}
                          onClick={() => void handleToggle(reseller)}
                        >
                          {togglingId === reseller.id ? '...' : reseller.status === 'active' ? 'Disable' : 'Enable'}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        <Pagination page={page} totalPages={totalPages} total={total} label="resellers" onPageChange={setPage} loading={loading} />
      </Card>

      <Dialog open={showCreate} onClose={() => setShowCreate(false)} size="sm">
        <DialogHeader>
          <DialogTitle>Add Reseller</DialogTitle>
          <DialogClose onClose={() => setShowCreate(false)} />
        </DialogHeader>
        <DialogBody className="space-y-4">
          {createError && (
            <div className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {createError}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Name" required className="col-span-2 sm:col-span-1">
              <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Shadow VPN" />
            </FormField>
            <FormField label="Email" required className="col-span-2 sm:col-span-1">
              <Input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} placeholder="seller@example.com" />
            </FormField>
            <FormField label="Miniapp Slug" hint={`Will use: ${slugPreview || '(enter name first)'}`} className="col-span-2 sm:col-span-1">
              <Input value={form.miniapp_slug} onChange={(e) => setForm((p) => ({ ...p, miniapp_slug: e.target.value }))} placeholder="auto-generated" />
            </FormField>
            <FormField label="Commission %" className="col-span-2 sm:col-span-1">
              <Input type="number" min={0} max={100} value={form.commission_percent} onChange={(e) => setForm((p) => ({ ...p, commission_percent: e.target.value }))} />
            </FormField>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => void handleCreate()} loading={creating} disabled={!form.name.trim() || !form.email.trim()}>
            Create Reseller
          </Button>
        </DialogFooter>
      </Dialog>

      {selectedReseller && (
        <ResellerDetailDialog
          reseller={selectedReseller}
          metric={findMetric(metricsByReseller, selectedReseller.id)}
          recentPayments={recentPaymentsByReseller.get(selectedReseller.id) ?? []}
          onClose={() => setSelectedReseller(null)}
        />
      )}

      {tempPassword && <TempPasswordDialog {...tempPassword} onClose={() => { void tempPassword.onDone(); setTempPassword(null); }} />}

      {configuringReseller && (
        <ResellerWorkspaceDialog
          reseller={configuringReseller}
          onClose={() => {
            setConfiguringReseller(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function ResellerDetailDialog({
  reseller,
  metric,
  recentPayments,
  onClose,
}: {
  reseller: Reseller;
  metric: AdminResellerBreakdown;
  recentPayments: OrderPayment[];
  onClose: () => void;
}) {
  return (
    <Dialog open onClose={onClose} size="lg">
      <DialogHeader>
        <DialogTitle>{reseller.name}</DialogTitle>
        <DialogClose onClose={onClose} />
      </DialogHeader>
      <DialogBody className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-lg border border-border bg-secondary/25 p-3">
            <div className="text-xs uppercase text-muted-foreground">Gross</div>
            <div className="mt-1 font-semibold text-foreground">{formatMMK(metric.gross_mmk)}</div>
          </div>
          <div className="rounded-lg border border-border bg-secondary/25 p-3">
            <div className="text-xs uppercase text-muted-foreground">Owner Due</div>
            <div className="mt-1 font-semibold text-foreground">{formatMMK(metric.platform_due_mmk)}</div>
          </div>
          <div className="rounded-lg border border-border bg-secondary/25 p-3">
            <div className="text-xs uppercase text-muted-foreground">Commission</div>
            <div className="mt-1 font-semibold text-foreground">{formatMMK(metric.commission_mmk)}</div>
          </div>
          <div className="rounded-lg border border-border bg-secondary/25 p-3">
            <div className="text-xs uppercase text-muted-foreground">Payments</div>
            <div className="mt-1 font-semibold text-foreground">{metric.payment_count}</div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-border p-3">
            <div className="text-xs uppercase text-muted-foreground">Account</div>
            <div className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Email</span><span>{reseller.email ?? '-'}</span></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Status</span><StatusBadge status={reseller.status ?? 'unknown'} /></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Commission</span><span>{reseller.commission_percent ?? 0}%</span></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Created</span><span>{formatDate(reseller.created_at)}</span></div>
            </div>
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="text-xs uppercase text-muted-foreground">Mini App</div>
            <div className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Slug</span><span className="font-mono text-xs">{reseller.miniapp_slug ?? '-'}</span></div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Visibility</span>
                <Badge variant={reseller.miniapp_enabled === false ? 'destructive' : 'success'}>
                  {reseller.miniapp_enabled === false ? 'off' : 'on'}
                </Badge>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border">
          <div className="border-b border-border px-3 py-2 font-medium text-foreground">Recent payments</div>
          <div className="divide-y divide-border">
            {recentPayments.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">No recent payment events for this reseller.</div>
            ) : (
              recentPayments.slice(0, 5).map((payment) => (
                <div key={payment.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">{paymentCustomer(payment)}</div>
                    <div className="truncate text-xs text-muted-foreground">{paymentPlan(payment)} - {payment.payment_type} - {formatDate(payment.created_at)}</div>
                  </div>
                  <div className="text-right text-sm font-semibold">{formatMMK(payment.amount_mmk)}</div>
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

function TempPasswordDialog({ password, email, onClose }: { password: string; email: string; onDone: () => void; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open onClose={onClose} size="sm">
      <DialogHeader>
        <DialogTitle>Reseller Created</DialogTitle>
        <DialogClose onClose={onClose} />
      </DialogHeader>
      <DialogBody className="space-y-4">
        <div className="rounded-md border border-warning/25 bg-warning/10 px-3 py-2 text-sm text-warning">
          This temporary password is shown <strong>once only</strong>. Copy it before closing.
        </div>
        <div className="text-sm text-muted-foreground">Login email: <span className="font-medium text-foreground">{email}</span></div>
        <div className="flex items-center gap-2 rounded-md bg-secondary px-3 py-2">
          <span className="flex-1 break-all font-mono text-sm">{password}</span>
          <button onClick={copy} className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground">
            {copied ? <Check size={15} className="text-success" /> : <Copy size={15} />}
          </button>
        </div>
        {copied && <Badge variant="success">Copied to clipboard</Badge>}
      </DialogBody>
      <DialogFooter>
        <Button variant="primary" onClick={onClose}>Done - I've saved it</Button>
      </DialogFooter>
    </Dialog>
  );
}
