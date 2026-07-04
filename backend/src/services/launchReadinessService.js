import { supabase } from "../lib/supabase.js";
import * as botManager from "../bot/manager.js";

const SCREENSHOT_BUCKET = "payment-screenshots";

function addCheck(checks, id, status, label, message, details = undefined) {
  checks.push({
    id,
    status,
    label,
    message,
    ...(details ? { details } : {}),
  });
}

function summarize(checks) {
  const summary = checks.reduce(
    (acc, check) => {
      acc[check.status] += 1;
      acc.total += 1;
      return acc;
    },
    { pass: 0, warn: 0, fail: 0, total: 0 }
  );

  return {
    ready: summary.fail === 0,
    summary,
  };
}

function isNonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeUrl(value) {
  return String(value || "").trim().replace(/\/$/, "");
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isReadyServer(server) {
  const status = String(server?.status || "").toLowerCase();
  const maxKeys = toNumber(server?.max_active_keys, 0);
  const activeKeys = toNumber(server?.current_active_keys, 0);

  return (
    status === "active" &&
    isNonEmpty(server?.outline_api_url) &&
    isNonEmpty(server?.outline_cert_sha256) &&
    maxKeys > 0 &&
    activeKeys < maxKeys
  );
}

function isValidPlan(plan) {
  return (
    plan &&
    Number.isFinite(Number(plan.price_mmk)) &&
    Number(plan.price_mmk) >= 0 &&
    Number.isInteger(Number(plan.duration_days)) &&
    Number(plan.duration_days) > 0 &&
    Number.isInteger(Number(plan.max_devices)) &&
    Number(plan.max_devices) > 0 &&
    Number.isFinite(Number(plan.data_limit_gb)) &&
    Number(plan.data_limit_gb) >= 0
  );
}

function getBotStatus(row) {
  const runtimeStatus = botManager.getRuntimeStatus(row?.reseller_id);
  const tokenSaved = Boolean(row?.bot_token_encrypted);
  const tokenValid = Boolean(
    row?.bot_username ||
      row?.bot_id ||
      runtimeStatus.bot_username ||
      runtimeStatus.bot_id
  );
  const webhookRegistered = Boolean(row?.bot_connected && runtimeStatus.webhook_registered);

  return {
    token_saved: tokenSaved,
    token_valid: tokenValid,
    webhook_registered: webhookRegistered,
    running: runtimeStatus.running,
    connected: Boolean(tokenSaved && tokenValid && webhookRegistered && runtimeStatus.running),
    bot_username: runtimeStatus.bot_username || row?.bot_username || null,
    bot_id: runtimeStatus.bot_id || row?.bot_id || null,
    webhook_registered_at: runtimeStatus.webhook_registered_at,
  };
}

async function loadWorkspace(resellerId) {
  const { data, error } = await supabase
    .from("reseller_miniapps")
    .select(
      `
      reseller_id,
      miniapp_slug,
      brand_name,
      brand_logo_url,
      support_username,
      payment_info,
      trial_enabled,
      trial_data_limit_gb,
      trial_duration_days,
      is_enabled,
      bot_token_encrypted,
      bot_connected,
      bot_username,
      bot_id
    `
    )
    .eq("reseller_id", resellerId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data || null;
}

async function loadPlans() {
  const { data, error } = await supabase
    .from("vpn_plans")
    .select(
      "id, name, price_mmk, data_limit_gb, duration_days, max_devices, is_active, is_trial, sort_order"
    )
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(error.message);
  return data || [];
}

async function loadServers() {
  const { data, error } = await supabase
    .from("vpn_servers")
    .select(
      "id, name, status, outline_api_url, outline_cert_sha256, current_active_keys, max_active_keys, is_default, last_error"
    )
    .order("is_default", { ascending: false })
    .order("current_active_keys", { ascending: true });

  if (error) throw new Error(error.message);
  return data || [];
}

async function checkStorageBucket(checks) {
  try {
    const { data, error } = await supabase.storage.getBucket(SCREENSHOT_BUCKET);

    if (error) {
      addCheck(
        checks,
        "payment_screenshot_storage",
        "fail",
        "Payment screenshot storage",
        `Supabase Storage bucket "${SCREENSHOT_BUCKET}" is not reachable. Create it before launch.`
      );
      return;
    }

    if (data?.public) {
      addCheck(
        checks,
        "payment_screenshot_storage",
        "fail",
        "Payment screenshot storage",
        `Bucket "${SCREENSHOT_BUCKET}" exists but is public. Payment screenshots should stay private.`
      );
      return;
    }

    addCheck(
      checks,
      "payment_screenshot_storage",
      "pass",
      "Payment screenshot storage",
      `Private bucket "${SCREENSHOT_BUCKET}" is available.`
    );
  } catch (error) {
    addCheck(
      checks,
      "payment_screenshot_storage",
      "warn",
      "Payment screenshot storage",
      `Storage bucket "${SCREENSHOT_BUCKET}" must be verified manually.`
    );
  }
}

function addEnvironmentChecks(checks) {
  const miniappUrl = normalizeUrl(process.env.TELEGRAM_MINIAPP_URL || process.env.MINIAPP_URL);
  const webhookBaseUrl = normalizeUrl(process.env.WEBHOOK_BASE_URL);
  const subscriptionBaseUrl = normalizeUrl(process.env.PUBLIC_SUBSCRIPTION_BASE_URL);
  const workerBaseUrl = normalizeUrl(process.env.PUBLIC_WORKER_BASE_URL);
  const encryptionKey = String(process.env.BOT_TOKEN_ENCRYPTION_KEY || "").trim();

  if (miniappUrl && isHttpsUrl(miniappUrl)) {
    addCheck(checks, "miniapp_url", "pass", "Telegram Mini App URL", "Mini App URL is configured with HTTPS.");
  } else if (miniappUrl) {
    addCheck(checks, "miniapp_url", "fail", "Telegram Mini App URL", "Mini App URL is configured but must use HTTPS for Telegram launch.");
  } else {
    addCheck(checks, "miniapp_url", "fail", "Telegram Mini App URL", "Set TELEGRAM_MINIAPP_URL or MINIAPP_URL before launch.");
  }

  if (webhookBaseUrl && isHttpsUrl(webhookBaseUrl)) {
    addCheck(checks, "webhook_base_url", "pass", "Telegram webhook base URL", "WEBHOOK_BASE_URL is configured with HTTPS.");
  } else if (webhookBaseUrl) {
    addCheck(checks, "webhook_base_url", "fail", "Telegram webhook base URL", "WEBHOOK_BASE_URL is configured but must be public HTTPS.");
  } else {
    addCheck(checks, "webhook_base_url", "fail", "Telegram webhook base URL", "Set WEBHOOK_BASE_URL so Telegram can deliver bot updates.");
  }

  if (subscriptionBaseUrl) {
    addCheck(checks, "subscription_base_url", "pass", "Subscription public URL", "PUBLIC_SUBSCRIPTION_BASE_URL is configured for token portal links.");
  } else {
    addCheck(checks, "subscription_base_url", "warn", "Subscription public URL", "PUBLIC_SUBSCRIPTION_BASE_URL is missing; legacy token portal links may not open correctly.");
  }

  if (workerBaseUrl) {
    addCheck(checks, "worker_base_url", "pass", "Worker portal URL", "PUBLIC_WORKER_BASE_URL is configured for Outline import bridge links.");
  } else {
    addCheck(checks, "worker_base_url", "warn", "Worker portal URL", "PUBLIC_WORKER_BASE_URL is missing; Outline import bridge links may fall back to direct ssconf links.");
  }

  if (/^[a-fA-F0-9]{64}$/.test(encryptionKey)) {
    addCheck(checks, "bot_token_encryption_key", "pass", "Bot token encryption key", "BOT_TOKEN_ENCRYPTION_KEY is present and has the expected length.");
  } else {
    addCheck(checks, "bot_token_encryption_key", "fail", "Bot token encryption key", "BOT_TOKEN_ENCRYPTION_KEY must be a 64-character hex string.");
  }
}

function addWorkspaceChecks(checks, reseller, workspace) {
  if (reseller?.status === "active") {
    addCheck(checks, "reseller_account", "pass", "Reseller account", "Logged-in reseller account is active.");
  } else {
    addCheck(checks, "reseller_account", "fail", "Reseller account", "Reseller account is not active.");
  }

  if (!workspace) {
    addCheck(checks, "workspace", "fail", "Reseller workspace", "No reseller Mini App workspace exists.");
    return;
  }

  addCheck(
    checks,
    "workspace",
    workspace.is_enabled ? "pass" : "fail",
    "Reseller workspace",
    workspace.is_enabled ? "Workspace is enabled." : "Workspace exists but is disabled."
  );

  addCheck(
    checks,
    "miniapp_slug",
    isNonEmpty(workspace.miniapp_slug) ? "pass" : "fail",
    "Mini App slug",
    isNonEmpty(workspace.miniapp_slug)
      ? "Mini App slug is configured."
      : "Set a Mini App slug so bot and Mini App routes resolve the reseller."
  );

  addCheck(
    checks,
    "brand_name",
    isNonEmpty(workspace.brand_name) ? "pass" : "fail",
    "Brand name",
    isNonEmpty(workspace.brand_name)
      ? "Brand name is configured."
      : "Set the reseller brand name before customers open the Mini App."
  );

  addCheck(
    checks,
    "support_contact",
    isNonEmpty(workspace.support_username) ? "pass" : "warn",
    "Support contact",
    isNonEmpty(workspace.support_username)
      ? "Support username/link is configured."
      : "Add a support username or link so customers can reach you."
  );

  const paymentInfo = Array.isArray(workspace.payment_info) ? workspace.payment_info : [];
  const usablePaymentInfo = paymentInfo.filter(
    (item) =>
      isNonEmpty(item?.method) &&
      isNonEmpty(item?.account_name) &&
      isNonEmpty(item?.account_number)
  );

  addCheck(
    checks,
    "payment_info",
    usablePaymentInfo.length > 0 ? "pass" : "fail",
    "Payment instructions",
    usablePaymentInfo.length > 0
      ? `${usablePaymentInfo.length} payment method(s) are configured.`
      : "Add payment method, account name, and account number for manual payments."
  );
}

function addBotChecks(checks, workspace) {
  if (!workspace) return;

  const botStatus = getBotStatus(workspace);

  addCheck(
    checks,
    "bot_token",
    botStatus.token_saved ? "pass" : "fail",
    "Telegram bot token saved",
    botStatus.token_saved
      ? "Bot token is saved securely."
      : "Save the reseller Telegram bot token before launch."
  );

  addCheck(
    checks,
    "bot_identity",
    botStatus.token_valid ? "pass" : "fail",
    "Telegram bot identity",
    botStatus.token_valid
      ? `Telegram bot identity was detected${botStatus.bot_username ? ` as @${botStatus.bot_username}` : ""}.`
      : "Bot username/id has not been detected. Re-save a valid token or restart the backend."
  );

  addCheck(
    checks,
    "bot_webhook",
    botStatus.webhook_registered ? "pass" : "fail",
    "Telegram webhook",
    botStatus.webhook_registered
      ? "Webhook is registered in the running bot manager."
      : "Webhook is not registered in the running bot manager."
  );

  addCheck(
    checks,
    "bot_runtime",
    botStatus.running && botStatus.connected ? "pass" : "fail",
    "Bot runtime",
    botStatus.running && botStatus.connected
      ? "Bot is running and connected in this backend process."
      : "Bot is not fully connected in this backend process."
  );

  addCheck(
    checks,
    "bot_commands",
    botStatus.running ? "pass" : "warn",
    "Bot commands/menu",
    botStatus.running
      ? "Bot startup attempts to register /start, /app, and the Mini App menu button."
      : "Command/menu registration cannot be confirmed until the bot is running."
  );
}

function addPlanChecks(checks, plans, workspace) {
  const paidPlans = plans.filter((plan) => !plan.is_trial && Number(plan.price_mmk) > 0);
  const validPaidPlans = paidPlans.filter(isValidPlan);

  addCheck(
    checks,
    "paid_plans",
    validPaidPlans.length > 0 ? "pass" : "fail",
    "Paid packages",
    validPaidPlans.length > 0
      ? `${validPaidPlans.length} active paid package(s) are ready.`
      : "Create at least one active non-trial paid plan with price, duration, devices, and data limit."
  );

  if (paidPlans.length > validPaidPlans.length) {
    addCheck(
      checks,
      "paid_plan_fields",
      "warn",
      "Paid package fields",
      "Some active paid plans have incomplete checkout/provisioning fields."
    );
  } else if (validPaidPlans.length > 0) {
    addCheck(
      checks,
      "paid_plan_fields",
      "pass",
      "Paid package fields",
      "Active paid plans include required checkout/provisioning fields."
    );
  }

  if (!workspace?.trial_enabled) {
    addCheck(checks, "trial_plan", "pass", "Trial package", "Trial is disabled, so no trial plan is required.");
    return;
  }

  const trialPlans = plans.filter((plan) => plan.is_trial);
  const validTrialPlans = trialPlans.filter(isValidPlan);
  const trialSettingsOk =
    Number(workspace.trial_data_limit_gb) > 0 && Number(workspace.trial_duration_days) > 0;

  addCheck(
    checks,
    "trial_plan",
    validTrialPlans.length > 0 ? "pass" : "fail",
    "Trial package",
    validTrialPlans.length > 0
      ? "Active trial plan is configured."
      : "Trial is enabled but no valid active trial plan exists."
  );

  addCheck(
    checks,
    "trial_settings",
    trialSettingsOk ? "pass" : "fail",
    "Trial display settings",
    trialSettingsOk
      ? "Trial duration and data limit are configured in the workspace."
      : "Trial is enabled but workspace trial duration/data limit is missing."
  );
}

function addServerChecks(checks, servers, workspace) {
  const readyServers = servers.filter(isReadyServer);
  const activeServers = servers.filter((server) => String(server.status || "").toLowerCase() === "active");
  const defaultReady = readyServers.some((server) => Boolean(server.is_default));

  addCheck(
    checks,
    "outline_servers",
    readyServers.length > 0 ? "pass" : "fail",
    "Outline servers",
    readyServers.length > 0
      ? `${readyServers.length} active Outline server(s) have API config and capacity.`
      : "Add at least one active Outline server with API URL, cert SHA-256, and available capacity."
  );

  if (activeServers.length > readyServers.length) {
    addCheck(
      checks,
      "outline_server_config",
      readyServers.length > 0 ? "warn" : "fail",
      "Outline server configuration",
      "One or more active servers are missing API config, cert SHA-256, or available capacity."
    );
  } else if (readyServers.length > 0) {
    addCheck(
      checks,
      "outline_server_config",
      "pass",
      "Outline server configuration",
      "Active servers look provisionable."
    );
  }

  addCheck(
    checks,
    "default_server",
    defaultReady ? "pass" : readyServers.length > 0 ? "warn" : "fail",
    "Default server selection",
    defaultReady
      ? "A ready default server is available."
      : readyServers.length > 0
        ? "No ready default server is marked; the system will use the least-loaded ready server."
        : "No ready server can be selected for trial or paid provisioning."
  );

  if (workspace?.trial_enabled) {
    addCheck(
      checks,
      "trial_server",
      readyServers.length > 0 ? "pass" : "fail",
      "Trial server provisioning",
      readyServers.length > 0
        ? "Trial key provisioning can select an active server."
        : "Trial is enabled but no ready active server exists."
    );
  }
}

function addLifecycleChecks(checks) {
  addCheck(
    checks,
    "paid_lifecycle",
    "pass",
    "Paid order lifecycle",
    "Paid Mini App purchases use orderLifecycleService, which stops trials and blocks duplicate active paid orders."
  );

  addCheck(
    checks,
    "auto_stop_job",
    "pass",
    "Expiry cleanup job",
    "Backend startup schedules the hourly auto-stop job for expired active orders."
  );
}

export async function getResellerLaunchReadiness(reseller) {
  const checks = [];
  const [workspace, plans, servers] = await Promise.all([
    loadWorkspace(reseller.id),
    loadPlans(),
    loadServers(),
  ]);

  addWorkspaceChecks(checks, reseller, workspace);
  addEnvironmentChecks(checks);
  addBotChecks(checks, workspace);
  addPlanChecks(checks, plans, workspace);
  addServerChecks(checks, servers, workspace);
  addLifecycleChecks(checks);
  await checkStorageBucket(checks);

  const result = summarize(checks);

  return {
    success: true,
    ready: result.ready,
    summary: result.summary,
    data: {
      reseller_id: reseller.id,
      miniapp_slug: workspace?.miniapp_slug || null,
      workspace_enabled: Boolean(workspace?.is_enabled),
      bot_status: workspace ? getBotStatus(workspace) : null,
    },
    checks,
  };
}

export async function getAdminLaunchReadiness() {
  const checks = [];
  const [plans, servers, resellersResult, miniappsResult] = await Promise.all([
    loadPlans(),
    loadServers(),
    supabase.from("resellers").select("id, status"),
    supabase
      .from("reseller_miniapps")
      .select("reseller_id, is_enabled, bot_token_encrypted, bot_connected, bot_username, bot_id"),
  ]);

  if (resellersResult.error) throw new Error(resellersResult.error.message);
  if (miniappsResult.error) throw new Error(miniappsResult.error.message);

  const resellers = resellersResult.data || [];
  const miniapps = miniappsResult.data || [];
  const activeResellers = resellers.filter((row) => row.status === "active");
  const enabledMiniapps = miniapps.filter((row) => row.is_enabled);
  const connectedBots = enabledMiniapps.filter((row) => getBotStatus(row).connected);

  addCheck(
    checks,
    "active_resellers",
    activeResellers.length > 0 ? "pass" : "fail",
    "Active resellers",
    activeResellers.length > 0
      ? `${activeResellers.length} active reseller account(s) exist.`
      : "Create at least one active reseller account."
  );

  addCheck(
    checks,
    "enabled_workspaces",
    enabledMiniapps.length > 0 ? "pass" : "fail",
    "Enabled reseller workspaces",
    enabledMiniapps.length > 0
      ? `${enabledMiniapps.length} enabled workspace(s) exist.`
      : "Enable at least one reseller Mini App workspace."
  );

  addEnvironmentChecks(checks);
  addPlanChecks(checks, plans, null);
  addServerChecks(checks, servers, null);
  addLifecycleChecks(checks);
  await checkStorageBucket(checks);

  addCheck(
    checks,
    "bot_manager",
    connectedBots.length > 0 ? "pass" : "warn",
    "Bot manager",
    connectedBots.length > 0
      ? `${connectedBots.length} reseller bot(s) are connected in this backend process.`
      : "No reseller bot is currently connected in this backend process."
  );

  const result = summarize(checks);

  return {
    success: true,
    ready: result.ready,
    summary: result.summary,
    data: {
      active_reseller_count: activeResellers.length,
      enabled_workspace_count: enabledMiniapps.length,
      connected_bot_count: connectedBots.length,
    },
    checks,
  };
}

