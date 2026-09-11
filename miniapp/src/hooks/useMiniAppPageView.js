import { useEffect } from "react";
import { trackMiniAppPageView } from "../features/auth/api";

export function useMiniAppPageView({ eventName, page, data, initData }) {
  const telegramUserId = data?.user?.telegram_user_id;
  const authInitData = initData || data?.init_data || "";

  useEffect(() => {
    if (!eventName || !page || !telegramUserId || !authInitData) return;

    trackMiniAppPageView({
      eventName,
      page,
      telegramUserId,
      initData: authInitData,
    }).catch(() => {
      // Monitoring must never break the customer flow.
    });
  }, [authInitData, eventName, page, telegramUserId]);
}
