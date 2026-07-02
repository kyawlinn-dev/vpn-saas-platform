/**
 * botCustomerService.js
 *
 * DB helpers for bot handlers. Mirror of the logic inline in resellerMiniappRoutes.js
 * — kept separate so bot handlers never import from route files, and so changes to
 * the miniapp flow can't accidentally break the bot (and vice versa).
 *
 * URL builder note: buildDynamicAccessUrl accepts a plain backendBaseUrl string
 * instead of an Express req object, since bot handlers have no request context.
 * In bot handlers, pass process.env.WEBHOOK_BASE_URL as backendBaseUrl.
 */

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
        ssconf_token
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
  };
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
 * Mirrors the vpn_keys query in the miniapp auth endpoint.
 *
 * @returns {{ id: string, vpn_servers: { name: string, flag_emoji: string } }|null}
 */
export async function resolveActiveKey(customerId, resellerId, orderId) {
  const { data: key, error } = await supabase
    .from("vpn_keys")
    .select(`
      id,
      vpn_servers (
        name,
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

// ── URL builders ───────────────────────────────────────────────────────────────
// Standalone versions of buildSsconfHttpUrl / buildDynamicAccessUrl from
// resellerMiniappRoutes.js — accept backendBaseUrl instead of Express req.

/**
 * @param {string} backendBaseUrl  e.g. process.env.WEBHOOK_BASE_URL (no trailing slash)
 */
export function buildDynamicAccessUrl(backendBaseUrl, slug, ssconfToken, label) {
  const httpUrl =
    `${backendBaseUrl}/api/miniapp/${encodeURIComponent(slug)}/ssconf/${encodeURIComponent(ssconfToken)}`;
  const url = new URL(httpUrl);
  const fragment = label ? `#${label}` : "";
  return `ssconf://${url.host}${url.pathname}${fragment}`;
}
