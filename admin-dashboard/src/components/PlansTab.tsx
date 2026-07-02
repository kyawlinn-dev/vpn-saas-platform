import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { api } from '../lib/api';
import { formatMMK } from '../lib/format';
import type { Plan } from '../types/api';

interface Props {
  plans: Plan[];
  onSuccess: () => Promise<void>;
}

interface PlanFormState {
  name: string;
  price_mmk: string;
  duration_days: string;
  data_limit_gb: string;
  max_devices: string;
  sort_order: string;
  is_trial: boolean;
  is_active: boolean;
  allowed_regions: string;
  features: string;
}

const emptyForm = (): PlanFormState => ({
  name: '',
  price_mmk: '0',
  duration_days: '30',
  data_limit_gb: '0',
  max_devices: '3',
  sort_order: '10',
  is_trial: false,
  is_active: true,
  allowed_regions: '',
  features: '',
});

function planToForm(plan: Plan): PlanFormState {
  return {
    name: plan.name,
    price_mmk: String(plan.price_mmk),
    duration_days: String(plan.duration_days),
    data_limit_gb: String(plan.data_limit_gb),
    max_devices: String(plan.max_devices),
    sort_order: String(plan.sort_order),
    is_trial: plan.is_trial,
    is_active: plan.is_active,
    allowed_regions: Array.isArray(plan.allowed_regions) ? plan.allowed_regions.join(', ') : '',
    features: Array.isArray(plan.features) ? plan.features.join('\n') : '',
  };
}

function formToBody(form: PlanFormState) {
  const regions = form.allowed_regions
    .split(',')
    .map((r) => r.trim().toLowerCase())
    .filter(Boolean);

  const features = form.features
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean);

  return {
    name: form.name.trim(),
    price_mmk: parseInt(form.price_mmk, 10) || 0,
    duration_days: parseInt(form.duration_days, 10) || 30,
    data_limit_gb: parseInt(form.data_limit_gb, 10) || 0,
    max_devices: parseInt(form.max_devices, 10) || 1,
    sort_order: parseInt(form.sort_order, 10) || 0,
    is_trial: form.is_trial,
    is_active: form.is_active,
    allowed_regions: regions.length ? regions : null,
    features,
  };
}

function PlanFormFields({
  form,
  onChange,
}: {
  form: PlanFormState;
  onChange: (patch: Partial<PlanFormState>) => void;
}) {
  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, md: 6 }}>
        <TextField
          label="Plan Name"
          value={form.name}
          onChange={(e) => onChange({ name: e.target.value })}
          fullWidth
          required
        />
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <TextField
          label="Price (MMK)"
          type="number"
          value={form.price_mmk}
          onChange={(e) => onChange({ price_mmk: e.target.value })}
          fullWidth
          inputProps={{ min: 0, step: 1000 }}
          helperText="0 for trial/free plans"
        />
      </Grid>
      <Grid size={{ xs: 12, md: 4 }}>
        <TextField
          label="Duration (days)"
          type="number"
          value={form.duration_days}
          onChange={(e) => onChange({ duration_days: e.target.value })}
          fullWidth
          inputProps={{ min: 1, step: 1 }}
        />
      </Grid>
      <Grid size={{ xs: 12, md: 4 }}>
        <TextField
          label="Data Limit (GB)"
          type="number"
          value={form.data_limit_gb}
          onChange={(e) => onChange({ data_limit_gb: e.target.value })}
          fullWidth
          inputProps={{ min: 0, step: 1 }}
          helperText="0 = unlimited"
        />
      </Grid>
      <Grid size={{ xs: 12, md: 4 }}>
        <TextField
          label="Max Devices"
          type="number"
          value={form.max_devices}
          onChange={(e) => onChange({ max_devices: e.target.value })}
          fullWidth
          inputProps={{ min: 1, step: 1 }}
        />
      </Grid>
      <Grid size={{ xs: 12, md: 4 }}>
        <TextField
          label="Sort Order"
          type="number"
          value={form.sort_order}
          onChange={(e) => onChange({ sort_order: e.target.value })}
          fullWidth
          inputProps={{ step: 1 }}
          helperText="Lower = shown first"
        />
      </Grid>
      <Grid size={{ xs: 12, md: 8 }}>
        <TextField
          label="Allowed Regions (optional)"
          value={form.allowed_regions}
          onChange={(e) => onChange({ allowed_regions: e.target.value })}
          fullWidth
          placeholder="sgp1, blr1 — leave blank for all regions"
          helperText="Comma-separated region codes. Leave blank to allow all servers."
        />
      </Grid>
      <Grid size={{ xs: 12 }}>
        <TextField
          label="Features (one per line)"
          value={form.features}
          onChange={(e) => onChange({ features: e.target.value })}
          fullWidth
          multiline
          rows={4}
          placeholder={"100 GB Premium Servers\nHigh-Speed Private Servers\nNo-Log Policy\n30 Days Validity"}
          helperText="Leave blank to auto-generate from plan data. Each line becomes one checklist item."
        />
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Switch
            checked={form.is_trial}
            onChange={(e) => onChange({ is_trial: e.target.checked })}
          />
          <Typography variant="body2">Trial plan</Typography>
        </Stack>
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Switch
            checked={form.is_active}
            onChange={(e) => onChange({ is_active: e.target.checked })}
          />
          <Typography variant="body2">Active (visible to customers)</Typography>
        </Stack>
      </Grid>
    </Grid>
  );
}

function EditPlanDialog({
  plan,
  onClose,
  onSuccess,
}: {
  plan: Plan;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}) {
  const [form, setForm] = useState<PlanFormState>(planToForm(plan));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const onChange = (patch: Partial<PlanFormState>) =>
    setForm((prev) => ({ ...prev, ...patch }));

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await api.patch(`/admin/plans/${plan.id}`, formToBody(form));
      await onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err?.message ?? 'Failed to update plan');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Edit Plan — {plan.name} ({plan.duration_days}d)</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <PlanFormFields form={form} onChange={onChange} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={() => void handleSave()}
          disabled={saving || !form.name.trim()}
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function PlansTab({ plans, onSuccess }: Props) {
  const [form, setForm] = useState<PlanFormState>(emptyForm());
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [editTarget, setEditTarget] = useState<Plan | null>(null);
  const [togglingId, setTogglingId] = useState('');
  const [toggleError, setToggleError] = useState('');

  const onChange = (patch: Partial<PlanFormState>) =>
    setForm((prev) => ({ ...prev, ...patch }));

  const handleCreate = async () => {
    setCreating(true);
    setCreateError('');
    try {
      await api.post('/admin/plans', formToBody(form));
      setForm(emptyForm());
      await onSuccess();
    } catch (err: any) {
      setCreateError(err?.response?.data?.error ?? err?.message ?? 'Failed to create plan');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (plan: Plan) => {
    setTogglingId(plan.id);
    setToggleError('');
    try {
      await api.patch(`/admin/plans/${plan.id}`, { is_active: !plan.is_active });
      await onSuccess();
    } catch (err: any) {
      setToggleError(err?.response?.data?.error ?? err?.message ?? 'Failed to update plan');
    } finally {
      setTogglingId('');
    }
  };

  return (
    <Stack spacing={3}>
      {editTarget && (
        <EditPlanDialog
          plan={editTarget}
          onClose={() => setEditTarget(null)}
          onSuccess={onSuccess}
        />
      )}

      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Create Plan
          </Typography>
          <Stack spacing={2}>
            {createError && <Alert severity="error">{createError}</Alert>}
            <PlanFormFields form={form} onChange={onChange} />
            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="contained"
                onClick={() => void handleCreate()}
                disabled={creating || !form.name.trim()}
              >
                {creating ? 'Creating…' : 'Create Plan'}
              </Button>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Plans <Chip size="small" label={plans.length} sx={{ ml: 1 }} />
          </Typography>
          {toggleError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {toggleError}
            </Alert>
          )}
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Price</TableCell>
                  <TableCell>Duration</TableCell>
                  <TableCell>Data</TableCell>
                  <TableCell>Devices</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {plans.map((plan) => (
                  <TableRow key={plan.id} hover>
                    <TableCell>
                      <Typography fontWeight={600}>
                        {plan.name} — {plan.duration_days}d
                      </Typography>
                      {Array.isArray(plan.allowed_regions) && plan.allowed_regions.length > 0 && (
                        <Typography variant="caption" color="text.secondary">
                          {plan.allowed_regions.join(', ')}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>{formatMMK(plan.price_mmk)}</TableCell>
                    <TableCell>{plan.duration_days}d</TableCell>
                    <TableCell>
                      {plan.data_limit_gb === 0 ? 'Unlimited' : `${plan.data_limit_gb} GB`}
                    </TableCell>
                    <TableCell>{plan.max_devices}</TableCell>
                    <TableCell>
                      {plan.is_trial ? (
                        <Chip size="small" label="Trial" color="info" />
                      ) : (
                        <Chip size="small" label="Paid" color="default" />
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={plan.is_active ? 'Active' : 'Inactive'}
                        color={plan.is_active ? 'success' : 'default'}
                      />
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={1}>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => setEditTarget(plan)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          color={plan.is_active ? 'error' : 'success'}
                          disabled={togglingId === plan.id}
                          onClick={() => void handleToggleActive(plan)}
                        >
                          {togglingId === plan.id
                            ? '…'
                            : plan.is_active
                              ? 'Deactivate'
                              : 'Activate'}
                        </Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
                {plans.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} align="center">
                      <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                        No plans yet — create one above.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </Stack>
  );
}
