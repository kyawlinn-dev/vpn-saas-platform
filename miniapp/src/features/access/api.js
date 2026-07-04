import { postJson, uploadFormData } from "../../services/http";
import { MINIAPP_SLUG } from "../../lib/slug";
import { getTelegramInitData } from "../../lib/telegram";

function getSlugOrThrow() {
  if (!MINIAPP_SLUG) {
    throw new Error("Missing Mini App slug. Please open this app from the Telegram bot.");
  }

  return encodeURIComponent(MINIAPP_SLUG);
}

function requireTelegramInitData(
  initData = "",
  message = "Missing Telegram Mini App authentication data. Close this Mini App and reopen it from the bot's Web App button."
) {
  const value = initData || getTelegramInitData();

  if (!value) {
    throw new Error(message);
  }

  return value;
}

export async function uploadPaymentScreenshot({ file, telegramUserId, initData = "" }) {
  const slug = getSlugOrThrow();
  const form = new FormData();
  form.append("file", file);
  form.append("telegram_user_id", String(telegramUserId));
  form.append("init_data", requireTelegramInitData(initData));
  const payload = await uploadFormData(`/api/miniapp/${slug}/upload-screenshot`, form);
  return payload;
}

export async function linkMiniAppServer({ server_id, telegram_user_id, init_data = "" }) {
  const slug = getSlugOrThrow();
  const verifiedInitData = requireTelegramInitData(init_data, "Open from Telegram bot again.");
  const payload = await postJson(
    `/api/miniapp/${slug}/servers/${encodeURIComponent(server_id)}/link`,
    { telegram_user_id, init_data: verifiedInitData },
    { headers: { "X-Telegram-Init-Data": verifiedInitData } }
  );
  return payload.data;
}

export async function submitMiniAppPurchase({
  telegram_user_id,
  plan_id,
  payment_screenshot_url,
  payment_note,
  init_data = "",
}) {
  const slug = getSlugOrThrow();
  const payload = await postJson(`/api/miniapp/${slug}/orders`, {
    telegram_user_id,
    plan_id,
    payment_screenshot_url,
    payment_note,
    init_data: requireTelegramInitData(init_data),
  });
  return payload.data;
}
