import { useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { formatDate, formatBytes } from '@/lib/format';
import { usePaginatedTable } from '@/hooks/usePaginatedTable';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import type { Reseller, VpnKey } from '@/types/api';

interface Props {
  resellers: Reseller[];
}

export function KeysPage({ resellers }: Props) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [statusFilter, setStatusFilter] = useState('active');
  const [resellerFilter, setResellerFilter] = useState('all');

  const filters = useMemo(() => {
    const f: Record<string, string> = {};
    if (statusFilter !== 'all') f.status = statusFilter;
    if (resellerFilter !== 'all') f.reseller_id = resellerFilter;
    if (debouncedSearch.trim()) f.search = debouncedSearch.trim();
    return f;
  }, [statusFilter, resellerFilter, debouncedSearch]);

  const { data: keys, total, page, totalPages, loading, setPage } =
    usePaginatedTable<VpnKey>('/admin/keys', filters, 20);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">VPN Keys</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{total.toLocaleString()} {statusFilter !== 'all' ? statusFilter : 'total'} keys</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          {loading && keys.length > 0 ? (
            <Loader2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground pointer-events-none" />
          ) : (
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          )}
          <Input className="pl-8" placeholder="Search key name or ID…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-36">
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="deleted">Deleted</option>
        </Select>
        <Select value={resellerFilter} onChange={(e) => setResellerFilter(e.target.value)} className="w-48">
          <option value="all">All resellers</option>
          {resellers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Key Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Order ID</TableHead>
              <TableHead>Usage</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={loading && keys.length > 0 ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
            {loading && keys.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">Loading…</TableCell>
              </TableRow>
            ) : keys.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">No keys found.</TableCell>
              </TableRow>
            ) : (
              keys.map((k) => (
                <TableRow key={k.id}>
                  <TableCell className="font-medium font-mono text-xs">{k.key_name}</TableCell>
                  <TableCell><StatusBadge status={k.status} /></TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{k.order_id.slice(0, 8)}…</TableCell>
                  <TableCell className="text-muted-foreground">{formatBytes(k.used_bytes)}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(k.created_at)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <Pagination page={page} totalPages={totalPages} total={total} label="keys" onPageChange={setPage} loading={loading} />
      </Card>
    </div>
  );
}
