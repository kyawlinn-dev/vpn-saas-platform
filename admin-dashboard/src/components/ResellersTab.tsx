import { useState } from 'react';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
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
  IconButton,
  Stack,
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
import type { Reseller } from '../types/api';

interface Props {
  resellers: Reseller[];
  onSuccess: () => Promise<void>;
}

function TempPasswordDialog({
  password,
  email,
  onClose,
}: {
  password: string;
  email: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Reseller Created</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <Alert severity="warning">
            This temporary password is shown <strong>once only</strong> — copy it before closing.
            It will not be shown again.
          </Alert>
          <Typography variant="body2" color="text.secondary">
            Login email: <strong>{email}</strong>
          </Typography>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              bgcolor: 'action.hover',
              borderRadius: 1,
              p: 1.5,
            }}
          >
            <Typography
              variant="body1"
              fontFamily="monospace"
              sx={{ flexGrow: 1, wordBreak: 'break-all' }}
            >
              {password}
            </Typography>
            <IconButton size="small" onClick={handleCopy} color={copied ? 'success' : 'default'}>
              <ContentCopyRoundedIcon fontSize="small" />
            </IconButton>
          </Box>
          {copied && (
            <Alert severity="success" sx={{ py: 0.5 }}>
              Copied to clipboard
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={onClose}>
          Done — I've saved the password
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function ResellersTab({ resellers, onSuccess }: Props) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    miniapp_slug: '',
    commission_percent: '20',
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [tempPassword, setTempPassword] = useState<{ password: string; email: string } | null>(
    null,
  );
  const [togglingId, setTogglingId] = useState('');
  const [toggleError, setToggleError] = useState('');

  // Live slug preview as admin types the name (if they haven't overridden it)
  const slugPreview = form.miniapp_slug.trim()
    ? form.miniapp_slug
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
    : form.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 63);

  const handleCreate = async () => {
    setCreating(true);
    setCreateError('');
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        email: form.email.trim(),
        commission_percent: Number(form.commission_percent),
      };
      if (form.miniapp_slug.trim()) {
        body.miniapp_slug = form.miniapp_slug.trim();
      }
      const res = await api.post('/admin/resellers', body);
      setTempPassword({ password: res.data.temp_password as string, email: form.email.trim() });
      setForm({ name: '', email: '', miniapp_slug: '', commission_percent: '20' });
      await onSuccess();
    } catch (err: any) {
      setCreateError(err?.response?.data?.error ?? err?.message ?? 'Failed to create reseller');
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (reseller: Reseller) => {
    const isActive = reseller.status === 'active';
    setTogglingId(reseller.id);
    setToggleError('');
    try {
      await api.patch(`/admin/resellers/${reseller.id}`, { enabled: !isActive });
      await onSuccess();
    } catch (err: any) {
      setToggleError(err?.response?.data?.error ?? err?.message ?? 'Failed to update reseller');
    } finally {
      setTogglingId('');
    }
  };

  return (
    <Stack spacing={3}>
      {tempPassword && (
        <TempPasswordDialog
          password={tempPassword.password}
          email={tempPassword.email}
          onClose={() => setTempPassword(null)}
        />
      )}

      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Create Reseller
          </Typography>
          <Stack spacing={2}>
            {createError && <Alert severity="error">{createError}</Alert>}
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  label="Name"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  fullWidth
                  required
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  label="Email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                  fullWidth
                  required
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  label="Miniapp Slug (optional)"
                  value={form.miniapp_slug}
                  onChange={(e) => setForm((prev) => ({ ...prev, miniapp_slug: e.target.value }))}
                  fullWidth
                  placeholder="auto-generated from name"
                  helperText={`Will use: ${slugPreview || '(enter a name first)'} — only a-z, 0-9, hyphens`}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  label="Commission %"
                  type="number"
                  value={form.commission_percent}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, commission_percent: e.target.value }))
                  }
                  fullWidth
                  inputProps={{ min: 0, max: 100, step: 1 }}
                />
              </Grid>
            </Grid>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="contained"
                onClick={() => void handleCreate()}
                disabled={creating || !form.name.trim() || !form.email.trim()}
              >
                {creating ? 'Creating…' : 'Create Reseller'}
              </Button>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Resellers <Chip size="small" label={resellers.length} sx={{ ml: 1 }} />
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
                  <TableCell>Email</TableCell>
                  <TableCell>Slug</TableCell>
                  <TableCell>Commission</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {resellers.map((reseller) => (
                  <TableRow key={reseller.id} hover>
                    <TableCell>
                      <Typography fontWeight={600}>{reseller.name}</Typography>
                    </TableCell>
                    <TableCell>{reseller.email ?? '-'}</TableCell>
                    <TableCell>
                      <Typography variant="body2" fontFamily="monospace" color="text.secondary">
                        {reseller.miniapp_slug ?? '-'}
                      </Typography>
                    </TableCell>
                    <TableCell>{reseller.commission_percent ?? 0}%</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={reseller.status ?? 'unknown'}
                        color={reseller.status === 'active' ? 'success' : 'default'}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        size="small"
                        variant="outlined"
                        color={reseller.status === 'active' ? 'error' : 'success'}
                        disabled={togglingId === reseller.id}
                        onClick={() => void handleToggle(reseller)}
                      >
                        {togglingId === reseller.id
                          ? '…'
                          : reseller.status === 'active'
                            ? 'Disable'
                            : 'Enable'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {resellers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                        No resellers yet — create one above.
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
