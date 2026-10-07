/**
 * resellerKeysRouter.js
 *
 * Mounted at: /api/reseller/keys
 * Already protected by: requireAuth + requireActiveReseller (in server.js)
 *
 *   req.user    → verified Supabase user
 *   req.reseller → verified, active reseller row from DB
 */

import express from "express";
import { supabase } from "../../lib/supabase.js";
import {
  buildDynamicAccessUrl,
  buildSsconfHttpUrl,
} from "../../services/publicAccessUrlService.js";
import { buildOrderQuotaSnapshot } from "../../services/subscriptionProvisionService.js";

const router = express.Router();

function bytesToGb(bytes) {
  const value = Number(bytes || 0);
  return value > 0 ? Number((value / 1024 / 1024 / 1024).toFixed(2)) : 0;
}

function usageBytesForOrderTotal(key) {
  return Math.max(Number(key?.used_bytes || 0), 0);
}

// ─── GET /api/reseller/keys ───────────────────────────────────────────────────

router.get("/", async (req, res) => {
  try {
    const reseller = req.reseller; // set by requireActiveReseller

    const { data, error } = await supabase
      .from("vpn_keys")
      .select(`
        *,
        order:vpn_orders (
          id,
          status,
          payment_status,
          expiry_date,
          usage_baseline_bytes,
          quota_limit_bytes
        ),
        customer:vpn_customers!vpn_keys_customer_id_fkey (
          id,
          full_name,
          telegram_username,
          phone,
          ssconf_token
        )
      `)
      .eq("reseller_id", reseller.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("GET /api/reseller/keys query error:", error);
      return res.status(500).json({ error: "Failed to load keys" });
    }

    const keys = data ?? [];

    const { data: miniapp, error: miniappError } = await supabase
      .from("reseller_miniapps")
      .select("miniapp_slug, brand_name")
      .eq("reseller_id", reseller.id)
      .maybeSingle();

    if (miniappError) {
      console.error("Failed to load reseller miniapp for key links:", miniappError);
    }

    // Batch-fetch all unique servers referenced by these keys
    const serverIds = [...new Set(keys.map((k) => k.server_id).filter(Boolean))];

    let serversById = {};
    if (serverIds.length > 0) {
      const { data: servers, error: serverError } = await supabase
        .from("vpn_servers")
        .select("id, name, host_ip, status")
        .in("id", serverIds);

      if (serverError) {
        console.error("Failed to load servers for keys:", serverError);
        // Non-fatal — keys are still returned without server labels.
      } else {
        serversById = Object.fromEntries((servers ?? []).map((s) => [s.id, s]));
      }
    }

    const enrichedBase = keys.map((key) => {
      const server = key.server_id ? serversById[key.server_id] : null;
      return {
        ...key,
        server: server
          ? { id: server.id, name: server.name, status: server.status, host_ip: server.host_ip }
          : null,
      };
    });

    const keysByOrderId = {};
    for (const key of enrichedBase) {
      if (!key.order_id) continue;
      if (!keysByOrderId[key.order_id]) keysByOrderId[key.order_id] = [];
      keysByOrderId[key.order_id].push({
        ...key,
        used_bytes: usageBytesForOrderTotal(key),
      });
    }

    const quotaByOrderId = Object.fromEntries(
      Object.entries(keysByOrderId).map(([orderId, orderKeys]) => [
        orderId,
        buildOrderQuotaSnapshot(orderKeys, orderKeys[0]?.order || {}),
      ])
    );

    const enriched = enrichedBase.map((key) => {
      const quota = quotaByOrderId[key.order_id] || buildOrderQuotaSnapshot([]);
      const customerSsconfToken = key?.customer?.ssconf_token || null;
      const miniappSlug = miniapp?.miniapp_slug || null;
      const label = miniapp?.brand_name || key?.server?.name || "VPN";
      const ssconfUrl = buildSsconfHttpUrl(customerSsconfToken, { req });
      const dynamicAccessUrl = buildDynamicAccessUrl(customerSsconfToken, label, { req });

      return {
        ...key,
        order_total_used_bytes: quota.totalUsedBytes,
        order_total_used_gb: bytesToGb(quota.totalUsedBytes),
        order_total_remaining_gb:
          typeof quota.remainingBytes === "number" ? bytesToGb(quota.remainingBytes) : null,
        quota: {
          limit_bytes: quota.totalAllowanceBytes,
          used_bytes: quota.totalUsedBytes,
          remaining_bytes: quota.remainingBytes,
          limit_gb:
            typeof quota.totalAllowanceBytes === "number" ? bytesToGb(quota.totalAllowanceBytes) : null,
          used_gb: bytesToGb(quota.totalUsedBytes),
          remaining_gb:
            typeof quota.remainingBytes === "number" ? bytesToGb(quota.remainingBytes) : null,
          is_unlimited: quota.isUnlimited,
        },
        ssconf_token: customerSsconfToken,
        ssconf_url: ssconfUrl,
        dynamic_access_url: dynamicAccessUrl,
        preferred_access_url: dynamicAccessUrl || ssconfUrl || key.access_url || null,
      };
    });

    return res.json(enriched);
  } catch (err) {
    console.error("GET /api/reseller/keys crash:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
