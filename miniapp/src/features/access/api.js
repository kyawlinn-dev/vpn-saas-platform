import { postJson, uploadFormData } from "../../services/http";
import { MINIAPP_SLUG } from "../../lib/slug";

export async function uploadPaymentScreenshot({ file, telegramUserId }) {
  const form = new FormData();
  form.append("file", file);
  form.append("telegram_user_id", String(telegramUserId));
  const payload = await uploadFormData(`/api/miniapp/${MINIAPP_SLUG}/upload-screenshot`, form);
  return payload;
}

export async function linkMiniAppServer({ server_id, telegram_user_id }) {
  const payload = await postJson(
    `/api/miniapp/${MINIAPP_SLUG}/servers/${server_id}/link`,
    { telegram_user_id }
  );
  return payload.data;
}

export async function submitMiniAppPurchase({
  telegram_user_id,
  plan_id,
  payment_screenshot_url,
  payment_note,
}) {
  const payload = await postJson(`/api/miniapp/${MINIAPP_SLUG}/orders`, {
    telegram_user_id,
    plan_id,
    payment_screenshot_url,
    payment_note,
  });
  return payload.data;
}
