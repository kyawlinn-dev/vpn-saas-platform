#!/usr/bin/env node
/**
 * Cleanup orphaned Marzneshin panel users.
 *
 * These are vpn_keys rows with status="deleted" in the DB but whose
 * Marzneshin panel user was NOT removed (the bug where outline_api_url
 * was checked instead of panel_url — now fixed). Run this once after
 * deploying the fix to clean up test-session orphans.
 *
 * Also fixes double-is_default: sets Outline Singapore 1 is_default=false.
 *
 * Usage:
 *   node backend/scripts/cleanup-orphaned-panel-users.mjs --dry-run
 *   node backend/scripts/cleanup-orphaned-panel-users.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
import axios from "axios";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../.env.local") });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const BOT_TOKEN_ENCRYPTION_KEY = process.env.BOT_TOKEN_ENCRYPTION_KEY;

if (!SUPABASE_URL?.includes("huqmzvlzfcexycdrsxpn")) {
  console.error("SAFETY: Not pointing at dev DB. Got:", SUPABASE_URL);
  process.exit(1);
}

import crypto from "node:crypto";
function decrypt(ciphertext) {
  const [ivHex, authTagHex, ctHex] = ciphertext.split(":");
  const key = Buffer.from(BOT_TOKEN_ENCRYPTION_KEY, "hex");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const ct = Buffer.from(ctHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

const DRY_RUN = process.argv.includes("--dry-run");
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Panel token cache
const tokenCache = {};
async function getPanelToken(panelUrl, username, password) {
  const key = `${panelUrl}:${username}`;
  if (tokenCache[key]) return tokenCache[key];
  const { data } = await axios.post(
    `${panelUrl}/api/admins/token`,
    new URLSearchParams({ username, password, grant_type: "password" }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 10000 }
  );
  tokenCache[key] = data.access_token;
  return data.access_token;
}

async function deletePanelUser(panelUrl, username, password, marzUsername) {
  const token = await getPanelToken(panelUrl, username, password);
  const encoded = encodeURIComponent(String(marzUsername));
  await axios.delete(`${panelUrl}/api/users/${encoded}`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 10000,
  });
}

async function run() {
  if (DRY_RUN) console.log("=== DRY RUN — no changes ===\n");

  // ── Fix double is_default ──────────────────────────────────────────────
  console.log("=== Fix double is_default ===");
  const { data: oldDefault } = await supabase
    .from("vpn_servers")
    .select("id, name, host_ip")
    .eq("name", "Outline Singapore 1")
    .maybeSingle();

  if (oldDefault) {
    console.log(`  Outline Singapore 1 (${oldDefault.host_ip}) → is_default=false`);
    if (!DRY_RUN) {
      const { error } = await supabase
        .from("vpn_servers")
        .update({ is_default: false })
        .eq("id", oldDefault.id);
      if (error) console.error("  ✗", error.message);
      else console.log("  ✓ done");
    }
  } else {
    console.log("  Outline Singapore 1 not found — skipping");
  }

  // ── Find all orphaned panel users ─────────────────────────────────────
  console.log("\n=== Orphaned Marzneshin panel users ===");
  // Orphan = deleted in DB within last 7 days, has outline_key_id (Marzneshin username), server has panel_url
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: orphans, error: oe } = await supabase
    .from("vpn_keys")
    .select(`
      id, outline_key_id, deleted_at,
      vpn_servers ( id, name, panel_url, panel_username, panel_password_encrypted )
    `)
    .eq("status", "deleted")
    .gte("deleted_at", since7d)
    .not("outline_key_id", "is", null);

  if (oe) { console.error("Query error:", oe.message); return; }

  // Only keep ones with panel credentials
  const toClean = (orphans || []).filter(k =>
    k.vpn_servers?.panel_url &&
    k.vpn_servers?.panel_username &&
    k.vpn_servers?.panel_password_encrypted
  );

  console.log(`  Found ${toClean.length} orphaned users to clean up`);

  let cleaned = 0, failed = 0, notFound = 0;
  for (const k of toClean) {
    const srv = k.vpn_servers;
    const password = decrypt(srv.panel_password_encrypted);
    const label = `${srv.name} / ${k.outline_key_id}`;
    try {
      if (!DRY_RUN) {
        await deletePanelUser(srv.panel_url, srv.panel_username, password, k.outline_key_id);
      }
      console.log(`  ✓ ${label}`);
      cleaned++;
    } catch (err) {
      const status = err.response?.status;
      if (status === 404) {
        console.log(`  ✓ ${label} (already gone from panel)`);
        notFound++;
      } else {
        console.error(`  ✗ ${label} — HTTP ${status} ${err.message}`);
        failed++;
      }
    }
  }

  console.log(`\n  Cleaned: ${cleaned}, Already gone: ${notFound}, Failed: ${failed}`);
  if (DRY_RUN) console.log("\n=== Dry run done. Re-run without --dry-run to apply. ===");
  else console.log("\n=== Done ===");
}

run().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
