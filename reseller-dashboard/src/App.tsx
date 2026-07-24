import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { ThemeProvider } from "./providers/ThemeProvider";
import { ResellerAuthProvider } from "./providers/ResellerAuthProvider";
import { DashboardDataProvider } from "./providers/DashboardDataProvider";
import LoginPage from "./pages/LoginPage";
import { AppShell } from "./components/layout/AppShell";

const OverviewPage = lazy(() => import("./pages/OverviewPage").then((module) => ({ default: module.OverviewPage })));
const OrdersPage = lazy(() => import("./pages/OrdersPage").then((module) => ({ default: module.OrdersPage })));
const CustomersPage = lazy(() => import("./pages/CustomersPage").then((module) => ({ default: module.CustomersPage })));
const AccountingPage = lazy(() => import("./pages/AccountingPage").then((module) => ({ default: module.AccountingPage })));
const PlansPage = lazy(() => import("./pages/PlansPage").then((module) => ({ default: module.PlansPage })));
const TelegramOrdersPage = lazy(() => import("./pages/TelegramOrdersPage").then((module) => ({ default: module.TelegramOrdersPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((module) => ({ default: module.SettingsPage })));

function RouteLoading() {
  return <div className="min-h-48 animate-pulse rounded-lg bg-white/50" aria-label="Loading page" />;
}

export default function App() {
  return (
    <ThemeProvider>
      <ResellerAuthProvider>
        <DashboardDataProvider>
          <Suspense fallback={<RouteLoading />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />

              <Route
                path="/app"
                element={
                  <ProtectedRoute>
                    <AppShell />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Navigate to="overview" replace />} />
                <Route path="overview" element={<OverviewPage />} />
                <Route path="orders" element={<OrdersPage />} />
                <Route path="customers" element={<CustomersPage />} />
                <Route path="accounting" element={<AccountingPage />} />
                <Route path="telegram-orders" element={<TelegramOrdersPage />} />
                <Route path="plans" element={<PlansPage />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>

              <Route path="*" element={<Navigate to="/app" replace />} />
            </Routes>
          </Suspense>
        </DashboardDataProvider>
      </ResellerAuthProvider>
    </ThemeProvider>
  );
}
