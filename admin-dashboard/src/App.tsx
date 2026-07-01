import { useMemo, useState } from 'react';
import { Alert, AppBar, Box, Button, Chip, Container, CssBaseline, LinearProgress, MenuItem, Stack, Tab, Tabs, TextField, ThemeProvider, Toolbar, Typography, createTheme } from '@mui/material';
import { CustomerForm } from './components/CustomerForm';
import { OrderForm } from './components/OrderForm';
import { OrdersTable } from './components/OrdersTable';
import { PlansTab } from './components/PlansTab';
import { ResellersTab } from './components/ResellersTab';
import { ServersTab } from './components/ServersTab';
import { SimpleTableCard } from './components/SimpleTableCard';
import { SummaryCards } from './components/SummaryCards';
import { useDashboardData } from './hooks/useDashboardData';
import { formatBytes, formatDate, formatMMK, getStatusColor } from './lib/format';
import { useAdminAuth } from './providers/AdminAuthProvider';
import { LoginPage } from './pages/LoginPage';

const theme = createTheme({
  palette: {
    mode: 'dark',
  },
});

export default function App() {
  const { isAuthenticated, initializing, admin, logout } = useAdminAuth();
  const { customers, orders, plans, resellers, servers, keys, loading, error, refresh } = useDashboardData();
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

  if (initializing) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <LinearProgress />
      </ThemeProvider>
    );
  }

  if (!isAuthenticated) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <LoginPage />
      </ThemeProvider>
    );
  }

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
            <Stack direction="row" alignItems="center" spacing={1.5} sx={{ flexShrink: 0 }}>
              <Typography variant="body2" color="text.secondary" noWrap>
                {admin?.name || admin?.email}
              </Typography>
              <Button size="small" variant="outlined" color="inherit" onClick={() => void logout()}>
                Sign Out
              </Button>
            </Stack>
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
              <Tab label="Servers" />
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

          {tab === 2 && <PlansTab plans={plans} onSuccess={refresh} />}

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

          {tab === 4 && <ServersTab servers={servers} onSuccess={refresh} />}

          {tab === 5 && (
            <ResellersTab resellers={resellers} onSuccess={refresh} />
          )}
        </Stack>
      </Container>
    </ThemeProvider>
  );
}
