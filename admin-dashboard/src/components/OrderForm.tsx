import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, CardContent, Grid, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { api } from '../lib/api';
import { formatMMK } from '../lib/format';
import type { Customer, Plan } from '../types/api';

interface Props {
  customers: Customer[];
  plans: Plan[];
  onSuccess: () => Promise<void>;
}

export function OrderForm({ customers, plans, onSuccess }: Props) {
  const [form, setForm] = useState({
    customer_id: '',
    plan_id: '',
    payment_status: 'paid',
    payment_note: '',
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!form.plan_id && plans[0]) {
      setForm((prev) => ({ ...prev, plan_id: plans[0].id }));
    }
  }, [plans, form.plan_id]);

  const selectedPlan = useMemo(
    () => plans.find((item) => item.id === form.plan_id),
    [plans, form.plan_id],
  );

  const submit = async () => {
    try {
      setLoading(true);
      setMessage('');
      setError('');
      await api.post('/orders', form);
      setMessage('Order created successfully.');
      setForm({ customer_id: '', plan_id: plans[0]?.id || '', payment_status: 'paid', payment_note: '' });
      await onSuccess();
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || 'Failed to create order');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h6">Create Order</Typography>
          {message && <Alert severity="success">{message}</Alert>}
          {error && <Alert severity="error">{error}</Alert>}
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                select
                fullWidth
                label="Customer"
                value={form.customer_id}
                onChange={(e) => setForm((prev) => ({ ...prev, customer_id: e.target.value }))}
              >
                {customers.map((item) => (
                  <MenuItem key={item.id} value={item.id}>
                    {item.full_name}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                select
                fullWidth
                label="Plan"
                value={form.plan_id}
                onChange={(e) => setForm((prev) => ({ ...prev, plan_id: e.target.value }))}
              >
                {plans.map((item) => (
                  <MenuItem key={item.id} value={item.id}>
                    {item.name} — {formatMMK(item.price_mmk)} / {item.duration_days} days
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                select
                fullWidth
                label="Payment status"
                value={form.payment_status}
                onChange={(e) => setForm((prev) => ({ ...prev, payment_status: e.target.value }))}
              >
                <MenuItem value="paid">Paid</MenuItem>
                <MenuItem value="unpaid">Unpaid</MenuItem>
                <MenuItem value="overdue">Overdue</MenuItem>
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Payment note"
                value={form.payment_note}
                onChange={(e) => setForm((prev) => ({ ...prev, payment_note: e.target.value }))}
              />
            </Grid>
          </Grid>
          {selectedPlan && (
            <Alert severity="info">
              Selected plan: {selectedPlan.name} · {formatMMK(selectedPlan.price_mmk)} · {selectedPlan.duration_days} days
            </Alert>
          )}
          <Stack direction="row" justifyContent="flex-end">
            <Button variant="contained" onClick={submit} disabled={loading || !form.customer_id || !form.plan_id}>
              {loading ? 'Saving...' : 'Create order'}
            </Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
