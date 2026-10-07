// One-customer Outline -> Marzneshin rehearsal. Never touches other customers.
// Usage: node scripts/production-marzneshin-canary.mjs inspect|prepare|migrate|rollback|finalize
import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const PROD_REF = "daenwuszqdfkbjiatsjs";
const DEV_REF = "huqmzvlzfcexycdrsxpn";
const RESELLER_ID = "fa196cf9-3985-4145-8cc2-1f78a182f49a";
const CUSTOMER_ID = "65931c2d-d7b8-4087-abf8-6c3e241985a1";
const ORDER_ID = "acbb0fc1-acd5-4f82-8a32-3e6a64cc42eb";
const SOURCE_SERVER_ID = "771fd368-678d-4af4-82a2-d0754d86e627";
const NODE_IP = "139.59.126.185";
const command = process.argv[2];

if (!["inspect", "prepare", "migrate", "rollback", "finalize"].includes(command)) {
  throw new Error("Usage: node scripts/production-marzneshin-canary.mjs inspect|prepare|migrate|rollback|finalize");
}

const prodEnv = dotenv.parse(fs.readFileSync(".env"));
const devEnv = dotenv.parse(fs.readFileSync(".env.local"));
if (!prodEnv.SUPABASE_URL.includes(PROD_REF) || !devEnv.SUPABASE_URL.includes(DEV_REF)) {
  throw new Error("Expected production and development Supabase projects were not found");
}
process.env.NODE_ENV = "production";
process.env.SUPABASE_URL = prodEnv.SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = prodEnv.SUPABASE_SERVICE_ROLE_KEY;

const prod = createClient(prodEnv.SUPABASE_URL, prodEnv.SUPABASE_SERVICE_ROLE_KEY);
const dev = createClient(devEnv.SUPABASE_URL, devEnv.SUPABASE_SERVICE_ROLE_KEY);

function one(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  if (!result.data) throw new Error(`${label}: no row`);
  return result.data;
}

async function canaryRows() {
  const customer = one(await prod.from("vpn_customers")
    .select("id,reseller_id,full_name,ssconf_token")
    .eq("id", CUSTOMER_ID).eq("reseller_id", RESELLER_ID).single(), "customer");
  const order = one(await prod.from("vpn_orders")
    .select("id,customer_id,reseller_id,status,order_type,expiry_date,plan_id,customer:vpn_customers!vpn_orders_customer_id_fkey(id,full_name),plan:vpn_plans(id,name,data_limit_gb)")
    .eq("id", ORDER_ID).eq("reseller_id", RESELLER_ID).single(), "order");
  const oldKey = one(await prod.from("vpn_keys")
    .select("id,order_id,customer_id,reseller_id,server_id,status,deleted_at,protocol,outline_key_id,used_bytes,data_limit_bytes")
    .eq("order_id", ORDER_ID).eq("server_id", SOURCE_SERVER_ID)
    .eq("status", "active").is("deleted_at", null).single(), "old key");
  if (order.customer_id !== CUSTOMER_ID || oldKey.customer_id !== CUSTOMER_ID ||
      order.status !== "active" || order.order_type !== "purchase" ||
      oldKey.protocol !== "shadowsocks" || !customer.ssconf_token) {
    throw new Error("Canary account, entitlement, or dynamic key changed; refusing to proceed");
  }
  return { customer, order, oldKey };
}

async function panelRow() {
  const result = await prod.from("vpn_servers").select("*")
    .eq("panel_type", "marzneshin").eq("host_ip", NODE_IP).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data;
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

function productionEncryptionKey() {
  const line = execFileSync("ssh", ["-o", "BatchMode=yes", "root@178.128.127.163",
    "grep '^BOT_TOKEN_ENCRYPTION_KEY=' /var/www/novanet/backend/.env.production"],
  { encoding: "utf8", timeout: 15000 }).trim();
  const key = dotenv.parse(line).BOT_TOKEN_ENCRYPTION_KEY;
  if (!/^[0-9a-f]{64}$/i.test(key || "")) throw new Error("Production encryption key unavailable");
  return key;
}

const { customer, order, oldKey } = await canaryRows();
const { getOrderQuotaSnapshot, migrateActiveOrderToServer, resolveRemainingKeyLimitBytes } =
  await import("../src/services/subscriptionProvisionService.js");
const quota = await getOrderQuotaSnapshot(ORDER_ID);
const remaining = resolveRemainingKeyLimitBytes({ quota, planDataLimitGb: order.plan?.data_limit_gb });
const existing = await panelRow();
console.log(JSON.stringify({ mode: command, customer: customer.full_name, order_id: ORDER_ID,
  source_key_id: oldKey.id, expires: order.expiry_date, remaining_bytes: remaining,
  panel_row_id: existing?.id || null, panel_row_status: existing?.status || null }));

if (command === "prepare") {
  if (existing) throw new Error("Panel row already exists; refusing duplicate creation");
  const source = one(await prod.from("vpn_servers").select("id,host_ip,status")
    .eq("id", SOURCE_SERVER_ID).single(), "source server");
  if (source.host_ip !== NODE_IP || source.status !== "active") throw new Error("Source server changed");
  const template = one(await dev.from("vpn_servers").select("*")
    .eq("panel_type", "marzneshin").eq("host_ip", NODE_IP).single(), "development panel row");
  if (template.marzneshin_service_ids?.join() !== "3" ||
      template.panel_url !== "https://panel.novanetmm.com") {
    throw new Error("Shared panel configuration changed");
  }
  const password = decryptWithKey(template.panel_password_encrypted, devEnv.BOT_TOKEN_ENCRYPTION_KEY);
  const prodKey = productionEncryptionKey();
  process.env.BOT_TOKEN_ENCRYPTION_KEY = prodKey;
  const { testServer } = await import("../src/services/vpnProviderService.js");
  await testServer({ ...template, _panel_password: password });
  const row = {
    name: template.name, provider: template.provider, region: template.region,
    region_code: template.region_code, host_ip: template.host_ip,
    status: "provisioning", is_active: false, is_default: false,
    max_active_keys: template.max_active_keys, current_active_keys: 0,
    display_country: template.display_country, display_city: template.display_city,
    flag_emoji: template.flag_emoji, sort_order: template.sort_order,
    server_tier: "premium", panel_type: "marzneshin",
    panel_url: template.panel_url, panel_public_url: template.panel_public_url,
    panel_username: template.panel_username,
    panel_password_encrypted: encryptWithKey(password, prodKey),
    marzneshin_service_ids: template.marzneshin_service_ids,
    marzneshin_vless_service_ids: template.marzneshin_vless_service_ids,
    marzneshin_vless_trial_service_ids: [],
  };
  const inserted = one(await prod.from("vpn_servers").insert(row).select("id,status").single(), "new panel row");
  console.log(JSON.stringify({ prepared: true, server_id: inserted.id, status: inserted.status }));
}

if (command === "migrate") {
  if (!existing || existing.status !== "provisioning") throw new Error("Canary panel row is not prepared");
  const already = await prod.from("vpn_keys").select("id").eq("order_id", ORDER_ID)
    .eq("server_id", existing.id).in("status", ["active", "pending"]);
  if (already.error || already.data?.length) throw new Error("Canary already migrated or key state unknown");
  process.env.BOT_TOKEN_ENCRYPTION_KEY = productionEncryptionKey();
  const { testServer, getKey } = await import("../src/services/vpnProviderService.js");
  await testServer(existing);
  const newKey = await migrateActiveOrderToServer({ order, newServer: existing,
    oldServerId: SOURCE_SERVER_ID, protocol: "shadowsocks", quotaSnapshot: quota });
  const live = await getKey({ server: existing, keyId: newKey.outline_key_id });
  if (!live) throw new Error("New panel user not found after migration; old Outline key remains active");
  console.log(JSON.stringify({ migrated: true, new_key_id: newKey.id,
    old_outline_key_retained: true, old_database_key_retained: true,
    panel_data_limit: live.data_limit, expected_data_limit: remaining }));
}

if (command === "rollback" || command === "finalize") {
  if (!existing) throw new Error("Canary panel row is missing");
  const newKey = one(await prod.from("vpn_keys")
    .select("id,outline_key_id,access_url,status,deleted_at")
    .eq("order_id", ORDER_ID).eq("server_id", existing.id)
    .eq("status", "active").is("deleted_at", null).single(), "new key");
  process.env.BOT_TOKEN_ENCRYPTION_KEY = productionEncryptionKey();
  const { getKey, deleteKey, getTransferMetrics } = await import("../src/services/vpnProviderService.js");
  const oldServer = one(await prod.from("vpn_servers").select("*")
    .eq("id", SOURCE_SERVER_ID).single(), "old server");
  const panelUser = await getKey({ server: existing, keyId: newKey.outline_key_id });
  if (!panelUser) throw new Error("Panel user missing; refusing to change the old key");

  if (command === "finalize") {
    if (Number(panelUser.used_traffic || 0) <= 0) {
      throw new Error("Panel user has no traffic; reconnect test must pass before finalization");
    }
    const response = await fetch(`https://api.novanetmm.com/k/${customer.ssconf_token}.json`,
      { headers: { "Cache-Control": "no-cache" } });
    if (!response.ok) throw new Error(`Dynamic key returned HTTP ${response.status}`);
    const actual = await response.json();
    const { resolveShadowsocksConfig } = await import("../src/services/shadowsocksConfigService.js");
    const expected = await resolveShadowsocksConfig(newKey.access_url);
    if (!expected || actual.server !== expected.server ||
        Number(actual.server_port) !== Number(expected.port) ||
        actual.password !== expected.password || actual.method !== expected.method) {
      throw new Error("Dynamic key does not resolve to the new panel user");
    }
    const oldLive = await getKey({ server: oldServer, keyId: oldKey.outline_key_id });
    const oldMetrics = oldLive ? await getTransferMetrics(oldServer) : {};
    const finalOldUsage = Math.max(Number(oldKey.used_bytes || 0),
      Number(oldMetrics[oldKey.outline_key_id] || 0));
    if (oldLive) await deleteKey({ server: oldServer, keyId: oldKey.outline_key_id });
    const { data: retired, error } = await prod.from("vpn_keys")
      .update({ status: "deleted", deleted_at: new Date().toISOString(), used_bytes: finalOldUsage })
      .eq("id", oldKey.id).eq("status", "active").select("id").single();
    if (error || !retired) throw new Error(`Old Outline key deleted, but DB retirement failed: ${error?.message}`);
    console.log(JSON.stringify({ finalized: true, old_outline_key_deleted: true,
      old_database_key_retired: true, new_panel_user_active: true,
      new_panel_used_bytes: panelUser.used_traffic }));
  } else {
    const { data: retired, error } = await prod.from("vpn_keys")
      .update({ status: "deleted", deleted_at: new Date().toISOString() })
      .eq("id", newKey.id).eq("status", "active").select("id").single();
    if (error || !retired) throw new Error(`Canary DB rollback failed: ${error?.message}`);
    const link = await prod.from("telegram_links").update({ current_server_id: SOURCE_SERVER_ID })
      .eq("customer_id", CUSTOMER_ID).eq("current_server_id", existing.id);
    if (link.error) throw new Error(`Canary key rolled back, but Telegram link update failed: ${link.error.message}`);
    const assignments = await prod.from("token_server_assignments")
      .update({ is_active: false }).eq("vpn_key_id", newKey.id);
    if (assignments.error) throw new Error(`Canary key rolled back, but token assignment update failed: ${assignments.error.message}`);
    await deleteKey({ server: existing, keyId: newKey.outline_key_id });
    console.log(JSON.stringify({ rolled_back: true, old_outline_key_retained: true }));
  }
}
