import { deliverOnce } from "./notificationDeliveryService.js";
import { sendTelegramNotification } from "./adminPurchaseNotificationService.js";
import { renderNotification, formatBurmeseDate, formatExpiryDeadline } from "../bot/notificationTemplates.js";
import { orderExpiryAt, EXPIRY_TIME_ZONE } from "../utils/businessTime.js";
import { buildWebAppUrl } from "../bot/webAppUrl.js";

const paymentEvents = new Set(["payment_confirmed", "payment_rejected"]);
const eventTypes = new Set([...paymentEvents, "trial_ending_24h", "trial_expired", "subscription_expiring_3d", "subscription_expired", "data_limit_warning", "data_limit_reached"]);

export function createCustomerEventNotifier(deps) {
  return async function notify(input) {
    if (!eventTypes.has(input.eventType)) return { sent: false, reason: "invalid_event" };
    try {
      const record = await deps.lookup(input);
      if (!record || record.order?.reseller_id !== input.resellerId || record.order.id !== input.orderId || (input.customerId && record.order.customer_id !== input.customerId)) return { sent: false, reason: "invalid_scope" };
      if (record.channel !== "telegram") return { sent: false, reason: "unsupported_channel" };
      if (record.paused) return { sent: false, reason: "paused" };
      if (record.legacySent) return { sent: false, reason: "already_sent" };
      if (!record.recipientId) return { sent: false, reason: "no_link" };
      if (input.deliveryIdentity && (record.channel !== input.deliveryIdentity.channel || String(record.recipientId) !== input.deliveryIdentity.recipientId || (record.eventKey || "") !== input.deliveryIdentity.eventKey)) return { sent: false, reason: "superseded" };
      const delivered = await deps.deliver({ resellerId: input.resellerId, recordId: input.orderId, eventType: input.eventType, eventKey: record.eventKey || "", channel: record.channel, recipientId: String(record.recipientId) }, async () => {
        return deps.send(record, input);
      });
      return { ...delivered, channel: record.channel };
    } catch { return { sent: false, reason: "notification_failed" }; }
  };
}

async function database() { return (await import("../lib/supabase.js")).supabase; }
async function lookup(input) {
  const db = await database();
  const { data: order, error } = await db.from("vpn_orders").select("*,plan:vpn_plans(name),customer:vpn_customers!vpn_orders_customer_id_fkey(reseller_id),reseller:resellers(notifications_paused)").eq("id", input.orderId).eq("reseller_id", input.resellerId).maybeSingle();
  if (error) throw new Error("Notification lookup failed");
  if (!order || order.customer?.reseller_id !== input.resellerId) return null;
  let payment = null;
  if (paymentEvents.has(input.eventType)) {
    let paymentQuery = db.from("order_payments").select("id,source,reviewed_at,payment_note").eq("reseller_id", input.resellerId).eq("order_id", order.id)
      .eq("review_status", input.eventType === "payment_confirmed" ? "confirmed" : "rejected");
    const requestedPayment = input.paymentId || input.deliveryIdentity?.eventKey;
    if (requestedPayment) paymentQuery = paymentQuery.eq("id", requestedPayment);
    const result = await paymentQuery.order("reviewed_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
    if (result.error) throw new Error("Payment notification lookup failed");
    payment = result.data;
    if (requestedPayment && !payment) return null;
  }
  const channel = "telegram";
  const configResult = await db.from("reseller_miniapps").select("bot_token_encrypted,brand_name,support_username,miniapp_slug").eq("reseller_id", input.resellerId).maybeSingle();
  if (configResult.error) throw new Error("Notification config lookup failed");
  const config = configResult.data;
  const link = await db.from("telegram_links").select("telegram_user_id").eq("reseller_id", input.resellerId).eq("customer_id", order.customer_id).maybeSingle();
  if (link.error) throw new Error("Telegram recipient lookup failed");
  const recipientId = config?.bot_token_encrypted ? link.data?.telegram_user_id : null;
  let historyQuery = db.from("notifications_sent").select("id").eq("customer_id", order.customer_id).eq("order_id", order.id).eq("event_type", input.eventType).eq("channel", channel);
  if (payment?.reviewed_at) historyQuery = historyQuery.gte("sent_at", payment.reviewed_at);
  // A committed new review or a known durable retry has a payment identity.
  // An order-level legacy success may belong to another payment, so it cannot
  // suppress either path. Legacy scanning still suppresses pre-rollout sends.
  const legacy = input.immediate || input.deliveryIdentity?.eventKey ? { data: null } : await historyQuery.maybeSingle();
  if (legacy.error) throw new Error("Notification history lookup failed");
  return { order, config, channel, recipientId, paused: order.reseller?.notifications_paused === true, legacySent: !!legacy.data, eventKey: payment?.id, rejectReason: payment?.payment_note };
}

async function send(record, input) {
  const db = await database();
  const template = await db.from("reseller_notification_templates").select("custom_text").eq("reseller_id", input.resellerId).eq("event_type", input.eventType).maybeSingle();
  if (template.error) throw Object.assign(new Error("Template lookup failed"), { deliveryStatus: "retryable", code: "template_lookup" });
  const data = { brand_name: record.config?.brand_name || "", plan_name: record.order.plan?.name || "", expiry_date: formatBurmeseDate(record.order.expiry_date),
    // Preserve the legacy date label; fresh channel rendering also needs the true cutoff.
    expiry_deadline: formatExpiryDeadline(record.order.expiry_date), expiry_cutoff_at: orderExpiryAt(record.order.expiry_date), expiry_timezone: EXPIRY_TIME_ZONE,
    support_username: record.config?.support_username || "", reject_reason: record.rejectReason || "", ...input.data };
  const text = (record.channel === "telegram" && input.text) || renderNotification(input.eventType, data, template.data?.custom_text || null);
  if (!text) throw Object.assign(new Error("No template"), { deliveryStatus: "skipped", code: "no_template" });
  const token = (await import("../lib/tokenEncryption.js")).decrypt(record.config.bot_token_encrypted);
  const body = { chat_id: String(record.recipientId), text, parse_mode: "HTML", disable_web_page_preview: true };
  if (input.replyMarkup?.reply_markup) body.reply_markup = input.replyMarkup.reply_markup;
  else if (!paymentEvents.has(input.eventType)) {
    const url = buildWebAppUrl(String(process.env.TELEGRAM_MINIAPP_URL || "").replace(/\/$/, ""), record.config?.miniapp_slug || "");
    if (url) body.reply_markup = { inline_keyboard: [[{ text: "Buy Package", web_app: { url } }]] };
  }
  return sendTelegramNotification(token, "sendMessage", body);
}

const configured = createCustomerEventNotifier({ lookup, deliver: deliverOnce, send });
export async function notifyCustomerEvent(input) {
  const result = await configured(input);
  if (!result.sent && !["already_claimed", "already_sent", "paused"].includes(result.reason)) {
    const { logger } = await import("../lib/logger.js");
    logger.warn({ reseller_id: input.resellerId, order_id: input.orderId, event_type: input.eventType, reason: result.reason }, "Customer notification not delivered");
  }
  return result;
}
export async function notifyPaymentReviewed({ resellerId, orderId, reviewStatus }) {
  if (!["confirmed", "rejected"].includes(reviewStatus)) return { sent: false, reason: "invalid_event" };
  return notifyCustomerEvent({ resellerId, orderId, eventType: `payment_${reviewStatus}`, immediate: true });
}

export async function recoverNotificationDeliveries({ limit = 50 } = {}) {
  const db = await database();
  const { data, error } = await db.from("notification_deliveries").select("id,reseller_id,record_id,event_type,channel,recipient_id,event_key")
    .eq("channel", "telegram")
    .in("event_type", ["purchase_submitted", "payment_confirmed", "payment_rejected"])
    .in("status", ["pending", "retryable"]).lte("next_attempt_at", new Date().toISOString()).order("created_at").limit(Math.min(50, Math.max(1, limit)));
  if (error) throw new Error("Notification recovery lookup failed");
  for (const row of data || []) {
    let result;
    if (row.event_type === "purchase_submitted") result = await (await import("./adminPurchaseNotificationService.js")).notifyPurchaseSubmitted({ resellerId: row.reseller_id, orderId: row.record_id, expectedRecipientId: row.recipient_id });
    else if (paymentEvents.has(row.event_type)) result = await notifyCustomerEvent({ resellerId: row.reseller_id, orderId: row.record_id, eventType: row.event_type,
      deliveryIdentity: { channel: row.channel, recipientId: row.recipient_id, eventKey: row.event_key } });
    if (["paused", "already_sent", "no_link", "invalid_scope", "superseded", "unconfigured"].includes(result?.reason)) {
      const terminal = await db.from("notification_deliveries").update({ status: "skipped", error_code: result.reason, updated_at: new Date().toISOString() })
        .eq("id", row.id).eq("reseller_id", row.reseller_id).in("status", ["pending", "retryable"]);
      if (terminal.error) throw new Error("Notification recovery completion failed");
    }
    // Reminder jobs recompute their event-specific data instead of replaying stale payloads.
  }
  return { examined: data?.length || 0 };
}
