/**
 * trialService.js — Shared trial order creation and key provisioning.
 *
 * Used by Mini App auth and Telegram onboarding.
 *
 * Guarantees:
 *  - Customer-scoped claim and order commit together in create_customer_trial.
 *  - Historical trial usage stays consumed even if its order was deleted.
 *  - A fenced provisioning claim prevents concurrent external key creation.
 *  - Ambiguous provisioning failures retain the order and require reconciliation.
 */

import { supabase } from "../lib/supabase.js";
import crypto from "node:crypto";
import { createKey, deleteKey, serviceIdsForOrder } from "./vpnProviderService.js";
import {
  clearServerError,
  decrementServerUsage,
  getActiveServers,
  incrementServerUsage,
  setServerError,
} from "./serverService.js";
import { trackAppEvent } from "./appEventService.js";
import { resolveServerAccessContext } from "./serverAccessContext.js";
import { evaluateServerAccess, ServerAccessPolicyError } from "./serverAccessPolicy.js";

function gbToBytes(gb) {
  if (!gb || Number(gb) <= 0) return null;
  return Math.floor(Number(gb) * 1024 * 1024 * 1024);
}

export function trialQuotaBytes(order, plan) {
  if (order?.quota_limit_bytes != null) {
    const quota = Number(order.quota_limit_bytes);
    if (!Number.isFinite(quota) || quota <= 0) throw new Error("Trial quota is invalid");
    return Math.floor(quota);
  }
  return gbToBytes(plan?.data_limit_gb);
}

export function requireTrialVlessServiceIds(server, accessContext) {
  return serviceIdsForOrder({ server, protocol: "vless", orderType: "trial", accessContext });
}

// ── Internal helpers ──────────────────────────────────────────────────────────

export async function getTrialEligibility({ customerId, resellerId }) {
  const { data, error } = await supabase.rpc("customer_trial_eligibility", { p_reseller_id: resellerId, p_customer_id: customerId });
  if (["PGRST202", "PGRST205"].includes(error?.code)) return { eligible: false, reason: "migration_required" };
  if (error) throw new Error(error.message || "Trial eligibility unavailable");
  return data;
}

export async function createTrialOrder({ customerId, resellerId, telegramLinkId = null, telegramUsername = null, source = "bot" }) {
  if (!["bot", "miniapp"].includes(source)) throw Object.assign(new Error("Invalid trial caller"), { code: "INVALID_CALLER" });
  const { data, error } = await supabase.rpc("create_customer_trial", {
    p_reseller_id: resellerId, p_customer_id: customerId, p_source: source,
    p_telegram_link_id: telegramLinkId, p_telegram_username: telegramUsername,
  });
  if (error) throw new Error(error.message || "Trial creation failed");
  if (data?.created && data.order) {
    trackAppEvent({ event_name: "trial_created", event_source: "backend", actor_type: "customer",
      reseller_id: resellerId, customer_id: customerId, order_id: data.order.id,
      plan_id: data.plan?.id, status: "success", metadata: { source, order_type: "trial",
        duration_days: data.plan?.duration_days, data_limit_gb: data.plan?.data_limit_gb } });
  }
  return data;
}

/**
 * Provisions a trial key on compatible public capacity when public access is enabled.
 *
 * Idempotent: if the order already has an active key, returns without creating another.
 * This makes it safe to call from concurrent bot /start + miniapp auth flows.
 *
 * Non-fatal pattern: callers should wrap in try/catch.
 * The trial order is valid with or without a key — key absence lets the user
 * link a server manually in the miniapp as a fallback.
 *
 * Legacy mode retains trial-only selection. Both modes preserve existing limits.
 *
 * @param {{ customerId, resellerId, orderId, plan, customerFullName, keyName, protocol }} params
 */
async function provisionTrialKeyUnchecked({
  customerId,
  resellerId,
  orderId,
  plan,
  customerFullName,
  keyName,
  protocol = "shadowsocks",
  preferredServerId,
  accessContext,
}) {
  // Idempotency: skip if a key already exists for this order
  const { data: existingKey } = await supabase
    .from("vpn_keys")
    .select("id")
    .eq("order_id", orderId)
    .eq("reseller_id", resellerId)
    .eq("customer_id", customerId)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();

  if (existingKey) return { ready: true };

  const { data: order, error: orderError } = await supabase
    .from("vpn_orders")
    .select("expiry_date,quota_limit_bytes")
    .eq("id", orderId)
    .eq("reseller_id", resellerId)
    .eq("customer_id", customerId)
    .single();
  if (orderError || !order?.expiry_date) {
    throw new Error(orderError?.message || "Trial order expiry_date is missing");
  }

  const context = await resolveServerAccessContext(accessContext);
  const candidates = await getActiveServers({ limit: 0, serverTier: "trial", resellerId,
    protocol, orderType: "trial", accessContext: context });
  const servers = preferredServerId ? candidates.filter(server => server.id === preferredServerId) : candidates;
  if (!servers.length) {
    if (context.publicAccessEnabled) throw Object.assign(new Error("No compatible public server available for trial provisioning"), { code: "TRIAL_SERVER_UNAVAILABLE" });
    throw new Error("No active trial server available for trial key provisioning");
  }

  const dataLimitBytes = trialQuotaBytes(order, plan);

  let lastCapacityError = null;

  for (const server of servers) {
    if (context.publicAccessEnabled) {
      const decision = evaluateServerAccess({ server, protocol, orderType: "trial", environment: context.environment, poolId: context.poolId, purpose: "assign" });
      if (!decision.allowed) throw new ServerAccessPolicyError(decision.code);
    } else if (String(server.server_tier || "").toLowerCase() !== "trial") {
      throw new Error("Trial provisioning selected a non-trial server; check server_tier configuration");
    }

    let incremented = false;
    let outlineKey = null;

    try {
      await incrementServerUsage(server.id);
      incremented = true;

      const name = keyName || [
        customerFullName || "Customer",
        server.name,
        plan?.name || "Trial",
        `ORD-${orderId}`,
      ].join(" | ");

      // Call the VPN provider API to create the key
      let serviceIds = null;
      if (context.publicAccessEnabled) {
        serviceIds = serviceIdsForOrder({ server, protocol, orderType: "trial", accessContext: context });
      } else if (protocol === "vless" || protocol === "hysteria2") {
        serviceIds = requireTrialVlessServiceIds(server);
      }

      outlineKey = await createKey({
        server,
        name,
        dataLimitBytes,
        protocol,
        serviceIds,
        expiryDate: order.expiry_date,
        accessContext: context,
      });

      // Persist the key in vpn_keys
      const { data: insertedKey, error: insertErr } = await supabase
        .from("vpn_keys")
        .insert({
          order_id: orderId,
          customer_id: customerId,
          reseller_id: resellerId,
          server_id: server.id,
          outline_key_id: outlineKey.outline_key_id,
          key_name: outlineKey.key_name,
          access_url: outlineKey.access_url,
          key_credentials: outlineKey._marzneshin_meta || null,
          protocol,
          data_limit_bytes: dataLimitBytes,
          used_bytes: 0,
          status: "active",
          is_used: true,
          used_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (insertErr || !insertedKey) {
        throw new Error(`vpn_keys insert failed: ${insertErr?.message || "No key row returned"}`);
      }

      try {
        await clearServerError(server.id);
      } catch {}

      trackAppEvent({
        event_name: "key_provisioned",
        event_source: "backend",
        actor_type: "customer",
        reseller_id: resellerId,
        customer_id: customerId,
        order_id: orderId,
        server_id: server.id,
        plan_id: plan?.id || null,
        status: "success",
        metadata: {
          server_tier: server.server_tier || "trial",
          region: server.region,
          order_type: "trial",
        },
      });

      return { ready: true };
    } catch (err) {
      if (outlineKey?.outline_key_id) {
        try {
          await deleteKey({ server, keyId: outlineKey.outline_key_id });
        } catch {}
      }

      if (incremented) {
        try {
          await decrementServerUsage(server.id);
        } catch {}
      }

      if (err?.code === "SERVER_FULL" || err?.code === "SERVER_USAGE_RACE") {
        lastCapacityError = err;
        continue;
      }

      try {
        await setServerError(server.id, err.message);
      } catch {}

      // Emit a failure event so trial provisioning breakage is visible in
      // the monitoring dashboard alongside successful trials.
      try {
        trackAppEvent({
          event_name: "key_provisioned",
          event_source: "backend",
          actor_type: "customer",
          reseller_id: resellerId,
          customer_id: customerId,
          order_id: orderId,
          server_id: server.id,
          plan_id: plan?.id || null,
          status: "failed",
          metadata: {
            server_tier: server.server_tier || "trial",
            region: server.region,
            order_type: "trial",
            error: String(err?.message || err).slice(0, 500),
          },
        });
      } catch {}

      throw err;
    }
  }

  throw lastCapacityError || new Error("No active trial server available for trial key provisioning");
}

export async function provisionTrialKey(input) {
  const { withCustomerInfrastructureMutation } = await import("./infrastructure/customerMutationGuard.js");
  return withCustomerInfrastructureMutation({ orderIds: [input.orderId], resellerId: input.resellerId }, () => provisionTrialKeyGuarded(input));
}
async function provisionTrialKeyGuarded(input) {
  const owner = crypto.randomUUID();
  const params = { p_reseller_id: input.resellerId, p_customer_id: input.customerId, p_order_id: input.orderId, p_owner: owner };
  const { data: existing, error: existingError } = await supabase.from("vpn_keys").select("id")
    .eq("order_id", input.orderId).eq("customer_id", input.customerId).eq("reseller_id", input.resellerId)
    .eq("status", "active").is("deleted_at", null).limit(1).maybeSingle();
  if (existingError) throw new Error("Trial key lookup failed");
  if (existing) return { ready: true };
  const { data: claimed, error } = await supabase.rpc("claim_trial_provisioning", params);
  if (error) throw new Error("Trial provisioning claim unavailable");
  if (!claimed) throw Object.assign(new Error("Trial access is being prepared or needs admin review"), { code: "TRIAL_RECOVERY_REQUIRED" });
  try {
    const result = await provisionTrialKeyUnchecked(input);
    const finished = await supabase.rpc("finish_trial_provisioning", { ...params, p_status: "completed" });
    if (finished.error || finished.data !== true) throw new Error("Trial provisioning completion needs review");
    return result;
  } catch (error) {
    const safeRetry = ["SERVER_FULL", "SERVER_USAGE_RACE", "TRIAL_SERVER_UNAVAILABLE"].includes(error.code) || error.message === "No active trial server available for trial key provisioning";
    await supabase.rpc("finish_trial_provisioning", { ...params, p_status: safeRetry ? "ready" : "uncertain" });
    throw error;
  }
}
