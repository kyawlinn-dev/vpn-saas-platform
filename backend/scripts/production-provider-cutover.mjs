// Production-only Outline -> Marzneshin migration. Dry-run unless --execute.
// Commands: prepare | audit | migrate [--limit=N]
import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const PROD_REF = "daenwuszqdfkbjiatsjs";
const DEV_REF = "huqmzvlzfcexycdrsxpn";
const HOSTS = ["168.144.133.227", "107.191.53.200", "165.22.242.245", "139.59.126.185"];
const args = process.argv.slice(2);
const command = args[0];
const execute = args.includes("--execute");
const limitArg = args.find((x) => x.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.slice(8)) : null;
if (!["prepare", "audit", "migrate"].includes(command) ||
    (limit !== null && (!Number.isSafeInteger(limit) || limit < 1))) {
  throw new Error("Usage: node scripts/production-provider-cutover.mjs prepare|audit|migrate [--limit=N] [--execute]");
}

const prodEnv = dotenv.parse(fs.readFileSync(".env"));
const devEnv = dotenv.parse(fs.readFileSync(".env.local"));
if (!prodEnv.SUPABASE_URL.includes(PROD_REF) || !devEnv.SUPABASE_URL.includes(DEV_REF)) {
  throw new Error("Unexpected Supabase project; refusing to run");
}
process.env.NODE_ENV = "production";
process.env.SUPABASE_URL = prodEnv.SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = prodEnv.SUPABASE_SERVICE_ROLE_KEY;
const prod = createClient(prodEnv.SUPABASE_URL, prodEnv.SUPABASE_SERVICE_ROLE_KEY);
const dev = createClient(devEnv.SUPABASE_URL, devEnv.SUPABASE_SERVICE_ROLE_KEY);

function rows(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data || [];
}

function productionKey() {
  const line = execFileSync("ssh", ["-o", "BatchMode=yes", "root@178.128.127.163",
    "grep '^BOT_TOKEN_ENCRYPTION_KEY=' /var/www/novanet/backend/.env.production"],
  { encoding: "utf8", timeout: 15000 }).trim();
  const key = dotenv.parse(line).BOT_TOKEN_ENCRYPTION_KEY;
  if (!/^[0-9a-f]{64}$/i.test(key || "")) throw new Error("Production encryption key unavailable");
  return key;
}

function decryptWithKey(stored, hexKey) {
  const [iv, tag, body] = stored.split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", Buffer.from(hexKey, "hex"), Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(body, "hex")), decipher.final()]).toString("utf8");
}

function encryptWithKey(plaintext, hexKey) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(hexKey, "hex"), iv);
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${body.toString("hex")}`;
}

const { data: allProd, error: prodError } = await prod.from("vpn_servers").select("*").in("host_ip", HOSTS);
if (prodError) throw prodError;
const outlineByHost = new Map(allProd.filter((s) => s.panel_type === "outline" && s.status === "active")
  .map((s) => [s.host_ip, s]));
const panelByHost = new Map(allProd.filter((s) => s.panel_type === "marzneshin")
  .map((s) => [s.host_ip, s]));

if (command === "prepare") {
  const devRows = rows(await dev.from("vpn_servers").select("*")
    .eq("panel_type", "marzneshin").in("host_ip", HOSTS).eq("status", "active"), "dev servers");
  const devByHost = new Map(devRows.map((s) => [s.host_ip, s]));
  if (HOSTS.some((host) => !devByHost.has(host))) throw new Error("Missing development panel server");
  if (!execute) {
    console.log(JSON.stringify({ dry_run: true, command, existing: [...panelByHost.keys()],
      to_create: HOSTS.filter((host) => !panelByHost.has(host)) }));
  } else {
    const prodKey = productionKey();
    process.env.BOT_TOKEN_ENCRYPTION_KEY = prodKey;
    const { testServer } = await import("../src/services/vpnProviderService.js");
    for (const host of HOSTS) {
      if (panelByHost.has(host)) continue;
      const template = devByHost.get(host);
      const source = outlineByHost.get(host);
      if (!source || !template.panel_password_encrypted ||
          !template.marzneshin_service_ids?.length ||
          !template.marzneshin_vless_service_ids?.length ||
          (template.server_tier === "trial" && !template.marzneshin_vless_trial_service_ids?.length)) {
        throw new Error(`Provider metadata incomplete on ${host}`);
      }
      const password = decryptWithKey(template.panel_password_encrypted, devEnv.BOT_TOKEN_ENCRYPTION_KEY);
      await testServer({ ...template, _panel_password: password });
      const row = {
        name: template.server_tier === "trial" ? source.name : template.name,
        provider: template.provider, region: template.region, region_code: template.region_code,
        host_ip: host, status: "provisioning", is_active: false, is_default: false,
        max_active_keys: template.max_active_keys, current_active_keys: 0,
        display_country: template.display_country || source.display_country,
        display_city: template.display_city || source.display_city,
        flag_emoji: template.flag_emoji || source.flag_emoji,
        sort_order: template.sort_order, server_tier: template.server_tier,
        panel_type: "marzneshin", panel_url: template.panel_url,
        panel_public_url: template.panel_public_url, panel_username: template.panel_username,
        panel_password_encrypted: encryptWithKey(password, prodKey),
        marzneshin_service_ids: template.marzneshin_service_ids,
        marzneshin_vless_service_ids: template.marzneshin_vless_service_ids,
        marzneshin_vless_trial_service_ids: template.marzneshin_vless_trial_service_ids,
      };
      const inserted = rows(await prod.from("vpn_servers").insert(row).select("id"), "panel server insert");
      console.log(JSON.stringify({ prepared: host, server_id: inserted[0]?.id }));
    }
  }
}

if (command === "audit" || command === "migrate") {
  const { getTransferMetrics, getKey, deleteKey } = await import("../src/services/vpnProviderService.js");
  const { getOrderQuotaSnapshot, migrateActiveOrderToServer, resolveRemainingKeyLimitBytes } =
    await import("../src/services/subscriptionProvisionService.js");
  const { resolveShadowsocksConfig } = await import("../src/services/shadowsocksConfigService.js");
  const activeKeys = rows(await prod.from("vpn_keys")
    .select("id,order_id,customer_id,reseller_id,server_id,outline_key_id,used_bytes,protocol,status")
    .eq("status", "active").is("deleted_at", null), "active keys");
  const resellers = rows(await prod.from("resellers").select("id,status"), "resellers");
  const miniapps = rows(await prod.from("reseller_miniapps")
    .select("reseller_id,is_enabled"), "reseller miniapps");
  const activeResellers = new Set(resellers.filter((r) => r.status === "active").map((r) => r.id));
  const enabledMiniapps = new Set(miniapps.filter((m) => m.is_enabled).map((m) => m.reseller_id));
  const outlineIds = new Set(outlineByHost.values().map((s) => s.id));
  const outlineKeys = activeKeys.filter((key) => outlineIds.has(key.server_id));
  const eligible = outlineKeys.filter((key) => activeResellers.has(key.reseller_id) &&
    enabledMiniapps.has(key.reseller_id));
  const targets = limit ? eligible.slice(0, limit) : eligible;
  const metrics = new Map();
  for (const source of outlineByHost.values()) {
    metrics.set(source.id, await getTransferMetrics(source));
  }
  const issues = [];
  let usageIncrease = 0;
  for (const key of targets) {
    const source = allProd.find((s) => s.id === key.server_id);
    const panel = panelByHost.get(source.host_ip);
    if (!panel || panel.status !== "provisioning") issues.push(`missing prepared panel row for ${source.host_ip}`);
    if (key.protocol !== "shadowsocks") issues.push(`non-SS Outline key ${key.id}`);
    const liveBytes = Number(metrics.get(source.id)?.[key.outline_key_id] ?? 0);
    if (!Number.isFinite(liveBytes) || liveBytes < 0) issues.push(`invalid live usage for ${key.id}`);
    else usageIncrease += Math.max(0, liveBytes - Number(key.used_bytes || 0));
  }
  console.log(JSON.stringify({ command, execute, total_outline_keys: outlineKeys.length,
    blocked_by_disabled_reseller_or_miniapp: outlineKeys.length - eligible.length,
    selected: targets.length, usage_increase_bytes: usageIncrease, issues: [...new Set(issues)] }));
  if (command === "audit" || !execute) process.exit(issues.length ? 2 : 0);
  if (issues.length) throw new Error("Preflight failed; no migration started");
  process.env.BOT_TOKEN_ENCRYPTION_KEY = productionKey();
  let migrated = 0;
  for (const oldKey of targets) {
    const source = allProd.find((s) => s.id === oldKey.server_id);
    const panel = panelByHost.get(source.host_ip);
    const orderResult = await prod.from("vpn_orders")
      .select("id,customer_id,reseller_id,status,order_type,expiry_date,plan_id,customer:vpn_customers!vpn_orders_customer_id_fkey(id,full_name,ssconf_token),plan:vpn_plans(id,name,data_limit_gb)")
      .eq("id", oldKey.order_id).eq("reseller_id", oldKey.reseller_id).single();
    if (orderResult.error || !orderResult.data) throw new Error(`Order lookup failed for key ${oldKey.id}`);
    const order = orderResult.data;
    if (order.status !== "active" || order.customer_id !== oldKey.customer_id ||
        !order.customer?.ssconf_token || !order.plan || !order.expiry_date) {
      throw new Error(`Order/customer invariant failed for key ${oldKey.id}`);
    }
    const existingPanelKey = rows(await prod.from("vpn_keys").select("id")
      .eq("order_id", order.id).eq("server_id", panel.id)
      .in("status", ["active", "pending"]), "target key check");
    if (existingPanelKey.length) throw new Error(`Already migrated order ${order.id}`);
    const liveBytes = Number(metrics.get(source.id)[oldKey.outline_key_id] ?? 0);
    const currentBytes = Math.max(Number(oldKey.used_bytes || 0), liveBytes);
    if (currentBytes > Number(oldKey.used_bytes || 0)) {
      const update = await prod.from("vpn_keys").update({ used_bytes: currentBytes })
        .eq("id", oldKey.id).eq("status", "active");
      if (update.error) throw new Error(`Could not refresh usage for key ${oldKey.id}: ${update.error.message}`);
    }
    const quota = await getOrderQuotaSnapshot(order.id);
    const remaining = resolveRemainingKeyLimitBytes({ quota, planDataLimitGb: order.plan.data_limit_gb });
    let newKey = null;
    let oldDeleted = false;
    try {
      newKey = await migrateActiveOrderToServer({ order, newServer: panel,
        oldServerId: source.id, protocol: "shadowsocks", quotaSnapshot: quota });
      const panelUser = await getKey({ server: panel, keyId: newKey.outline_key_id });
      const expected = await resolveShadowsocksConfig(newKey.access_url);
      const response = await fetch(`https://api.novanetmm.com/k/${order.customer.ssconf_token}.json`,
        { headers: { "Cache-Control": "no-cache" } });
      const actual = response.ok ? await response.json() : null;
      if (!panelUser || Number(panelUser.data_limit) !== remaining || !expected ||
          actual?.server !== expected.server || Number(actual?.server_port) !== Number(expected.port) ||
          actual?.password !== expected.password || actual?.method !== expected.method) {
        throw new Error(`New key verification failed for order ${order.id}`);
      }
      await deleteKey({ server: source, keyId: oldKey.outline_key_id });
      oldDeleted = true;
      const retired = await prod.from("vpn_keys")
        .update({ status: "deleted", deleted_at: new Date().toISOString(), used_bytes: currentBytes })
        .eq("id", oldKey.id).eq("status", "active");
      if (retired.error) throw new Error(`Old key deleted but DB retirement failed for ${oldKey.id}`);
      const assignments = await prod.from("token_server_assignments")
        .update({ is_active: false }).eq("vpn_key_id", oldKey.id);
      if (assignments.error) throw new Error(`Token assignment retirement failed for ${oldKey.id}`);
    } catch (error) {
      if (newKey && !oldDeleted) {
        const retired = await prod.from("vpn_keys")
          .update({ status: "deleted", deleted_at: new Date().toISOString() })
          .eq("id", newKey.id).eq("status", "active");
        const assignments = await prod.from("token_server_assignments")
          .update({ is_active: false }).eq("vpn_key_id", newKey.id);
        if (retired.error || assignments.error) {
          throw new Error(`Migration failed for ${order.id}; automatic DB rollback also failed`);
        }
        await deleteKey({ server: panel, keyId: newKey.outline_key_id });
      }
      throw error;
    }
    migrated++;
    console.log(JSON.stringify({ migrated, remaining_in_batch: targets.length - migrated,
      source: source.name, target: panel.name, order_id: order.id }));
  }
}
