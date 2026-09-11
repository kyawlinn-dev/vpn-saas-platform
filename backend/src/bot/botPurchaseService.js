/**
 * botPurchaseService.js
 *
 * DB helpers for the bot purchase flow. Mirrors the logic in
 * resellerMiniappRoutes.js POST /:slug/buy — kept separate so bot handlers
 * never import from route files and changes to one flow can't silently break
 * the other.
 */

import crypto from "node:crypto";
import { supabase } from "../lib/supabase.js";
import {
  getPackageCommissionPercent,
  activatePendingReviewPurchase,
} from "../services/orderLifecycleService.js";
import { createOrderPayment } from "../services/paymentLedgerService.js";

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
export async function createBotPurchaseOrder({ resellerId, customerId, planId, screenshotPath }) {
  // 1. Fetch reseller (for commission_percent)
  const reseller = await getResellerRow(resellerId);

  // 2. Fetch plan
  const { data: plan, error: planErr } = await supabase
    .from("vpn_plans")
    .select("id, name, price_mmk, data_limit_gb, duration_days, max_devices")
    .eq("id", planId)
    .eq("is_active", true)
    .eq("is_trial", false)
    .maybeSingle();

  if (planErr || !plan) throw new Error("Plan not found or no longer available");

  // 3. Guard: customer must not already have an active purchase.
  // Cannot use assertNoOtherActivePurchase here (no order id yet — passing null
  // causes PostgREST to send "neq.null" which PostgreSQL rejects as invalid UUID).
  // activatePendingReviewPurchase repeats this check with the real order id after insert.
  const { data: existingActive } = await supabase
    .from("vpn_orders")
    .select("id")
    .eq("customer_id", customerId)
    .eq("reseller_id", resellerId)
    .eq("status", "active")
    .eq("order_type", "purchase")
    .limit(1)
    .maybeSingle();

  if (existingActive) {
    const err = new Error("Customer already has an active paid subscription");
    err.code = "CUSTOMER_ALREADY_ACTIVE";
    throw err;
  }

  // 4. Commission
  const commissionPercent = getPackageCommissionPercent({ reseller, plan });
  const commissionAmountMmk = Math.round(plan.price_mmk * commissionPercent / 100);

  // 5. Create order row
  const { data: order, error: orderErr } = await supabase
    .from("vpn_orders")
    .insert({
      customer_id: customerId,
      reseller_id: resellerId,
      plan_id: plan.id,
      status: "pending",
      price_mmk: plan.price_mmk,
      commission_percent: commissionPercent,
      commission_amount_mmk: commissionAmountMmk,
      payment_status: "unpaid",
      total_paid_mmk: 0,
      order_type: "purchase",
      review_status: "pending_review",
      source: "bot",
      payment_screenshot_url: screenshotPath || null,
    })
    .select("id, customer_id, reseller_id, plan_id, status, price_mmk, commission_percent, payment_status, review_status, order_type, source, start_date, expiry_date, payment_screenshot_url")
    .single();

  if (orderErr || !order) throw new Error(`Failed to create order: ${orderErr?.message}`);

  // 6. Payment ledger row
  await createOrderPayment({
    order: { ...order, reseller_id: resellerId, customer_id: customerId },
    amountMmk: plan.price_mmk,
    reviewStatus: "pending_review",
    source: "bot",
    paymentScreenshotUrl: screenshotPath || null,
  });

  // 7. Provision key immediately (pending-review instant access)
  const activation = await activatePendingReviewPurchase({
    order: { ...order, customer: { id: customerId } },
    reseller,
    plan,
  });

  return { order, activation, plan, reseller };
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
export async function setCustomerProtocolPreference(customerId, protocol) {
  const { error } = await supabase
    .from("vpn_customers")
    .update({ protocol_preference: protocol })
    .eq("id", customerId);
  if (error) {
    console.warn(`[botPurchaseService] setCustomerProtocolPreference failed (non-fatal):`, error.message);
  }
}

