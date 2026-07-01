import { Box } from "@mui/material";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Header from "./Header";
import BottomTabs from "./BottomTabs";
import LoadingPage from "../../pages/LoadingPage";
import ErrorPage from "../../pages/ErrorPage";
import ToastMessage from "../common/ToastMessage";
import { DEFAULT_TAB } from "../../constants/app";
import { useMiniAppAuth } from "../../hooks/useMiniAppAuth";
import { getMiniAppConfig } from "../../features/auth/api";
import { renderPage } from "../../app/router";

export default function AppShell() {
  const [tab, setTab] = useState(DEFAULT_TAB);
  const [toast, setToast] = useState({
    open: false,
    message: "",
    severity: "info",
  });

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

  // Fetched independently so ErrorPage can show the reseller's support handle
  // even when the main auth query fails (e.g. auth error after config succeeded).
  // If config itself fails (bad/missing slug), configData is undefined and
  // ErrorPage hides the support button entirely.
  const { data: configData } = useQuery({
    queryKey: ["miniapp-config"],
    queryFn: getMiniAppConfig,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const supportUsername =
    (data?.config ?? configData)?.brand?.support_username ?? null;

  const showToast = (message, severity = "info") => {
    setToast({
      open: true,
      message,
      severity,
    });
  };

  const closeToast = () => {
    setToast((prev) => ({ ...prev, open: false }));
  };

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
      onToast: showToast,
      onTabChange: setTab,
      onRefreshAuth: refreshAuth,
    });
  }

  const brand = data?.config?.brand || null;

  return (
    <Box
      minHeight="100vh"
      display="flex"
      flexDirection="column"
      sx={{
        background: "#030712",
        color: "#fff",
      }}
    >
      <Box flex={1} pb="96px">
        <Box sx={{ px: 1.75, pt: 1.75 }}>
          <Header brand={brand} />
        </Box>

        {content}
      </Box>

      <BottomTabs value={tab} onChange={setTab} />

      <ToastMessage
        open={toast.open}
        message={toast.message}
        severity={toast.severity}
        onClose={closeToast}
      />
    </Box>
  );
}
