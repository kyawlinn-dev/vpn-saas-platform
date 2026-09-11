import { useQuery } from "@tanstack/react-query";
import {
  authenticateMiniApp,
  getMiniAppConfig,
  getMiniAppPlans,
  getMiniAppServers,
} from "../features/auth/api";
import { getTelegramInitData, prepareTelegramWebApp } from "../lib/telegram";
import { getImportUrl } from "../lib/links";
import { useEffect } from "react";

export function attachKeyToServer(server, vpnKey) {
  if (!server) return null;

  return {
    ...server,
    // Protocol info
    protocol: vpnKey?.protocol || "shadowsocks",
    // SS fields
    dynamic_access_url: vpnKey?.dynamic_access_url || "",
    ssconf_url: vpnKey?.ssconf_url || "",
    ssconf_token: vpnKey?.ssconf_token || "",
    // VLESS / Hysteria2 field
    subscription_url: vpnKey?.subscription_url || "",
    // Common
    data_limit_bytes: vpnKey?.data_limit_bytes || null,
    used_bytes: vpnKey?.used_bytes || 0,
  };
}

export function useMiniAppAuth() {
  useEffect(() => {
    prepareTelegramWebApp();
  }, []);

  const query = useQuery({
    queryKey: ["miniapp-dashboard"],
    queryFn: async () => {
      const config = await getMiniAppConfig();
      const auth = await authenticateMiniApp();
      const plans = await getMiniAppPlans();
      const servers = await getMiniAppServers(auth?.user?.telegram_user_id, auth?.init_data);

      // Use vpn_key (new) with fallback to outline_key (legacy)
      const vpnKey = auth?.vpn_key || auth?.outline_key || null;
      const currentServer = attachKeyToServer(auth?.current_server, vpnKey);

      return {
        ...auth,
        current_server: currentServer,
        vpn_key: vpnKey,
        // Legacy alias
        outline_key: vpnKey,
        config,
        plans,
        servers,
        order: auth?.subscription || null,
        protocol_preference: auth?.protocol_preference || "shadowsocks",
      };
    },
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });

  const data = query.data || null;
  const subscription = data?.subscription || null;
  const vpnKey = data?.vpn_key || data?.outline_key || null;
  const protocolPreference = data?.protocol_preference || "shadowsocks";

  const hasActivePackage =
    subscription?.status === "active" &&
    (
      subscription?.type === "trial" ||
      ["pending_review", "confirmed", "approved"].includes(subscription?.review_status)
    );

  // Key is linked when there is any usable import URL, regardless of protocol.
  // Using getImportUrl() covers SS (subscription_url / dynamic_access_url / ssconf_url)
  // and VLESS/Hysteria2 (subscription_url) with the same fallback chain.
  // Previously this checked protocolPreference, which broke VLESS trial keys when
  // the preference defaulted to "shadowsocks" and dynamic_access_url was empty.
  const hasLinkedKey = Boolean(vpnKey && getImportUrl(vpnKey));

  return {
    ...query,
    initData: data?.init_data || getTelegramInitData() || "",
    data,
    state: hasActivePackage ? "active" : "no_package",
    hasActivePackage,
    hasLinkedKey,
    hasActiveAccess: hasLinkedKey,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error || null,
    refreshAuth: query.refetch,
    protocolPreference,
  };
}
