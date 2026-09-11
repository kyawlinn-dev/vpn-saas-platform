/**
 * botCustomerService.js
 *
 * DB helpers for bot handlers. Mirror of the logic inline in resellerMiniappRoutes.js
 * — kept separate so bot handlers never import from route files, and so changes to
 * the miniapp flow can't accidentally break the bot (and vice versa).
 *
 * Trial creation is NOT duplicated here — both the bot and the miniapp auth route
 * import from backend/src/services/trialService.js for that logic.
 */

import crypto from "node:crypto";
import { supabase } from "../lib/supabase.js";

// ── Customer resolution ────────────────────────────────────────────────────────

/**
 * Resolves a Telegram user to their customer record for a specific reseller.
 * Returns null if no telegram_links row exists (user has never interacted via miniapp).
 *
 * @returns {{ customerId: string, fullName: string|null, ssconfToken: string|null }|null}
 */
export async function resolveCustomerByTelegram(telegramUserId, resellerId) {
  const { data: link, error } = await supabase
    .from("telegram_links")
    .select(`
      customer_id,
      vpn_customers (
        id,
        full_name,
        ssconf_token,
        protocol_preference
      )
    `)
    .eq("reseller_id", resellerId)
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();

  if (error) throw new Error(`telegram_links lookup failed: ${error.message}`);
  if (!link) return null;

  return {
    customerId: link.customer_id,
    fullName: link.vpn_customers?.full_name || null,
    ssconfToken: link.vpn_customers?.ssconf_token || null,
    protocolPreference: link.vpn_customers?.protocol_preference || "shadowsocks",
  };
}

// ── Trial eligibility ──────────────────────────────────────────────────────────

/**
 * Returns trial eligibility info for a Telegram user from telegram_links.
 * Returns null if the user has never done /start (no link row).
 * @returns {{ id: string, customer_id: string, trial_used_at: string|null }|null}
 */
export async function getCustomerTrialInfo(telegramUserId, resellerId) {
  const { data: link, error } = await supabase
    .from("telegram_links")
    .select("id, customer_id, trial_used_at")
    .eq("telegram_user_id", telegramUserId)
    .eq("reseller_id", resellerId)
    .maybeSingle();
  if (error) throw new Error(`telegram_links trial lookup failed: ${error.message}`);
  return link || null;
}

// ── Order resolution ───────────────────────────────────────────────────────────

/**
 * Returns the best active order for a customer (purchase beats trial).
 * Mirrors getBestActiveOrder() in resellerMiniappRoutes.js.
 *
 * @returns {object|null}
 */
export async function getBestActiveOrder(customerId, resellerId) {
  const today = new Date().toISOString().slice(0, 10);

  const { data: orders, error } = await supabase
    .from("vpn_orders")
    .select("id, order_type, review_status, status, expiry_date")
    .eq("customer_id", customerId)
    .eq("reseller_id", resellerId)
    .eq("status", "active")
    .gte("expiry_date", today)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`vpn_orders lookup failed: ${error.message}`);

  const rows = orders || [];

  const purchaseOrder = rows.find(
    (o) =>
      o.order_type === "purchase" &&
      ["pending_review", "confirmed"].includes(o.review_status)
  );
  if (purchaseOrder) return purchaseOrder;

  return rows.find((o) => o.order_type === "trial") || null;
}

// ── Key resolution ─────────────────────────────────────────────────────────────

/**
 * Returns the customer's current active VPN key with its server details.
 * Includes server_id, outline_key_id, and protocol so the bot server-switch
 * handler can call switchOrderServer without a second DB round-trip.
 *
 * @returns {{ id: string, server_id: string, outline_key_id: string|null, protocol: string, vpn_servers: object }|null}
 */
export async function resolveActiveKey(customerId, resellerId, orderId) {
  const { data: key, error } = await supabase
    .from("vpn_keys")
    .select(`
      id,
      server_id,
      outline_key_id,
      access_url,
      protocol,
      vpn_servers (
        id,
        name,
        region,
        display_country,
        display_city,
        flag_emoji
      )
    `)
    .eq("customer_id", customerId)
    .eq("reseller_id", resellerId)
    .eq("order_id", orderId)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`vpn_keys lookup failed: ${error.message}`);
  return key || null;
}

/**
 * Like getBestActiveOrder but with plan + customer joins needed by
 * switchOrderServer / migrateActiveOrderToServer.
 *
 * @returns {object|null}
 */
export async function getFullActiveOrder(customerId, resellerId) {
  const today = new Date().toISOString().slice(0, 10);

  const { data: orders, error } = await supabase
    .from("vpn_orders")
    .select(`
      id, order_type, review_status, status, expiry_date, plan_id,
      customer_id, reseller_id,
      customer:vpn_customers!vpn_orders_customer_id_fkey(id, full_name),
      plan:vpn_plans(id, name, data_limit_gb, is_trial)
    `)
    .eq("customer_id", customerId)
    .eq("reseller_id", resellerId)
    .eq("status", "active")
    .gte("expiry_date", today)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`vpn_orders (full) lookup failed: ${error.message}`);

  const rows = orders || [];
  const purchaseOrder = rows.find(
    (o) =>
      o.order_type === "purchase" &&
      ["pending_review", "confirmed"].includes(o.review_status)
  );
  if (purchaseOrder) return purchaseOrder;
  return rows.find((o) => o.order_type === "trial") || null;
}

/**
 * Fetches all active servers (both trial + premium) with display fields
 * for building the bot server-picker keyboard.
 * Ordered: trial servers first, then premium (so available servers appear at top).
 *
 * @returns {Array}
 */
export async function getAllActiveServersForDisplay() {
  const { data, error } = await supabase
    .from("vpn_servers")
    .select(
      "id, name, region, display_country, display_city, flag_emoji, " +
        "server_tier, current_active_keys, max_active_keys"
    )
    .eq("status", "active")
    .order("server_tier", { ascending: false })   // "trial" > "premium" alphabetically → trial first
    .order("display_country", { ascending: true });

  if (error) throw new Error(`vpn_servers list failed: ${error.message}`);
  return data || [];
}

/**
 * Fetches the full server row (credentials included) needed by switchOrderServer.
 *
 * @returns {object|null}
 */
export async function getFullServerById(serverId) {
  const { data, error } = await supabase
    .from("vpn_servers")
    .select(
      "id, name, region, server_tier, status, " +
        "panel_url, panel_username, panel_password_encrypted, " +
        "marzneshin_service_ids, marzneshin_vless_service_ids, marzneshin_vless_trial_service_ids, " +
        "current_active_keys, max_active_keys"
    )
    .eq("id", serverId)
    .maybeSingle();

  if (error) throw new Error(`vpn_servers fetch failed: ${error.message}`);
  return data || null;
}

// ── Customer upsert (bot /start) ──────────────────────────────────────────────

/**
 * Ensures a vpn_customers + telegram_links row exists for this Telegram user.
 * Called on every /start — creates the rows if they're missing (brand-new users
 * who have never opened the miniapp), no-ops if they already exist.
 *
 * @returns {{ customerId: string, telegramLinkId: string, trial_used_at: string|null, isNew: boolean }}
 */
export async function ensureCustomerAndLink(telegramUserId, telegramUsername, fullName, resellerId) {
  // Fast path: existing link
  const { data: existingLink, error: linkErr } = await supabase
    .from("telegram_links")
    .select(`
      id,
      customer_id,
      trial_used_at,
      vpn_customers ( id, status, customer_type )
    `)
    .eq("reseller_id", resellerId)
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();

  if (linkErr) throw new Error(`telegram_links lookup failed: ${linkErr.message}`);

  if (existingLink) {
    if (existingLink.vpn_customers?.customer_type !== "telegram") {
      const { error: markErr } = await supabase
        .from("vpn_customers")
        .update({ customer_type: "telegram" })
        .eq("id", existingLink.customer_id);

      if (markErr) {
        throw new Error(`Failed to mark Telegram customer: ${markErr.message}`);
      }
    }

    return {
      customerId: existingLink.customer_id,
      telegramLinkId: existingLink.id,
      trial_used_at: existingLink.trial_used_at,
      isNew: false,
    };
  }

  // New user: create customer row first
  const { data: customer, error: customerErr } = await supabase
    .from("vpn_customers")
    .insert({
      reseller_id: resellerId,
      full_name: fullName,
      telegram_username: telegramUsername,
      status: "active",
      customer_type: "telegram",
    })
    .select("id")
    .single();

  if (customerErr || !customer) {
    throw new Error(`Failed to create customer: ${customerErr?.message}`);
  }

  // Create telegram_links row
  const { data: link, error: linkCreateErr } = await supabase
    .from("telegram_links")
    .insert({
      reseller_id: resellerId,
      customer_id: customer.id,
      telegram_user_id: telegramUserId,
      telegram_username: telegramUsername,
    })
    .select("id, trial_used_at")
    .single();

  if (linkCreateErr || !link) {
    throw new Error(`Failed to create telegram_links: ${linkCreateErr?.message}`);
  }

  return {
    customerId: customer.id,
    telegramLinkId: link.id,
    trial_used_at: link.trial_used_at,
    isNew: true,
  };
}

// ── SS / Outline token ─────────────────────────────────────────────────────────

/**
 * Ensures the customer has a permanent ssconf_token so the ssconf:// URL can be
 * built for Outline. Race-safe: conditional UPDATE then re-fetch.
 * @returns {string} ssconf_token
 */
export async function ensureCustomerSsconfToken(customerId) {
  const { data: existing, error: readErr } = await supabase
    .from("vpn_customers")
    .select("ssconf_token")
    .eq("id", customerId)
    .single();

  if (readErr) throw new Error(readErr.message);
  if (existing?.ssconf_token) return existing.ssconf_token;

  const newToken = crypto.randomUUID().replaceAll("-", "");

  await supabase
    .from("vpn_customers")
    .update({ ssconf_token: newToken })
    .eq("id", customerId)
    .is("ssconf_token", null);

  // Re-fetch in case a concurrent request won the race
  const { data: updated, error: refetchErr } = await supabase
    .from("vpn_customers")
    .select("ssconf_token")
    .eq("id", customerId)
    .single();

  if (refetchErr || !updated?.ssconf_token) {
    throw new Error("Failed to ensure customer ssconf token");
  }
  return updated.ssconf_token;
}
