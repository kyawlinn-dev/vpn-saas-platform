import { Box } from "@mui/material";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import BottomTabs from "./BottomTabs";
import LoadingPage from "../../pages/LoadingPage";
import ErrorPage from "../../pages/ErrorPage";
import ToastMessage from "../common/ToastMessage";
import { DEFAULT_TAB } from "../../constants/app";
import { TAB_KEYS } from "../../constants/routes";
import { useMiniAppAuth } from "../../hooks/useMiniAppAuth";
import { getMiniAppConfig } from "../../features/auth/api";
import { renderPage } from "../../app/router";

// Sub-screens (checkout, payment_status) hide the BottomTabs and take full height.
const SUB_SCREENS = new Set([TAB_KEYS.CHECKOUT, TAB_KEYS.PAYMENT_STATUS]);

export default function AppShell() {
  const [tab, setTab] = useState(DEFAULT_TAB);
  const [toast, setToast] = useState({ open: false, message: "", severity: "info" });

  // Selected plan passed from PackagesPage → CheckoutPage → PaymentStatusPage.
  const [checkoutPlan, setCheckoutPlan] = useState(null);

  const {
    data,
    error,
    isError,
    isLoading,
    hasActivePackage,
    hasLinkedKey,
    hasActiveAccess,
    initData,
    refreshAuth,
  } = useMiniAppAuth();

  const { data: configData } = useQuery({
    queryKey: ["miniapp-config"],
    queryFn: getMiniAppConfig,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const supportUsername =
    (data?.config ?? configData)?.brand?.support_username ?? null;

  const showToast = (message, severity = "info") => {
    setToast({ open: true, message, severity });
  };

  const closeToast = () => {
    setToast((prev) => ({ ...prev, open: false }));
  };

  // Navigate to checkout carrying the selected plan.
  const navigateToCheckout = (plan) => {
    setCheckoutPlan(plan);
    setTab(TAB_KEYS.CHECKOUT);
  };

  const isSubScreen = SUB_SCREENS.has(tab);

  let content = null;
  if (isLoading) {
    content = <LoadingPage />;
  } else if (isError) {
    content = <ErrorPage error={error} supportUsername={supportUsername} />;
  } else {
    content = renderPage(tab, {
      data,
      hasActivePackage,
      hasLinkedKey,
      hasActiveAccess,
      initData,
      checkoutPlan,
      onToast: showToast,
      onTabChange: setTab,
      onRefreshAuth: refreshAuth,
      onNavigateToCheckout: navigateToCheckout,
    });
  }

  const brand = data?.config?.brand || null;
  const brandPrimary = brand?.primary_color || "#3b82f6";

  return (
    <Box
      minHeight="100vh"
      display="flex"
      flexDirection="column"
      sx={{
        "--brand-primary": brandPrimary,
        background:
          "radial-gradient(closest-side at 15% 8%, rgba(37,99,235,0.22), transparent), radial-gradient(closest-side at 88% 12%, rgba(34,211,238,0.16), transparent), radial-gradient(closest-side at 50% 100%, rgba(124,58,237,0.12), transparent), #0b1020",
        color: "#fff",
      }}
    >
      {/* Sub-screens (checkout / payment_status) use full height; main tabs pad for BottomTabs. */}
      <Box flex={1} pb={isSubScreen ? 0 : "82px"}>
        {content}
      </Box>

      {/* BottomTabs hidden on checkout / payment_status sub-screens. */}
      {!isSubScreen && (
        <BottomTabs value={tab} onChange={setTab} />
      )}

      <ToastMessage
        open={toast.open}
        message={toast.message}
        severity={toast.severity}
        onClose={closeToast}
      />
    </Box>
  );
}
