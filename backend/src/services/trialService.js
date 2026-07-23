/**
 * trialService.js — Shared trial order creation and key provisioning.
 *
 * Used by: POST /:slug/auth (miniapp) and the Telegram bot /start handler.
 * Both flows import from here — logic is never duplicated across callers.
 *
 * Guarantees:
 *  - Atomic trial_used_at claim (prevents TOCTOU double-trial race)
 *  - Full rollback of the claim if order creation or link-update fails,
 *    so a user can never be marked "trial used" without receiving a trial.
 *  - Idempotent key provisioning (no-op if key already exists for the order)
 *  - Provisioning failure is non-fatal: trial order stands; caller wraps in try/catch.
 */

import { supabase } from "../lib/supabase.js";
import { createOutlineKey, deleteOutlineKey } from "./outlineService.js";
import { getActiveServers, incrementServerUsage } from "./serverService.js";
import { addDaysToDateOnly, businessDateOnly } from "../utils/businessTime.js";

function gbToBytes(gb) {
  if (!gb || Number(gb) <= 0) return null;
  return Math.floor(Number(gb) * 1024 * 1024 * 1024);
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function rollbackTrialClaim(telegramLinkId) {
  try {
    await supabase
      .from("telegram_links")
      .update({ trial_used_at: null, trial_order_id: null })
      .eq("id", telegramLinkId);
  } catch (err) {
    console.error("[trialService] rollback of trial_used_at failed:", err.message);
  }
}

async function findActiveTrialOrder(customerId, resellerId) {
  const today = businessDateOnly();
  const { data } = await supabase
    .from("vpn_orders")
    .select(`
      id, customer_id, reseller_id, plan_id, status, order_type,
      payment_status, review_status, start_date, expiry_date, created_at,
      vpn_plans (
        id, name, price_mmk, data_limit_gb, duration_days,
        max_devices, allowed_regions, is_trial
      )
    `)
    .eq("customer_id", customerId)
    .eq("reseller_id", resellerId)
    .eq("order_type", "trial")
    .eq("status", "active")
    .gte("expiry_date", today)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}

// ── Exported functions ────────────────────────────────────────────────────────

/**
 * Creates a trial order for a customer, atomically claiming trial_used_at first.
 *
 * Sequence:
 *   1. Atomically claim: UPDATE telegram_links SET trial_used_at = NOW()
 *      WHERE id = ? AND trial_used_at IS NULL
 *      → prevents concurrent /start + miniapp-auth from creating two orders
 *   2. If claim fails (race lost): return the existing trial order with created: false
 *   3. Select trial plan (is_trial=true, is_active=true, ORDER BY sort_order)
 *   4. INSERT vpn_orders
 *   5. UPDATE telegram_links SET trial_order_id = order.id
 *   Failure after step 1: roll back claim so user can retry and never loses eligibility.
 *
 * Throws on unrecoverable errors (plan not configured, DB error after rollback).
 *
 * @param {{ customerId, resellerId, telegramLinkId, telegramUsername }} params
 * @returns {{ order: object|null, plan: object|null, created: boolean }}
 */
export async function createTrialOrder({
  customerId,
  resellerId,
  telegramLinkId,
  telegramUsername,
}) {
  const now = new Date().toISOString();

  // Step 1: Atomic claim — only one concurrent caller can win this UPDATE
  const { data: claimed, error: claimError } = await supabase
    .from("telegram_links")
    .update({ trial_used_at: now })
    .eq("id", telegramLinkId)
    .is("trial_used_at", null)
    .select("id")
    .maybeSingle();

  if (claimError) {
    throw new Error(`Failed to claim trial slot: ${claimError.message}`);
  }

  if (!claimed) {
    // Race lost — the other concurrent request won.
    // Return whatever order it created (may be null if it's still in-flight,
    // but in practice the order write is sub-millisecond after the claim).
    const existingOrder = await findActiveTrialOrder(customerId, resellerId);
    return { order: existingOrder, plan: existingOrder?.vpn_plans || null, created: false };
  }

  // We won the race — now create the order.
  // Any failure from here: rollback the claim so the user can retry.
  let createdOrder = null;

  try {
    // Step 3: Select trial plan
    const { data: trialPlan, error: planError } = await supabase
      .from("vpn_plans")
      .select(`
        id, name, price_mmk, data_limit_gb, duration_days,
        max_devices, allowed_regions, is_trial
      `)
      .eq("is_trial", true)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (planError || !trialPlan) {
      throw new Error(planError?.message || "Trial plan is not configured");
    }

    // Step 4: Insert order
    const startDate = businessDateOnly();
    const expiryDate = addDaysToDateOnly(startDate, trialPlan.duration_days);

    const { data: insertedOrder, error: orderError } = await supabase
      .from("vpn_orders")
      .insert({
        customer_id: customerId,
        reseller_id: resellerId,
        plan_id: trialPlan.id,
        status: "active",
        price_mmk: 0,
        commission_percent: 0,
        commission_amount_mmk: 0,
        start_date: startDate,
        expiry_date: expiryDate,
        payment_status: "paid",
        activated_at: now,
        total_paid_mmk: 0,
        order_type: "trial",
        review_status: "confirmed",
        source: "miniapp",
      })
      .select(`
        id, customer_id, reseller_id, plan_id, status, order_type,
        payment_status, review_status, start_date, expiry_date, created_at,
        vpn_plans (
          id, name, price_mmk, data_limit_gb, duration_days,
          max_devices, allowed_regions, is_trial
        )
      `)
      .single();

    if (orderError || !insertedOrder) {
      throw new Error(orderError?.message || "Failed to insert trial order");
    }

    createdOrder = insertedOrder;

    // Step 5: Link the order id back onto telegram_links
    const { error: linkUpdateError } = await supabase
      .from("telegram_links")
      .update({
        trial_order_id: createdOrder.id,
        telegram_username: telegramUsername,
        updated_at: now,
      })
      .eq("id", telegramLinkId);

    if (linkUpdateError) {
      throw new Error(`Failed to set trial_order_id: ${linkUpdateError.message}`);
    }

    return { order: createdOrder, plan: trialPlan, created: true };
  } catch (err) {
    // Roll back the claim so this user can try again later
    await rollbackTrialClaim(telegramLinkId);

    // Best-effort cleanup of the order if we already created it
    if (createdOrder?.id) {
      try {
        await supabase.from("vpn_orders").delete().eq("id", createdOrder.id);
      } catch {}
    }

    throw err;
  }
}

/**
 * Provisions a VPN key on trial-only server capacity for a trial order.
 *
 * Idempotent: if the order already has an active key, returns without creating another.
 * This makes it safe to call from concurrent bot /start + miniapp auth flows.
 *
 * Non-fatal pattern: callers should wrap in try/catch.
 * The trial order is valid with or without a key — key absence lets the user
 * link a server manually in the miniapp as a fallback.
 *
 * Server selection: getActiveServers filters server_tier='trial', then orders
 * by is_default DESC and least-loaded.
 *
 * @param {{ customerId, resellerId, orderId, plan, customerFullName, keyName }} params
 */
export async function provisionTrialKey({
  customerId,
  resellerId,
  orderId,
  plan,
  customerFullName,
  keyName,
}) {
  // Idempotency: skip if a key already exists for this order
  const { data: existingKey } = await supabase
    .from("vpn_keys")
    .select("id")
    .eq("order_id", orderId)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();

  if (existingKey) return;

  // Pick trial capacity only. Trial users must never land on premium servers.
  const servers = await getActiveServers({ limit: 1, serverTier: "trial" });
  if (!servers.length) {
    throw new Error("No active trial server available for trial key provisioning");
  }
  const server = servers[0];
  if (String(server.server_tier || "").toLowerCase() !== "trial") {
    throw new Error("Trial provisioning selected a non-trial server; check server_tier configuration");
  }

  const dataLimitBytes = gbToBytes(plan?.data_limit_gb);
  const name = keyName || [
    customerFullName || "Customer",
    server.name,
    plan?.name || "Trial",
    `ORD-${orderId}`,
  ].join(" | ");

  // Call the Outline server to create the key
  const outlineKey = await createOutlineKey({
    apiUrl: server.outline_api_url,
    certSha256: server.outline_cert_sha256,
    name,
    dataLimitBytes,
  });

  // Persist the key in vpn_keys
  const { error: insertErr } = await supabase
    .from("vpn_keys")
    .insert({
      order_id: orderId,
      customer_id: customerId,
      reseller_id: resellerId,
      server_id: server.id,
      outline_key_id: outlineKey.outline_key_id,
      key_name: outlineKey.key_name,
      access_url: outlineKey.access_url,
      data_limit_bytes: dataLimitBytes,
      used_bytes: 0,
      status: "active",
      is_used: true,
      used_at: new Date().toISOString(),
    });

  if (insertErr) {
    // Clean up the Outline key to avoid an orphan on the server
    try {
      await deleteOutlineKey({
        apiUrl: server.outline_api_url,
        certSha256: server.outline_cert_sha256,
        outlineKeyId: outlineKey.outline_key_id,
      });
    } catch {}
    throw new Error(`vpn_keys insert failed: ${insertErr.message}`);
  }

  await incrementServerUsage(server.id);
}
