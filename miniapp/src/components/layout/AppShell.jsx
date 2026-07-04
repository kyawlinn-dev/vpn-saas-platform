import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BottomNav } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import LoadingPage from "../../pages/LoadingPage";
import ErrorPage from "../../pages/ErrorPage";
import ToastMessage from "../common/ToastMessage";
import { DEFAULT_TAB } from "../../constants/app";
import { TAB_KEYS } from "../../constants/routes";
import { useMiniAppAuth } from "../../hooks/useMiniAppAuth";
import { getMiniAppConfig } from "../../features/auth/api";
import { renderPage } from "../../app/router";

// Sub-screens hide the BottomNav and take full page height.
const SUB_SCREENS = new Set([
  TAB_KEYS.CHECKOUT,
  TAB_KEYS.PAYMENT_STATUS,
  TAB_KEYS.SETTINGS,
]);

export default function AppShell() {
  const [tab, setTab] = useState(DEFAULT_TAB);
  const [prevTab, setPrevTab] = useState(DEFAULT_TAB);
  const [toast, setToast] = useState({ open: false, message: "", severity: "info" });
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

  const showToast = (message, severity = "info") =>
    setToast({ open: true, message, severity });

  const closeToast = () =>
    setToast((prev) => ({ ...prev, open: false }));

  const navigateToCheckout = (plan) => {
    setCheckoutPlan(plan);
    setTab(TAB_KEYS.CHECKOUT);
  };

  const openSettings = () => {
    setPrevTab(tab);
    setTab(TAB_KEYS.SETTINGS);
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
      prevTab,
      onToast: showToast,
      onTabChange: setTab,
      onRefreshAuth: refreshAuth,
      onNavigateToCheckout: navigateToCheckout,
      onOpenSettings: openSettings,
    });
  }

  const brand = data?.config?.brand || null;
  const brandPrimary = brand?.primary_color || "#3b82f6";

  return (
    <div
      className="flex min-h-screen flex-col text-white"
      style={{
        "--brand-primary": brandPrimary,
        background:
          "radial-gradient(closest-side at 15% 8%, rgba(37,99,235,0.22), transparent), " +
          "radial-gradient(closest-side at 88% 12%, rgba(34,211,238,0.16), transparent), " +
          "radial-gradient(closest-side at 50% 100%, rgba(124,58,237,0.12), transparent), " +
          "#0b1020",
      }}
    >
      <div
        className={cn(
          "flex-1 pt-[var(--app-safe-top)]",
          !isSubScreen
            ? "pb-[calc(4rem_+_var(--app-safe-bottom))]"
            : "pb-[var(--app-safe-bottom)]",
        )}
      >
        {content}
      </div>

      {!isSubScreen && (
        <BottomNav active={tab} onChange={setTab} />
      )}

      <ToastMessage
        open={toast.open}
        message={toast.message}
        severity={toast.severity}
        onClose={closeToast}
      />
    </div>
  );
}
