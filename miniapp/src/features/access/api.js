import { postJson } from "../../services/http";

const MINIAPP_SLUG = import.meta.env.VITE_MINIAPP_SLUG || "nexa";

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
