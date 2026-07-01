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
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { api } from '../lib/api';
import type { Server } from '../types/api';

interface Props {
  servers: Server[];
  onSuccess: () => Promise<void>;
}

function CapacityBar({ current, max }: { current: number; max: number }) {
  const pct = max > 0 ? Math.min((current / max) * 100, 100) : 0;
  const color = pct >= 90 ? 'error' : pct >= 70 ? 'warning' : 'primary';

  return (
    <Stack spacing={0.5} sx={{ minWidth: 120 }}>
      <LinearProgress
        variant="determinate"
        value={pct}
        color={color}
        sx={{ height: 6, borderRadius: 3 }}
      />
      <Typography variant="caption" color="text.secondary">
        {current} / {max} ({max - current} free)
      </Typography>
    </Stack>
  );
}

function EditCapacityDialog({
  server,
  onClose,
  onSuccess,
}: {
  server: Server;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}) {
  const [value, setValue] = useState(String(server.max_active_keys));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    const parsed = parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      setError('Must be a positive integer');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.patch(`/admin/servers/${server.id}/capacity`, { max_active_keys: parsed });
      await onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err?.message ?? 'Failed to update capacity');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Edit Capacity — {server.name}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Typography variant="body2" color="text.secondary">
            Current usage: {server.current_active_keys} active keys
          </Typography>
          <TextField
            label="Max Active Keys"
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            fullWidth
            autoFocus
            inputProps={{ min: 1, step: 1 }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={() => void handleSave()}
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function statusColor(status: string): 'success' | 'warning' | 'error' | 'default' {
  if (status === 'active') return 'success';
  if (status === 'provisioning') return 'warning';
  if (status === 'error' || status === 'failed') return 'error';
  return 'default';
}

export function ServersTab({ servers, onSuccess }: Props) {
  const [editTarget, setEditTarget] = useState<Server | null>(null);

  return (
    <Stack spacing={3}>
      {editTarget && (
        <EditCapacityDialog
          server={editTarget}
          onClose={() => setEditTarget(null)}
          onSuccess={onSuccess}
        />
      )}

      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            VPN Servers <Chip size="small" label={servers.length} sx={{ ml: 1 }} />
          </Typography>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Region</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Capacity</TableCell>
                  <TableCell>Host</TableCell>
                  <TableCell>Last Error</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {servers.map((server) => (
                  <TableRow key={server.id} hover>
                    <TableCell>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography fontWeight={600}>{server.name}</Typography>
                        {server.is_default && (
                          <Chip size="small" label="default" color="primary" variant="outlined" />
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontFamily="monospace">
                        {server.region}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={server.status}
                        color={statusColor(server.status)}
                      />
                    </TableCell>
                    <TableCell>
                      <CapacityBar
                        current={server.current_active_keys}
                        max={server.max_active_keys}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" fontFamily="monospace" color="text.secondary">
                        {server.host_ip ?? '—'}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ maxWidth: 220 }}>
                      {server.last_error ? (
                        <Tooltip title={server.last_error}>
                          <Typography
                            variant="caption"
                            color="error"
                            sx={{
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                            }}
                          >
                            {server.last_error}
                          </Typography>
                        </Tooltip>
                      ) : (
                        <Typography variant="caption" color="text.disabled">
                          —
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => setEditTarget(server)}
                      >
                        Edit Capacity
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {servers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center">
                      <Box sx={{ py: 3 }}>
                        <Typography variant="body2" color="text.secondary">
                          No servers configured.
                        </Typography>
                      </Box>
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
