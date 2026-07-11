import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/ui/form-field';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog, DialogHeader, DialogTitle, DialogBody, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { formatMMK } from '@/lib/format';
import type { Plan } from '@/types/api';

interface Props {
  plans: Plan[];
  onSuccess: () => Promise<void>;
}

interface PlanForm {
  name: string; price_mmk: string; duration_days: string;
  data_limit_gb: string; max_devices: string; sort_order: string;
  is_trial: boolean; is_active: boolean; allowed_regions: string; features: string;
}

const emptyForm = (): PlanForm => ({
  name: '', price_mmk: '0', duration_days: '30', data_limit_gb: '0',
  max_devices: '3', sort_order: '10', is_trial: false, is_active: true,
  allowed_regions: '', features: '',
});

function planToForm(p: Plan): PlanForm {
  return {
    name: p.name, price_mmk: String(p.price_mmk), duration_days: String(p.duration_days),
    data_limit_gb: String(p.data_limit_gb), max_devices: String(p.max_devices),
    sort_order: String(p.sort_order), is_trial: p.is_trial, is_active: p.is_active,
    allowed_regions: Array.isArray(p.allowed_regions) ? p.allowed_regions.join(', ') : '',
    features: Array.isArray(p.features) ? p.features.join('\n') : '',
  };
}

function formToBody(f: PlanForm) {
  return {
    name: f.name.trim(),
    price_mmk: parseInt(f.price_mmk) || 0,
    duration_days: parseInt(f.duration_days) || 30,
    data_limit_gb: parseInt(f.data_limit_gb) || 0,
    max_devices: parseInt(f.max_devices) || 1,
    sort_order: parseInt(f.sort_order) || 0,
    is_trial: f.is_trial,
    is_active: f.is_active,
    allowed_regions: f.allowed_regions.split(',').map((r) => r.trim().toLowerCase()).filter(Boolean) || null,
    features: f.features.split('\n').map((x) => x.trim()).filter(Boolean),
  };
}

function PlanFormFields({ form, onChange }: { form: PlanForm; onChange: (p: Partial<PlanForm>) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <FormField label="Plan Name" required className="col-span-2 sm:col-span-1">
        <Input value={form.name} onChange={(e) => onChange({ name: e.target.value })} />
      </FormField>
      <FormField label="Price (MMK)" hint="0 for trial/free" className="col-span-2 sm:col-span-1">
        <Input type="number" min={0} step={1000} value={form.price_mmk} onChange={(e) => onChange({ price_mmk: e.target.value })} />
      </FormField>
      <FormField label="Duration (days)">
        <Input type="number" min={1} value={form.duration_days} onChange={(e) => onChange({ duration_days: e.target.value })} />
      </FormField>
      <FormField label="Data Limit (GB)" hint="0 = unlimited">
        <Input type="number" min={0} value={form.data_limit_gb} onChange={(e) => onChange({ data_limit_gb: e.target.value })} />
      </FormField>
      <FormField label="Max Devices">
        <Input type="number" min={1} value={form.max_devices} onChange={(e) => onChange({ max_devices: e.target.value })} />
      </FormField>
      <FormField label="Sort Order" hint="Lower = shown first">
        <Input type="number" value={form.sort_order} onChange={(e) => onChange({ sort_order: e.target.value })} />
      </FormField>
      <FormField label="Allowed Regions" hint="Comma-separated. Leave blank = all." className="col-span-2">
        <Input value={form.allowed_regions} onChange={(e) => onChange({ allowed_regions: e.target.value })} placeholder="sgp1, blr1" />
      </FormField>
      <FormField label="Features (one per line)" hint="Leave blank to auto-generate" className="col-span-2">
        <Textarea rows={4} value={form.features} onChange={(e) => onChange({ features: e.target.value })} placeholder="100 GB Data&#10;30 Days Validity" />
      </FormField>
      <div className="col-span-2 flex gap-6">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" className="rounded" checked={form.is_trial} onChange={(e) => onChange({ is_trial: e.target.checked })} />
          Trial plan
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" className="rounded" checked={form.is_active} onChange={(e) => onChange({ is_active: e.target.checked })} />
          Active (visible to customers)
        </label>
      </div>
    </div>
  );
}

export function PlansPage({ plans, onSuccess }: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<PlanForm>(emptyForm());
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [editTarget, setEditTarget] = useState<Plan | null>(null);
  const [togglingId, setTogglingId] = useState('');

  const onChange = (patch: Partial<PlanForm>) => setForm((p) => ({ ...p, ...patch }));

  const handleCreate = async () => {
    setCreating(true); setCreateError('');
    try {
      await api.post('/admin/plans', formToBody(form));
      setForm(emptyForm()); setShowCreate(false);
      await onSuccess();
    } catch (err: any) {
      setCreateError(err?.response?.data?.error ?? err?.message ?? 'Failed');
    } finally { setCreating(false); }
  };

  const handleToggle = async (plan: Plan) => {
    setTogglingId(plan.id);
    try {
      await api.patch(`/admin/plans/${plan.id}`, { is_active: !plan.is_active });
      await onSuccess();
    } finally { setTogglingId(''); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Plans</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{plans.length} plan{plans.length !== 1 ? 's' : ''}</p>
        </div>
        <Button variant="primary" leftIcon={<Plus size={15} />} onClick={() => setShowCreate(true)}>
          Create Plan
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Name</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Devices</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {plans.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">No plans yet.</TableCell>
              </TableRow>
            ) : (
              plans.map((plan) => (
                <TableRow key={plan.id}>
                  <TableCell>
                    <div className="font-medium">{plan.name}</div>
                    {Array.isArray(plan.allowed_regions) && plan.allowed_regions.length > 0 && (
                      <div className="text-xs text-muted-foreground">{plan.allowed_regions.join(', ')}</div>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{formatMMK(plan.price_mmk)}</TableCell>
                  <TableCell>{plan.duration_days}d</TableCell>
                  <TableCell>{plan.data_limit_gb === 0 ? 'Unlimited' : `${plan.data_limit_gb} GB`}</TableCell>
                  <TableCell>{plan.max_devices}</TableCell>
                  <TableCell><Badge variant={plan.is_trial ? 'info' : 'default'}>{plan.is_trial ? 'Trial' : 'Paid'}</Badge></TableCell>
                  <TableCell><StatusBadge status={plan.is_active ? 'active' : 'stopped'} /></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setEditTarget(plan)}>Edit</Button>
                      <Button variant={plan.is_active ? 'destructiveOutline' : 'success'} size="sm" disabled={togglingId === plan.id} onClick={() => void handleToggle(plan)}>
                        {togglingId === plan.id ? '…' : plan.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Create dialog */}
      <Dialog open={showCreate} onClose={() => setShowCreate(false)} size="lg">
        <DialogHeader>
          <DialogTitle>Create Plan</DialogTitle>
          <DialogClose onClose={() => setShowCreate(false)} />
        </DialogHeader>
        <DialogBody className="space-y-4">
          {createError && <div className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">{createError}</div>}
          <PlanFormFields form={form} onChange={onChange} />
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
          <Button variant="primary" loading={creating} disabled={!form.name.trim()} onClick={() => void handleCreate()}>Create Plan</Button>
        </DialogFooter>
      </Dialog>

      {/* Edit dialog */}
      {editTarget && <EditPlanDialog plan={editTarget} onClose={() => setEditTarget(null)} onSuccess={onSuccess} />}
    </div>
  );
}

function EditPlanDialog({ plan, onClose, onSuccess }: { plan: Plan; onClose: () => void; onSuccess: () => Promise<void> }) {
  const [form, setForm] = useState<PlanForm>(planToForm(plan));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const onChange = (patch: Partial<PlanForm>) => setForm((p) => ({ ...p, ...patch }));

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      await api.patch(`/admin/plans/${plan.id}`, formToBody(form));
      await onSuccess(); onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err?.message ?? 'Failed');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onClose={onClose} size="lg">
      <DialogHeader>
        <DialogTitle>Edit Plan — {plan.name}</DialogTitle>
        <DialogClose onClose={onClose} />
      </DialogHeader>
      <DialogBody className="space-y-4">
        {error && <div className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
        <PlanFormFields form={form} onChange={onChange} />
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={saving} disabled={!form.name.trim()} onClick={() => void handleSave()}>Save Changes</Button>
      </DialogFooter>
    </Dialog>
  );
}
