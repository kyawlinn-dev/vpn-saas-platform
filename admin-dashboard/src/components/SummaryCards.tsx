import { Card, CardContent, Grid, Stack, Typography } from '@mui/material';
import type { Order, VpnKey } from '../types/api';
import { formatMMK } from '../lib/format';

interface Props {
  orders: Order[];
  keys: VpnKey[];
}

export function SummaryCards({ orders, keys }: Props) {
  const activeOrders = orders.filter((item) => item.status === 'active').length;
  const pendingOrders = orders.filter((item) => item.status === 'pending').length;
  const stoppedOrders = orders.filter((item) => item.status === 'stopped').length;
  const activeKeys = keys.filter((item) => item.status === 'active').length;
  const monthlyValue = orders.reduce((sum, item) => sum + Number(item.price_mmk || 0), 0);

  const cards = [
    ['Active Orders', activeOrders],
    ['Pending Orders', pendingOrders],
    ['Stopped Orders', stoppedOrders],
    ['Active Keys', activeKeys],
    ['Order Value', formatMMK(monthlyValue)],
  ];

  return (
    <Grid container spacing={2}>
      {cards.map(([label, value]) => (
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }} key={label}>
          <Card>
            <CardContent>
              <Stack spacing={1}>
                <Typography variant="body2" color="text.secondary">
                  {label}
                </Typography>
                <Typography variant="h5" fontWeight={700}>
                  {value}
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
}
