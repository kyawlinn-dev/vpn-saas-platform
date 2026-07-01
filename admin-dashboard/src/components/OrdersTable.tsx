import { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
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
import { formatDate, formatMMK, getStatusColor } from '../lib/format';
import type { Order, Plan } from '../types/api';

interface Props {
  orders: Order[];
  plans: Plan[];
  onSuccess: () => Promise<void>;
}

export function OrdersTable({ orders, plans, onSuccess }: Props) {
  const [loadingId, setLoadingId] = useState('');
  const [extendPlanByOrder, setExtendPlanByOrder] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirmStop, setConfirmStop] = useState<Order | null>(null);

  const runAction = async (order: Order, action: 'activate' | 'extend' | 'stop') => {
    try {
      setLoadingId(`${order.id}:${action}`);
      setError('');
      setMessage('');
      if (action === 'extend') {
        await api.post(`/admin/order-actions/${order.id}/extend`, {
          plan_id: extendPlanByOrder[order.id] || order.plan_id,
        });
      } else {
        await api.post(`/admin/order-actions/${order.id}/${action}`);
      }
      setMessage(`${action} completed for order ${order.id.slice(0, 8)}…`);
      await onSuccess();
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || `Failed to ${action} order`);
    } finally {
      setLoadingId('');
    }
  };

  return (
    <Card>
      {/* Confirm dialog for destructive stop action */}
      {confirmStop && (
        <Dialog open onClose={() => setConfirmStop(null)} maxWidth="xs" fullWidth>
          <DialogTitle>Stop Order?</DialogTitle>
          <DialogContent>
            <Typography variant="body2">
              This will permanently delete the VPN key for{' '}
              <strong>{confirmStop.customer?.full_name ?? 'this customer'}</strong> and cut their
              access immediately. The key cannot be recovered — the order must be re-activated to
              restore access.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirmStop(null)}>Cancel</Button>
            <Button
              variant="contained"
              color="error"
              disabled={loadingId === `${confirmStop.id}:stop`}
              onClick={() => {
                const order = confirmStop;
                setConfirmStop(null);
                void runAction(order, 'stop');
              }}
            >
              Stop &amp; Delete Keys
            </Button>
          </DialogActions>
        </Dialog>
      )}

      <CardContent>
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2}>
            <Typography variant="h6">Orders</Typography>
            {message && <Alert severity="success">{message}</Alert>}
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Customer</TableCell>
                  <TableCell>Plan</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Payment</TableCell>
                  <TableCell>Expiry</TableCell>
                  <TableCell>Price</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id} hover>
                    <TableCell>
                      <Stack>
                        <Typography fontWeight={600}>{order.customer?.full_name || '-'}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {order.reseller?.name || 'No reseller'}
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell>{order.plan?.name || '-'}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        color={getStatusColor(order.status) as any}
                        label={order.status}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        color={getStatusColor(order.payment_status) as any}
                        label={order.payment_status}
                      />
                    </TableCell>
                    <TableCell>{formatDate(order.expiry_date)}</TableCell>
                    <TableCell>{formatMMK(order.price_mmk)}</TableCell>
                    <TableCell>
                      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1} alignItems="stretch">
                        {order.status === 'pending' && (
                          <Button
                            variant="contained"
                            size="small"
                            onClick={() => void runAction(order, 'activate')}
                            disabled={loadingId === `${order.id}:activate`}
                          >
                            {loadingId === `${order.id}:activate` ? '…' : 'Activate'}
                          </Button>
                        )}
                        {(order.status === 'active' ||
                          order.status === 'expired' ||
                          order.status === 'stopped') && (
                          <>
                            <TextField
                              select
                              size="small"
                              sx={{ minWidth: 160 }}
                              value={extendPlanByOrder[order.id] || order.plan_id}
                              onChange={(e) =>
                                setExtendPlanByOrder((prev) => ({
                                  ...prev,
                                  [order.id]: e.target.value,
                                }))
                              }
                            >
                              {plans.map((plan) => (
                                <MenuItem key={plan.id} value={plan.id}>
                                  {plan.name}
                                </MenuItem>
                              ))}
                            </TextField>
                            <Button
                              variant="contained"
                              color="secondary"
                              size="small"
                              onClick={() => void runAction(order, 'extend')}
                              disabled={loadingId === `${order.id}:extend`}
                            >
                              {loadingId === `${order.id}:extend` ? '…' : 'Extend'}
                            </Button>
                          </>
                        )}
                        {(order.status === 'active' || order.status === 'expired') && (
                          <Button
                            variant="outlined"
                            color="error"
                            size="small"
                            onClick={() => setConfirmStop(order)}
                            disabled={loadingId === `${order.id}:stop`}
                          >
                            Stop
                          </Button>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
                {orders.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center">
                      <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                        No orders to display.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Stack>
      </CardContent>
    </Card>
  );
}
