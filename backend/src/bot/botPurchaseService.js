/**
 * botPurchaseService.js
 *
 * Shared bot read helpers and the Telegram purchase compatibility adapter.
 * Purchase writes are owned by services/purchaseService.js, not by channel code.
 */

import crypto from "node:crypto";
import { supabase } from "../lib/supabase.js";
import { submitPurchase } from "../services/purchaseService.js";
import { getPurchaseBlockReason } from "../services/purchaseQueuePolicy.js";

// ── Plans ──────────────────────────────────────────────────────────────────────

/**
 * Returns active, purchasable (non-trial) plans ordered by price ascending.
 * Plans are global — not filtered per reseller.
 */
export async function getPurchasablePlans() {
  const { data, error } = await supabase
    .from("vpn_plans")
    .select("id, name, price_mmk, data_limit_gb, duration_days")
    .eq("is_active", true)
    .eq("is_trial", false)
    .order("price_mmk", { ascending: true });

  if (error) throw new Error(`Failed to load plans: ${error.message}`);
  return data ?? [];
}

// ── Reseller ───────────────────────────────────────────────────────────────────

/** Fetch reseller row (commission_percent, name, etc.) for order creation. */
export async function getResellerRow(resellerId) {
  const { data, error } = await supabase
    .from("resellers")
    .select("id, name, commission_percent, status")
    .eq("id", resellerId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load reseller: ${error.message}`);
  if (!data) throw new Error("Reseller not found");
  return data;
}

// ── Screenshot upload ──────────────────────────────────────────────────────────

/**
 * Downloads a Telegram file and uploads it to Supabase Storage.
 * Returns the storage path string stored in vpn_orders.payment_screenshot_url.
 *
 * @param {import("telegraf").Telegraf} bot
 * @param {string} fileId  Telegram file_id from ctx.message.photo
 * @param {string} resellerId
 * @returns {Promise<string>} storagePath
 */
export async function uploadScreenshot(bot, fileId, resellerId) {
  const fileLink = await bot.telegram.getFileLink(fileId);
  const response = await fetch(fileLink.href);
  if (!response.ok) throw new Error(`Failed to download screenshot from Telegram: ${response.status}`);

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const storagePath = `bot/${resellerId}/${crypto.randomUUID()}.jpg`;

  const { error } = await supabase.storage
    .from("payment-screenshots")
    .upload(storagePath, buffer, { contentType: "image/jpeg" });

  if (error) throw new Error(`Failed to upload screenshot: ${error.message}`);
  return storagePath;
}

// ── Order creation ─────────────────────────────────────────────────────────────

/**
 * Creates a purchase order, payment row, and immediately provisions the VPN key
 * (same instant-access flow as the Mini App: customer gets the key right away,
 * reseller reviews the payment screenshot afterwards).
 *
 * @param {{ resellerId, customerId, planId, screenshotPath }} params
 * @returns {{ order, activation }} — order row, activation result (includes expiry_date)
 */
export async function createBotPurchaseOrder({ resellerId, customerId, planId, screenshotPath, protocol, requestKey }) {
  try {
    return await submitPurchase({
      actor: { role: "customer", resellerId },
      channel: "bot",
      customerId,
      planId,
      screenshotPath,
      protocol,
      requestKey,
    });
  } catch (error) {
    if (error.code === "QUEUED_PACKAGE_EXISTS") error.code = "CUSTOMER_ALREADY_QUEUED";
    throw error;
  }
}

// ── Payment info ───────────────────────────────────────────────────────────────

/**
 * Fetch the reseller's live payment methods array from reseller_miniapps.payment_info.
 * Returns [] if not set. Shape per element: { method, account_name, account_number, qr_url? }
 */
export async function getResellerPaymentInfo(resellerId) {
  const { data } = await supabase
    .from("reseller_miniapps")
    .select("payment_info")
    .eq("reseller_id", resellerId)
    .maybeSingle();
  return Array.isArray(data?.payment_info) ? data.payment_info : [];
}

// ── Notification helpers ───────────────────────────────────────────────────────

/**
 * Returns the customer's Telegram user ID for a given order.
 * Needed to send the customer a DM after the reseller confirms/rejects.
 */
export async function getOrderCustomerTelegramId(orderId) {
  const { data: order, error } = await supabase
    .from("vpn_orders")
    .select(`
      customer_id,
      reseller_id,
      vpn_customers ( id )
    `)
    .eq("id", orderId)
    .maybeSingle();

  if (error || !order) return null;

  const { data: link } = await supabase
    .from("telegram_links")
    .select("telegram_user_id")
    .eq("customer_id", order.customer_id)
    .eq("reseller_id", order.reseller_id)
    .maybeSingle();

  return link?.telegram_user_id ?? null;
}

/**
 * Persist the customer's protocol choice so provisionOrderAccess reads it
 * automatically via vpn_customers.protocol_preference.
 * @param {string} customerId
 * @param {"shadowsocks"|"vless"} protocol
 */
export async function setCustomerProtocolPreference(customerId, protocol, resellerId) {
  if (!resellerId) throw new Error("Reseller ID is required for protocol update");
  const { error } = await supabase
    .from("vpn_customers")
    .update({ protocol_preference: protocol })
    .eq("id", customerId)
    .eq("reseller_id", resellerId);
  if (error) {
    console.warn(`[botPurchaseService] setCustomerProtocolPreference failed (non-fatal):`, error.message);
  }
}

/**
 * Query customer purchase eligibility for bot buy flow.
 * Rules:
 *   - At most 1 active purchase + 1 queued (scheduled) purchase order.
 *   - Any scheduled purchase blocks another purchase until it activates or is cancelled.
 * @param {string} customerId
 * @param {string} resellerId
 */
export async function getCustomerOrderPurchaseState(customerId, resellerId) {
  const { data: activeOrder, error: activeError } = await supabase
    .from("vpn_orders")
    .select("id, status, order_type, review_status")
    .eq("customer_id", customerId)
    .eq("reseller_id", resellerId)
    .eq("status", "active")
    .eq("order_type", "purchase")
    .limit(1)
    .maybeSingle();

  const { data: queuedOrder, error: queuedError } = await supabase
    .from("vpn_orders")
    .select("id, status, order_type")
    .eq("customer_id", customerId)
    .eq("reseller_id", resellerId)
    .eq("status", "scheduled")
    .limit(1)
    .maybeSingle();

  if (activeError || queuedError) {
    throw new Error(activeError?.message || queuedError?.message);
  }
  return {
    activeOrder,
    queuedOrder,
    canBuy: !getPurchaseBlockReason(activeOrder, queuedOrder),
    blockReason: getPurchaseBlockReason(activeOrder, queuedOrder),
    isExtend: Boolean(activeOrder),
  };
}

/**
 * Fetch a customer's pending/queued (scheduled) purchase order along with plan details.
 * Scoped strictly by customer_id and reseller_id.
 *
 * @param {string} customerId
 * @param {string} resellerId
 * @returns {Promise<{ id: string, planName: string, dataLimitGb: number|null, durationDays: number|null }|null>}
 */
export async function getCustomerQueuedOrder(customerId, resellerId) {
  try {
    const { data, error } = await supabase
      .from("vpn_orders")
      .select(`
        id,
        status,
        order_type,
        vpn_plans (
          id,
          name,
          data_limit_gb,
          duration_days
        )
      `)
      .eq("customer_id", customerId)
      .eq("reseller_id", resellerId)
      .eq("status", "scheduled")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    return {
      id: data.id,
      planName: data.vpn_plans?.name || "Premium Plan",
      dataLimitGb: data.vpn_plans?.data_limit_gb ?? null,
      durationDays: data.vpn_plans?.duration_days ?? null,
    };
  } catch (err) {
    console.warn(`[botPurchaseService] getCustomerQueuedOrder error (non-fatal):`, err.message);
    return null;
  }
}

