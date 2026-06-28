import { useState } from 'react';
import { Alert, Button, Card, CardContent, Grid, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { api } from '../lib/api';
import type { Reseller } from '../types/api';

interface Props {
  resellers: Reseller[];
  defaultResellerId?: string;
  hideResellerSelect?: boolean;
  onSuccess: () => Promise<void>;
}

export function CustomerForm({ resellers, defaultResellerId = '', hideResellerSelect = false, onSuccess }: Props) {
  const [form, setForm] = useState({
    reseller_id: defaultResellerId,
    full_name: '',
    telegram_username: '',
    phone: '',
    notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const submit = async () => {
    try {
      setLoading(true);
      setError('');
      setMessage('');
      await api.post('/customers', form);
      setMessage('Customer created successfully.');
      setForm({ reseller_id: defaultResellerId, full_name: '', telegram_username: '', phone: '', notes: '' });
      await onSuccess();
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || 'Failed to create customer');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h6">Create Customer</Typography>
          {message && <Alert severity="success">{message}</Alert>}
          {error && <Alert severity="error">{error}</Alert>}
          <Grid container spacing={2}>
            {!hideResellerSelect && (
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  select
                  fullWidth
                  label="Reseller"
                  value={form.reseller_id}
                  onChange={(e) => setForm((prev) => ({ ...prev, reseller_id: e.target.value }))}
                >
                  <MenuItem value="">No reseller</MenuItem>
                  {resellers.map((item) => (
                    <MenuItem key={item.id} value={item.id}>
                      {item.name}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
            )}
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                required
                label="Full name"
                value={form.full_name}
                onChange={(e) => setForm((prev) => ({ ...prev, full_name: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Telegram username"
                value={form.telegram_username}
                onChange={(e) => setForm((prev) => ({ ...prev, telegram_username: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Phone"
                value={form.phone}
                onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
              />
            </Grid>
            <Grid size={12}>
              <TextField
                fullWidth
                multiline
                minRows={2}
                label="Notes"
                value={form.notes}
                onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              />
            </Grid>
          </Grid>
          <Stack direction="row" justifyContent="flex-end">
            <Button variant="contained" onClick={submit} disabled={loading || !form.full_name}>
              {loading ? 'Saving...' : 'Create customer'}
            </Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
