import { useState } from 'react';
import { Plus, Copy, Check } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog, DialogHeader, DialogTitle, DialogBody, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Pagination } from '@/components/ui/pagination';
import { api } from '@/lib/api';
import { usePaginatedTable } from '@/hooks/usePaginatedTable';
import type { Reseller } from '@/types/api';

interface Props {
  onSuccess: () => Promise<void>;
}

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 63);
}

function sanitizeSlug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-+|-+$/g, '').slice(0, 63);
}

export function ResellersPage({ onSuccess }: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', miniapp_slug: '', commission_percent: '20' });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [tempPassword, setTempPassword] = useState<{ password: string; email: string; onDone: () => void } | null>(null);
  const [togglingId, setTogglingId] = useState('');

  const { data: resellers, total, page, totalPages, loading, setPage, refresh } =
    usePaginatedTable<Reseller>('/admin/resellers', {}, 20);

  const slugPreview = form.miniapp_slug.trim()
    ? sanitizeSlug(form.miniapp_slug)
    : slugify(form.name);

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
      // ignore
    } finally {
      setTogglingId('');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Resellers</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{total.toLocaleString()} reseller{total !== 1 ? 's' : ''} registered</p>
        </div>
        <Button variant="primary" size="md" leftIcon={<Plus size={15} />} onClick={() => setShowCreate(true)}>
          Add Reseller
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Commission</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Loading…</TableCell>
              </TableRow>
            ) : resellers.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  No resellers yet — add one above.
                </TableCell>
              </TableRow>
            ) : (
              resellers.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-muted-foreground">{r.email ?? '—'}</TableCell>
                  <TableCell>
                    <span className="font-mono text-xs text-muted-foreground">{r.miniapp_slug ?? '—'}</span>
                  </TableCell>
                  <TableCell>{r.commission_percent ?? 0}%</TableCell>
                  <TableCell><StatusBadge status={r.status ?? 'unknown'} /></TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant={r.status === 'active' ? 'destructiveOutline' : 'success'}
                      size="sm"
                      disabled={togglingId === r.id}
                      onClick={() => void handleToggle(r)}
                    >
                      {togglingId === r.id ? '…' : r.status === 'active' ? 'Disable' : 'Enable'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <Pagination page={page} totalPages={totalPages} total={total} label="resellers" onPageChange={setPage} loading={loading} />
      </Card>

      {/* Create dialog */}
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
              <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="John Doe" />
            </FormField>
            <FormField label="Email" required className="col-span-2 sm:col-span-1">
              <Input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} placeholder="john@example.com" />
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

      {tempPassword && <TempPasswordDialog {...tempPassword} onClose={() => { void tempPassword.onDone(); setTempPassword(null); }} />}
    </div>
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
          <span className="flex-1 font-mono text-sm break-all">{password}</span>
          <button onClick={copy} className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground">
            {copied ? <Check size={15} className="text-success" /> : <Copy size={15} />}
          </button>
        </div>
        {copied && <Badge variant="success">Copied to clipboard</Badge>}
      </DialogBody>
      <DialogFooter>
        <Button variant="primary" onClick={onClose}>Done — I've saved it</Button>
      </DialogFooter>
    </Dialog>
  );
}
