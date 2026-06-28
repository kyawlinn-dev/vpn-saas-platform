import express from "express";
import { supabase } from "../../lib/supabase.js";
import { verifyTelegramInitData } from "../../utils/telegramAuth.js";
import { ensureOrderToken } from "../../services/tokenService.js";
import { getActiveServers, ServerAvailabilityError } from "../../services/serverService.js";
import { provisionServersForToken } from "../../services/subscriptionProvisionService.js";

const router = express.Router();

function getWorkerBaseUrl() {
  return String(process.env.PUBLIC_WORKER_BASE_URL || "").trim().replace(/\/$/, "");
}

function buildServerUrls(token, region) {
  const workerBase = getWorkerBaseUrl();

  if (!workerBase) {
    return {
      portal_url: null,
      open_url: null,
      ss_url: null,
      json_url: null,
      ssconf_url: null,
    };
  }

  const encodedToken = encodeURIComponent(token);
  const encodedRegion = encodeURIComponent(region);
  const jsonUrl = `${workerBase}/sub/${encodedToken}/${encodedRegion}.json`;
  const workerHost = workerBase.replace(/^https?:\/\//, "");

  return {
    portal_url: `${workerBase}/t/${encodedToken}`,
    open_url: `${workerBase}/open/${encodedToken}/${encodedRegion}`,
    ss_url: `${workerBase}/sub/${encodedToken}/${encodedRegion}.ss`,
    json_url: jsonUrl,
    ssconf_url: `ssconf://${workerHost}/sub/${encodedToken}/${encodedRegion}.json#NovaNetMM`,
  };
}

async function getLinkedCustomerByTelegramUserId(telegramUserId) {
  const { data, error } = await supabase
    .from("telegram_links")
    .select(`
      telegram_user_id,
      telegram_username,
      trial_used_at,
      trial_order_id,
      customer:vpn_customers(
        id,
        reseller_id,
        full_name,
        telegram_username,
        phone
      )
    `)
    .eq("telegram_user_id", telegramUserId)
    .single();

  if (error || !data?.customer) {
    return null;
  }

  return data;
}

async function getActiveTokenForCustomer(customerId) {
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from("access_tokens")
    .select(`
      id,
      token,
      customer_id,
      reseller_id,
      order_id,
      status,
      expires_at,
      created_at,
      order:vpn_orders(
        id,
        status,
        review_status,
        order_type,
        expiry_date,
        payment_screenshot_url,
        plan:vpn_plans(
          id,
          name,
          duration_days,
          data_limit_gb,
          max_devices,
          price_mmk,
          allowed_regions
        )
      )
    `)
    .eq("customer_id", customerId)
    .eq("status", "active")
    .gte("expires_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data || null;
}

async function getAssignedServersForToken(tokenId, publicToken) {
  const { data, error } = await supabase
    .from("token_server_assignments")
    .select(`
      id,
      is_active,
      server:vpn_servers(
        id,
        name,
        region,
        status
      ),
      vpn_key:vpn_keys(
        id,
        status,
        access_url
      )
    `)
    .eq("token_id", tokenId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  const seenRegions = new Set();
  const servers = [];

  for (const row of data || []) {
    if (
      row.server?.status !== "active" ||
      row.vpn_key?.status !== "active" ||
      !row.server?.region ||
      !row.vpn_key?.access_url
    ) {
      continue;
    }

    const regionKey = String(row.server.region).trim().toLowerCase();
    if (seenRegions.has(regionKey)) {
      continue;
    }

    seenRegions.add(regionKey);
    servers.push({
      id: row.server.id,
      tag: row.server.name,
      region: row.server.region,
      ...buildServerUrls(publicToken, row.server.region),
    });
  }

  return servers;
}

async function listPublicPlans() {
  const { data, error } = await supabase
    .from("vpn_plans")
    .select(`
      id,
      name,
      duration_days,
      data_limit_gb,
      max_devices,
      price_mmk,
      allowed_regions,
      is_active
    `)
    .eq("is_active", true)
    .order("price_mmk", { ascending: true });

  if (error) throw new Error(error.message);
  return data || [];
}

function toDateOnly(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function calcExpiryDate(fromDate, durationDays) {
  const d = new Date(fromDate);
  d.setDate(d.getDate() + Number(durationDays || 30));
  return d;
}

function getPlanRegions(plan) {
  const allowed = Array.isArray(plan?.allowed_regions)
    ? plan.allowed_regions.filter(Boolean)
    : [];

  if (allowed.length > 0) return allowed;
  return ["india", "singapore"];
}

async function getDefaultTrialPlan() {
  const { data, error } = await supabase
    .from("vpn_plans")
    .select("*")
    .eq("is_active", true)
    .ilike("name", "%trial%")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("No active trial plan found");

  return data;
}

async function createCustomerShellFromTelegramUser(user) {
  const resellerId = await getDefaultTrialResellerId();

  const fullName =
    [user.first_name, user.last_name].filter(Boolean).join(" ").trim() ||
    user.username ||
    `Telegram User ${user.id}`;

  const { data, error } = await supabase
    .from("vpn_customers")
    .insert({
      reseller_id: resellerId,
      full_name: fullName,
      telegram_username: user.username || null,
      phone: null,
      status: "active",
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Failed to create customer shell");
  }

  return data;
}

async function getDefaultTrialResellerId() {
  const envResellerId = String(process.env.DEFAULT_TRIAL_RESELLER_ID || "").trim();

  if (envResellerId) {
    const { data, error } = await supabase
      .from("resellers")
      .select("id, status")
      .eq("id", envResellerId)
      .eq("status", "active")
      .maybeSingle();

    if (error) throw new Error(error.message);

    if (!data?.id) {
      throw new Error(
        `DEFAULT_TRIAL_RESELLER_ID is invalid or inactive: ${envResellerId}`
      );
    }

    return data.id;
  }

  const { data, error } = await supabase
    .from("resellers")
    .select("id, status")
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);

  if (!data?.id) {
    throw new Error("No active reseller available for trial assignment");
  }

  return data.id;
}

async function getResellerById(resellerId) {
  const { data, error } = await supabase
    .from("resellers")
    .select("*")
    .eq("id", resellerId)
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Reseller not found");
  }

  return data;
}

async function ensureTelegramLinkedCustomer(verifiedUser) {
  const telegramUserId = Number(verifiedUser.id);

  const existing = await getLinkedCustomerByTelegramUserId(telegramUserId);
  if (existing) return existing;

  const customer = await createCustomerShellFromTelegramUser(verifiedUser);

  const payload = {
    telegram_user_id: telegramUserId,
    telegram_username: verifiedUser.username || null,
    customer_id: customer.id,
    reseller_id: customer.reseller_id || null,
    updated_at: new Date().toISOString(),
  };

  const { error: upsertErr } = await supabase
    .from("telegram_links")
    .upsert(payload, { onConflict: "telegram_user_id" });

  if (upsertErr) {
    const raced = await getLinkedCustomerByTelegramUserId(telegramUserId);
    if (raced) return raced;

    throw new Error(upsertErr.message || "Failed to link Telegram user");
  }

  const linked = await getLinkedCustomerByTelegramUserId(telegramUserId);
  if (!linked) {
    throw new Error("Failed to load linked Telegram customer");
  }

  return linked;
}

async function getTelegramLinkRow(telegramUserId) {
  const { data, error } = await supabase
    .from("telegram_links")
    .select("*")
    .eq("telegram_user_id", telegramUserId)
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Telegram link not found");
  }

  return data;
}

async function getOrderById(orderId) {
  const { data, error } = await supabase
    .from("vpn_orders")
    .select(`
      *,
      customer:vpn_customers(
        id,
        full_name,
        reseller_id,
        telegram_username,
        phone
      ),
      plan:vpn_plans(
        id,
        name,
        duration_days,
        data_limit_gb,
        max_devices,
        price_mmk,
        allowed_regions,
        is_active
      )
    `)
    .eq("id", orderId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data || null;
}

async function createTrialOrderForCustomer({ customer, plan }) {
  const now = new Date();
  const expiryAt = calcExpiryDate(now, plan.duration_days);

  const resellerId = customer.reseller_id || (await getDefaultTrialResellerId());
  const priceMmk = Number(plan.price_mmk || 0);
  const commissionPercent = 20;
  const commissionAmountMmk = Math.floor((priceMmk * commissionPercent) / 100);

  const { data: order, error } = await supabase
    .from("vpn_orders")
    .insert({
      customer_id: customer.id,
      reseller_id: resellerId,
      plan_id: plan.id,
      status: "pending",
      payment_status: "paid",
      order_type: "trial",
      review_status: "confirmed",
      source: "miniapp",
      price_mmk: priceMmk,
      commission_percent: commissionPercent,
      commission_amount_mmk: commissionAmountMmk,
      total_paid_mmk: priceMmk,
      start_date: toDateOnly(now),
      expiry_date: toDateOnly(expiryAt),
      payment_note: "Auto-created Telegram trial",
    })
    .select(`
      *,
      customer:vpn_customers(
        id,
        full_name,
        reseller_id,
        telegram_username,
        phone
      )
    `)
    .single();

  if (error || !order) {
    throw new Error(error?.message || "Failed to create trial order");
  }

  return order;
}

async function activateTrialOrder({ order, plan }) {
  const now = new Date();
  const expiryAt = calcExpiryDate(now, plan.duration_days);
  const regions = getPlanRegions(plan);

  const selectedServers = await getActiveServers({
    regions,
    limit: regions.length,
  });

  if (!selectedServers.length) {
    throw new ServerAvailabilityError("No active server available", "NO_ACTIVE_SERVER");
  }

  const resellerId =
    order.reseller_id || order.customer?.reseller_id || (await getDefaultTrialResellerId());

  const token = await ensureOrderToken({
    customerId: order.customer_id,
    resellerId,
    orderId: order.id,
    expiresAt: expiryAt.toISOString(),
  });

  await provisionServersForToken({
    token,
    order,
    customer: order.customer,
    reseller: { id: resellerId },
    plan,
    servers: selectedServers,
  });

  const { error: updateErr } = await supabase
    .from("vpn_orders")
    .update({
      status: "active",
      activated_at: now.toISOString(),
      start_date: toDateOnly(now),
      expiry_date: toDateOnly(expiryAt),
      stopped_at: null,
    })
    .eq("id", order.id);

  if (updateErr) throw new Error(updateErr.message);

  return {
    token: token.token,
    expires_at: expiryAt.toISOString(),
  };
}

async function ensureTrialForTelegramUser({ verifiedUser, linked }) {
  const telegramUserId = Number(verifiedUser.id);
  const linkRow = await getTelegramLinkRow(telegramUserId);

  if (linkRow.trial_order_id) {
    const existingOrder = await getOrderById(linkRow.trial_order_id);
    if (existingOrder) {
      return {
        orderId: existingOrder.id,
        plan: existingOrder.plan,
        reused: true,
      };
    }
  }

  if (linkRow.trial_used_at) {
    return {
      orderId: null,
      plan: null,
      reused: true,
    };
  }

  const plan = await getDefaultTrialPlan();
  const order = await createTrialOrderForCustomer({
    customer: linked.customer,
    plan,
  });

  await activateTrialOrder({
    order,
    plan,
  });

  const { error: updateErr } = await supabase
    .from("telegram_links")
    .update({
      trial_used_at: new Date().toISOString(),
      trial_order_id: order.id,
      telegram_username: verifiedUser.username || null,
      updated_at: new Date().toISOString(),
    })
    .eq("telegram_user_id", telegramUserId);

  if (updateErr) throw new Error(updateErr.message);

  return {
    orderId: order.id,
    plan,
    reused: false,
  };
}

async function getPendingReviewPurchaseOrder(customerId) {
  const { data, error } = await supabase
    .from("vpn_orders")
    .select(`
      *,
      customer:vpn_customers(
        id,
        full_name,
        reseller_id,
        telegram_username,
        phone
      ),
      plan:vpn_plans(
        id,
        name,
        duration_days,
        data_limit_gb,
        max_devices,
        price_mmk,
        allowed_regions,
        is_active
      )
    `)
    .eq("customer_id", customerId)
    .eq("order_type", "purchase")
    .eq("review_status", "pending_review")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data || null;
}

async function createImmediatePurchaseOrder({
  customer,
  reseller,
  plan,
  paymentScreenshotUrl,
  paymentNote,
}) {
  const now = new Date();
  const expiryAt = calcExpiryDate(now, plan.duration_days);
  const priceMmk = Number(plan.price_mmk || 0);
  const commissionPercent = Number(reseller.commission_percent || 20);
  const commissionAmountMmk = Math.round((priceMmk * commissionPercent) / 100);

  const { data: order, error } = await supabase
    .from("vpn_orders")
    .insert({
      customer_id: customer.id,
      reseller_id: reseller.id,
      plan_id: plan.id,
      status: "active",
      payment_status: "unpaid",
      order_type: "purchase",
      review_status: "pending_review",
      source: "miniapp",
      payment_screenshot_url: paymentScreenshotUrl,
      payment_note: paymentNote || "",
      price_mmk: priceMmk,
      total_paid_mmk: 0,
      commission_percent: commissionPercent,
      commission_amount_mmk: commissionAmountMmk,
      activated_at: now.toISOString(),
      start_date: toDateOnly(now),
      expiry_date: toDateOnly(expiryAt),
      stopped_at: null,
    })
    .select(`
      *,
      customer:vpn_customers(
        id,
        full_name,
        reseller_id,
        telegram_username,
        phone
      )
    `)
    .single();

  if (error || !order) {
    throw new Error(error?.message || "Failed to create purchase order");
  }

  return order;
}

async function provisionImmediatePurchaseOrder({ order, customer, reseller, plan }) {
  const now = new Date();
  const expiryAt = calcExpiryDate(now, plan.duration_days);
  const regions = getPlanRegions(plan);

  const selectedServers = await getActiveServers({
    regions,
    limit: regions.length,
  });

  if (!selectedServers.length) {
    throw new ServerAvailabilityError("No active server available", "NO_ACTIVE_SERVER");
  }

  if (regions.length && selectedServers.length < regions.length) {
    const availableRegions = new Set(
      selectedServers.map((server) => String(server.region || "").toLowerCase())
    );

    const missingRegions = regions.filter(
      (region) => !availableRegions.has(String(region || "").toLowerCase())
    );

    throw new ServerAvailabilityError(
      `Missing active server capacity for region(s): ${missingRegions.join(", ")}`,
      "MISSING_REGION_CAPACITY"
    );
  }

  const token = await ensureOrderToken({
    customerId: order.customer_id,
    resellerId: order.reseller_id,
    orderId: order.id,
    expiresAt: expiryAt.toISOString(),
  });

  await provisionServersForToken({
    token,
    order,
    customer,
    reseller,
    plan,
    servers: selectedServers,
  });

  return {
    token: token.token,
    expires_at: expiryAt.toISOString(),
  };
}

function normalizePlanListForPackages(plans) {
  return (plans || []).filter((plan) => {
    const name = String(plan?.name || "").toLowerCase();
    return !name.includes("trial");
  });
}

router.post("/purchase", async (req, res) => {
  try {
    const initData = String(req.body?.initData || "").trim();
    const planId = String(req.body?.plan_id || "").trim();
    const paymentScreenshotUrl = String(req.body?.payment_screenshot_url || "").trim();
    const paymentNote = String(req.body?.payment_note || "").trim();

    if (!initData) {
      return res.status(400).json({ error: "Missing initData" });
    }

    if (!planId) {
      return res.status(400).json({ error: "Missing plan_id" });
    }

    if (!paymentScreenshotUrl) {
      return res.status(400).json({ error: "Missing payment_screenshot_url" });
    }

    const botToken = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
    if (!botToken) {
      return res.status(500).json({ error: "Missing TELEGRAM_BOT_TOKEN" });
    }

    const verified = verifyTelegramInitData(initData, botToken);
    const linked = await ensureTelegramLinkedCustomer(verified.user);

    const existingPendingReview = await getPendingReviewPurchaseOrder(linked.customer.id);
    if (existingPendingReview) {
      return res.status(409).json({
        error: "You already have a purchase waiting for reseller review",
        order_id: existingPendingReview.id,
        review_status: existingPendingReview.review_status,
      });
    }

    const { data: plan, error: planError } = await supabase
      .from("vpn_plans")
      .select("*")
      .eq("id", planId)
      .eq("is_active", true)
      .single();

    if (planError || !plan) {
      return res.status(400).json({ error: "Invalid or inactive plan" });
    }

    if (String(plan.name || "").toLowerCase().includes("trial")) {
      return res.status(400).json({ error: "Trial plan cannot be purchased here" });
    }

    const resellerId = linked.customer?.reseller_id || (await getDefaultTrialResellerId());
    const reseller = await getResellerById(resellerId);

    const order = await createImmediatePurchaseOrder({
      customer: linked.customer,
      reseller,
      plan,
      paymentScreenshotUrl,
      paymentNote,
    });

    const provisioned = await provisionImmediatePurchaseOrder({
      order,
      customer: linked.customer,
      reseller,
      plan,
    });

    const activeToken = await getActiveTokenForCustomer(linked.customer.id);
    const servers = activeToken
      ? await getAssignedServersForToken(activeToken.id, activeToken.token)
      : [];

    return res.status(201).json({
      ok: true,
      message: "Premium access created and waiting for reseller review",
      review_status: "pending_review",
      order: {
        id: order.id,
        status: "active",
        order_type: "purchase",
        review_status: "pending_review",
        payment_status: "unpaid",
        expiry_date: order.expiry_date,
        payment_screenshot_url: order.payment_screenshot_url,
      },
      access: {
        token: provisioned.token,
        expires_at: provisioned.expires_at,
        portal_url: getWorkerBaseUrl()
          ? `${getWorkerBaseUrl()}/t/${encodeURIComponent(provisioned.token)}`
          : null,
      },
      plan,
      servers,
      current_server: servers[0] || null,
    });
  } catch (error) {
    console.error("POST /api/public/telegram-miniapp/purchase crash:", error);

    const message = error.message || "Internal server error";

    if (
      message.includes("Missing Telegram hash") ||
      message.includes("Invalid Telegram initData signature") ||
      message.includes("Telegram initData expired") ||
      message.includes("Missing Telegram user")
    ) {
      return res.status(401).json({ error: message });
    }

    if (
      message.includes("No active server available") ||
      message.includes("Missing active server capacity")
    ) {
      return res.status(409).json({ error: message });
    }

    return res.status(500).json({ error: message });
  }
});

router.post("/auth", async (req, res) => {
  try {
    const initData = String(req.body?.initData || "").trim();
    if (!initData) {
      return res.status(400).json({ error: "Missing initData" });
    }

    const botToken = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
    if (!botToken) {
      return res.status(500).json({ error: "Missing TELEGRAM_BOT_TOKEN" });
    }

    const verified = verifyTelegramInitData(initData, botToken);
    const allPlans = await listPublicPlans();
    const plans = normalizePlanListForPackages(allPlans);

    const linked = await ensureTelegramLinkedCustomer(verified.user);

    let activeToken = await getActiveTokenForCustomer(linked.customer.id);

    if (!activeToken) {
      await ensureTrialForTelegramUser({
        verifiedUser: verified.user,
        linked,
      });

      activeToken = await getActiveTokenForCustomer(linked.customer.id);
    }

    if (!activeToken) {
      return res.json({
        ok: true,
        state: "no_active_access",
        telegram_user: {
          id: verified.user.id,
          username: verified.user.username || null,
          first_name: verified.user.first_name || null,
          last_name: verified.user.last_name || null,
        },
        customer: linked.customer,
        access: null,
        plan: null,
        order: null,
        servers: [],
        current_server: null,
        plans,
      });
    }

    const servers = await getAssignedServersForToken(
      activeToken.id,
      activeToken.token
    );

    return res.json({
      ok: true,
      state: servers.length > 0 ? "active" : "active_no_servers",
      telegram_user: {
        id: verified.user.id,
        username: verified.user.username || null,
        first_name: verified.user.first_name || null,
        last_name: verified.user.last_name || null,
      },
      customer: linked.customer,
      access: {
        token: activeToken.token,
        expires_at: activeToken.expires_at,
        portal_url: getWorkerBaseUrl()
          ? `${getWorkerBaseUrl()}/t/${encodeURIComponent(activeToken.token)}`
          : null,
      },
      order: activeToken.order
        ? {
            id: activeToken.order.id,
            status: activeToken.order.status,
            review_status: activeToken.order.review_status || null,
            order_type: activeToken.order.order_type || null,
            payment_screenshot_url: activeToken.order.payment_screenshot_url || null,
            expiry_date: activeToken.order.expiry_date || null,
          }
        : null,
      plan: activeToken.order?.plan || null,
      servers,
      current_server: servers[0] || null,
      plans,
    });
  } catch (error) {
    console.error("POST /api/public/telegram-miniapp/auth crash:", error);

    const message = error.message || "Internal server error";

    if (
      message.includes("Missing Telegram hash") ||
      message.includes("Invalid Telegram initData signature") ||
      message.includes("Telegram initData expired") ||
      message.includes("Missing Telegram user")
    ) {
      return res.status(401).json({ error: message });
    }

    if (
      message.includes("No active server available") ||
      message.includes("No active trial plan found")
    ) {
      return res.status(409).json({ error: message });
    }

    return res.status(500).json({ error: message });
  }
});

export default router;