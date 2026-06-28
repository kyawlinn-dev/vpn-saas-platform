import { postJson, requestJson } from "../../services/http";

const MINIAPP_SLUG = import.meta.env.VITE_MINIAPP_SLUG || "nexa";

function getTelegramUserFallback() {
  const webAppUser = window.Telegram?.WebApp?.initDataUnsafe?.user;

  if (webAppUser?.id) {
    return {
      id: webAppUser.id,
      first_name: webAppUser.first_name || "",
      last_name: webAppUser.last_name || "",
      username: webAppUser.username || "",
    };
  }

  // Browser/dev fallback
  return {
    id: 123456789,
    first_name: "Kyaw",
    last_name: "Linn",
    username: "kyawlinn",
  };
}

export async function getMiniAppConfig() {
  const payload = await requestJson(`/api/miniapp/${MINIAPP_SLUG}/config`);
  return payload.data;
}

export async function authenticateMiniApp() {
  const telegram_user = getTelegramUserFallback();

  const payload = await postJson(`/api/miniapp/${MINIAPP_SLUG}/auth`, {
    telegram_user,
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

