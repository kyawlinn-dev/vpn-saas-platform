import { useState } from 'react';
import { Alert, Button, Card, CardContent, Chip, MenuItem, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
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
  const [renewPlanByOrder, setRenewPlanByOrder] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const runAction = async (order: Order, action: 'activate' | 'renew' | 'stop') => {
    try {
      setLoadingId(`${order.id}:${action}`);
      setError('');
      setMessage('');
      if (action === 'renew') {
        await api.post(`/order-actions/${order.id}/renew`, {
          payment_status: 'paid',
          plan_id: renewPlanByOrder[order.id] || order.plan_id,
        });
      } else {
        await api.post(`/order-actions/${order.id}/${action}`);
      }
      setMessage(`${action} completed for order ${order.id.slice(0, 8)}...`);
      await onSuccess();
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || `Failed to ${action} order`);
    } finally {
      setLoadingId('');
    }
  };

  return (
    <Card>
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
                      <Chip size="small" color={getStatusColor(order.status) as any} label={order.status} />
                    </TableCell>
                    <TableCell>
                      <Chip size="small" color={getStatusColor(order.payment_status) as any} label={order.payment_status} />
                    </TableCell>
                    <TableCell>{formatDate(order.expiry_date)}</TableCell>
                    <TableCell>{formatMMK(order.price_mmk)}</TableCell>
                    <TableCell>
                      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1} alignItems="stretch">
                        {order.status === 'pending' && (
                          <Button
                            variant="contained"
                            onClick={() => void runAction(order, 'activate')}
                            disabled={loadingId === `${order.id}:activate`}
                          >
                            Activate
                          </Button>
                        )}
                        {(order.status === 'active' || order.status === 'expired') && (
                          <>
                            <TextField
                              select
                              size="small"
                              sx={{ minWidth: 180 }}
                              value={renewPlanByOrder[order.id] || order.plan_id}
                              onChange={(e) => setRenewPlanByOrder((prev) => ({ ...prev, [order.id]: e.target.value }))}
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
                              onClick={() => void runAction(order, 'renew')}
                              disabled={loadingId === `${order.id}:renew`}
                            >
                              Renew
                            </Button>
                          </>
                        )}
                        {order.status === 'active' && (
                          <Button
                            variant="outlined"
                            color="error"
                            onClick={() => void runAction(order, 'stop')}
                            disabled={loadingId === `${order.id}:stop`}
                          >
                            Stop
                          </Button>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Stack>
      </CardContent>
    </Card>
  );
}
