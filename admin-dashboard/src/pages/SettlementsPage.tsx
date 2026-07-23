import { useMemo, useState } from 'react';
import {
  Calculator,
  CheckCircle2,
  ExternalLink,
  Eye,
  FileImage,
  RotateCcw,
  Search,
  Wallet,
} from 'lucide-react';
import { ActionMenu, type ActionMenuItem } from '@/components/ui/action-menu';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogBody, DialogClose, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { Select } from '@/components/ui/select';
import { StatCard } from '@/components/ui/stat-card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { formatDate, formatMMK } from '@/lib/format';
import { usePaginatedTable } from '@/hooks/usePaginatedTable';
import type { MonthlySettlement, Reseller } from '@/types/api';

interface Props {
  resellers: Reseller[];
}

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function SettlementBadge({ status }: { status: string }) {
  const variant =
    status === 'confirmed'
      ? 'success'
      : status === 'submitted'
        ? 'warning'
        : status === 'reopened'
          ? 'destructive'
          : 'default';

  return <Badge variant={variant}>{status.replace(/_/g, ' ')}</Badge>;
}

function settlementMonthLabel(value: string) {
  if (!value) return '-';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export function SettlementsPage({ resellers }: Props) {
  const [month, setMonth] = useState(currentMonthValue);
  const [statusFilter, setStatusFilter] = useState('all');
  const [resellerFilter, setResellerFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [adminNote, setAdminNote] = useState('');
  const [busyId, setBusyId] = useState('');
  const [proofId, setProofId] = useState('');
  const [selectedSettlement, setSelectedSettlement] = useState<MonthlySettlement | null>(null);
  const [message, setMessage] = useState('');
  const [actionError, setActionError] = useState('');

  const filters = useMemo(() => {
    const next: Record<string, string> = {};
    if (month) next.month = month;
    if (statusFilter !== 'all') next.status = statusFilter;
    if (resellerFilter !== 'all') next.reseller_id = resellerFilter;
    return next;
  }, [month, statusFilter, resellerFilter]);

  const { data, total, page, totalPages, loading, error, setPage, refresh } =
    usePaginatedTable<MonthlySettlement>('/admin/settlements', filters, 20);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return data;
    return data.filter((settlement) =>
      [
        settlement.reseller?.name,
        settlement.reseller?.email,
        settlement.transfer_reference,
        settlement.transfer_note,
        settlement.status,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [data, search]);

  const totals = useMemo(
    () =>
      data.reduce(
        (acc, settlement) => {
          acc.platformDue += Number(settlement.platform_due_mmk || 0);
          acc.gross += Number(settlement.gross_paid_mmk || 0);
          acc.commission += Number(settlement.reseller_commission_mmk || 0);
          acc.pendingReview += Number(settlement.pending_review_mmk || 0);
          if (settlement.status === 'submitted') {
            acc.submitted += Number(settlement.platform_due_mmk || 0);
            acc.submittedCount += 1;
          }
          if (settlement.status === 'confirmed') {
            acc.confirmed += Number(settlement.platform_due_mmk || 0);
            acc.confirmedCount += 1;
          }
          if (settlement.status === 'draft') acc.draftCount += 1;
          if (settlement.status === 'reopened') acc.reopenedCount += 1;
          return acc;
        },
        {
          platformDue: 0,
          gross: 0,
          commission: 0,
          pendingReview: 0,
          submitted: 0,
          confirmed: 0,
          submittedCount: 0,
          confirmedCount: 0,
          draftCount: 0,
          reopenedCount: 0,
        },
      ),
    [data],
  );

  const runAction = async (settlement: MonthlySettlement, action: 'confirm' | 'reopen') => {
    try {
      setBusyId(`${settlement.id}:${action}`);
      setMessage('');
      setActionError('');
      const res = await api.post<{ settlement: MonthlySettlement }>(`/admin/settlements/${settlement.id}/${action}`, {
        admin_note: adminNote,
      });
      setMessage(action === 'confirm' ? 'Settlement confirmed.' : 'Settlement reopened.');
      setSelectedSettlement(res.data.settlement);
      setAdminNote('');
      refresh();
    } catch (err: any) {
      setActionError(err?.response?.data?.error || err.message || `Failed to ${action} settlement`);
    } finally {
      setBusyId('');
    }
  };

  const openProof = async (settlement: MonthlySettlement) => {
    try {
      setProofId(settlement.id);
      setActionError('');
      const res = await api.get<{ signed_url: string }>(`/admin/settlements/${settlement.id}/proof-url`);
      window.open(res.data.signed_url, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      setActionError(err?.response?.data?.error || err.message || 'Failed to open transfer proof');
    } finally {
      setProofId('');
    }
  };

  const getActions = (settlement: MonthlySettlement): ActionMenuItem[] => [
    {
      label: 'View details',
      icon: <Eye size={14} />,
      onSelect: () => setSelectedSettlement(settlement),
    },
    {
      label: 'Open proof',
      icon: <FileImage size={14} />,
      disabled: !settlement.transfer_proof_url || proofId === settlement.id,
      onSelect: () => void openProof(settlement),
    },
    {
      label: 'Confirm settlement',
      icon: <CheckCircle2 size={14} />,
      disabled: settlement.status === 'confirmed' || busyId === `${settlement.id}:confirm`,
      onSelect: () => void runAction(settlement, 'confirm'),
    },
    {
      label: 'Reopen settlement',
      icon: <RotateCcw size={14} />,
      disabled: settlement.status !== 'confirmed' || busyId === `${settlement.id}:reopen`,
      destructive: true,
      onSelect: () => void runAction(settlement, 'reopen'),
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Settlements</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Month-end reseller transfers, proof review, and owner confirmation.
        </p>
      </div>

      {message && <div className="rounded-md border border-success/25 bg-success/10 px-4 py-2 text-sm text-success">{message}</div>}
      {(error || actionError) && (
        <div className="rounded-md border border-destructive/25 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {actionError || error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
        <StatCard label="Platform Due" value={formatMMK(totals.platformDue)} icon={<Wallet size={16} />} />
        <StatCard label="Submitted" value={formatMMK(totals.submitted)} accent="warning" icon={<Calculator size={16} />} />
        <StatCard label="Confirmed" value={formatMMK(totals.confirmed)} accent="success" icon={<CheckCircle2 size={16} />} />
        <StatCard label="Commission" value={formatMMK(totals.commission)} accent="info" icon={<Wallet size={16} />} />
        <StatCard label="Pending Review" value={formatMMK(totals.pendingReview)} accent="warning" icon={<Calculator size={16} />} className="col-span-2 xl:col-span-1" />
      </div>

      <Card className="p-4">
        <div className="grid gap-3 xl:grid-cols-[1fr_0.75fr_0.75fr_0.9fr]">
          <label className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search reseller, reference, note..."
              className="pl-8"
            />
          </label>
          <Input
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value || currentMonthValue())}
          />
          <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="submitted">Submitted</option>
            <option value="confirmed">Confirmed</option>
            <option value="reopened">Reopened</option>
            <option value="draft">Draft</option>
          </Select>
          <Select value={resellerFilter} onChange={(event) => setResellerFilter(event.target.value)}>
            <option value="all">All resellers</option>
            {resellers.map((reseller) => (
              <option key={reseller.id} value={reseller.id}>
                {reseller.name}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Reseller</TableHead>
              <TableHead>Month</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Transfer</TableHead>
              <TableHead className="text-right">Gross</TableHead>
              <TableHead className="text-right">Commission</TableHead>
              <TableHead className="text-right">Due</TableHead>
              <TableHead>Proof</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">Loading...</TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">No settlements found.</TableCell>
              </TableRow>
            ) : (
              filtered.map((settlement) => (
                <TableRow key={settlement.id}>
                  <TableCell>
                    <div className="font-medium text-foreground">{settlement.reseller?.name || 'Unknown reseller'}</div>
                    <div className="text-xs text-muted-foreground">{settlement.reseller?.email || '-'}</div>
                  </TableCell>
                  <TableCell>
                    <div>{settlementMonthLabel(settlement.settlement_month)}</div>
                    <div className="text-xs text-muted-foreground">{formatDate(settlement.updated_at)}</div>
                  </TableCell>
                  <TableCell><SettlementBadge status={settlement.status} /></TableCell>
                  <TableCell className="max-w-64">
                    <div className="truncate text-xs font-medium text-foreground">{settlement.transfer_reference || '-'}</div>
                    <div className="line-clamp-2 text-xs text-muted-foreground">{settlement.transfer_note || '-'}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {settlement.submitted_at ? `Submitted ${formatDate(settlement.submitted_at)}` : 'Not submitted'}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium">{formatMMK(settlement.gross_paid_mmk)}</TableCell>
                  <TableCell className="text-right">{formatMMK(settlement.reseller_commission_mmk)}</TableCell>
                  <TableCell className="text-right font-black text-primary">{formatMMK(settlement.platform_due_mmk)}</TableCell>
                  <TableCell>
                    {settlement.transfer_proof_url ? (
                      <Button
                        size="sm"
                        variant="outline"
                        leftIcon={<ExternalLink size={13} />}
                        loading={proofId === settlement.id}
                        onClick={() => void openProof(settlement)}
                      >
                        Proof
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <ActionMenu items={getActions(settlement)} label="Settlement actions" />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <Pagination page={page} totalPages={totalPages} total={total} label="settlements" onPageChange={setPage} loading={loading} />
      </Card>

      <Card className="p-4">
        <div className="grid gap-3 text-sm text-muted-foreground md:grid-cols-4">
          <FootStat label="Submitted rows" value={String(totals.submittedCount)} />
          <FootStat label="Confirmed rows" value={String(totals.confirmedCount)} />
          <FootStat label="Draft rows" value={String(totals.draftCount)} />
          <FootStat label="Reopened rows" value={String(totals.reopenedCount)} />
        </div>
      </Card>

      {selectedSettlement && (
        <SettlementDetailDialog
          settlement={selectedSettlement}
          adminNote={adminNote}
          setAdminNote={setAdminNote}
          busyId={busyId}
          proofId={proofId}
          onOpenProof={openProof}
          onAction={runAction}
          onClose={() => setSelectedSettlement(null)}
        />
      )}
    </div>
  );
}

function SettlementDetailDialog({
  settlement,
  adminNote,
  setAdminNote,
  busyId,
  proofId,
  onOpenProof,
  onAction,
  onClose,
}: {
  settlement: MonthlySettlement;
  adminNote: string;
  setAdminNote: (value: string) => void;
  busyId: string;
  proofId: string;
  onOpenProof: (settlement: MonthlySettlement) => Promise<void>;
  onAction: (settlement: MonthlySettlement, action: 'confirm' | 'reopen') => Promise<void>;
  onClose: () => void;
}) {
  return (
    <Dialog open onClose={onClose} size="lg">
      <DialogHeader>
        <DialogTitle>Settlement Details</DialogTitle>
        <DialogClose onClose={onClose} />
      </DialogHeader>
      <DialogBody className="space-y-4">
        <div className="flex flex-col gap-3 rounded-lg border border-border p-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-lg font-semibold text-foreground">{settlement.reseller?.name || 'Unknown reseller'}</div>
            <div className="text-sm text-muted-foreground">{settlementMonthLabel(settlement.settlement_month)}</div>
          </div>
          <SettlementBadge status={settlement.status} />
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <Money label="Gross paid" value={settlement.gross_paid_mmk} />
          <Money label="Commission" value={settlement.reseller_commission_mmk} />
          <Money label="Owner due" value={settlement.platform_due_mmk} />
          <Money label="Pending review" value={settlement.pending_review_mmk} />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-border p-4">
            <div className="text-xs uppercase text-muted-foreground">Transfer</div>
            <div className="mt-3 space-y-2 text-sm">
              <Info label="Reference" value={settlement.transfer_reference || '-'} />
              <Info label="Note" value={settlement.transfer_note || '-'} />
              <Info label="Submitted" value={formatDate(settlement.submitted_at)} />
              <Info label="Confirmed" value={formatDate(settlement.confirmed_at)} />
            </div>
            {settlement.transfer_proof_url ? (
              <Button
                className="mt-4"
                variant="outline"
                size="sm"
                leftIcon={<FileImage size={14} />}
                loading={proofId === settlement.id}
                onClick={() => void onOpenProof(settlement)}
              >
                Open Proof
              </Button>
            ) : null}
          </div>

          <div className="rounded-lg border border-border p-4">
            <div className="text-xs uppercase text-muted-foreground">Snapshot</div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <Info label="Confirmed orders" value={String(settlement.confirmed_order_count)} />
              <Info label="Pending reviews" value={String(settlement.pending_review_count)} />
              <Info label="Unpaid" value={formatMMK(settlement.unpaid_mmk)} />
              <Info label="Rejected" value={formatMMK(settlement.rejected_mmk)} />
            </div>
            {settlement.admin_note ? (
              <div className="mt-4 rounded-md bg-secondary/35 px-3 py-2 text-sm text-muted-foreground">
                {settlement.admin_note}
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-lg border border-border p-4">
          <div className="mb-2 text-xs uppercase text-muted-foreground">Admin note</div>
          <Textarea
            value={adminNote}
            onChange={(event) => setAdminNote(event.target.value)}
            placeholder="Optional note for confirm or reopen"
            className="min-h-20"
          />
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Close</Button>
        {settlement.status !== 'confirmed' ? (
          <Button
            variant="success"
            leftIcon={<CheckCircle2 size={14} />}
            loading={busyId === `${settlement.id}:confirm`}
            onClick={() => void onAction(settlement, 'confirm')}
          >
            Confirm
          </Button>
        ) : (
          <Button
            variant="destructiveOutline"
            leftIcon={<RotateCcw size={14} />}
            loading={busyId === `${settlement.id}:reopen`}
            onClick={() => void onAction(settlement, 'reopen')}
          >
            Reopen
          </Button>
        )}
      </DialogFooter>
    </Dialog>
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 break-words font-medium text-foreground">{value}</div>
    </div>
  );
}

function FootStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/20 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-semibold text-foreground">{value}</div>
    </div>
  );
}
