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
  buildKeyUsageView,
  getOutlineMetricsForServer,
} from "../../services/outlineMetricsService.js";

const router = express.Router();

function bytesToGb(bytes) {
  const value = Number(bytes || 0);
  return value > 0 ? Number((value / 1024 / 1024 / 1024).toFixed(2)) : 0;
}

function getRequestBaseUrl(req) {
  const proto =
    String(req.headers["x-forwarded-proto"] || "")
      .split(",")[0]
      .trim() ||
    req.protocol ||
    "http";

  const host =
    String(req.headers["x-forwarded-host"] || "")
      .split(",")[0]
      .trim() || req.get("host");

  return `${proto}://${host}`.replace(/\/$/, "");
}

function buildSsconfHttpUrl(req, slug, token) {
  if (!slug || !token) return null;
  return `${getRequestBaseUrl(req)}/api/miniapp/${encodeURIComponent(
    slug
  )}/ssconf/${encodeURIComponent(token)}`;
}

function buildDynamicAccessUrl(req, slug, token, label) {
  const httpUrl = buildSsconfHttpUrl(req, slug, token);
  if (!httpUrl) return null;

  const url = new URL(httpUrl);
  const fragment = label ? `#${label}` : "";
  return `ssconf://${url.host}${url.pathname}${fragment}`;
}

function usageBytesForOrderTotal(key) {
  const storedBytes = Number(key?.used_bytes || 0);
  const liveBytes = Number(key?.used_bytes_30d || 0);
  return Math.max(storedBytes, liveBytes, 0);
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
          expiry_date
        ),
        customer:vpn_customers (
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
        .select("id, name, host_ip, status, outline_api_url")
        .in("id", serverIds);

      if (serverError) {
        console.error("Failed to load servers for keys:", serverError);
        // Non-fatal — keys are still returned, just without metrics
      } else {
        serversById = Object.fromEntries((servers ?? []).map((s) => [s.id, s]));
      }
    }

    // Fetch Outline metrics concurrently for each active server
    const metricsByServerId = Object.fromEntries(
      await Promise.all(
        Object.values(serversById)
          .filter((s) => s?.status === "active" && s?.host_ip)
          .map(async (s) => {
            const metrics = await getOutlineMetricsForServer(s.host_ip);
            return [s.id, metrics];
          })
      )
    );

    const enrichedBase = keys.map((key) => {
      const server = key.server_id ? serversById[key.server_id] : null;
      const metrics =
        server?.id && key?.outline_key_id
          ? (metricsByServerId?.[server.id]?.[String(key.outline_key_id)] ?? {})
          : {};

      return buildKeyUsageView(
        {
          ...key,
          server: server
            ? { id: server.id, name: server.name, status: server.status, host_ip: server.host_ip }
            : null,
        },
        metrics
      );
    });

    const totalUsedBytesByOrderId = {};
    for (const key of enrichedBase) {
      if (!key.order_id) continue;
      totalUsedBytesByOrderId[key.order_id] =
        Number(totalUsedBytesByOrderId[key.order_id] || 0) + usageBytesForOrderTotal(key);
    }

    const enriched = enrichedBase.map((key) => {
      const orderTotalUsedBytes = Number(totalUsedBytesByOrderId[key.order_id] || 0);
      const dataLimitBytes =
        typeof key?.data_limit_bytes === "number" ? key.data_limit_bytes : null;
      const orderRemainingBytes =
        typeof dataLimitBytes === "number"
          ? Math.max(dataLimitBytes - orderTotalUsedBytes, 0)
          : null;
      const customerSsconfToken = key?.customer?.ssconf_token || null;
      const miniappSlug = miniapp?.miniapp_slug || null;
      const label = miniapp?.brand_name || key?.server?.name || "VPN";
      const ssconfUrl = buildSsconfHttpUrl(req, miniappSlug, customerSsconfToken);
      const dynamicAccessUrl = buildDynamicAccessUrl(req, miniappSlug, customerSsconfToken, label);

      return {
        ...key,
        order_total_used_bytes: orderTotalUsedBytes,
        order_total_used_gb: bytesToGb(orderTotalUsedBytes),
        order_total_remaining_gb:
          typeof orderRemainingBytes === "number" ? bytesToGb(orderRemainingBytes) : null,
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
