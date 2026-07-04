import { postJson, requestJson } from "../../services/http";
import { MINIAPP_SLUG } from "../../lib/slug";
import {
  getTelegramInitData,
  rememberTelegramInitData,
  waitForTelegramInitData,
} from "../../lib/telegram";

function getSlugOrThrow() {
  if (!MINIAPP_SLUG) {
    throw new Error("Missing Mini App slug. Please open this app from the Telegram bot.");
  }

  return encodeURIComponent(MINIAPP_SLUG);
}

export async function getMiniAppConfig() {
  const slug = getSlugOrThrow();
  const payload = await requestJson(`/api/miniapp/${slug}/config`);
  return payload.data;
}

export async function authenticateMiniApp() {
  const { hasTelegramBridge, hasInitData, initData, platform, version } =
    await waitForTelegramInitData();
  const slug = getSlugOrThrow();

  if (!hasInitData) {
    throw new Error(
      hasTelegramBridge
        ? `Missing Telegram Mini App authentication data. Reopen from the bot's Web App button. Telegram platform=${platform}, version=${version}.`
        : "Telegram Mini App bridge is unavailable. Open this app from the bot's Mini App button inside Telegram."
    );
  }

  const payload = await postJson(`/api/miniapp/${slug}/auth`, {
    init_data: initData,
  });

  rememberTelegramInitData(initData);

  return {
    ...payload.data,
    init_data: initData,
  };
}

export async function getMiniAppPlans() {
  const slug = getSlugOrThrow();
  const payload = await requestJson(`/api/miniapp/${slug}/plans`);
  return payload.data?.plans || [];
}

export async function getMiniAppServers(telegramUserId, initDataOverride = "") {
  const slug = getSlugOrThrow();
  const initData = initDataOverride || getTelegramInitData();

  if (telegramUserId) {
    const payload = await postJson(`/api/miniapp/${slug}/servers`, {
      telegram_user_id: telegramUserId,
      init_data: initData,
    });
    return payload.data?.servers || [];
  }

  const payload = await requestJson(`/api/miniapp/${slug}/servers`);
  return payload.data?.servers || [];
}
