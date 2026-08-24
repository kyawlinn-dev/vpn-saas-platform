import express from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import {supabase} from "../../lib/supabase.js";
import { parseSsUrl } from "../../utils/parseSsUrl.js";
import {
  createOutlineKey,
  deleteOutlineKey,
  getOutlineTransferMetrics,
} from "../../services/outlineService.js";
import { decrypt } from "../../lib/tokenEncryption.js";

import {
  incrementServerUsage,
  decrementServerUsage,
  setServerError,
  clearServerError,
} from "../../services/serverService.js";
import { getRegionLocation } from "../../constants/doRegions.js";
import {
  activatePendingReviewPurchase,
  OrderLifecycleError,
} from "../../services/orderLifecycleService.js";
import { createOrderPayment } from "../../services/paymentLedgerService.js";
import { createTrialOrder, provisionTrialKey } from "../../services/trialService.js";
import {
  buildDynamicAccessUrl,
  buildSsconfHttpUrl,
} from "../../services/publicAccessUrlService.js";
import { getOrderQuotaSnapshot } from "../../services/subscriptionProvisionService.js";
import {
  buildRequestEventContext,
  trackAppEvent,
} from "../../services/appEventService.js";
import { verifyTelegramInitData } from "../../utils/telegramInitData.js";
import { businessDateOnly } from "../../utils/businessTime.js";

const router = express.Router();

// Only true when NODE_ENV is explicitly "development". Unset/missing → false →
// production behaviour (full HMAC verification, no bypass allowed).
const IS_DEV = process.env.NODE_ENV === "development";
const MINIAPP_PAGE_VIEW_EVENTS = new Set([
  "packages_viewed",
  "server_page_viewed",
]);

function trackMiniAppEvent(req, event) {
  trackAppEvent({
    event_source: "miniapp",
    actor_type: event.actor_type || "customer",
    ...buildRequestEventContext(req),
    ...event,
    metadata: {
      slug: req.params?.slug,
      ...(event.metadata || {}),
    },
  });
}

function miniAppAuthError(message, status = 401, code = "MINIAPP_AUTH_FAILED") {
  return Object.assign(new Error(message), { status, code });
}

function miniAppAuthResponse(res, error) {
  return res.status(error.status || 401).json({
    success: false,
    code: error.code || "MINIAPP_AUTH_FAILED",
    message: error.message,
  });
}

function parseTelegramUserId(value) {
  if (value == null || value === "") return null;

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : NaN;
}

function verifyMiniAppRequestUser({ miniapp, initData, expectedTelegramUserId }) {
  const initDataString = typeof initData === "string" ? initData.trim() : "";

  if (IS_DEV && !initDataString) {
    return { id: expectedTelegramUserId || 123456789 };
  }

  if (!initDataString) {
    throw miniAppAuthError(
      "Missing Telegram Mini App authentication data. Open the Mini App from the bot's Web App button.",
      401,
      "MISSING_INIT_DATA"
    );
  }

  if (!miniapp?.bot_token_encrypted) {
    throw miniAppAuthError("Mini App bot is not configured", 503, "BOT_NOT_CONFIGURED");
  }

  let botToken;
  try {
    botToken = decrypt(miniapp.bot_token_encrypted);
  } catch (err) {
    console.error("Bot token decrypt error:", err);
    throw miniAppAuthError("Failed to process authentication", 500, "BOT_TOKEN_DECRYPT_FAILED");
  }

  const { valid, user } = verifyTelegramInitData(initDataString, botToken);

  if (!valid) {
    throw miniAppAuthError(
      "Invalid or expired Telegram Mini App authentication. Reopen the Mini App from the reseller bot.",
      401,
      "INVALID_INIT_DATA"
    );
  }

  if (expectedTelegramUserId && Number(user.id) !== Number(expectedTelegramUserId)) {
    throw miniAppAuthError("Telegram user does not match this request", 403, "TELEGRAM_USER_MISMATCH");
  }

  return user;
}

// ── Screenshot upload infrastructure ─────────────────────────────────────────

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

// multer: memory storage, 5 MB cap enforced DURING the upload stream —
// the connection is dropped before the full body lands in RAM.
const _uploadSingle = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(Object.assign(new Error("Only JPEG, PNG and WebP images are accepted"), { code: "INVALID_TYPE" }));
    }
  },
}).single("file");

// Wraps multer so its errors become JSON responses instead of hitting the
// global error handler.
function runUploadMiddleware(req, res, next) {
  _uploadSingle(req, res, (err) => {
    if (!err) return next();
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "File exceeds the 5 MB limit" });
    }
    return res.status(415).json({ error: err.message || "Invalid file upload" });
  });
}

// Magic-byte checks — defence-in-depth against a file that lies about its
// Content-Type. Checked against the actual buffer bytes after multer lands it.
const MAGIC_CHECKS = {
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  // WebP: RIFF at bytes 0-3, then WEBP at bytes 8-11
  "image/webp": (b) =>
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
};

function hasValidMagicBytes(buffer, mimetype) {
  const check = MAGIC_CHECKS[mimetype];
  return check && buffer.length >= 12 && check(buffer);
}

// Tight per-IP rate limit on the upload route to limit storage abuse.
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many upload attempts. Please try again later." },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many authentication attempts. Please try again later." },
});

const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many order attempts. Please try again later." },
});

const serverLinkLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many server switch attempts. Please try again later." },
});

const EXT_MAP = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

function toPublicOutlineKey(req, customerSsconfToken, key, label, orderTotalUsedBytes = 0) {
  if (!customerSsconfToken) return null;

  return {
    ssconf_token: customerSsconfToken,
    ssconf_url: buildSsconfHttpUrl(customerSsconfToken, { req }),
    dynamic_access_url: buildDynamicAccessUrl(customerSsconfToken, label, { req }),
    data_limit_bytes: key?.data_limit_bytes ?? null,
    used_bytes: orderTotalUsedBytes,
  };
}

async function getOrderTotalUsedBytes(orderId) {
  const { data: keys, error } = await supabase
    .from("vpn_keys")
    .select("used_bytes")
    .eq("order_id", orderId)
    .in("status", ["active", "deleted"]);

  if (error) {
    console.error("[usage] Failed to sum order used_bytes:", error.message);
    return 0;
  }

  return (keys || []).reduce((sum, k) => sum + Number(k.used_bytes || 0), 0);
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
  const loc = getRegionLocation(server.region);
  const serverTier = normalizeMiniAppServerTier(server.server_tier);
  const flag = server.flag_emoji || loc?.flag || "🌐";

  return {
    id: server.id,
    name: server.name,
    region: server.region,
    region_code: server.region_code || null,
    country: server.display_country || loc?.country || server.region,
    city: server.display_city || loc?.city || server.name,
    flag,
    flag_emoji: flag,
    server_tier: serverTier,
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
    payment: Array.isArray(row.payment_info) ? row.payment_info : [],
  };
}

// Generates and persists a permanent ssconf_token on vpn_customers if one does
// not already exist. Race-safe: uses a conditional UPDATE then re-fetches.
async function ensureCustomerSsconfToken(customerId) {
  const { data: existing, error: readErr } = await supabase
    .from("vpn_customers")
    .select("ssconf_token")
    .eq("id", customerId)
    .single();

  if (readErr) throw new Error(readErr.message);
  if (existing?.ssconf_token) return existing.ssconf_token;

  const newToken = crypto.randomUUID().replaceAll("-", "");

  const { error: updateErr } = await supabase
    .from("vpn_customers")
    .update({ ssconf_token: newToken })
    .eq("id", customerId)
    .is("ssconf_token", null);

  if (updateErr) throw new Error(updateErr.message);

  // Re-fetch in case a concurrent request won the race and set a different token
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

async function ensureTelegramCustomerType(customer) {
  if (!customer?.id || customer.customer_type === "telegram") return customer;

  const { data: updated, error } = await supabase
    .from("vpn_customers")
    .update({ customer_type: "telegram" })
    .eq("id", customer.id)
    .select("id, full_name, telegram_username, status, customer_type")
    .single();

  if (error || !updated) {
    throw new Error(error?.message || "Failed to mark Telegram customer");
  }

  return updated;
}

async function getBestActiveOrder({ customerId, resellerId }) {
  const today = businessDateOnly();

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

function getOrderServerTier(order) {
  return order?.order_type === "trial" || order?.vpn_plans?.is_trial ? "trial" : "premium";
}

function normalizeMiniAppServerTier(serverTier) {
  return String(serverTier || "").trim().toLowerCase() === "trial" ? "trial" : "premium";
}

// Access rule (2026-08): trial customers are still confined to trial-tier
// servers, but paid/premium customers may now connect to ANY active server
// — trial-tier included, any region — ignoring the plan's allowed_regions.
// This is deliberate: trial servers are lightly used and premium customers
// occasionally need an emergency alternate server when their usual region
// has issues. Trial customers stay restricted so they don't crowd out the
// premium server pool they haven't paid for.
function getMiniAppServerAccessState({ activeOrder, server, allowedRegions = [] }) {
  if (!activeOrder) {
    return {
      canAccess: false,
      reason: "NO_ACTIVE_PACKAGE",
      requiredTier: null,
    };
  }

  const requiredTier = getOrderServerTier(activeOrder);
  const serverTier = normalizeMiniAppServerTier(server?.server_tier);

  // Paid customers: no tier or region restriction — any active server.
  if (requiredTier === "premium") {
    return {
      canAccess: true,
      reason: null,
      requiredTier,
    };
  }

  // Trial customers: unchanged — trial-tier only, no region restriction
  // (trial plans don't carry allowed_regions in practice, but the check
  // stays here for parity with premium's original behavior).
  if (serverTier !== requiredTier) {
    return {
      canAccess: false,
      reason: "TRIAL_CANNOT_USE_PREMIUM",
      requiredTier,
    };
  }

  const normalizedAllowedRegions = (allowedRegions || [])
    .map((r) => String(r || "").toLowerCase().trim())
    .filter(Boolean);

  if (
    normalizedAllowedRegions.length > 0 &&
    !normalizedAllowedRegions.includes(String(server?.region || "").toLowerCase().trim())
  ) {
    return {
      canAccess: false,
      reason: "REGION_NOT_ALLOWED",
      requiredTier,
    };
  }

  return {
    canAccess: true,
    reason: null,
    requiredTier,
  };
}

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
        is_enabled,
        payment_info
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

    trackMiniAppEvent(req, {
      event_name: "miniapp_config_loaded",
      actor_type: "anonymous",
      reseller_id: data.reseller_id,
      page: "home",
      status: "success",
    });

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

router.post("/:slug/auth", authLimiter, async (req, res) => {
  try {
    const { slug } = req.params;
    const { init_data } = req.body;
    const initDataString = typeof init_data === "string" ? init_data.trim() : "";

    if (!slug) {
      return res.status(400).json({
        success: false,
        message: "Mini App slug is required",
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
        is_enabled,
        bot_token_encrypted
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

    // ── Telegram HMAC verification ──────────────────────────────────────────
    // Fallback is ONLY available when NODE_ENV is explicitly "development" AND
    // the client sent no initData (browser/local dev). Any other combination
    // goes through full HMAC verification. Unset NODE_ENV → IS_DEV is false →
    // verification is required (fail-safe default).
    let verifiedUser = null;

    if (IS_DEV && !initDataString) {
      verifiedUser = { id: 123456789, first_name: "Kyaw", last_name: "Linn", username: "kyawlinn" };
    } else {
      if (!initDataString) {
        return miniAppAuthResponse(
          res,
          miniAppAuthError(
            "Missing Telegram Mini App authentication data. Open the Mini App from the bot's Web App button.",
            401,
            "MISSING_INIT_DATA"
          )
        );
      }

      if (!miniapp.bot_token_encrypted) {
        return miniAppAuthResponse(
          res,
          miniAppAuthError("Mini App bot is not configured", 503, "BOT_NOT_CONFIGURED")
        );
      }

      let botToken;
      try {
        botToken = decrypt(miniapp.bot_token_encrypted);
      } catch (err) {
        console.error("Bot token decrypt error:", err);
        return miniAppAuthResponse(
          res,
          miniAppAuthError("Failed to process authentication", 500, "BOT_TOKEN_DECRYPT_FAILED")
        );
      }

      const { valid, user } = verifyTelegramInitData(initDataString, botToken);
      // botToken goes out of scope here — not logged, not stored, not returned

      if (!valid) {
        return miniAppAuthResponse(
          res,
          miniAppAuthError(
            "Invalid or expired Telegram Mini App authentication. Reopen the Mini App from the reseller bot.",
            401,
            "INVALID_INIT_DATA"
          )
        );
      }

      verifiedUser = user;
    }

    const telegramUserId = Number(verifiedUser.id);
    const telegramUsername = verifiedUser.username || null;
    const fullName =
      [verifiedUser.first_name, verifiedUser.last_name]
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
          status,
          customer_type
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
          customer_type: "telegram",
        })
        .select("id, full_name, telegram_username, status, customer_type")
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
      customer = await ensureTelegramCustomerType(existingLink.vpn_customers);
    }

    // Ensure the customer has a permanent ssconf_token from this point forward
    const customerSsconfToken = await ensureCustomerSsconfToken(customer.id);
    const label = [miniapp.brand_name, customer.full_name].filter(Boolean).join("-");

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
      // Delegate to shared trialService — handles atomic claim, TOCTOU guard,
      // rollback on failure, and immediate key provisioning on trial capacity.
      try {
      const { order, plan, created } = await createTrialOrder({
        customerId: customer.id,
        resellerId: miniapp.reseller_id,
        telegramLinkId: telegramLink.id,
        telegramUsername,
      });

      if (order) {
        if (created) {
          // Provision a trial key immediately so the customer has a working key
          // on first open (non-fatal if trial capacity is unavailable).
          try {
            await provisionTrialKey({
              customerId: customer.id,
              resellerId: miniapp.reseller_id,
              orderId: order.id,
              plan,
              customerFullName: customer.full_name,
              keyName: label,
            });
          } catch (provErr) {
            console.warn("[auth] trial key auto-provision failed (non-fatal):", provErr.message);
          }
          trialCreated = true;
        }
        activeOrder = order;
      }
      } catch (trialErr) {
        console.warn("[auth] trial auto-create failed (non-fatal):", trialErr.message);
      }
    }

    // When no active order exists, check whether the customer's most recent
    // purchase was rejected so the miniapp can surface a clear message.
    let recentRejection = null;
    if (!activeOrder) {
      const { data: rejectedOrder } = await supabase
        .from("vpn_orders")
        .select("stopped_at, vpn_plans(name)")
        .eq("customer_id", customer.id)
        .eq("reseller_id", miniapp.reseller_id)
        .eq("status", "stopped")
        .eq("review_status", "rejected")
        .order("stopped_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (rejectedOrder) {
        recentRejection = {
          plan_name: rejectedOrder.vpn_plans?.name || null,
          stopped_at: rejectedOrder.stopped_at || null,
        };
      }
    }

    let currentKeyRow = null;
    let currentServer = null;

    if (activeOrder) {
      const { data: keyRow, error: keyError } = await supabase
        .from("vpn_keys")
        .select(`
          id,
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
            server_tier,
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

      currentKeyRow = keyRow || null;

      if (keyRow?.vpn_servers) {
        currentServer = mapServerForMiniApp(keyRow.vpn_servers, true);
      }
    }

    const orderUsedBytes =
      currentKeyRow && activeOrder ? await getOrderTotalUsedBytes(activeOrder.id) : 0;

    trackMiniAppEvent(req, {
      event_name: "miniapp_authenticated",
      reseller_id: miniapp.reseller_id,
      customer_id: customer.id,
      telegram_user_id: telegramUserId,
      order_id: activeOrder?.id || null,
      plan_id: activeOrder?.plan_id || null,
      server_id: currentKeyRow?.server_id || null,
      page: "home",
      status: "success",
      metadata: {
        created: trialCreated,
        order_type: activeOrder?.order_type || null,
      },
    });

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
              plan_id: activeOrder.plan_id,
              type: activeOrder.order_type,
              status: activeOrder.status,
              payment_status: activeOrder.payment_status,
              review_status: activeOrder.review_status,
              plan_name: activeOrder.vpn_plans?.name,
              data_limit_gb: activeOrder.vpn_plans?.data_limit_gb,
              duration_days: activeOrder.vpn_plans?.duration_days,
              start_date: activeOrder.start_date,
              expiry_date: activeOrder.expiry_date,
            }
          : null,
        current_server: currentServer,
        outline_key: currentKeyRow
          ? toPublicOutlineKey(req, customerSsconfToken, currentKeyRow, label, orderUsedBytes)
          : null,
        trial: {
          created_now: trialCreated,
          used: Boolean(telegramLink.trial_used_at || trialCreated),
        },
        recent_rejection: recentRejection,
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

async function handleMiniAppServers(
  req,
  res,
  { telegramUserId = null, initData = "" } = {}
) {
  try {
    const { slug } = req.params;

    const { data: miniapp, error: miniappError } = await supabase
      .from("reseller_miniapps")
      .select("id, reseller_id, miniapp_slug, is_enabled, bot_token_encrypted")
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
    let activeOrder = null;
    let customerId = null;

    if (telegramUserId) {
      try {
        verifyMiniAppRequestUser({
          miniapp,
          initData,
          expectedTelegramUserId: telegramUserId,
        });
      } catch (authErr) {
        return miniAppAuthResponse(res, authErr);
      }

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
        customerId = link.customer_id;
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
      .select("id, name, region, region_code, display_country, display_city, flag_emoji, status, is_default, server_tier")
      .eq("status", "active")
      .order("created_at", { ascending: true });

    if (serversError) {
      console.error("Servers lookup error:", serversError);
      return res.status(500).json({
        success: false,
        message: "Failed to load servers",
      });
    }

    const mappedServers = (servers || []).map((server) => {
      const access = getMiniAppServerAccessState({
        activeOrder,
        server,
        allowedRegions,
      });

      return {
        ...mapServerForMiniApp(server, currentServerId === server.id),
        can_access: access.canAccess,
        access_reason: access.reason,
        required_server_tier: access.requiredTier,
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
}

router.get("/:slug/servers", async (req, res) => {
  const telegramUserId = parseTelegramUserId(req.query.telegram_user_id);
  const initData = req.get("x-telegram-init-data") || req.query.init_data || "";

  if (Number.isNaN(telegramUserId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid telegram_user_id",
    });
  }

  if (!telegramUserId || (!IS_DEV && !String(initData).trim())) {
    return res.status(401).json({
      success: false,
      message: "Telegram authentication is required to view servers",
    });
  }

  return handleMiniAppServers(req, res, { telegramUserId, initData });
});

router.post("/:slug/servers", async (req, res) => {
  const telegramUserId = parseTelegramUserId(req.body.telegram_user_id);
  const initData = req.body.init_data || "";

  if (Number.isNaN(telegramUserId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid telegram_user_id",
    });
  }

  if (!telegramUserId || (!IS_DEV && !String(initData).trim())) {
    return res.status(401).json({
      success: false,
      message: "Telegram authentication is required to view servers",
    });
  }

  return handleMiniAppServers(req, res, { telegramUserId, initData });
});

router.post("/:slug/events", async (req, res) => {
  try {
    const { slug } = req.params;
    const eventName = String(req.body.event_name || "").trim();
    const page = String(req.body.page || "").trim();
    const telegramUserId = parseTelegramUserId(req.body.telegram_user_id);
    const initData = req.body.init_data || req.get("x-telegram-init-data") || "";

    if (!MINIAPP_PAGE_VIEW_EVENTS.has(eventName)) {
      return res.status(400).json({
        success: false,
        message: "Unsupported Mini App event",
      });
    }

    if (Number.isNaN(telegramUserId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid telegram_user_id",
      });
    }

    if (!telegramUserId || (!IS_DEV && !String(initData).trim())) {
      return res.status(401).json({
        success: false,
        message: "Telegram authentication is required to record Mini App events",
      });
    }

    const { data: miniapp, error: miniappError } = await supabase
      .from("reseller_miniapps")
      .select("id, reseller_id, miniapp_slug, is_enabled, bot_token_encrypted")
      .eq("miniapp_slug", slug)
      .maybeSingle();

    if (miniappError) {
      console.error("Mini App event lookup error:", miniappError);
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

    try {
      verifyMiniAppRequestUser({
        miniapp,
        initData,
        expectedTelegramUserId: telegramUserId,
      });
    } catch (authErr) {
      return miniAppAuthResponse(res, authErr);
    }

    const { data: link, error: linkError } = await supabase
      .from("telegram_links")
      .select("customer_id, reseller_id")
      .eq("reseller_id", miniapp.reseller_id)
      .eq("telegram_user_id", telegramUserId)
      .maybeSingle();

    if (linkError) {
      console.error("Mini App event link lookup error:", linkError);
      return res.status(500).json({
        success: false,
        message: "Failed to check Telegram user",
      });
    }

    let activeOrder = null;
    if (link?.customer_id) {
      try {
        activeOrder = await getBestActiveOrder({
          customerId: link.customer_id,
          resellerId: miniapp.reseller_id,
        });
      } catch (err) {
        console.error("Mini App event order lookup error:", err);
      }
    }

    trackMiniAppEvent(req, {
      event_name: eventName,
      reseller_id: miniapp.reseller_id,
      customer_id: link?.customer_id || null,
      telegram_user_id: telegramUserId,
      order_id: activeOrder?.id || null,
      plan_id: activeOrder?.plan_id || null,
      page: page || (eventName === "packages_viewed" ? "packages" : "servers"),
      status: "success",
      metadata: {
        order_type: activeOrder?.order_type || null,
      },
    });

    return res.json({ success: true });
  } catch (err) {
    console.error("Mini App event exception:", err);
    return res.status(500).json({
      success: false,
      message: "Unexpected server error",
    });
  }
});

router.post("/:slug/servers/:serverId/link", serverLinkLimiter, async (req, res) => {
  let createdOutlineKeyId = null;
  let createdServer = null;
  let insertedVpnKeyId = null;
  let incrementedNewServer = false;

  try {
    const { slug, serverId } = req.params;
    const { telegram_user_id } = req.body;
    const initData = req.body.init_data || req.get("x-telegram-init-data") || "";

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

    if (!String(initData).trim()) {
      return miniAppAuthResponse(
        res,
        miniAppAuthError("Open from Telegram bot again.", 401, "MISSING_INIT_DATA")
      );
    }

    const { data: miniapp, error: miniappError } = await supabase
      .from("reseller_miniapps")
      .select("id, reseller_id, miniapp_slug, brand_name, is_enabled, bot_token_encrypted")
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

    try {
      verifyMiniAppRequestUser({
        miniapp,
        initData,
        expectedTelegramUserId: telegramUserId,
      });
    } catch (authErr) {
      return miniAppAuthResponse(res, authErr);
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
          status,
          customer_type
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

    const customer = await ensureTelegramCustomerType(link.vpn_customers);

    if (!customer || customer.status !== "active") {
      return res.status(403).json({
        success: false,
        message: "Customer is inactive",
      });
    }

    const customerSsconfToken = await ensureCustomerSsconfToken(customer.id);
    const label = [miniapp.brand_name, customer.full_name].filter(Boolean).join("-");

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
      trackMiniAppEvent(req, {
        event_name: "server_select_blocked",
        reseller_id: miniapp.reseller_id,
        customer_id: customer.id,
        telegram_user_id: telegramUserId,
        server_id: serverId,
        page: "servers",
        status: "blocked",
        metadata: {
          code: "NO_ACTIVE_PACKAGE",
          reason: "No active package",
        },
      });

      return res.status(403).json({
        success: false,
        message: "No active package. Please buy a package.",
      });
    }

    const plan = activeOrder.vpn_plans;
    const allowedRegions = plan?.allowed_regions || [];
    const requiredServerTier = getOrderServerTier(activeOrder);

    const { data: server, error: serverError } = await supabase
      .from("vpn_servers")
      .select("id, name, region, region_code, display_country, display_city, flag_emoji, outline_api_url, outline_cert_sha256, status, is_default, server_tier")
      .eq("id", serverId)
      .maybeSingle();

    if (serverError) {
      console.error("Server lookup error:", serverError);
      return res.status(500).json({
        success: false,
        message: "Failed to load server",
      });
    }

    if (!server || server.status !== "active") {
      return res.status(404).json({
        success: false,
        message: "Server is not available",
      });
    }

    // Single choke point for tier/region rules — see
    // getMiniAppServerAccessState() for the current policy (paid customers:
    // any active server; trial customers: trial-tier only).
    const access = getMiniAppServerAccessState({ activeOrder, server, allowedRegions });
    if (!access.canAccess) {
      trackMiniAppEvent(req, {
        event_name: "server_select_blocked",
        reseller_id: miniapp.reseller_id,
        customer_id: customer.id,
        telegram_user_id: telegramUserId,
        order_id: activeOrder.id,
        plan_id: activeOrder.plan_id,
        server_id: server.id,
        page: "servers",
        status: "blocked",
        metadata: {
          code: access.reason,
          server_tier: normalizeMiniAppServerTier(server.server_tier),
          required_tier: requiredServerTier,
        },
      });

      const messages = {
        NO_ACTIVE_PACKAGE: "No active package. Please buy a package.",
        TRIAL_CANNOT_USE_PREMIUM: "Trial packages can only connect to trial servers.",
        REGION_NOT_ALLOWED: "Your package cannot access this server",
      };

      return res.status(403).json({
        success: false,
        code: access.reason,
        message: messages[access.reason] || "This server is not available for your package.",
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

    const activeKeys = existingActiveKeys || [];
    const activeTargetKey = activeKeys.find(
      (key) => key.server_id === server.id && key.access_url
    );

    // Idempotent: target server is already the only active key -> nothing to switch.
    if (activeTargetKey && activeKeys.length === 1) {
      const totalUsedBytes = await getOrderTotalUsedBytes(activeOrder.id);
      trackMiniAppEvent(req, {
        event_name: "server_selected",
        reseller_id: miniapp.reseller_id,
        customer_id: customer.id,
        telegram_user_id: telegramUserId,
        order_id: activeOrder.id,
        plan_id: activeOrder.plan_id,
        server_id: server.id,
        page: "servers",
        status: "success",
        metadata: {
          reused: true,
          server_tier: normalizeMiniAppServerTier(server.server_tier),
          region: server.region,
        },
      });

      return res.json({
        success: true,
        message: "Server already linked",
        data: {
          current_server: mapServerForMiniApp(server, true),
          outline_key: toPublicOutlineKey(req, customerSsconfToken, activeTargetKey, label, totalUsedBytes),
        },
      });
    }

    // Order-wide data-limit guard: block switching to a NEW server once the whole
    // order has hit its cap. Re-linking the current server above is exempt.
    const quota = await getOrderQuotaSnapshot(activeOrder.id);
    if (!quota.isUnlimited && quota.remainingBytes === 0) {
      trackMiniAppEvent(req, {
        event_name: "server_select_blocked",
        reseller_id: miniapp.reseller_id,
        customer_id: customer.id,
        telegram_user_id: telegramUserId,
        order_id: activeOrder.id,
        plan_id: activeOrder.plan_id,
        server_id: server.id,
        page: "servers",
        status: "blocked",
        metadata: {
          code: "DATA_LIMIT_REACHED",
          server_tier: normalizeMiniAppServerTier(server.server_tier),
        },
      });

      return res.status(403).json({
        success: false,
        code: "DATA_LIMIT_REACHED",
        message: "You have used all your data. Renew or upgrade to switch servers.",
      });
    }

    let insertedKey = activeTargetKey || null;

    // Append-only: the partial unique index keeps one ACTIVE key per (order, server),
    // but deleted history rows never conflict -> a switch is always a fresh INSERT.
    if (!insertedKey) {
      // New key's Outline limit = remaining order balance, so Outline throttles at the
      // real cap even between hourly usage syncs. null plan limit = unlimited.
      const remainingBytes = quota.isUnlimited ? null : quota.remainingBytes;

      let outlineKey;
      try {
        // Critical path: only touch the NEW server here. Any call to the OLD server
        // (metrics, delete) is deferred to background after the response is sent.
        // Hitting the old server during the request can disrupt the customer's active
        // VPN connection (which routes through that same server), causing "Load failed".
        outlineKey = await createOutlineKey({
          apiUrl: server.outline_api_url,
          certSha256: server.outline_cert_sha256,
          name: buildMiniAppKeyName({ customer, server, order: activeOrder, plan }),
          dataLimitBytes: remainingBytes,
        });
      } catch (outlineErr) {
        console.error("Outline key create error:", outlineErr);
        const friendlyErr = new Error(
          "Could not create VPN key on this server. Please try another server or contact support."
        );
        friendlyErr.status = 502;
        throw friendlyErr;
      }

      createdOutlineKeyId = outlineKey.outline_key_id;
      createdServer = server;

      const insertPayload = {
        order_id: activeOrder.id,
        customer_id: customer.id,
        reseller_id: miniapp.reseller_id,
        server_id: server.id,
        outline_key_id: outlineKey.outline_key_id,
        key_name: outlineKey.key_name,
        access_url: outlineKey.access_url,
        data_limit_bytes: remainingBytes,
        used_bytes: 0,
        status: "active",
        is_used: true,
        used_at: new Date().toISOString(),
        deleted_at: null,
      };

      let insertKeyError = null;
      ({ data: insertedKey, error: insertKeyError } = await supabase
        .from("vpn_keys")
        .insert(insertPayload)
        .select("id, outline_key_id, server_id, access_url, data_limit_bytes, used_bytes")
        .single());

      // Concurrent double-link to the same new server: the partial active index rejects
      // the second insert (23505). Reuse the row that won and drop our extra Outline key.
      if (insertKeyError?.code === "23505") {
        const { data: racedKey } = await supabase
          .from("vpn_keys")
          .select("id, outline_key_id, server_id, access_url, data_limit_bytes, used_bytes")
          .eq("order_id", activeOrder.id)
          .eq("server_id", server.id)
          .eq("status", "active")
          .is("deleted_at", null)
          .maybeSingle();

        if (racedKey?.id) {
          insertedKey = racedKey;
          insertKeyError = null;
          try {
            await deleteOutlineKey({
              apiUrl: server.outline_api_url,
              certSha256: server.outline_cert_sha256,
              outlineKeyId: outlineKey.outline_key_id,
            });
            createdOutlineKeyId = null;
          } catch (cleanupErr) {
            console.warn("[link] Failed to clean up raced Outline key:", cleanupErr.message);
          }
        }
      }

      if (insertKeyError || !insertedKey) {
        console.error("VPN key store error:", insertKeyError);
        const friendlyErr = new Error("Failed to store VPN key. Please try again.");
        friendlyErr.status = 500;
        throw friendlyErr;
      }

      // Count server load only for a genuinely new active key (not a raced reuse).
      if (createdOutlineKeyId) {
        insertedVpnKeyId = insertedKey.id;
        await incrementServerUsage(server.id);
        incrementedNewServer = true;
        trackMiniAppEvent(req, {
          event_name: "key_provisioned",
          reseller_id: miniapp.reseller_id,
          customer_id: customer.id,
          telegram_user_id: telegramUserId,
          order_id: activeOrder.id,
          plan_id: activeOrder.plan_id,
          server_id: server.id,
          page: "servers",
          status: "success",
          metadata: {
            server_tier: normalizeMiniAppServerTier(server.server_tier),
            region: server.region,
            order_type: activeOrder.order_type || null,
          },
        });
      }

      await clearServerError(server.id);
    }

    // Respond immediately — use already-fetched used_bytes (avoids a second DB
    // round-trip) and send before touching the old server at all.
    const knownUsedBytes = activeKeys.reduce(
      (sum, k) => sum + Number(k.used_bytes || 0), 0
    );
    trackMiniAppEvent(req, {
      event_name: "server_selected",
      reseller_id: miniapp.reseller_id,
      customer_id: customer.id,
      telegram_user_id: telegramUserId,
      order_id: activeOrder.id,
      plan_id: activeOrder.plan_id,
      server_id: server.id,
      page: "servers",
      status: "success",
      metadata: {
        server_tier: normalizeMiniAppServerTier(server.server_tier),
        region: server.region,
        reused: Boolean(activeTargetKey),
      },
    });

    res.json({
      success: true,
      message: "Server linked successfully",
      data: {
        current_server: mapServerForMiniApp(server, true),
        outline_key: toPublicOutlineKey(req, customerSsconfToken, insertedKey, label, knownUsedBytes),
      },
    });

    // Background: 30-second grace period, then snapshot usage + delete old keys.
    //
    // WHY 30 seconds: customers who are actively connected to the old server via
    // Outline VPN will have their connection dropped the moment the old key is
    // deleted. Outline's auto-reconnect then takes 20-30s (retries with cached
    // credentials). Manual disconnect is instant — Outline fetches fresh ssconf
    // (now pointing to the new server) and reconnects in 1-2s.
    //
    // The grace period gives them time to disconnect cleanly. The old key stays
    // valid during this window; the ssconf URL already points to the new server.
    //
    // WHY NO CALLS TO OLD SERVER DURING THE REQUEST: the old server is the one
    // routing the customer's VPN traffic. An unexpected API hit to it during the
    // switch can momentarily disrupt the VPN tunnel and cause "Load failed" in the
    // miniapp fetch — only happens when the customer is connected to that server.
    const OLD_KEY_GRACE_MS = 30_000;
    const oldKeysToClean = activeKeys.filter((k) => k.id !== insertedKey.id);
    if (oldKeysToClean.length > 0) {
      Promise.allSettled(
        oldKeysToClean.map(async (oldKey) => {
          await new Promise((resolve) => setTimeout(resolve, OLD_KEY_GRACE_MS));

          if (
            oldKey.outline_key_id &&
            oldKey.vpn_servers?.outline_api_url &&
            oldKey.vpn_servers?.outline_cert_sha256
          ) {
            // Snapshot live usage before deleting the key
            const metricsMap = await getOutlineTransferMetrics({
              apiUrl: oldKey.vpn_servers.outline_api_url,
              certSha256: oldKey.vpn_servers.outline_cert_sha256,
            }).catch((err) => {
              console.warn(`[link] Usage snapshot failed for key ${oldKey.id}:`, err.message);
              return null;
            });

            if (metricsMap) {
              const liveBytes = metricsMap[String(oldKey.outline_key_id)];
              if (liveBytes !== undefined) {
                await supabase
                  .from("vpn_keys")
                  .update({ used_bytes: liveBytes })
                  .eq("id", oldKey.id);
              }
            }

            try {
              await deleteOutlineKey({
                apiUrl: oldKey.vpn_servers.outline_api_url,
                certSha256: oldKey.vpn_servers.outline_cert_sha256,
                outlineKeyId: oldKey.outline_key_id,
              });
            } catch (err) {
              console.error("[link] Old Outline key delete error:", err);
              if (oldKey.server_id) {
                await setServerError(oldKey.server_id, err.message).catch(() => {});
              }
            }
          }

          if (oldKey.server_id) {
            await decrementServerUsage(oldKey.server_id).catch(() => {});
          }

          await supabase
            .from("vpn_keys")
            .update({
              status: "deleted",
              deleted_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", oldKey.id);
        })
      ).catch((err) => console.error("[link] Background old key cleanup error:", err));
    }
  } catch (err) {
    console.error("Mini App link server exception:", err);

    // Guard: only send an error response if the success response hasn't been sent yet.
    if (res.headersSent) return;

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

    const status = Number.isInteger(err.status) ? err.status : 500;
    const message =
      status === 500
        ? "Failed to link server. Please try again."
        : err.message || "Failed to link server";

    return res.status(status).json({
      success: false,
      message,
    });
  }
});

router.post("/:slug/orders", orderLimiter, async (req, res) => {
  try {
    const { slug } = req.params;
    const { telegram_user_id, plan_id, payment_screenshot_url, payment_note, init_data } =
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
        brand_name,
        is_enabled,
        bot_token_encrypted
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

    try {
      verifyMiniAppRequestUser({
        miniapp,
        initData: init_data,
        expectedTelegramUserId: telegramUserId,
      });
    } catch (authErr) {
      return miniAppAuthResponse(res, authErr);
    }

    // Require a non-empty path that was produced by our own upload endpoint.
    // Format: {slug}/{reseller_id}/{uuid}.{ext}
    const _screenshotPath = typeof payment_screenshot_url === "string" ? payment_screenshot_url : "";
    const _validScreenshot =
      _screenshotPath.startsWith(`${slug}/${miniapp.reseller_id}/`) &&
      [".jpg", ".png", ".webp"].some((ext) => _screenshotPath.endsWith(ext));

    if (!_validScreenshot) {
      return res.status(400).json({
        success: false,
        message: "Payment screenshot is required",
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
          status,
          customer_type
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

    const customer = await ensureTelegramCustomerType(link.vpn_customers);

    if (!customer || customer.status !== "active") {
      return res.status(403).json({
        success: false,
        message: "Customer is inactive",
      });
    }

    const customerSsconfToken = await ensureCustomerSsconfToken(customer.id);
    const label = [miniapp.brand_name, customer.full_name].filter(Boolean).join("-");

    const { data: plan, error: planError } = await supabase
      .from("vpn_plans")
      .select(`
        id,
        name,
        price_mmk,
        data_limit_gb,
        duration_days,
        max_devices,
        allowed_regions,
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

    const { data: activePurchaseOrder, error: activePurchaseError } = await supabase
      .from("vpn_orders")
      .select(`
        *,
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
      .eq("status", "active")
      .eq("order_type", "purchase")
      .limit(1)
      .maybeSingle();

    if (activePurchaseError) {
      console.error("Active purchase check error:", activePurchaseError);
      return res.status(500).json({
        success: false,
        message: "Failed to check active package",
      });
    }

    // Renew/top-up while a package is already active is not supported yet —
    // one active purchase order at a time. Customers must wait for expiry,
    // or contact their reseller, until the renew flow ships in a future version.
    if (activePurchaseOrder) {
      return res.status(409).json({
        success: false,
        message:
          "You already have an active package. Renewing or adding a top-up isn't available yet — please contact your reseller.",
        code: "ACTIVE_PACKAGE_EXISTS",
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

    const { data: createdOrder, error: orderError } = await supabase
      .from("vpn_orders")
      .insert({
        customer_id: customer.id,
        reseller_id: miniapp.reseller_id,
        plan_id: plan.id,

        status: "pending",
        price_mmk: priceMmk,
        commission_percent: commissionPercent,
        commission_amount_mmk: commissionAmountMmk,

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

    const payment = await createOrderPayment({
      order: {
        ...createdOrder,
        commission_percent: commissionPercent,
        reseller_id: miniapp.reseller_id,
        customer_id: customer.id,
      },
      amountMmk: priceMmk,
      reviewStatus: "pending_review",
      source: "miniapp",
      paymentNote: payment_note,
      paymentScreenshotUrl: payment_screenshot_url || null,
    });

    const activation = await activatePendingReviewPurchase({
      order: { ...createdOrder, customer },
      reseller,
      plan,
    });

    const activatedOrder = activation.order || {
      ...createdOrder,
      status: "active",
      expiry_date: activation.expiry_date,
    };

    const { data: insertedKey, error: insertKeyError } = await supabase
      .from("vpn_keys")
      .select(`
        id,
        data_limit_bytes,
        used_bytes,
        vpn_servers (
          id,
          name,
          region,
          region_code,
          display_country,
          display_city,
          flag_emoji,
          server_tier,
          is_default
        )
      `)
      .eq("order_id", createdOrder.id)
      .eq("status", "active")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (insertKeyError || !insertedKey) {
      throw new Error(insertKeyError?.message || "Failed to load provisioned VPN key");
    }

    const currentServer = insertedKey.vpn_servers || null;

    trackMiniAppEvent(req, {
      event_name: "order_submitted",
      reseller_id: miniapp.reseller_id,
      customer_id: customer.id,
      telegram_user_id: telegramUserId,
      order_id: activatedOrder.id,
      payment_id: payment?.id || null,
      plan_id: plan.id,
      server_id: currentServer?.id || null,
      page: "checkout",
      status: "success",
      metadata: {
        price_mmk: priceMmk,
        duration_days: plan.duration_days,
        data_limit_gb: plan.data_limit_gb,
        order_type: "purchase",
        review_status: activatedOrder.review_status,
        payment_status: activatedOrder.payment_status,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Order submitted. Premium access is active while waiting for reseller approval.",
      data: {
        order: {
          id: activatedOrder.id,
          status: activatedOrder.status,
          payment_status: activatedOrder.payment_status,
          review_status: activatedOrder.review_status,
          order_type: activatedOrder.order_type,
          source: activatedOrder.source,
          price_mmk: activatedOrder.price_mmk,
          start_date: activatedOrder.start_date,
          expiry_date: activatedOrder.expiry_date,
          payment_screenshot_url: activatedOrder.payment_screenshot_url,
          payment_note: activatedOrder.payment_note,
          created_at: activatedOrder.created_at,
          plan: createdOrder.vpn_plans,
        },
        current_server: mapServerForMiniApp(currentServer, true),
        outline_key: toPublicOutlineKey(req, customerSsconfToken, insertedKey, label, 0),
      },
    });
  } catch (err) {
    console.error("Mini App order exception:", err);

    if (err instanceof OrderLifecycleError) {
      return res.status(err.status || 400).json({
        success: false,
        message: err.message,
        code: err.code,
      });
    }

    return res.status(500).json({
      success: false,
      message: err.message || "Unexpected server error",
    });
  }
});

// ── POST /:slug/upload-screenshot ────────────────────────────────────────────
// Accepts a multipart image from the miniapp, validates it, and stores it in
// the private Supabase Storage bucket using the service-role key.
// Returns the storage path (not a URL). The anon key is never involved.

router.post(
  "/:slug/upload-screenshot",
  uploadLimiter,
  runUploadMiddleware,
  async (req, res) => {
    try {
      const { slug } = req.params;
      const telegramUserId = req.body.telegram_user_id
        ? Number(req.body.telegram_user_id)
        : null;

      // ── 1. Resolve miniapp ────────────────────────────────────────────────
      const { data: miniapp, error: miniappError } = await supabase
        .from("reseller_miniapps")
        .select("id, reseller_id, miniapp_slug, is_enabled, bot_token_encrypted")
        .eq("miniapp_slug", slug)
        .maybeSingle();

      if (miniappError) {
        console.error("Screenshot upload miniapp lookup:", miniappError);
        return res.status(500).json({ error: "Failed to load Mini App" });
      }
      if (!miniapp) return res.status(404).json({ error: "Mini App not found" });
      if (!miniapp.is_enabled) return res.status(403).json({ error: "Mini App is disabled" });

      // ── 2. Verify Telegram user is a registered customer of this reseller ─
      if (!telegramUserId) {
        return res.status(400).json({ error: "telegram_user_id is required" });
      }

      try {
        verifyMiniAppRequestUser({
          miniapp,
          initData: req.body.init_data,
          expectedTelegramUserId: telegramUserId,
        });
      } catch (authErr) {
        return miniAppAuthResponse(res, authErr);
      }

      const { data: link, error: linkError } = await supabase
        .from("telegram_links")
        .select("id, customer_id, reseller_id")
        .eq("reseller_id", miniapp.reseller_id)
        .eq("telegram_user_id", telegramUserId)
        .maybeSingle();

      if (linkError) {
        console.error("Screenshot upload link lookup:", linkError);
        return res.status(500).json({ error: "Failed to verify customer" });
      }
      if (!link) {
        return res.status(401).json({ error: "Unregistered Telegram user for this Mini App" });
      }

      // ── 3. Confirm a legitimate payment context exists ────────────────────
      // The customer must have at least one order in this reseller's system —
      // proving they completed onboarding (trial created on first auth) and are
      // a real customer, not a spoofed telegram_user_id calling this endpoint
      // directly. A purchase order does not need to exist yet; a trial is enough.
      const { data: anyOrder, error: orderContextError } = await supabase
        .from("vpn_orders")
        .select("id")
        .eq("customer_id", link.customer_id)
        .eq("reseller_id", miniapp.reseller_id)
        .limit(1)
        .maybeSingle();

      if (orderContextError) {
        console.error("Screenshot upload order context check:", orderContextError);
        return res.status(500).json({ error: "Failed to verify order context" });
      }
      if (!anyOrder) {
        return res.status(403).json({ error: "No order context for this customer" });
      }

      // ── 4. Validate the file ──────────────────────────────────────────────
      if (!req.file) {
        return res.status(400).json({ error: "Image file is required" });
      }

      // Magic-byte check: reject files that lie about their Content-Type
      if (!hasValidMagicBytes(req.file.buffer, req.file.mimetype)) {
        return res.status(415).json({ error: "File content does not match its declared image type" });
      }

      // ── 5. Upload to private Supabase Storage with service-role key ───────
      const ext = EXT_MAP[req.file.mimetype] || "jpg";
      const storagePath = `${slug}/${miniapp.reseller_id}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("payment-screenshots")
        .upload(storagePath, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false,
        });

      if (uploadError) {
        console.error("Supabase Storage upload error:", uploadError);
        return res.status(500).json({ error: "Failed to store screenshot" });
      }

      trackMiniAppEvent(req, {
        event_name: "payment_screenshot_uploaded",
        reseller_id: miniapp.reseller_id,
        customer_id: link.customer_id,
        telegram_user_id: telegramUserId,
        page: "checkout",
        status: "success",
      });

      return res.json({ path: storagePath });
    } catch (err) {
      console.error("Screenshot upload exception:", err);
      return res.status(500).json({ error: "Unexpected server error" });
    }
  }
);

export default router;
