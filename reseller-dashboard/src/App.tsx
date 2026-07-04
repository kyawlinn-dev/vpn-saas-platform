import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { ResellerAuthProvider } from "./providers/ResellerAuthProvider";
import { DashboardDataProvider } from "./providers/DashboardDataProvider";
import LoginPage from "./pages/LoginPage";
import { OverviewPage } from "./pages/OverviewPage";
import { OrdersPage } from "./pages/OrdersPage";
import { PlansPage } from "./pages/PlansPage";
import { TelegramOrdersPage } from "./pages/TelegramOrdersPage";
import { SettingsPage } from "./pages/SettingsPage";
import { AppShell } from "./components/layout/AppShell";

export default function App() {
  return (
    <ResellerAuthProvider>
      <DashboardDataProvider>
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
            <Route path="telegram-orders" element={<TelegramOrdersPage />} />
            <Route path="plans" element={<PlansPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </DashboardDataProvider>
    </ResellerAuthProvider>
  );
}
