import { postJson, requestJson } from "../../services/http";
import { MINIAPP_SLUG } from "../../lib/slug";

export async function getMiniAppConfig() {
  const payload = await requestJson(`/api/miniapp/${MINIAPP_SLUG}/config`);
  return payload.data;
}

export async function authenticateMiniApp() {
  const initData = window.Telegram?.WebApp?.initData || "";

  const payload = await postJson(`/api/miniapp/${MINIAPP_SLUG}/auth`, {
    init_data: initData,
  });

  return payload.data;
}

export async function getMiniAppPlans() {
  const payload = await requestJson(`/api/miniapp/${MINIAPP_SLUG}/plans`);
  return payload.data?.plans || [];
}

export async function getMiniAppServers(telegramUserId) {
  const path = telegramUserId
    ? `/api/miniapp/${MINIAPP_SLUG}/servers?telegram_user_id=${encodeURIComponent(
        telegramUserId
      )}`
    : `/api/miniapp/${MINIAPP_SLUG}/servers`;

  const payload = await requestJson(path);
  return payload.data?.servers || [];
}

