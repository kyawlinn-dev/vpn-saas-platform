import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAdminAuth } from './providers/AdminAuthProvider';
import { AppLayout } from './components/layout/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { useDashboardData } from './hooks/useDashboardData';

const OverviewPage = lazy(() => import('./pages/OverviewPage').then((module) => ({ default: module.OverviewPage })));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage').then((module) => ({ default: module.AnalyticsPage })));
const ResellersPage = lazy(() => import('./pages/ResellersPage').then((module) => ({ default: module.ResellersPage })));
const PlansPage = lazy(() => import('./pages/PlansPage').then((module) => ({ default: module.PlansPage })));
const OrdersPage = lazy(() => import('./pages/OrdersPage').then((module) => ({ default: module.OrdersPage })));
const CustomersPage = lazy(() => import('./pages/CustomersPage').then((module) => ({ default: module.CustomersPage })));
const KeysPage = lazy(() => import('./pages/KeysPage').then((module) => ({ default: module.KeysPage })));
const ServersPage = lazy(() => import('./pages/ServersPage').then((module) => ({ default: module.ServersPage })));
const SettlementsPage = lazy(() => import('./pages/SettlementsPage').then((module) => ({ default: module.SettlementsPage })));

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
      onRefresh={refresh}
      error={error || undefined}
    >
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route index element={<Navigate to="/overview" replace />} />
          <Route path="overview" element={<OverviewPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
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
            path="settlements"
            element={<SettlementsPage resellers={resellers} />}
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
      </Suspense>
    </AppLayout>
  );
}

export default function App() {
  const { isAuthenticated, initializing } = useAdminAuth();

  if (initializing) return <LoadingScreen />;
  if (!isAuthenticated) return <LoginPage />;
  return <AuthenticatedApp />;
}
