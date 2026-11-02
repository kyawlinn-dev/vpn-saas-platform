import crypto from "node:crypto";

export function createNotificationDelivery(repository) {
  return async function deliver(identity, send) {
    if (!["resellerId", "eventType", "recordId", "channel", "recipientId"].every(key => typeof identity?.[key] === "string" && identity[key].length)) {
      return { sent: false, reason: "invalid_identity" };
    }
    const owner = crypto.randomUUID();
    let claim;
    try { claim = await repository.claim(identity, owner); }
    catch { return { sent: false, reason: "storage_failed" }; }
    if (!claim) return { sent: false, reason: "already_claimed" };
    let result;
    try {
      const response = await send();
      result = { status: "sent", providerMessageId: response?.messageId == null ? null : String(response.messageId) };
    } catch (error) {
      const status = ["retryable", "skipped"].includes(error.deliveryStatus) ? error.deliveryStatus : "uncertain";
      result = { status: status === "retryable" && claim.attempt_count >= 3 ? "skipped" : status, errorCode: String(error.code || error.metaCode || status).slice(0, 80) };
    }
    try {
      const finished = await repository.finish(claim.id, owner, result, identity.resellerId);
      if (!finished) return { sent: false, reason: "lease_lost", deliveryId: claim.id };
    } catch { return { sent: false, reason: "storage_failed", deliveryId: claim.id }; }
    return { sent: result.status === "sent", reason: result.status, deliveryId: claim.id };
  };
}

async function database() { return (await import("../lib/supabase.js")).supabase; }
const repository = {
  async claim(identity, owner) {
    const { data, error } = await (await database()).rpc("claim_notification_delivery", {
      p_reseller_id: identity.resellerId, p_event_type: identity.eventType, p_record_id: identity.recordId,
      p_channel: identity.channel, p_recipient_id: identity.recipientId, p_owner: owner,
      p_event_key: identity.eventKey || "",
    });
    if (error) throw new Error("Notification claim failed");
    return data;
  },
  async finish(id, owner, result, resellerId) {
    const { data, error } = await (await database()).rpc("finish_notification_delivery", {
      p_id: id, p_reseller_id: resellerId, p_owner: owner, p_status: result.status,
      p_provider_message_id: result.providerMessageId || null, p_error_code: result.errorCode || null,
    });
    if (error) throw new Error("Notification completion failed");
    return data === true;
  },
};
export const deliverOnce = createNotificationDelivery(repository);
