import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { formatDate } from '@/lib/format';
import { usePaginatedTable } from '@/hooks/usePaginatedTable';
import type { Customer, Reseller } from '@/types/api';

interface Props {
  resellers: Reseller[];
}

export function CustomersPage({ resellers }: Props) {
  const [search, setSearch] = useState('');
  const [resellerFilter, setResellerFilter] = useState('all');

  const filters = useMemo(() => {
    const f: Record<string, string> = {};
    if (resellerFilter !== 'all') f.reseller_id = resellerFilter;
    return f;
  }, [resellerFilter]);

  const { data: customers, total, page, totalPages, loading, setPage } =
    usePaginatedTable<Customer>('/admin/customers', filters, 20);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) =>
      c.full_name.toLowerCase().includes(q) ||
      (c.telegram_username ?? '').toLowerCase().includes(q) ||
      (c.phone ?? '').includes(q) ||
      (c.reseller?.name ?? '').toLowerCase().includes(q),
    );
  }, [customers, search]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Customers</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{total.toLocaleString()} total customers</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input className="pl-8" placeholder="Search name, Telegram, phone…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={resellerFilter} onChange={(e) => { setResellerFilter(e.target.value); setSearch(''); }} className="w-48">
          <option value="all">All resellers</option>
          {resellers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Name</TableHead>
              <TableHead>Telegram</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Reseller</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead>Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">Loading…</TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">No customers found.</TableCell>
              </TableRow>
            ) : (
              filtered.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.full_name}</TableCell>
                  <TableCell className="text-muted-foreground">{c.telegram_username ? `@${c.telegram_username}` : '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{c.phone || '—'}</TableCell>
                  <TableCell>
                    <Badge variant={(c as any).customer_type === 'telegram' ? 'info' : 'default'}>
                      {(c as any).customer_type === 'telegram' ? 'Telegram' : 'Normal'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.reseller?.name || '—'}</TableCell>
                  <TableCell className="text-muted-foreground text-xs max-w-40 truncate">{c.notes || '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(c.created_at)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <Pagination page={page} totalPages={totalPages} total={total} label="customers" onPageChange={setPage} loading={loading} />
      </Card>
    </div>
  );
}
