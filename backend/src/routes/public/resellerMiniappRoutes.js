import express from "express";
import crypto from "node:crypto";
import {supabase} from "../../lib/supabase.js";
import { parseSsUrl } from "../../utils/parseSsUrl.js";
import {
  createOutlineKey,
  deleteOutlineKey,
} from "../../services/outlineService.js";

import {
  incrementServerUsage,
  decrementServerUsage,
  setServerError,
  clearServerError,
} from "../../services/serverService.js";

const router = express.Router();

function createSsconfToken() {
  return crypto.randomUUID().replaceAll("-", "");
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
  return `${getRequestBaseUrl(req)}/api/miniapp/${encodeURIComponent(
    slug
  )}/ssconf/${encodeURIComponent(token)}`;
}

function buildDynamicAccessUrl(req, slug, token) {
  const httpUrl = buildSsconfHttpUrl(req, slug, token);
  const url = new URL(httpUrl);

  return `ssconf://${url.host}${url.pathname}`;
}

function toPublicOutlineKey(req, slug, key) {
  if (!key?.ssconf_token) return null;

  return {
    id: key.id,
    ssconf_token: key.ssconf_token,

    // Normal URL for browser/curl/backend testing
    ssconf_url: buildSsconfHttpUrl(req, slug, key.ssconf_token),

    // User-facing Outline import URL
    dynamic_access_url: buildDynamicAccessUrl(req, slug, key.ssconf_token),

    data_limit_bytes: key.data_limit_bytes,
    used_bytes: key.used_bytes || 0,
  };
}

async function ensureKeySsconfToken(key) {
  if (!key || key.ssconf_token) return key;

  const ssconfToken = createSsconfToken();

  const { data, error } = await supabase
    .from("vpn_keys")
    .update({
      ssconf_token: ssconfToken,
      updated_at: new Date().toISOString(),
    })
    .eq("id", key.id)
    .select("id, ssconf_token")
    .single();

  if (error || !data?.ssconf_token) {
    throw new Error(error?.message || "Failed to create ssconf token");
  }

  return {
    ...key,
    ssconf_token: data.ssconf_token,
  };
}

function gbToBytes(gb) {
  if (!gb || Number(gb) <= 0) return null;
  return Math.floor(Number(gb) * 1024 * 1024 * 1024);
}

function buildMiniAppKeyName({ customer, server, order, plan }) {
  return [
    customer?.full_name || "Mini App Customer",
    server?.name || "Server",
    plan?.name || "Plan",
    `ORD-${order.id}`,
  ].join(" | ");
}

function mapServerForMiniApp(server, isCurrent = false) {
  if (!server) return null;

  return {
    id: server.id,
    name: server.name,
    region: server.region,
    region_code: server.region_code,
    country: server.display_country || server.region,
    city: server.display_city || server.name,
    flag: server.flag_emoji || "🌐",
    server_number: server.server_number,
    is_default: server.is_default,
    is_current: isCurrent,
  };
}

function toPublicMiniAppConfig(row) {
  return {
    miniapp: {
      slug: row.miniapp_slug,
      enabled: row.is_enabled,
    },
    brand: {
      name: row.brand_name,
      logo_url: row.brand_logo_url,
      support_username: row.support_username,
      primary_color: row.primary_color || "#2f7bff",
    },
    trial: {
      enabled: row.trial_enabled,
      data_limit_gb: row.trial_data_limit_gb,
      duration_days: row.trial_duration_days,
    },
  };
}

async function getBestActiveOrder({ customerId, resellerId }) {
  const today = new Date().toISOString().slice(0, 10);

  const { data: orders, error } = await supabase
    .from("vpn_orders")
    .select(`
      id,
      customer_id,
      reseller_id,
      plan_id,
      status,
      order_type,
      payment_status,
      review_status,
      start_date,
      expiry_date,
      created_at,
      vpn_plans (
        id,
        name,
        price_mmk,
        data_limit_gb,
        duration_days,
        max_devices,
        allowed_regions,
        is_trial
      )
    `)
    .eq("customer_id", customerId)
    .eq("reseller_id", resellerId)
    .eq("status", "active")
    .gte("expiry_date", today)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message || "Failed to load active order");
  }

  const rows = orders || [];

  // Premium/purchase access should always win over trial,
  // even if payment is still pending reseller review.
  const purchaseOrder = rows.find(
    (order) =>
      order.order_type === "purchase" &&
      ["pending_review", "confirmed"].includes(order.review_status)
  );

  if (purchaseOrder) return purchaseOrder;

  const trialOrder = rows.find((order) => order.order_type === "trial");

  return trialOrder || null;
}

router.get("/:slug/ssconf/:token", async (req, res) => {
  try {
    const { slug, token } = req.params;

    const { data: miniapp, error: miniappError } = await supabase
      .from("reseller_miniapps")
      .select("id, reseller_id, miniapp_slug, is_enabled")
      .eq("miniapp_slug", slug)
      .maybeSingle();

    if (miniappError) {
      console.error("Mini App ssconf lookup error:", miniappError);
      return res.status(500).json({ error: "Failed to load Mini App" });
    }

    if (!miniapp) {
      return res.status(404).json({ error: "Mini App not found" });
    }

    if (!miniapp.is_enabled) {
      return res.status(403).json({ error: "Mini App is disabled" });
    }

    const { data: key, error: keyError } = await supabase
      .from("vpn_keys")
      .select(`
        id,
        reseller_id,
        order_id,
        access_url,
        ssconf_token,
        status,
        deleted_at
      `)
      .eq("ssconf_token", token)
      .eq("reseller_id", miniapp.reseller_id)
      .maybeSingle();

    if (keyError) {
      console.error("Mini App ssconf key lookup error:", keyError);
      return res.status(500).json({ error: "Failed to load VPN key" });
    }

    if (!key) {
      return res.status(404).json({ error: "VPN key not found" });
    }

    if (key.status !== "active" || key.deleted_at) {
      return res.status(410).json({ error: "VPN key is no longer active" });
    }

    const { data: order, error: orderError } = await supabase
      .from("vpn_orders")
      .select("id, reseller_id, status, expiry_date")
      .eq("id", key.order_id)
      .eq("reseller_id", miniapp.reseller_id)
      .maybeSingle();

    if (orderError) {
      console.error("Mini App ssconf order lookup error:", orderError);
      return res.status(500).json({ error: "Failed to load VPN order" });
    }

    const today = new Date().toISOString().slice(0, 10);

    if (
      !order ||
      order.status !== "active" ||
      !order.expiry_date ||
      order.expiry_date < today
    ) {
      return res.status(410).json({ error: "VPN key is expired" });
    }

    const parsed = parseSsUrl(key.access_url);

    return res.json({
      server: parsed.server,
      server_port: parsed.port,
      password: parsed.password,
      method: parsed.method,
    });
  } catch (err) {
    console.error("Mini App ssconf exception:", err);
    return res.status(500).json({ error: "Unexpected server error" });
  }
});

router.get("/:slug/config", async (req, res) => {
  try {
    const { slug } = req.params;

    if (!slug) {
      return res.status(400).json({
        success: false,
        message: "Mini App slug is required",
      });
    }

    const { data, error } = await supabase
      .from("reseller_miniapps")
      .select(`
        id,
        reseller_id,
        miniapp_slug,
        brand_name,
        brand_logo_url,
        support_username,
        primary_color,
        trial_enabled,
        trial_data_limit_gb,
        trial_duration_days,
        is_enabled
      `)
      .eq("miniapp_slug", slug)
      .maybeSingle();

    if (error) {
      console.error("Mini App config error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to load Mini App config",
      });
    }

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Mini App not found",
      });
    }

    if (!data.is_enabled) {
      return res.status(403).json({
        success: false,
        message: "Mini App is disabled",
      });
    }

    return res.json({
      success: true,
      data: toPublicMiniAppConfig(data),
    });
  } catch (err) {
    console.error("Mini App config exception:", err);
    return res.status(500).json({
      success: false,
      message: "Unexpected server error",
    });
  }
});

router.post("/:slug/auth", async (req, res) => {
  try {
    const { slug } = req.params;
    const { telegram_user } = req.body;

    if (!slug) {
      return res.status(400).json({
        success: false,
        message: "Mini App slug is required",
      });
    }

    if (!telegram_user?.id) {
      return res.status(400).json({
        success: false,
        message: "Telegram user is required",
      });
    }

    const { data: miniapp, error: miniappError } = await supabase
      .from("reseller_miniapps")
      .select(`
        id,
        reseller_id,
        miniapp_slug,
        brand_name,
        brand_logo_url,
        support_username,
        primary_color,
        trial_enabled,
        trial_data_limit_gb,
        trial_duration_days,
        is_enabled
      `)
      .eq("miniapp_slug", slug)
      .maybeSingle();

    if (miniappError) {
      console.error("Mini App auth lookup error:", miniappError);
      return res.status(500).json({
        success: false,
        message: "Failed to load Mini App",
      });
    }

    if (!miniapp) {
      return res.status(404).json({
        success: false,
        message: "Mini App not found",
      });
    }

    if (!miniapp.is_enabled) {
      return res.status(403).json({
        success: false,
        message: "Mini App is disabled",
      });
    }

    const telegramUserId = Number(telegram_user.id);
    const telegramUsername = telegram_user.username || null;
    const fullName =
      [telegram_user.first_name, telegram_user.last_name]
        .filter(Boolean)
        .join(" ") || `Telegram User ${telegramUserId}`;

    const { data: existingLink, error: linkLookupError } = await supabase
      .from("telegram_links")
      .select(`
        id,
        telegram_user_id,
        telegram_username,
        customer_id,
        reseller_id,
        trial_used_at,
        trial_order_id,
        vpn_customers (
          id,
          full_name,
          telegram_username,
          status
        )
      `)
      .eq("reseller_id", miniapp.reseller_id)
      .eq("telegram_user_id", telegramUserId)
      .maybeSingle();

    if (linkLookupError) {
      console.error("Telegram link lookup error:", linkLookupError);
      return res.status(500).json({
        success: false,
        message: "Failed to check Telegram user",
      });
    }

    let customer = null;
    let telegramLink = existingLink;
    let trialCreated = false;

    if (!existingLink) {
      const { data: createdCustomer, error: customerError } = await supabase
        .from("vpn_customers")
        .insert({
          reseller_id: miniapp.reseller_id,
          full_name: fullName,
          telegram_username: telegramUsername,
          status: "active",
        })
        .select("id, full_name, telegram_username, status")
        .single();

      if (customerError) {
        console.error("Customer create error:", customerError);
        return res.status(500).json({
          success: false,
          message: "Failed to create customer",
        });
      }

      customer = createdCustomer;

      const { data: createdLink, error: createLinkError } = await supabase
        .from("telegram_links")
        .insert({
          reseller_id: miniapp.reseller_id,
          customer_id: createdCustomer.id,
          telegram_user_id: telegramUserId,
          telegram_username: telegramUsername,
        })
        .select(`
          id,
          telegram_user_id,
          telegram_username,
          customer_id,
          reseller_id,
          trial_used_at,
          trial_order_id
        `)
        .single();

      if (createLinkError) {
        console.error("Telegram link create error:", createLinkError);
        return res.status(500).json({
          success: false,
          message: "Failed to link Telegram user",
        });
      }

      telegramLink = createdLink;
    } else {
      customer = existingLink.vpn_customers;
    }

    let activeOrder = null;

    try {
      activeOrder = await getBestActiveOrder({
        customerId: customer.id,
        resellerId: miniapp.reseller_id,
      });
    } catch (err) {
      console.error("Active order lookup error:", err);
      return res.status(500).json({
        success: false,
        message: "Failed to load active package",
      });
    }

    if (!activeOrder && miniapp.trial_enabled && !telegramLink.trial_used_at) {
      const { data: trialPlan, error: trialPlanError } = await supabase
        .from("vpn_plans")
        .select("id, name, price_mmk, data_limit_gb, duration_days")
        .eq("is_trial", true)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (trialPlanError || !trialPlan) {
        console.error("Trial plan lookup error:", trialPlanError);
        return res.status(500).json({
          success: false,
          message: "Trial plan is not configured",
        });
      }

      const startDate = new Date();
      const expiryDate = new Date();
      expiryDate.setDate(startDate.getDate() + trialPlan.duration_days);

      const startDateText = startDate.toISOString().slice(0, 10);
      const expiryDateText = expiryDate.toISOString().slice(0, 10);

      const { data: createdTrialOrder, error: trialOrderError } = await supabase
        .from("vpn_orders")
        .insert({
          customer_id: customer.id,
          reseller_id: miniapp.reseller_id,
          plan_id: trialPlan.id,
          status: "active",
          price_mmk: 0,
          commission_percent: 0,
          commission_amount_mmk: 0,
          start_date: startDateText,
          expiry_date: expiryDateText,
          payment_status: "paid",
          activated_at: new Date().toISOString(),
          total_paid_mmk: 0,
          order_type: "trial",
          review_status: "confirmed",
          source: "miniapp",
        })
        .select(`
          id,
          customer_id,
          reseller_id,
          plan_id,
          status,
          order_type,
          payment_status,
          review_status,
          start_date,
          expiry_date,
          created_at,
          vpn_plans (
            id,
            name,
            price_mmk,
            data_limit_gb,
            duration_days,
            max_devices,
            allowed_regions,
            is_trial
          )
        `)
        .single();

      if (trialOrderError) {
        console.error("Trial order create error:", trialOrderError);
        return res.status(500).json({
          success: false,
          message: "Failed to create trial package",
        });
      }

      const { error: updateTrialLinkError } = await supabase
        .from("telegram_links")
        .update({
          trial_used_at: new Date().toISOString(),
          trial_order_id: createdTrialOrder.id,
          telegram_username: telegramUsername,
          updated_at: new Date().toISOString(),
        })
        .eq("id", telegramLink.id);

      if (updateTrialLinkError) {
        console.error("Trial link update error:", updateTrialLinkError);
        return res.status(500).json({
          success: false,
          message: "Failed to mark trial as used",
        });
      }

      activeOrder = createdTrialOrder;
      trialCreated = true;
    }

    let activeKey = null;
    let currentServer = null;

    if (activeOrder) {
      const { data: keyRow, error: keyError } = await supabase
        .from("vpn_keys")
        .select(`
          id,
          ssconf_token,
          outline_key_id,
          data_limit_bytes,
          used_bytes,
          server_id,
          vpn_servers (
            id,
            name,
            region,
            region_code,
            display_country,
            display_city,
            flag_emoji,
            server_number,
            is_default
          )
        `)
        .eq("customer_id", customer.id)
        .eq("reseller_id", miniapp.reseller_id)
        .eq("order_id", activeOrder.id)
        .eq("status", "active")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (keyError) {
        console.error("Active key dashboard lookup error:", keyError);
        return res.status(500).json({
          success: false,
          message: "Failed to load active key",
        });
      }

      activeKey = keyRow ? await ensureKeySsconfToken(keyRow) : null;

      if (keyRow?.vpn_servers) {
        currentServer = mapServerForMiniApp(keyRow.vpn_servers, true);
      }
    }

    return res.json({
      success: true,
      message: trialCreated
        ? "Trial package created"
        : "Mini App auth successful",
      data: {
        brand: toPublicMiniAppConfig(miniapp).brand,
        user: {
          customer_id: customer.id,
          full_name: customer.full_name,
          telegram_user_id: telegramUserId,
          telegram_username: telegramUsername,
        },
        subscription: activeOrder
          ? {
              order_id: activeOrder.id,
              type: activeOrder.order_type,
              status: activeOrder.status,
              payment_status: activeOrder.payment_status,
              review_status: activeOrder.review_status,
              plan_name: activeOrder.vpn_plans?.name,
              data_limit_gb: activeOrder.vpn_plans?.data_limit_gb,
              start_date: activeOrder.start_date,
              expiry_date: activeOrder.expiry_date,
            }
          : null,
        current_server: currentServer,
        outline_key: activeKey
          ? toPublicOutlineKey(req, slug, activeKey)
          : null,
        trial: {
          created_now: trialCreated,
          used: Boolean(telegramLink.trial_used_at || trialCreated),
        },
      },
    });
  } catch (err) {
    console.error("Mini App auth exception:", err);
    return res.status(500).json({
      success: false,
      message: "Unexpected server error",
    });
  }
});

router.get("/:slug/plans", async (req, res) => {
  try {
    const { slug } = req.params;

    const { data: miniapp, error: miniappError } = await supabase
      .from("reseller_miniapps")
      .select("id, reseller_id, miniapp_slug, is_enabled")
      .eq("miniapp_slug", slug)
      .maybeSingle();

    if (miniappError) {
      console.error("Mini App plans lookup error:", miniappError);
      return res.status(500).json({
        success: false,
        message: "Failed to load Mini App",
      });
    }

    if (!miniapp) {
      return res.status(404).json({
        success: false,
        message: "Mini App not found",
      });
    }

    if (!miniapp.is_enabled) {
      return res.status(403).json({
        success: false,
        message: "Mini App is disabled",
      });
    }

    const { data: plans, error: plansError } = await supabase
      .from("vpn_plans")
      .select(`
        id,
        name,
        price_mmk,
        data_limit_gb,
        duration_days,
        max_devices,
        features,
        sort_order
      `)
      .eq("is_active", true)
      .eq("is_trial", false)
      .gt("price_mmk", 0)
      .order("sort_order", { ascending: true });

    if (plansError) {
      console.error("Plans lookup error:", plansError);
      return res.status(500).json({
        success: false,
        message: "Failed to load plans",
      });
    }

    return res.json({
      success: true,
      data: {
        plans: plans || [],
      },
    });
  } catch (err) {
    console.error("Mini App plans exception:", err);
    return res.status(500).json({
      success: false,
      message: "Unexpected server error",
    });
  }
});

router.get("/:slug/servers", async (req, res) => {
  try {
    const { slug } = req.params;
    const telegramUserId = req.query.telegram_user_id
      ? Number(req.query.telegram_user_id)
      : null;

    const { data: miniapp, error: miniappError } = await supabase
      .from("reseller_miniapps")
      .select("id, reseller_id, miniapp_slug, is_enabled")
      .eq("miniapp_slug", slug)
      .maybeSingle();

    if (miniappError) {
      console.error("Mini App servers lookup error:", miniappError);
      return res.status(500).json({
        success: false,
        message: "Failed to load Mini App",
      });
    }

    if (!miniapp) {
      return res.status(404).json({
        success: false,
        message: "Mini App not found",
      });
    }

    if (!miniapp.is_enabled) {
      return res.status(403).json({
        success: false,
        message: "Mini App is disabled",
      });
    }

    let allowedRegions = [];
    let currentServerId = null;

    if (telegramUserId) {
      const { data: link, error: linkError } = await supabase
        .from("telegram_links")
        .select("customer_id, reseller_id")
        .eq("reseller_id", miniapp.reseller_id)
        .eq("telegram_user_id", telegramUserId)
        .maybeSingle();

      if (linkError) {
        console.error("Telegram link server lookup error:", linkError);
        return res.status(500).json({
          success: false,
          message: "Failed to check Telegram user",
        });
      }

      if (link) {
        let activeOrder = null;

        try {
          activeOrder = await getBestActiveOrder({
            customerId: link.customer_id,
            resellerId: miniapp.reseller_id,
          });
        } catch (err) {
          console.error("Active order server lookup error:", err);
          return res.status(500).json({
            success: false,
            message: "Failed to load active package",
          });
        }

        allowedRegions = activeOrder?.vpn_plans?.allowed_regions || [];

        if (activeOrder) {
          const { data: activeKey, error: keyError } = await supabase
            .from("vpn_keys")
            .select("id, server_id")
            .eq("customer_id", link.customer_id)
            .eq("reseller_id", miniapp.reseller_id)
            .eq("order_id", activeOrder.id)
            .eq("status", "active")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (keyError) {
            console.error("Active key server lookup error:", keyError);
            return res.status(500).json({
              success: false,
              message: "Failed to load active server",
            });
          }

          currentServerId = activeKey?.server_id || null;
        }
      }
    }

    const { data: servers, error: serversError } = await supabase
      .from("vpn_servers")
      .select(`
        id,
        name,
        region,
        region_code,
        display_country,
        display_city,
        flag_emoji,
        server_number,
        status,
        is_active,
        is_default,
        sort_order
      `)
      .eq("is_active", true)
      .eq("status", "active")
      .order("sort_order", { ascending: true });

    if (serversError) {
      console.error("Servers lookup error:", serversError);
      return res.status(500).json({
        success: false,
        message: "Failed to load servers",
      });
    }

    const mappedServers = (servers || []).map((server) => {
      const canAccess =
        allowedRegions.length === 0
          ? false
          : allowedRegions.includes(server.region);

      return {
        id: server.id,
        name: server.name,
        region: server.region,
        region_code: server.region_code,
        country: server.display_country || server.region,
        city: server.display_city || server.name,
        flag: server.flag_emoji || "🌐",
        server_number: server.server_number,
        is_default: server.is_default,
        is_current: currentServerId === server.id,
        can_access: canAccess,
      };
    });

    return res.json({
      success: true,
      data: {
        servers: mappedServers,
      },
    });
  } catch (err) {
    console.error("Mini App servers exception:", err);
    return res.status(500).json({
      success: false,
      message: "Unexpected server error",
    });
  }
});

router.post("/:slug/servers/:serverId/link", async (req, res) => {
  let createdOutlineKeyId = null;
  let createdServer = null;
  let insertedVpnKeyId = null;
  let incrementedNewServer = false;

  try {
    const { slug, serverId } = req.params;
    const { telegram_user_id } = req.body;

    if (!slug) {
      return res.status(400).json({
        success: false,
        message: "Mini App slug is required",
      });
    }

    if (!serverId) {
      return res.status(400).json({
        success: false,
        message: "Server ID is required",
      });
    }

    if (!telegram_user_id) {
      return res.status(400).json({
        success: false,
        message: "Telegram user ID is required",
      });
    }

    const telegramUserId = Number(telegram_user_id);

    const { data: miniapp, error: miniappError } = await supabase
      .from("reseller_miniapps")
      .select("id, reseller_id, miniapp_slug, is_enabled")
      .eq("miniapp_slug", slug)
      .maybeSingle();

    if (miniappError) {
      console.error("Mini App link lookup error:", miniappError);
      return res.status(500).json({
        success: false,
        message: "Failed to load Mini App",
      });
    }

    if (!miniapp) {
      return res.status(404).json({
        success: false,
        message: "Mini App not found",
      });
    }

    if (!miniapp.is_enabled) {
      return res.status(403).json({
        success: false,
        message: "Mini App is disabled",
      });
    }

    const { data: link, error: linkError } = await supabase
      .from("telegram_links")
      .select(`
        id,
        customer_id,
        reseller_id,
        telegram_user_id,
        vpn_customers (
          id,
          full_name,
          telegram_username,
          status
        )
      `)
      .eq("reseller_id", miniapp.reseller_id)
      .eq("telegram_user_id", telegramUserId)
      .maybeSingle();

    if (linkError) {
      console.error("Telegram link lookup error:", linkError);
      return res.status(500).json({
        success: false,
        message: "Failed to check Telegram user",
      });
    }

    if (!link) {
      return res.status(404).json({
        success: false,
        message: "Telegram user is not registered. Please open Mini App first.",
      });
    }

    const customer = link.vpn_customers;

    if (!customer || customer.status !== "active") {
      return res.status(403).json({
        success: false,
        message: "Customer is inactive",
      });
    }

    let activeOrder = null;

    try {
      activeOrder = await getBestActiveOrder({
        customerId: customer.id,
        resellerId: miniapp.reseller_id,
      });
    } catch (err) {
      console.error("Active order link lookup error:", err);
      return res.status(500).json({
        success: false,
        message: "Failed to load active package",
      });
    }

    if (!activeOrder) {
      return res.status(403).json({
        success: false,
        message: "No active package. Please buy a package.",
      });
    }

    const plan = activeOrder.vpn_plans;
    const allowedRegions = plan?.allowed_regions || [];

    const { data: server, error: serverError } = await supabase
      .from("vpn_servers")
      .select(`
        id,
        name,
        region,
        region_code,
        display_country,
        display_city,
        flag_emoji,
        server_number,
        outline_api_url,
        outline_cert_sha256,
        status,
        is_active,
        is_default
      `)
      .eq("id", serverId)
      .maybeSingle();

    if (serverError) {
      console.error("Server lookup error:", serverError);
      return res.status(500).json({
        success: false,
        message: "Failed to load server",
      });
    }

    if (!server || !server.is_active || server.status !== "active") {
      return res.status(404).json({
        success: false,
        message: "Server is not available",
      });
    }

    if (!allowedRegions.includes(server.region)) {
      return res.status(403).json({
        success: false,
        message: "Your package cannot access this server",
      });
    }

    if (!server.outline_api_url || !server.outline_cert_sha256) {
      return res.status(500).json({
        success: false,
        message: "Server Outline config is missing",
      });
    }

    const dataLimitBytes = gbToBytes(plan?.data_limit_gb);

    const { data: existingActiveKeys, error: existingKeyError } = await supabase
      .from("vpn_keys")
      .select(`
        id,
        order_id,
        customer_id,
        reseller_id,
        server_id,
        outline_key_id,
        access_url,
        ssconf_token,
        data_limit_bytes,
        used_bytes,
        status,
        vpn_servers (
          id,
          outline_api_url,
          outline_cert_sha256
        )
      `)
      .eq("customer_id", customer.id)
      .eq("reseller_id", miniapp.reseller_id)
      .eq("order_id", activeOrder.id)
      .eq("status", "active")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (existingKeyError) {
      console.error("Existing active key lookup error:", existingKeyError);
      return res.status(500).json({
        success: false,
        message: "Failed to check existing key",
      });
    }

    const existingCurrentKey = (existingActiveKeys || [])[0];

    if (
      existingCurrentKey?.server_id === server.id &&
      existingCurrentKey?.access_url
    ) {
      const publicKey = await ensureKeySsconfToken(existingCurrentKey);

      return res.json({
        success: true,
        message: "Server already linked",
        data: {
          current_server: mapServerForMiniApp(server, true),
          outline_key: toPublicOutlineKey(req, slug, publicKey),
        },
      });
    }

    const outlineKey = await createOutlineKey({
      apiUrl: server.outline_api_url,
      certSha256: server.outline_cert_sha256,
      name: buildMiniAppKeyName({
        customer,
        server,
        order: activeOrder,
        plan,
      }),
      dataLimitBytes,
    });

    createdOutlineKeyId = outlineKey.outline_key_id;
    createdServer = server;

    const { data: insertedKey, error: insertKeyError } = await supabase
      .from("vpn_keys")
      .insert({
        order_id: activeOrder.id,
        customer_id: customer.id,
        reseller_id: miniapp.reseller_id,
        server_id: server.id,
        outline_key_id: outlineKey.outline_key_id,
        key_name: outlineKey.key_name,
        access_url: outlineKey.access_url,
        ssconf_token: createSsconfToken(),
        data_limit_bytes: dataLimitBytes,
        used_bytes: 0,
        status: "active",
        is_used: true,
        used_at: new Date().toISOString(),
      })
      .select("id, ssconf_token, outline_key_id, server_id, data_limit_bytes, used_bytes")
      .single();

    if (insertKeyError || !insertedKey) {
      throw new Error(insertKeyError?.message || "Failed to store VPN key");
    }

    insertedVpnKeyId = insertedKey.id;

    await incrementServerUsage(server.id);
    incrementedNewServer = true;
    await clearServerError(server.id);

    for (const oldKey of existingActiveKeys || []) {
      if (oldKey.id === insertedKey.id) continue;

      try {
        if (
          oldKey.outline_key_id &&
          oldKey.vpn_servers?.outline_api_url &&
          oldKey.vpn_servers?.outline_cert_sha256
        ) {
          await deleteOutlineKey({
            apiUrl: oldKey.vpn_servers.outline_api_url,
            certSha256: oldKey.vpn_servers.outline_cert_sha256,
            outlineKeyId: oldKey.outline_key_id,
          });
        }
      } catch (err) {
        console.error("Old Outline key delete error:", err);
        if (oldKey.server_id) {
          await setServerError(oldKey.server_id, err.message);
        }
      }

      try {
        if (oldKey.server_id) {
          await decrementServerUsage(oldKey.server_id);
        }
      } catch {}

      await supabase
        .from("vpn_keys")
        .update({
          status: "deleted",
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", oldKey.id);
    }

    return res.json({
      success: true,
      message: "Server linked successfully",
      data: {
        current_server: mapServerForMiniApp(server, true),
        outline_key: toPublicOutlineKey(req, slug, insertedKey),
      },
    });
  } catch (err) {
    console.error("Mini App link server exception:", err);

    if (incrementedNewServer && createdServer?.id) {
      try {
        await decrementServerUsage(createdServer.id);
      } catch {}
    }

    if (insertedVpnKeyId) {
      try {
        await supabase
          .from("vpn_keys")
          .update({
            status: "deleted",
            deleted_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", insertedVpnKeyId);
      } catch {}
    }

    if (createdOutlineKeyId && createdServer?.outline_api_url) {
      try {
        await deleteOutlineKey({
          apiUrl: createdServer.outline_api_url,
          certSha256: createdServer.outline_cert_sha256,
          outlineKeyId: createdOutlineKeyId,
        });
      } catch {}
    }

    return res.status(500).json({
      success: false,
      message: err.message || "Failed to link server",
    });
  }
});

router.post("/:slug/orders", async (req, res) => {
  let createdOutlineKeyId = null;
  let createdServer = null;
  let insertedVpnKeyId = null;
  let incrementedServer = false;

  try {
    const { slug } = req.params;
    const { telegram_user_id, plan_id, payment_screenshot_url, payment_note } =
      req.body;

    if (!slug) {
      return res.status(400).json({
        success: false,
        message: "Mini App slug is required",
      });
    }

    if (!telegram_user_id) {
      return res.status(400).json({
        success: false,
        message: "Telegram user ID is required",
      });
    }

    if (!plan_id) {
      return res.status(400).json({
        success: false,
        message: "Plan ID is required",
      });
    }

    const telegramUserId = Number(telegram_user_id);

    const { data: miniapp, error: miniappError } = await supabase
      .from("reseller_miniapps")
      .select(`
        id,
        reseller_id,
        miniapp_slug,
        is_enabled
      `)
      .eq("miniapp_slug", slug)
      .maybeSingle();

    if (miniappError) {
      console.error("Mini App order lookup error:", miniappError);
      return res.status(500).json({
        success: false,
        message: "Failed to load Mini App",
      });
    }

    if (!miniapp) {
      return res.status(404).json({
        success: false,
        message: "Mini App not found",
      });
    }

    if (!miniapp.is_enabled) {
      return res.status(403).json({
        success: false,
        message: "Mini App is disabled",
      });
    }

    const { data: link, error: linkError } = await supabase
      .from("telegram_links")
      .select(`
        id,
        customer_id,
        reseller_id,
        telegram_user_id,
        vpn_customers (
          id,
          full_name,
          telegram_username,
          status
        )
      `)
      .eq("reseller_id", miniapp.reseller_id)
      .eq("telegram_user_id", telegramUserId)
      .maybeSingle();

    if (linkError) {
      console.error("Telegram link order lookup error:", linkError);
      return res.status(500).json({
        success: false,
        message: "Failed to check Telegram user",
      });
    }

    if (!link) {
      return res.status(404).json({
        success: false,
        message: "Telegram user is not registered. Please open Mini App first.",
      });
    }

    const customer = link.vpn_customers;

    if (!customer || customer.status !== "active") {
      return res.status(403).json({
        success: false,
        message: "Customer is inactive",
      });
    }

    const { data: plan, error: planError } = await supabase
      .from("vpn_plans")
      .select(`
        id,
        name,
        price_mmk,
        data_limit_gb,
        duration_days,
        max_devices,
        is_active,
        is_trial
      `)
      .eq("id", plan_id)
      .eq("is_active", true)
      .maybeSingle();

    if (planError) {
      console.error("Plan order lookup error:", planError);
      return res.status(500).json({
        success: false,
        message: "Failed to load plan",
      });
    }

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Plan not found",
      });
    }

    if (plan.is_trial || Number(plan.price_mmk) <= 0) {
      return res.status(400).json({
        success: false,
        message: "Trial plan cannot be purchased",
      });
    }

    const { data: defaultServer, error: defaultServerError } = await supabase
      .from("vpn_servers")
      .select(`
        id,
        name,
        region,
        region_code,
        display_country,
        display_city,
        flag_emoji,
        server_number,
        outline_api_url,
        outline_cert_sha256,
        status,
        is_active,
        is_default
      `)
      .eq("is_default", true)
      .eq("is_active", true)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (defaultServerError) {
      console.error("Default server lookup error:", defaultServerError);
      return res.status(500).json({
        success: false,
        message: "Failed to load default server",
      });
    }

    if (!defaultServer) {
      return res.status(500).json({
        success: false,
        message: "Default server is not configured",
      });
    }

    if (!defaultServer.outline_api_url || !defaultServer.outline_cert_sha256) {
      return res.status(500).json({
        success: false,
        message: "Default server Outline config is missing",
      });
    }

    const { data: existingPendingOrder, error: pendingOrderError } =
      await supabase
        .from("vpn_orders")
        .select(`
          id,
          customer_id,
          reseller_id,
          plan_id,
          status,
          payment_status,
          review_status,
          created_at,
          vpn_plans (
            id,
            name,
            price_mmk,
            data_limit_gb,
            duration_days,
            max_devices
          )
        `)
        .eq("customer_id", customer.id)
        .eq("reseller_id", miniapp.reseller_id)
        .eq("source", "miniapp")
        .eq("order_type", "purchase")
        .eq("review_status", "pending_review")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (pendingOrderError) {
      console.error("Pending order lookup error:", pendingOrderError);
      return res.status(500).json({
        success: false,
        message: "Failed to check pending order",
      });
    }

    if (existingPendingOrder) {
      const { data: existingKey, error: existingKeyError } = await supabase
        .from("vpn_keys")
        .select(`
          id,
          access_url,
          ssconf_token,
          outline_key_id,
          data_limit_bytes,
          used_bytes,
          server_id,
          vpn_servers (
            id,
            name,
            region,
            region_code,
            display_country,
            display_city,
            flag_emoji,
            server_number,
            is_default
          )
        `)
        .eq("customer_id", customer.id)
        .eq("reseller_id", miniapp.reseller_id)
        .eq("order_id", existingPendingOrder.id)
        .eq("status", "active")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingKeyError) {
        console.error("Existing pending key lookup error:", existingKeyError);
        return res.status(500).json({
          success: false,
          message: "Failed to load existing pending access",
        });
      }

      if (existingKey?.access_url) {
        const publicKey = await ensureKeySsconfToken(existingKey);

        return res.status(409).json({
          success: false,
          message: "You already have a pending order with active access.",
          data: {
            order: {
              id: existingPendingOrder.id,
              status: existingPendingOrder.status,
              payment_status: existingPendingOrder.payment_status,
              review_status: existingPendingOrder.review_status,
              created_at: existingPendingOrder.created_at,
              plan: existingPendingOrder.vpn_plans,
            },
            current_server: mapServerForMiniApp(existingKey.vpn_servers, true),
            outline_key: toPublicOutlineKey(req, slug, publicKey),
          },
        });
      }

      await supabase
        .from("vpn_orders")
        .update({
          status: "active",
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingPendingOrder.id);

      const dataLimitBytes = gbToBytes(existingPendingOrder.vpn_plans?.data_limit_gb);

      const outlineKey = await createOutlineKey({
        apiUrl: defaultServer.outline_api_url,
        certSha256: defaultServer.outline_cert_sha256,
        name: buildMiniAppKeyName({
          customer,
          server: defaultServer,
          order: existingPendingOrder,
          plan: existingPendingOrder.vpn_plans,
        }),
        dataLimitBytes,
      });

      createdOutlineKeyId = outlineKey.outline_key_id;
      createdServer = defaultServer;

      const { data: insertedKey, error: insertKeyError } = await supabase
        .from("vpn_keys")
        .insert({
          order_id: existingPendingOrder.id,
          customer_id: customer.id,
          reseller_id: miniapp.reseller_id,
          server_id: defaultServer.id,
          outline_key_id: outlineKey.outline_key_id,
          key_name: outlineKey.key_name,
          access_url: outlineKey.access_url,
          ssconf_token: createSsconfToken(),
          data_limit_bytes: dataLimitBytes,
          used_bytes: 0,
          status: "active",
          is_used: true,
          used_at: new Date().toISOString(),
        })
        .select("id, ssconf_token, data_limit_bytes, used_bytes")
        .single();

      if (insertKeyError || !insertedKey) {
        throw new Error(insertKeyError?.message || "Failed to store VPN key");
      }

      insertedVpnKeyId = insertedKey.id;

      await incrementServerUsage(defaultServer.id);
      incrementedServer = true;
      await clearServerError(defaultServer.id);

      return res.status(200).json({
        success: true,
        message: "Pending order access created successfully.",
        data: {
          order: {
            id: existingPendingOrder.id,
            status: "active",
            payment_status: existingPendingOrder.payment_status,
            review_status: existingPendingOrder.review_status,
            order_type: "purchase",
            source: "miniapp",
            price_mmk: existingPendingOrder.vpn_plans?.price_mmk,
            created_at: existingPendingOrder.created_at,
            plan: existingPendingOrder.vpn_plans,
          },
          current_server: mapServerForMiniApp(defaultServer, true),
          outline_key: toPublicOutlineKey(req, slug, insertedKey),
        },
      });
    }

    const { data: reseller, error: resellerError } = await supabase
      .from("resellers")
      .select("id, commission_percent")
      .eq("id", miniapp.reseller_id)
      .maybeSingle();

    if (resellerError) {
      console.error("Reseller lookup error:", resellerError);
      return res.status(500).json({
        success: false,
        message: "Failed to load reseller",
      });
    }

    const commissionPercent = Number(reseller?.commission_percent || 0);
    const priceMmk = Number(plan.price_mmk || 0);
    const commissionAmountMmk = Math.floor(
      (priceMmk * commissionPercent) / 100
    );

    const startDate = new Date();
    const expiryDate = new Date();
    expiryDate.setDate(startDate.getDate() + Number(plan.duration_days || 30));

    const startDateText = startDate.toISOString().slice(0, 10);
    const expiryDateText = expiryDate.toISOString().slice(0, 10);

    const { data: createdOrder, error: orderError } = await supabase
      .from("vpn_orders")
      .insert({
        customer_id: customer.id,
        reseller_id: miniapp.reseller_id,
        plan_id: plan.id,

        status: "active",
        price_mmk: priceMmk,
        commission_percent: commissionPercent,
        commission_amount_mmk: commissionAmountMmk,

        start_date: startDateText,
        expiry_date: expiryDateText,
        activated_at: new Date().toISOString(),

        payment_status: "unpaid",
        total_paid_mmk: 0,

        order_type: "purchase",
        review_status: "pending_review",
        source: "miniapp",

        payment_screenshot_url: payment_screenshot_url || null,
        payment_note: payment_note || null,
      })
      .select(`
        id,
        customer_id,
        reseller_id,
        plan_id,
        status,
        price_mmk,
        payment_status,
        review_status,
        order_type,
        source,
        start_date,
        expiry_date,
        payment_screenshot_url,
        payment_note,
        created_at,
        vpn_plans (
          id,
          name,
          price_mmk,
          data_limit_gb,
          duration_days,
          max_devices
        )
      `)
      .single();

    if (orderError || !createdOrder) {
      console.error("Mini App order create error:", orderError);
      return res.status(500).json({
        success: false,
        message: "Failed to create order",
      });
    }

    const dataLimitBytes = gbToBytes(plan.data_limit_gb);

    const outlineKey = await createOutlineKey({
      apiUrl: defaultServer.outline_api_url,
      certSha256: defaultServer.outline_cert_sha256,
      name: buildMiniAppKeyName({
        customer,
        server: defaultServer,
        order: createdOrder,
        plan,
      }),
      dataLimitBytes,
    });

    createdOutlineKeyId = outlineKey.outline_key_id;
    createdServer = defaultServer;

    const { data: insertedKey, error: insertKeyError } = await supabase
      .from("vpn_keys")
      .insert({
        order_id: createdOrder.id,
        customer_id: customer.id,
        reseller_id: miniapp.reseller_id,
        server_id: defaultServer.id,
        outline_key_id: outlineKey.outline_key_id,
        key_name: outlineKey.key_name,
        access_url: outlineKey.access_url,
        ssconf_token: createSsconfToken(),
        data_limit_bytes: dataLimitBytes,
        used_bytes: 0,
        status: "active",
        is_used: true,
        used_at: new Date().toISOString(),
      })
      .select("id, ssconf_token, data_limit_bytes, used_bytes")
      .single();

    if (insertKeyError || !insertedKey) {
      throw new Error(insertKeyError?.message || "Failed to store VPN key");
    }

    insertedVpnKeyId = insertedKey.id;

    await incrementServerUsage(defaultServer.id);
    incrementedServer = true;
    await clearServerError(defaultServer.id);

    return res.status(201).json({
      success: true,
      message: "Order submitted. Premium access is active while waiting for reseller approval.",
      data: {
        order: {
          id: createdOrder.id,
          status: createdOrder.status,
          payment_status: createdOrder.payment_status,
          review_status: createdOrder.review_status,
          order_type: createdOrder.order_type,
          source: createdOrder.source,
          price_mmk: createdOrder.price_mmk,
          start_date: createdOrder.start_date,
          expiry_date: createdOrder.expiry_date,
          payment_screenshot_url: createdOrder.payment_screenshot_url,
          payment_note: createdOrder.payment_note,
          created_at: createdOrder.created_at,
          plan: createdOrder.vpn_plans,
        },
        current_server: mapServerForMiniApp(defaultServer, true),
        outline_key: toPublicOutlineKey(req, slug, insertedKey),
      },
    });
  } catch (err) {
    console.error("Mini App order exception:", err);

    if (incrementedServer && createdServer?.id) {
      try {
        await decrementServerUsage(createdServer.id);
      } catch {}
    }

    if (insertedVpnKeyId) {
      try {
        await supabase
          .from("vpn_keys")
          .update({
            status: "deleted",
            deleted_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", insertedVpnKeyId);
      } catch {}
    }

    if (createdOutlineKeyId && createdServer?.outline_api_url) {
      try {
        await deleteOutlineKey({
          apiUrl: createdServer.outline_api_url,
          certSha256: createdServer.outline_cert_sha256,
          outlineKeyId: createdOutlineKeyId,
        });
      } catch {}
    }

    return res.status(500).json({
      success: false,
      message: err.message || "Unexpected server error",
    });
  }
});

export default router;
