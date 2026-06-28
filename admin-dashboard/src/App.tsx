import { useMemo, useState } from 'react';
import { Alert, AppBar, Box, Chip, Container, CssBaseline, MenuItem, Stack, Tab, Tabs, TextField, ThemeProvider, Toolbar, Typography, createTheme } from '@mui/material';
import { CustomerForm } from './components/CustomerForm';
import { OrderForm } from './components/OrderForm';
import { OrdersTable } from './components/OrdersTable';
import { SimpleTableCard } from './components/SimpleTableCard';
import { SummaryCards } from './components/SummaryCards';
import { useDashboardData } from './hooks/useDashboardData';
import { formatBytes, formatDate, formatMMK, getStatusColor } from './lib/format';

const theme = createTheme({
  palette: {
    mode: 'dark',
  },
});

export default function App() {
  const { customers, orders, plans, resellers, keys, loading, error, refresh } = useDashboardData();
  const [tab, setTab] = useState(0);
  const [selectedResellerId, setSelectedResellerId] = useState('all');

  const filtered = useMemo(() => {
    if (selectedResellerId === 'all') {
      return { customers, orders, keys };
    }

    return {
      customers: customers.filter((item) => item.reseller_id === selectedResellerId),
      orders: orders.filter((item) => item.reseller_id === selectedResellerId),
      keys: keys.filter((item) => item.reseller_id === selectedResellerId),
    };
  }, [customers, orders, keys, selectedResellerId]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppBar position="sticky" color="transparent" enableColorOnDark>
        <Toolbar>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', md: 'center' }} sx={{ width: '100%' }}>
            <Box sx={{ flexGrow: 1 }}>
              <Typography variant="h5" fontWeight={700}>VPN SaaS Admin Dashboard</Typography>
              <Typography variant="body2" color="text.secondary">
                Super-admin view for monitoring customers, orders, keys, plans, and reseller activity.
              </Typography>
            </Box>
            <TextField
              select
              size="small"
              label="Reseller filter"
              value={selectedResellerId}
              onChange={(e) => setSelectedResellerId(e.target.value)}
              sx={{ minWidth: 220 }}
            >
              <MenuItem value="all">All resellers</MenuItem>
              {resellers.map((item) => (
                <MenuItem key={item.id} value={item.id}>
                  {item.name}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Stack spacing={3}>
          {error && <Alert severity="error">{error}</Alert>}
          {loading ? <Alert severity="info">Loading dashboard data...</Alert> : <SummaryCards orders={filtered.orders} keys={filtered.keys} />}

          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tabs value={tab} onChange={(_, value) => setTab(value)} variant="scrollable" scrollButtons="auto">
              <Tab label="Operations" />
              <Tab label="Customers" />
              <Tab label="Plans" />
              <Tab label="Keys" />
              <Tab label="Resellers" />
            </Tabs>
          </Box>

          {tab === 0 && (
            <Stack spacing={3}>
              <CustomerForm resellers={resellers} onSuccess={refresh} />
              <OrderForm customers={filtered.customers} plans={plans} onSuccess={refresh} />
              <OrdersTable orders={filtered.orders} plans={plans} onSuccess={refresh} />
            </Stack>
          )}

          {tab === 1 && (
            <SimpleTableCard
              title="Customers"
              rows={filtered.customers}
              columns={[
                { key: 'name', header: 'Name', render: (row) => row.full_name },
                { key: 'telegram', header: 'Telegram', render: (row) => row.telegram_username || '-' },
                { key: 'phone', header: 'Phone', render: (row) => row.phone || '-' },
                { key: 'reseller', header: 'Reseller', render: (row) => row.reseller?.name || '-' },
                { key: 'notes', header: 'Notes', render: (row) => row.notes || '-' },
              ]}
            />
          )}

          {tab === 2 && (
            <SimpleTableCard
              title="Plans"
              rows={plans}
              columns={[
                { key: 'name', header: 'Name', render: (row) => row.name },
                { key: 'price', header: 'Price', render: (row) => formatMMK(row.price_mmk) },
                { key: 'duration', header: 'Duration', render: (row) => `${row.duration_days} days` },
                { key: 'limit', header: 'Data Limit', render: (row) => row.data_limit_gb ? `${row.data_limit_gb} GB` : 'Unlimited' },
                { key: 'devices', header: 'Devices', render: (row) => row.max_devices || '-' },
              ]}
            />
          )}

          {tab === 3 && (
            <SimpleTableCard
              title="VPN Keys"
              rows={filtered.keys}
              columns={[
                { key: 'keyName', header: 'Key Name', render: (row) => row.key_name },
                { key: 'status', header: 'Status', render: (row) => <Chip size="small" color={getStatusColor(row.status) as any} label={row.status} /> },
                { key: 'order', header: 'Order', render: (row) => row.order_id.slice(0, 8) },
                { key: 'usage', header: 'Used', render: (row) => formatBytes(row.used_bytes) },
                { key: 'created', header: 'Created', render: (row) => formatDate(row.created_at) },
              ]}
            />
          )}

          {tab === 4 && (
            <SimpleTableCard
              title="Resellers"
              rows={resellers}
              columns={[
                { key: 'name', header: 'Name', render: (row) => row.name },
                { key: 'commission', header: 'Commission', render: (row) => `${row.commission_percent || 0}%` },
                { key: 'customers', header: 'Customers', render: (row) => customers.filter((item) => item.reseller_id === row.id).length },
                { key: 'orders', header: 'Orders', render: (row) => orders.filter((item) => item.reseller_id === row.id).length },
              ]}
            />
          )}
        </Stack>
      </Container>
    </ThemeProvider>
  );
}
