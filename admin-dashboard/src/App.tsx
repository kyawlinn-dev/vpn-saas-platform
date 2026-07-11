import { Routes, Route, Navigate } from 'react-router-dom';
import { useAdminAuth } from './providers/AdminAuthProvider';
import { AppLayout } from './components/layout/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { OverviewPage } from './pages/OverviewPage';
import { ResellersPage } from './pages/ResellersPage';
import { PlansPage } from './pages/PlansPage';
import { OrdersPage } from './pages/OrdersPage';
import { CustomersPage } from './pages/CustomersPage';
import { KeysPage } from './pages/KeysPage';
import { ServersPage } from './pages/ServersPage';
import { useDashboardData } from './hooks/useDashboardData';

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

function AuthenticatedApp() {
  const { plans, resellers, servers, loading, error, refresh } = useDashboardData();

  if (loading && plans.length === 0 && servers.length === 0) return <LoadingScreen />;

  return (
    <AppLayout
      adminName={undefined}
      onRefresh={refresh}
      error={error || undefined}
    >
      <Routes>
        <Route index element={<Navigate to="/overview" replace />} />
        <Route path="overview" element={<OverviewPage />} />
        <Route
          path="resellers"
          element={<ResellersPage onSuccess={refresh} />}
        />
        <Route
          path="plans"
          element={<PlansPage plans={plans} onSuccess={refresh} />}
        />
        <Route
          path="orders"
          element={<OrdersPage plans={plans} resellers={resellers} onSuccess={refresh} />}
        />
        <Route
          path="customers"
          element={<CustomersPage resellers={resellers} />}
        />
        <Route
          path="keys"
          element={<KeysPage resellers={resellers} />}
        />
        <Route
          path="servers"
          element={<ServersPage servers={servers} onSuccess={refresh} />}
        />
        <Route path="*" element={<Navigate to="/overview" replace />} />
      </Routes>
    </AppLayout>
  );
}

export default function App() {
  const { isAuthenticated, initializing } = useAdminAuth();

  if (initializing) return <LoadingScreen />;
  if (!isAuthenticated) return <LoginPage />;
  return <AuthenticatedApp />;
}
