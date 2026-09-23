#!/usr/bin/env node
/**
 * Update the LOCAL DEV database (huqmzvlzfcexycdrsxpn.supabase.co) to reflect
 * the new premium server fleet:
 *
 *   - Retire old rows:  sgp1-3111 (165.22.110.55) + Outline Japan Osaka 01 (64.176.61.174)
 *   - Insert new rows:  Singapore #2 (165.22.242.245) + Tokyo #1 (107.191.53.200)
 *                       with full Marzneshin columns populated
 *
 * IMPORTANT: Uses backend/.env.local (dev Supabase), NOT production.
 *
 * Usage:
 *   # Dry run — list current state, show what will change:
 *   node backend/scripts/update-dev-db-premium-nodes.mjs --dry-run
 *
 *   # Apply changes:
 *   node backend/scripts/update-dev-db-premium-nodes.mjs
 *
 * Fill in the SS service IDs from setup-premium-services.mjs output before running.
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
import { readFileSync } from "fs";
import crypto from "node:crypto";

// ── Load .env.local ──────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envLocalPath = path.resolve(__dirname, "../.env.local");
config({ path: envLocalPath });

// ── Inline encrypt (avoids ESM import path issues in scripts) ────────────────
function encrypt(plaintext) {
  const hex = process.env.BOT_TOKEN_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) throw new Error("BOT_TOKEN_ENCRYPTION_KEY must be 64 hex chars");
  const key = Buffer.from(hex, "hex");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

// ── Config ───────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
if (!SUPABASE_URL.includes("huqmzvlzfcexycdrsxpn")) {
  console.error("SAFETY: .env.local does not point to the dev Supabase project.");
  console.error(`  Got: ${SUPABASE_URL}`);
  console.error("  Expected: huqmzvlzfcexycdrsxpn.supabase.co");
  console.error("  This script must NOT run against production.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const DRY_RUN = process.argv.includes("--dry-run");

// ── Marzneshin panel config (same for all servers) ──────────────────────────
// Credentials come from env (backend/.env.local) — never hardcode secrets.
const PANEL_URL = process.env.MARZNESHIN_PANEL_URL || "https://panel.novanetmm.com";
const PANEL_USERNAME = process.env.MARZNESHIN_PANEL_USERNAME;
const PANEL_PASSWORD = process.env.MARZNESHIN_PANEL_PASSWORD; // encrypted before DB insert
if (!PANEL_USERNAME || !PANEL_PASSWORD) {
  console.error("Missing MARZNESHIN_PANEL_USERNAME / MARZNESHIN_PANEL_PASSWORD in backend/.env.local");
  process.exit(1);
}

// ── IDs to retire ───────────────────────────────────────────────────────────
const RETIRE_IDS = [
  "3af71922-5e50-46a8-aa44-e3b07642f741",  // sgp1-3111 (165.22.110.55)
  "5ef530e6-3be2-4bce-8a75-22f89d5fffc6",  // Outline Japan Osaka 01 (64.176.61.174)
];

// ── New rows ─────────────────────────────────────────────────────────────────
// TODO: Fill in marzneshin_service_ids from setup-premium-services.mjs output
// before running with --apply.
const GLOBAL_VLESS_SERVICE_IDS = [5]; // same on all servers; verify from panel

const NEW_SERVERS = [
  {
    name: "Singapore #2",
    provider: "digitalocean",
    region: "sgp1",
    region_code: "SG",
    host_ip: "165.22.242.245",
    status: "active",
    is_active: true,
    is_default: true,       // premium default for dev
    max_active_keys: 100,
    current_active_keys: 0,
    server_tier: "premium",
    sort_order: 2,
    display_country: "Singapore",
    display_city: "Singapore #2",
    flag_emoji: "🇸🇬",
    // Marzneshin columns:
    panel_url: PANEL_URL,
    panel_public_url: PANEL_URL,
    panel_username: PANEL_USERNAME,
    marzneshin_service_ids: [9],          // SS - Singapore-2 (from setup-premium-services.mjs)
    marzneshin_vless_service_ids: GLOBAL_VLESS_SERVICE_IDS,
    marzneshin_vless_trial_service_ids: [],
  },
  {
    name: "Tokyo #1",
    provider: "vultr",
    region: "nrt",
    region_code: "JP",
    host_ip: "107.191.53.200",
    status: "active",
    is_active: true,
    is_default: false,
    max_active_keys: 100,
    current_active_keys: 0,
    server_tier: "premium",
    sort_order: 3,
    display_country: "Japan",
    display_city: "Tokyo #1",
    flag_emoji: "🇯🇵",
    // Marzneshin columns:
    panel_url: PANEL_URL,
    panel_public_url: PANEL_URL,
    panel_username: PANEL_USERNAME,
    marzneshin_service_ids: [10],         // SS - Tokyo-1 (from setup-premium-services.mjs)
    marzneshin_vless_service_ids: GLOBAL_VLESS_SERVICE_IDS,
    marzneshin_vless_trial_service_ids: [],
  },
];

function checkTodos() {
  const missing = NEW_SERVERS.filter(s => s.marzneshin_service_ids === null);
  if (missing.length > 0) {
    console.error("\n✗ marzneshin_service_ids not set for:");
    for (const s of missing) {
      console.error(`    ${s.name} — edit NEW_SERVERS in this script`);
    }
    console.error("\nRun setup-premium-services.mjs first, then fill in the IDs above.");
    return false;
  }
  return true;
}

async function showCurrentState() {
  console.log("=== Current dev DB state ===");
  const { data, error } = await supabase
    .from("vpn_servers")
    .select("id, name, host_ip, status, is_active, server_tier, panel_url, marzneshin_service_ids")
    .order("sort_order", { ascending: true });

  if (error) { console.error("Query failed:", error.message); return; }

  for (const row of data) {
    const retire = RETIRE_IDS.includes(row.id) ? " ← WILL RETIRE" : "";
    const marzCols = row.panel_url ? `panel✓ ss=[${row.marzneshin_service_ids}]` : "no Marzneshin cols";
    console.log(`  ${row.name} (${row.host_ip}) — ${row.status} ${row.server_tier} [${marzCols}]${retire}`);
  }
}

async function run() {
  if (DRY_RUN) {
    console.log("=== DRY RUN — no changes will be applied ===\n");
  }

  await showCurrentState();

  if (!checkTodos()) {
    if (!DRY_RUN) process.exit(1);
    console.log("\n(Dry run: would exit here due to missing service IDs)");
    return;
  }

  const encryptedPassword = encrypt(PANEL_PASSWORD);

  // ── Step 1: Retire old rows ────────────────────────────────────────────
  console.log("\n--- Step 1: Retire old premium server rows ---");
  for (const id of RETIRE_IDS) {
    console.log(`  UPDATE vpn_servers SET status='decommissioned', is_active=false WHERE id='${id}'`);
    if (!DRY_RUN) {
      const { error } = await supabase
        .from("vpn_servers")
        .update({ status: "decommissioned", is_active: false })
        .eq("id", id);
      if (error) console.error(`    ✗ ${error.message}`);
      else console.log("    ✓ done");
    }
  }

  // ── Step 2: Insert new rows ────────────────────────────────────────────
  console.log("\n--- Step 2: Insert new premium server rows ---");
  for (const server of NEW_SERVERS) {
    const row = { ...server, panel_password_encrypted: encryptedPassword };
    console.log(`  INSERT ${server.name} (${server.host_ip})`);
    console.log(`    ss_service_ids=${JSON.stringify(server.marzneshin_service_ids)}`);
    console.log(`    vless_service_ids=${JSON.stringify(server.marzneshin_vless_service_ids)}`);
    if (!DRY_RUN) {
      const { data, error } = await supabase
        .from("vpn_servers")
        .insert(row)
        .select("id")
        .single();
      if (error) console.error(`    ✗ ${error.message}`);
      else console.log(`    ✓ inserted id=${data.id}`);
    }
  }

  // ── Step 3: Verify ────────────────────────────────────────────────────
  if (!DRY_RUN) {
    console.log("\n--- Verification ---");
    await showCurrentState();
  }

  console.log(DRY_RUN ? "\n=== Dry run complete. Re-run without --dry-run to apply. ===" : "\n=== Done ===");
}

run().catch(e => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
