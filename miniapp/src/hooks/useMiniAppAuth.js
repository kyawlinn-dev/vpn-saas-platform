import { useQuery } from "@tanstack/react-query";
import {
  authenticateMiniApp,
  getMiniAppConfig,
  getMiniAppPlans,
  getMiniAppServers,
} from "../features/auth/api";
import { getTelegramInitData, prepareTelegramWebApp } from "../lib/telegram";
import { useEffect } from "react";

function attachKeyToServer(server, outlineKey) {
  if (!server) return null;

  return {
    ...server,
    dynamic_access_url: outlineKey?.dynamic_access_url || "",
    ssconf_url: outlineKey?.ssconf_url || "",
    ssconf_token: outlineKey?.ssconf_token || "",
    data_limit_bytes: outlineKey?.data_limit_bytes || null,
    used_bytes: outlineKey?.used_bytes || 0,
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

      const currentServer = attachKeyToServer(auth?.current_server, auth?.outline_key);

      return {
        ...auth,
        current_server: currentServer,
        config,
        plans,
        servers,
        order: auth?.subscription || null,
      };
    },
  });

  const data = query.data || null;
  const subscription = data?.subscription || null;
  const outlineKey = data?.outline_key || null;

  const hasActivePackage =
    subscription?.status === "active" &&
    (
      subscription?.type === "trial" ||
      ["pending_review", "confirmed", "approved"].includes(subscription?.review_status)
    );
  const hasLinkedKey = Boolean(outlineKey?.dynamic_access_url);

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
  };
}
