import { deliverOnce } from "./notificationDeliveryService.js";
import { resellerNotifyCaption, NOTIFY_CONFIRM_BTN, NOTIFY_REJECT_BTN } from "../bot/strings.js";

const escapeHtml = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

export async function sendTelegramNotification(token, method, body, fetchImpl = fetch) {
  const response = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000),
  });
  const data = await response.json();
  if (!response.ok || data.ok !== true) {
    const code = Number(data.error_code || response.status);
    throw Object.assign(new Error("Telegram notification rejected"), {
      code: String(code), deliveryStatus: code === 429 ? "retryable" : code >= 400 && code < 500 ? "skipped" : "uncertain",
    });
  }
  return { messageId: data.result?.message_id };
}

export function createAdminPurchaseNotifier(deps) {
  return async function notify({ resellerId, orderId, receipt, expectedRecipientId }) {
    try {
      const record = await deps.lookup({ resellerId, orderId });
      if (!record || record.order?.reseller_id !== resellerId || record.order.id !== orderId) return { sent: false, reason: "invalid_scope" };
      const { order, customer, plan, config, payment } = record;
      if (!config?.admin_telegram_user_id || !config.bot_token_encrypted) return { sent: false, reason: "unconfigured" };
      const recipientId = String(config.admin_telegram_user_id);
      if (expectedRecipientId && expectedRecipientId !== recipientId) return { sent: false, reason: "superseded" };
      return await deps.deliver({ resellerId, eventType: "purchase_submitted", recordId: orderId, channel: "telegram", recipientId }, async () => {
        let photo = receipt?.kind === "telegram_file" ? receipt.fileId : null;
        const path = receipt?.kind === "storage" ? receipt.path : payment?.payment_screenshot_url;
        if (!photo && path) { try { photo = await deps.signReceipt(path); } catch { /* Text review remains available when signing fails. */ } }
        const caption = resellerNotifyCaption({
          customerName: escapeHtml(customer?.full_name || "Customer"), planName: escapeHtml(plan?.name || "Package"),
          priceMmk: Number(order.price_mmk ?? plan?.price_mmk ?? 0), durationDays: plan?.duration_days,
          dataLimitGb: plan?.data_limit_gb ?? "Unlimited", orderId: escapeHtml(orderId),
          isExtend: order.order_type === "extend" || payment?.payment_type === "extend",
        }) + `\nSource: ${escapeHtml(order.source || "legacy")}`;
        const body = { chat_id: recipientId, parse_mode: "HTML", reply_markup: { inline_keyboard: [[
          { text: NOTIFY_CONFIRM_BTN, callback_data: `pay_ok:${orderId}` }, { text: NOTIFY_REJECT_BTN, callback_data: `pay_no:${orderId}` },
        ]] } };
        if (photo && caption.length <= 1024) Object.assign(body, { photo, caption });
        else body.text = caption;
        return deps.sendTelegram(await deps.decrypt(config.bot_token_encrypted), body.photo ? "sendPhoto" : "sendMessage", body);
      });
    } catch { return { sent: false, reason: "notification_failed" }; }
  };
}

async function database() { return (await import("../lib/supabase.js")).supabase; }
const configured = createAdminPurchaseNotifier({
  deliver: deliverOnce, sendTelegram: sendTelegramNotification,
  decrypt: async value => (await import("../lib/tokenEncryption.js")).decrypt(value),
  async signReceipt(path) {
    const { data, error } = await (await database()).storage.from("payment-screenshots").createSignedUrl(path, 3600);
    if (error) throw new Error("Receipt signing failed");
    return data?.signedUrl || null;
  },
  async lookup({ resellerId, orderId }) {
    const db = await database();
    const orderResult = await db.from("vpn_orders").select("*,customer:vpn_customers!vpn_orders_customer_id_fkey(*),plan:vpn_plans(*)").eq("id", orderId).eq("reseller_id", resellerId).maybeSingle();
    if (orderResult.error) throw new Error("Notification order lookup failed");
    if (!orderResult.data) return null;
    const configResult = await db.from("reseller_miniapps").select("admin_telegram_user_id,bot_token_encrypted").eq("reseller_id", resellerId).maybeSingle();
    const paymentResult = await db.from("order_payments").select("payment_screenshot_url,payment_type").eq("order_id", orderId).eq("reseller_id", resellerId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (configResult.error || paymentResult.error) throw new Error("Notification configuration lookup failed");
    const order = orderResult.data;
    if (order.customer?.reseller_id !== resellerId) throw new Error("Notification customer scope mismatch");
    return { order, customer: order.customer, plan: order.plan, config: configResult.data, payment: paymentResult.data };
  },
});

export async function notifyPurchaseSubmitted(input) {
  const result = await configured(input);
  if (!result.sent && result.reason !== "already_claimed") {
    const { logger } = await import("../lib/logger.js");
    logger.warn({ reseller_id: input.resellerId, order_id: input.orderId, reason: result.reason }, "Admin purchase notification not delivered");
  }
  return result;
}
