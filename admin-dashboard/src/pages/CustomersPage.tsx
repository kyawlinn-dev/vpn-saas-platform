import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Clipboard, Copy, Eye, Loader2, Search, Trash2, UserCheck, Users, Wallet } from 'lucide-react';
import { ActionMenu, type ActionMenuItem } from '@/components/ui/action-menu';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogBody, DialogClose, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { Select } from '@/components/ui/select';
import { StatCard } from '@/components/ui/stat-card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatBytes, formatDate, formatMMK } from '@/lib/format';
import { api } from '@/lib/api';
import { usePaginatedTable } from '@/hooks/usePaginatedTable';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import type { Customer, Order, OrderPayment, Reseller, VpnKey } from '@/types/api';

interface Props {
  resellers: Reseller[];
}

interface CleanupPreview {
  reseller_id: string;
  reseller_name: string | null;
  customer_ids: string[];
  customers: Array<{
    id: string;
    full_name: string;
    telegram_username: string | null;
    phone: string | null;
    created_at: string | null;
    order_count: number;
    confirmed_paid_mmk: number;
  }>;
  counts: {
    customers: number;
    orders: number;
    active_orders: number;
    keys: number;
    active_keys: number;
    orphan_active_keys: number;
    payments: number;
    confirmed_paid_payments: number;
    telegram_links: number;
    access_tokens: number;
    commission_rows: number;
  };
  gross_confirmed_mmk: number;
  has_confirmed_paid_data: boolean;
  warnings: string[];
}

function getActiveOrder(customer: Customer): Order | null {
  return customer.active_order || customer.orders?.find((order) => order.status === 'active') || customer.orders?.[0] || null;
}

function getActiveKey(customer: Customer): VpnKey | null {
  const activeOrder = getActiveOrder(customer);
  return (
    activeOrder?.keys?.find((key) => key.status === 'active') ||
    customer.keys?.find((key) => key.status === 'active') ||
    activeOrder?.keys?.[0] ||
    customer.keys?.[0] ||
    null
  );
}

function getCustomerUsageBytes(customer: Customer, activeOrder: Order | null, activeKey: VpnKey | null): number {
  if (typeof activeOrder?.total_used_bytes === 'number') return activeOrder.total_used_bytes;
  if (typeof activeKey?.order_total_used_bytes === 'number') return activeKey.order_total_used_bytes;
  return activeKey?.used_bytes ?? 0;
}

function getAccessUrl(customer: Customer) {
  const activeOrder = getActiveOrder(customer);
  const activeKey = getActiveKey(customer);
  return (
    customer.dynamic_access_url ||
    customer.ssconf_url ||
    customer.preferred_access_url ||
    activeOrder?.dynamic_access_url ||
    activeOrder?.ssconf_url ||
    activeOrder?.preferred_access_url ||
    activeKey?.dynamic_access_url ||
    activeKey?.ssconf_url ||
    activeKey?.preferred_access_url ||
    activeKey?.access_url ||
    ''
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

function displayTelegram(customer: Customer) {
  const username = customer.telegram_username || customer.telegram_link?.telegram_username;
  if (username) return `@${username}`;
  if (customer.telegram_link?.telegram_user_id) return String(customer.telegram_link.telegram_user_id);
  return '-';
}

type PaymentWithOrder = OrderPayment & { parentOrder: Order };

function allPaymentRows(customer: Customer): PaymentWithOrder[] {
  return (customer.orders ?? []).flatMap((order) =>
    (order.payments ?? []).map((payment) => ({ ...payment, parentOrder: order })),
  );
}

function sortPayments(payments: PaymentWithOrder[]) {
  return [...payments].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

function paymentEventLabel(value?: string | null) {
  if (!value) return 'Initial';
  return value.replace(/_/g, ' ').replace(/^\w/, (char) => char.toUpperCase());
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

export function CustomersPage({ resellers }: Props) {
  const [search, setSearch] = useState('');
  const [resellerFilter, setResellerFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedCustomerLoading, setSelectedCustomerLoading] = useState(false);
  const [selectedCustomerError, setSelectedCustomerError] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [cleanupPreview, setCleanupPreview] = useState<CleanupPreview | null>(null);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupError, setCleanupError] = useState('');
  const [cleanupConfirmText, setCleanupConfirmText] = useState('');
  const [allowPaidCleanup, setAllowPaidCleanup] = useState(false);
  const { copiedId, copy } = useClipboard();

  const debouncedSearch = useDebouncedValue(search, 300);

  const filters = useMemo(() => {
    const next: Record<string, string> = {};
    if (resellerFilter !== 'all') next.reseller_id = resellerFilter;
    if (typeFilter !== 'all') next.customer_type = typeFilter;
    if (debouncedSearch.trim()) next.search = debouncedSearch.trim();
    return next;
  }, [resellerFilter, typeFilter, debouncedSearch]);

  const { data: customers, total, page, totalPages, loading, error, setPage, refresh } =
    usePaginatedTable<Customer>('/admin/customers', filters, 100);

  useEffect(() => {
    setSelectedIds(new Set());
    setCleanupPreview(null);
    setCleanupError('');
  }, [resellerFilter]);

  const pageTotals = useMemo(
    () =>
      customers.reduce(
        (acc, customer) => {
          acc.gross += Number(customer.payment_summary?.gross_mmk || 0);
          if (customer.customer_type === 'telegram') acc.telegram += 1;
          if (getActiveOrder(customer)?.status === 'active') acc.active += 1;
          return acc;
        },
        { gross: 0, telegram: 0, active: 0 },
      ),
    [customers],
  );

  const cleanupCandidateIds = useMemo(
    () => (resellerFilter === 'all' ? [] : customers.filter((customer) => customer.reseller_id === resellerFilter).map((customer) => customer.id)),
    [customers, resellerFilter],
  );
  const cleanupCandidateIdSet = useMemo(() => new Set(cleanupCandidateIds), [cleanupCandidateIds]);
  const selectedCleanupIds = useMemo(
    () => cleanupCandidateIds.filter((id) => selectedIds.has(id)),
    [cleanupCandidateIds, selectedIds],
  );
  const selectionEnabled = resellerFilter !== 'all' && !loading;
  const visibleSelectableIds = customers
    .filter((customer) => customer.reseller_id === resellerFilter)
    .map((customer) => customer.id);
  const allVisibleSelected = visibleSelectableIds.length > 0 && visibleSelectableIds.every((id) => selectedIds.has(id));

  useEffect(() => {
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => cleanupCandidateIdSet.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [cleanupCandidateIdSet]);

  const toggleCustomerSelection = (customerId: string) => {
    if (!selectionEnabled || !cleanupCandidateIdSet.has(customerId)) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(customerId)) next.delete(customerId);
      else next.add(customerId);
      return next;
    });
  };

  const toggleVisibleSelection = () => {
    if (!selectionEnabled) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleSelectableIds.forEach((id) => next.delete(id));
      } else {
        visibleSelectableIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const previewCleanup = async () => {
    if (!selectionEnabled) return;
    if (selectedCleanupIds.length === 0) {
      setSelectedIds(new Set());
      setCleanupError('No selected customers belong to the current reseller.');
      return;
    }
    setCleanupLoading(true);
    setCleanupError('');
    setCleanupPreview(null);
    setCleanupConfirmText('');
    setAllowPaidCleanup(false);
    try {
      const res = await api.post<{ success: boolean; preview: CleanupPreview }>('/admin/customers/cleanup-preview', {
        reseller_id: resellerFilter,
        customer_ids: selectedCleanupIds,
      });
      setCleanupPreview(res.data.preview);
    } catch (err: any) {
      setCleanupError(err?.response?.data?.error || err.message || 'Failed to preview cleanup');
    } finally {
      setCleanupLoading(false);
    }
  };

  const deleteSelectedCustomers = async () => {
    if (!cleanupPreview) return;
    setCleanupLoading(true);
    setCleanupError('');
    try {
      await api.post('/admin/customers/cleanup-delete', {
        reseller_id: cleanupPreview.reseller_id,
        customer_ids: cleanupPreview.customer_ids,
        confirmation: cleanupConfirmText,
        allow_paid_customers: allowPaidCleanup,
      });
      setSelectedIds(new Set());
      setCleanupPreview(null);
      setCleanupConfirmText('');
      setAllowPaidCleanup(false);
      refresh();
    } catch (err: any) {
      setCleanupError(err?.response?.data?.error || err.message || 'Failed to delete selected customers');
    } finally {
      setCleanupLoading(false);
    }
  };

  const openCustomerDetails = async (customer: Customer) => {
    setSelectedCustomer(customer);
    setSelectedCustomerLoading(true);
    setSelectedCustomerError('');
    try {
      const res = await api.get<{ data: Customer }>(`/admin/customers/${customer.id}`);
      setSelectedCustomer(res.data.data);
    } catch (err: any) {
      setSelectedCustomerError(err?.response?.data?.error || err.message || 'Failed to load customer details');
    } finally {
      setSelectedCustomerLoading(false);
    }
  };

  const getActions = (customer: Customer): ActionMenuItem[] => [
    {
      label: 'View details',
      icon: <Eye size={14} />,
      onSelect: () => void openCustomerDetails(customer),
    },
    {
      label: 'Copy access key',
      icon: <Copy size={14} />,
      disabled: !getAccessUrl(customer),
      onSelect: () => void copy(customer.id, getAccessUrl(customer)),
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Customers</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Customer lifecycle, active package, access, and lifetime payment history.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/25 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      {cleanupError && !cleanupPreview && (
        <div className="rounded-md border border-destructive/25 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {cleanupError}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Customers" value={total.toLocaleString()} icon={<Users size={16} />} />
        <StatCard label="Active Customers" value={pageTotals.active} accent="success" icon={<UserCheck size={16} />} />
        <StatCard label="Telegram Users" value={pageTotals.telegram} accent="info" icon={<Users size={16} />} />
        <StatCard label="Page Lifetime Paid" value={formatMMK(pageTotals.gross)} accent="success" icon={<Wallet size={16} />} />
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-48 flex-1">
            {loading && customers.length > 0 ? (
              <Loader2 size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
            ) : (
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            )}
            <Input
              className="pl-8"
              placeholder="Search name, Telegram, phone..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <Select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="w-full lg:w-44">
            <option value="all">All customers</option>
            <option value="telegram">Telegram</option>
            <option value="normal">Normal</option>
          </Select>
          <Select
            value={resellerFilter}
            onChange={(event) => {
              setSelectedIds(new Set());
              setCleanupPreview(null);
              setCleanupError('');
              setResellerFilter(event.target.value);
              setSearch('');
            }}
            className="w-full lg:w-52"
          >
            <option value="all">All resellers</option>
            {resellers.map((reseller) => <option key={reseller.id} value={reseller.id}>{reseller.name}</option>)}
          </Select>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-sm font-semibold text-foreground">Test Data Cleanup</div>
            <p className="text-xs text-muted-foreground">
              Choose one reseller first, then select exact test customers. Unselected customers and other resellers are untouched.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={selectionEnabled ? 'info' : 'warning'}>
              {selectionEnabled ? `${selectedCleanupIds.length} selected` : 'Select reseller first'}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              disabled={!selectionEnabled || selectedCleanupIds.length === 0 || cleanupLoading}
              onClick={() => setSelectedIds(new Set())}
            >
              Clear
            </Button>
            <Button
              variant="destructiveOutline"
              size="sm"
              leftIcon={<Trash2 size={14} />}
              disabled={!selectionEnabled || selectedCleanupIds.length === 0 || loading || cleanupLoading}
              loading={cleanupLoading && !cleanupPreview}
              onClick={() => void previewCleanup()}
            >
              Preview Delete
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border"
                  disabled={!selectionEnabled || customers.length === 0}
                  checked={selectionEnabled && allVisibleSelected}
                  onChange={toggleVisibleSelection}
                  aria-label="Select visible customers"
                />
              </TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Reseller</TableHead>
              <TableHead>Current Package</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Expiry</TableHead>
              <TableHead>Usage</TableHead>
              <TableHead>Trial</TableHead>
              <TableHead>Access</TableHead>
              <TableHead className="text-right">Lifetime Paid</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={loading && customers.length > 0 ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
            {loading && customers.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={11} className="py-10 text-center text-muted-foreground">Loading...</TableCell>
              </TableRow>
            ) : customers.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={11} className="py-10 text-center text-muted-foreground">No customers found.</TableCell>
              </TableRow>
            ) : (
              customers.map((customer) => {
                const activeOrder = getActiveOrder(customer);
                const activeKey = getActiveKey(customer);
                const accessUrl = getAccessUrl(customer);
                const summary = customer.payment_summary;

                return (
                  <TableRow key={customer.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-border"
                        disabled={!selectionEnabled}
                        checked={selectedIds.has(customer.id)}
                        onChange={() => toggleCustomerSelection(customer.id)}
                        aria-label={`Select ${customer.full_name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-foreground">{customer.full_name}</div>
                      <div className="text-xs text-muted-foreground">{displayTelegram(customer)}</div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{customer.reseller?.name || '-'}</TableCell>
                    <TableCell>
                      <div className="font-medium text-foreground">{activeOrder?.plan?.name || '-'}</div>
                      <div className="text-xs text-muted-foreground">{activeOrder?.order_type || customer.customer_type}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        <StatusBadge status={activeOrder?.status || customer.status || 'inactive'} />
                        <Badge variant={customer.customer_type === 'telegram' ? 'info' : 'default'}>{customer.customer_type || 'normal'}</Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>{formatDate(activeOrder?.expiry_date)}</div>
                      <div className="text-xs text-muted-foreground">{remainingDays(activeOrder?.expiry_date)}</div>
                    </TableCell>
                    <TableCell>
                      <div>{formatBytes(getCustomerUsageBytes(customer, activeOrder, activeKey))}</div>
                      <div className="text-xs text-muted-foreground">{activeKey?.status || '-'}</div>
                    </TableCell>
                    <TableCell>
                      {customer.telegram_link?.trial_used_at ? (
                        <Badge variant="success">used</Badge>
                      ) : customer.customer_type === 'telegram' ? (
                        <Badge variant="outline">available</Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={!accessUrl}
                        title={accessUrl ? 'Copy access key' : 'No access key'}
                        onClick={() => void copy(customer.id, accessUrl)}
                      >
                        {copiedId === customer.id ? <CheckCircle2 size={15} className="text-success" /> : <Clipboard size={15} />}
                      </Button>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="font-semibold text-foreground">{formatMMK(summary?.gross_mmk ?? 0)}</div>
                      <div className="text-xs text-muted-foreground">{summary?.confirmed_count ?? 0} payments</div>
                    </TableCell>
                    <TableCell className="text-right">
                      <ActionMenu items={getActions(customer)} label="Customer actions" />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        <Pagination page={page} totalPages={totalPages} total={total} label="customers" onPageChange={setPage} loading={loading} />
      </Card>

      {selectedCustomer && (
        <CustomerDetailDialog
          customer={selectedCustomer}
          loading={selectedCustomerLoading}
          error={selectedCustomerError}
          copiedId={copiedId}
          onCopy={(id, value) => void copy(id, value)}
          onClose={() => {
            setSelectedCustomer(null);
            setSelectedCustomerLoading(false);
            setSelectedCustomerError('');
          }}
        />
      )}

      {cleanupPreview && (
        <CleanupPreviewDialog
          preview={cleanupPreview}
          error={cleanupError}
          loading={cleanupLoading}
          confirmation={cleanupConfirmText}
          allowPaid={allowPaidCleanup}
          onConfirmationChange={setCleanupConfirmText}
          onAllowPaidChange={setAllowPaidCleanup}
          onDelete={() => void deleteSelectedCustomers()}
          onClose={() => {
            if (cleanupLoading) return;
            setCleanupPreview(null);
            setCleanupConfirmText('');
            setAllowPaidCleanup(false);
            setCleanupError('');
          }}
        />
      )}
    </div>
  );
}

function CleanupPreviewDialog({
  preview,
  error,
  loading,
  confirmation,
  allowPaid,
  onConfirmationChange,
  onAllowPaidChange,
  onDelete,
  onClose,
}: {
  preview: CleanupPreview;
  error: string;
  loading: boolean;
  confirmation: string;
  allowPaid: boolean;
  onConfirmationChange: (value: string) => void;
  onAllowPaidChange: (value: boolean) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const canDelete =
    confirmation === 'DELETE TEST CUSTOMERS' &&
    preview.counts.orphan_active_keys === 0 &&
    (!preview.has_confirmed_paid_data || allowPaid);

  return (
    <Dialog open onClose={onClose} size="lg">
      <DialogHeader>
        <DialogTitle>Delete Selected Test Customers</DialogTitle>
        <DialogClose onClose={onClose} />
      </DialogHeader>
      <DialogBody className="space-y-4">
        {error && (
          <div className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Only selected customers under {preview.reseller_name || 'this reseller'} will be deleted.</p>
              <p className="mt-1 text-warning/85">This removes linked orders, payment ledger rows, VPN keys, tokens, and Telegram links for the selected test customers.</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <CleanupMetric label="Customers" value={preview.counts.customers} />
          <CleanupMetric label="Orders" value={preview.counts.orders} />
          <CleanupMetric label="Active Keys" value={preview.counts.active_keys} />
          <CleanupMetric label="Payments" value={preview.counts.payments} />
          <CleanupMetric label="Paid" value={formatMMK(preview.gross_confirmed_mmk)} />
        </div>

        {preview.warnings.length > 0 && (
          <div className="space-y-1 rounded-lg border border-border bg-secondary/25 p-3">
            {preview.warnings.map((warning) => (
              <p key={warning} className="text-xs text-muted-foreground">{warning}</p>
            ))}
          </div>
        )}

        {preview.counts.orphan_active_keys > 0 && (
          <div className="rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
            Cleanup is blocked until orphan active VPN keys are handled manually.
          </div>
        )}

        <div className="max-h-56 overflow-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Customer</TableHead>
                <TableHead>Orders</TableHead>
                <TableHead className="text-right">Confirmed Paid</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.customers.map((customer) => (
                <TableRow key={customer.id} className="hover:bg-transparent">
                  <TableCell>
                    <div className="font-medium text-foreground">{customer.full_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {customer.telegram_username ? `@${customer.telegram_username}` : customer.phone || '-'}
                    </div>
                  </TableCell>
                  <TableCell>{customer.order_count}</TableCell>
                  <TableCell className="text-right font-semibold">{formatMMK(customer.confirmed_paid_mmk)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {preview.has_confirmed_paid_data && (
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/10 p-3">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded"
              checked={allowPaid}
              onChange={(event) => onAllowPaidChange(event.target.checked)}
            />
            <span className="text-sm text-destructive">
              I understand selected rows include confirmed paid ledger data and these are test customers.
            </span>
          </label>
        )}

        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">Type DELETE TEST CUSTOMERS to confirm</p>
          <Input
            value={confirmation}
            onChange={(event) => onConfirmationChange(event.target.value)}
            placeholder="DELETE TEST CUSTOMERS"
          />
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
        <Button
          variant="destructive"
          leftIcon={<Trash2 size={14} />}
          disabled={!canDelete || loading}
          loading={loading}
          onClick={onDelete}
        >
          Delete Selected Test Customers
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

function CleanupMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/20 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-bold text-foreground">{value}</p>
    </div>
  );
}

function CustomerDetailDialog({
  customer,
  loading,
  error,
  copiedId,
  onCopy,
  onClose,
}: {
  customer: Customer;
  loading: boolean;
  error: string;
  copiedId: string;
  onCopy: (id: string, value: string) => void;
  onClose: () => void;
}) {
  const activeOrder = getActiveOrder(customer);
  const activeKey = getActiveKey(customer);
  const accessUrl = getAccessUrl(customer);
  const payments = sortPayments(allPaymentRows(customer));
  const orders = customer.orders ?? [];
  const keys = customer.keys ?? [];

  return (
    <Dialog open onClose={onClose} size="xl">
      <DialogHeader>
        <DialogTitle>{customer.full_name}</DialogTitle>
        <DialogClose onClose={onClose} />
      </DialogHeader>
      <DialogBody className="max-h-[calc(100vh-11rem)] space-y-4 overflow-y-auto">
        {loading && (
          <div className="rounded-md border border-primary/20 bg-primary/10 px-3 py-2 text-sm text-primary">
            Loading complete customer ledger...
          </div>
        )}
        {error && (
          <div className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
        <div className="grid gap-3 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-lg border border-border p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-lg font-semibold text-foreground">{customer.full_name}</div>
                <div className="text-sm text-muted-foreground">{displayTelegram(customer)}</div>
              </div>
              <div className="flex flex-wrap justify-end gap-1.5">
                <Badge variant={customer.customer_type === 'telegram' ? 'info' : 'default'}>{customer.customer_type || 'normal'}</Badge>
                <StatusBadge status={activeOrder?.status || customer.status || 'inactive'} />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <Info label="Reseller" value={customer.reseller?.name || '-'} />
              <Info label="Phone" value={customer.phone || '-'} />
              <Info label="Joined" value={formatDate(customer.created_at)} />
              <Info label="Trial" value={customer.telegram_link?.trial_used_at ? `Used ${formatDate(customer.telegram_link.trial_used_at)}` : customer.customer_type === 'telegram' ? 'Available' : '-'} />
            </div>
          </div>

          <div className="rounded-lg border border-border p-4">
            <div className="text-xs uppercase text-muted-foreground">Current Package</div>
            <div className="mt-2 text-lg font-semibold text-foreground">{activeOrder?.plan?.name || '-'}</div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <Info label="Expiry" value={`${formatDate(activeOrder?.expiry_date)} (${remainingDays(activeOrder?.expiry_date)})`} />
              <Info label="Usage" value={formatBytes(getCustomerUsageBytes(customer, activeOrder, activeKey))} />
              <Info label="Key Status" value={activeKey?.status || '-'} />
              <Info label="Orders" value={String(orders.length)} />
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <Money label="Lifetime paid" value={customer.payment_summary?.gross_mmk ?? 0} />
          <Money label="Owner due" value={customer.payment_summary?.platform_due_mmk ?? 0} />
          <Money label="Commission" value={customer.payment_summary?.commission_mmk ?? 0} />
          <Money label="Pending review" value={customer.payment_summary?.pending_mmk ?? 0} />
        </div>

        <div className="rounded-lg border border-border p-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-foreground">Dynamic Access Key</h3>
              <p className="text-xs text-muted-foreground">Customer-level permanent ssconf access.</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              leftIcon={copiedId === `${customer.id}:detail` ? <CheckCircle2 size={14} /> : <Copy size={14} />}
              disabled={!accessUrl}
              onClick={() => onCopy(`${customer.id}:detail`, accessUrl)}
            >
              Copy
            </Button>
          </div>
          <div className="rounded-md bg-secondary/40 px-3 py-2 font-mono text-xs text-muted-foreground break-all">
            {accessUrl || 'No access key available'}
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <HistoryCard title="Order History" empty="No orders for this customer.">
            {orders.map((order) => (
              <div key={order.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">{order.plan?.name || '-'}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(order.created_at)} - expires {formatDate(order.expiry_date)}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {order.plan?.duration_days ?? '-'} days / {order.plan?.data_limit_gb ?? '-'} GB
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                  <StatusBadge status={order.status} />
                  {order.order_type ? <Badge variant="outline">{order.order_type}</Badge> : null}
                </div>
              </div>
            ))}
          </HistoryCard>

          <HistoryCard title="Payment Ledger" empty="No payment rows for this customer.">
            {payments.map((payment) => (
              <div key={payment.id} className="grid gap-3 px-3 py-3 md:grid-cols-[1.25fr_1fr]">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline">{paymentEventLabel(payment.payment_type)}</Badge>
                    <StatusBadge status={payment.review_status} />
                    <StatusBadge status={payment.apply_status} />
                    {payment.source ? <Badge variant="info">{payment.source}</Badge> : null}
                  </div>
                  <div className="text-sm font-medium text-foreground">{payment.parentOrder.plan?.name || '-'}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(payment.created_at)} - {payment.package_duration_days ?? payment.parentOrder.plan?.duration_days ?? '-'} days -{' '}
                    {payment.package_data_limit_gb ?? payment.parentOrder.plan?.data_limit_gb ?? '-'} GB
                  </div>
                  {payment.payment_note ? (
                    <div className="truncate text-xs text-muted-foreground">Note: {payment.payment_note}</div>
                  ) : null}
                </div>
                <div className="grid grid-cols-3 gap-2 text-right text-xs md:self-center">
                  <LedgerAmount label="Gross" value={payment.amount_mmk} strong />
                  <LedgerAmount label="Commission" value={payment.commission_amount_mmk} />
                  <LedgerAmount label="Owner due" value={payment.platform_due_mmk} accent />
                </div>
              </div>
            ))}
          </HistoryCard>
        </div>

        <HistoryCard title="VPN Key History" empty="No VPN keys for this customer.">
          {keys.map((key) => (
            <div key={key.id} className="grid gap-2 px-3 py-2.5 md:grid-cols-[1fr_auto_auto] md:items-center">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-foreground">{key.key_name || key.outline_key_id || key.id}</div>
                <div className="text-xs text-muted-foreground">{formatDate(key.created_at)}</div>
              </div>
              <div className="text-sm text-muted-foreground">{formatBytes(key.used_bytes)}</div>
              <StatusBadge status={key.status} />
            </div>
          ))}
        </HistoryCard>
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
    <div className="rounded-lg border border-border bg-secondary/25 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-semibold text-foreground">{formatMMK(value)}</div>
    </div>
  );
}

function LedgerAmount({ label, value, strong, accent }: { label: string; value: number; strong?: boolean; accent?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className={strong || accent ? 'mt-0.5 font-semibold text-foreground' : 'mt-0.5 text-muted-foreground'}>
        <span className={accent ? 'text-success' : undefined}>{formatMMK(value)}</span>
      </div>
    </div>
  );
}

function HistoryCard({ title, empty, children }: { title: string; empty: string; children: ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);

  return (
    <div className="rounded-lg border border-border">
      <div className="border-b border-border px-3 py-2 font-semibold text-foreground">{title}</div>
      <div className="divide-y divide-border">
        {hasChildren ? children : <div className="px-3 py-6 text-center text-sm text-muted-foreground">{empty}</div>}
      </div>
    </div>
  );
}
