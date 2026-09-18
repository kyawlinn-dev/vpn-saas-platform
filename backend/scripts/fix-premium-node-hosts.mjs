#!/usr/bin/env node
/**
 * Fix VLESS Reality SNI for Singapore #2 and Tokyo #1 inbounds.
 *
 * Root cause: inbounds #10 (SG#2) and #12 (Tokyo) were created with
 * sni=www.yahoo.com as the Reality destination. The Marzneshin panel's
 * diagnostic shows all host records have correct public IPs, but Yahoo
 * is unreachable or too slow from those servers — so the Reality
 * camouflage handshake fails. SG1 and Trial-SGP use www.tiktok.com
 * and connect fine.
 *
 * This script:
 *   1. Updates the inbound's Xray JSON config: sni → ["www.tiktok.com"]
 *   2. Updates the inbound's host record:      sni → "www.tiktok.com"
 *
 * Also handles the original host-address case (creates host if missing).
 *
 * Usage:
 *   node backend/scripts/fix-premium-node-hosts.mjs --dry-run
 *   node backend/scripts/fix-premium-node-hosts.mjs
 *
 * Reads panel credentials from backend/.env.local:
 *   MARZNESHIN_PANEL_URL / MARZNESHIN_PANEL_USERNAME / MARZNESHIN_PANEL_PASSWORD
 */
import axios from "axios";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env.local") });

const PANEL_URL = process.env.MARZNESHIN_PANEL_URL;
const USERNAME  = process.env.MARZNESHIN_PANEL_USERNAME;
const PASSWORD  = process.env.MARZNESHIN_PANEL_PASSWORD;
const DRY_RUN   = process.argv.includes("--dry-run");

if (!PANEL_URL || !USERNAME || !PASSWORD) {
  console.error("Missing MARZNESHIN_PANEL_URL / _USERNAME / _PASSWORD in backend/.env.local");
  process.exit(1);
}

const TARGET_NODES = [
  { address: "165.22.242.245", name: "Singapore #2" },
  { address: "107.191.53.200", name: "Tokyo #1" },
];

const CORRECT_SNI  = "www.tiktok.com";
const BAD_SNI      = "www.yahoo.com";

async function getToken() {
  const { data } = await axios.post(
    `${PANEL_URL}/api/admins/token`,
    new URLSearchParams({ username: USERNAME, password: PASSWORD, grant_type: "password" }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 10000 }
  );
  return data.access_token;
}

// ── 1. Fix inbound Xray JSON config (server-side sni/dest) ────────────────
async function fixInboundConfig(api, inbound) {
  if (inbound.protocol !== "vless") return; // only VLESS Reality needs this

  const ibId = inbound.id;
  let currentConfig;
  try {
    const { data: detail } = await api.get(`/api/inbounds/${ibId}`);
    currentConfig = detail.config || inbound.config;
  } catch (e) {
    // Some Marzneshin versions return config in the list response
    currentConfig = inbound.config;
  }

  let parsed;
  try {
    parsed = typeof currentConfig === "string" ? JSON.parse(currentConfig) : currentConfig;
  } catch {
    console.warn(`    ⚠️  Could not parse inbound config JSON — skipping config update`);
    return;
  }

  const currentSni = parsed?.sni;
  console.log(`    Config sni currently: ${JSON.stringify(currentSni)}`);

  const needsUpdate = Array.isArray(currentSni)
    ? currentSni.some(s => s === BAD_SNI)
    : currentSni === BAD_SNI;

  if (!needsUpdate) {
    console.log(`    ✅ Config sni already correct — no change needed`);
    return;
  }

  const updatedSni = Array.isArray(currentSni)
    ? currentSni.map(s => s === BAD_SNI ? CORRECT_SNI : s)
    : CORRECT_SNI;

  const updatedConfig = { ...parsed, sni: updatedSni };
  console.log(`    → SET config sni: ${JSON.stringify(updatedSni)}`);

  if (!DRY_RUN) {
    try {
      await api.put(`/api/inbounds/${ibId}`, {
        tag: inbound.tag,
        protocol: inbound.protocol,
        node_id: inbound.node_id ?? inbound.node?.id,
        config: JSON.stringify(updatedConfig),
      });
      console.log(`    ✓ Inbound config updated`);
    } catch (e) {
      console.error(`    ✗ PUT inbound config failed: HTTP ${e.response?.status} — ${JSON.stringify(e.response?.data)}`);
    }
  } else {
    console.log(`    (dry run — would PUT inbound config)`);
  }
}

// ── 2. Fix host record (client-side address + sni in subscription) ─────────
async function fixHostRecord(api, inbound, serverAddress) {
  if (inbound.protocol !== "vless") return; // SS hosts don't use SNI

  const ibId = inbound.id;
  let hosts = [];
  try {
    const { data: hostsData } = await api.get(`/api/inbounds/${ibId}/hosts`);
    hosts = hostsData?.items || (Array.isArray(hostsData) ? hostsData : []);
  } catch (e) {
    console.error(`    ✗ Failed to fetch hosts: ${e.message}`);
    return;
  }

  const payload = {
    remark: `NovaNet ({USERNAME}) [VLESS Reality]`,
    address: serverAddress,
    sni: CORRECT_SNI,
  };

  if (hosts.length > 0) {
    const host = hosts[0];
    const currentAddr = host.address || host.host || "(empty)";
    const currentSni  = host.sni || "(none)";
    const addrOk = currentAddr === serverAddress;
    const sniOk  = currentSni === CORRECT_SNI;
    console.log(`    Host #${host.id}: address=${currentAddr} [${addrOk ? "✅" : "❌"}]  sni=${currentSni} [${sniOk ? "✅" : "❌"}]`);

    if (addrOk && sniOk) {
      console.log(`    ✅ Host already correct — no change needed`);
      return;
    }

    console.log(`    → SET address=${serverAddress}, sni=${CORRECT_SNI}`);
    if (!DRY_RUN) {
      try {
        await api.put(`/api/inbounds/hosts/${host.id}`, payload);
        console.log(`    ✓ Host updated`);
      } catch (e) {
        console.error(`    ✗ PUT host failed: HTTP ${e.response?.status} — ${JSON.stringify(e.response?.data)}`);
      }
    } else {
      console.log(`    (dry run — would PUT host)`);
    }
  } else {
    console.log(`    No host records found — will CREATE`);
    console.log(`    → CREATE address=${serverAddress}, sni=${CORRECT_SNI}`);
    if (!DRY_RUN) {
      try {
        const { data: created } = await api.post(`/api/inbounds/${ibId}/hosts`, payload);
        console.log(`    ✓ Host created: #${created?.id}`);
      } catch (e) {
        const status = e.response?.status;
        if (status === 404 || status === 405) {
          console.warn(`    ⚠️  POST /api/inbounds/{id}/hosts not supported — add host manually in panel UI`);
        } else {
          console.error(`    ✗ POST host failed: HTTP ${status} — ${JSON.stringify(e.response?.data)}`);
        }
      }
    } else {
      console.log(`    (dry run — would POST to create)`);
    }
  }
}

async function run() {
  if (DRY_RUN) console.log("=== DRY RUN — no changes ===\n");

  const token = await getToken();
  const api = axios.create({
    baseURL: PANEL_URL,
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15000,
  });

  // ── Resolve target nodes ─────────────────────────────────────────────────
  const { data: nodesData } = await api.get("/api/nodes");
  const nodes = nodesData.items || nodesData;
  const targetNodeMap = {};
  for (const n of nodes) {
    if (TARGET_NODES.some(t => t.address === n.address)) targetNodeMap[n.address] = n;
  }

  const missing = TARGET_NODES.filter(t => !targetNodeMap[t.address]);
  if (missing.length > 0) {
    console.error(`✗ Target node(s) not found: ${missing.map(t => `${t.name} (${t.address})`).join(", ")}`);
    process.exit(1);
  }

  // ── Find all inbounds for the target nodes ───────────────────────────────
  const { data: ibData } = await api.get("/api/inbounds");
  const inbounds = ibData.items || ibData;
  const targetInbounds = {};
  for (const t of TARGET_NODES) targetInbounds[t.address] = [];
  for (const ib of inbounds) {
    const nodeId = ib.node_id ?? ib.node?.id;
    for (const t of TARGET_NODES) {
      if (targetNodeMap[t.address]?.id === nodeId) targetInbounds[t.address].push(ib);
    }
  }

  // ── Fix each inbound ─────────────────────────────────────────────────────
  for (const t of TARGET_NODES) {
    console.log(`\n=== ${t.name} (${t.address}) ===`);
    const ibs = targetInbounds[t.address];
    if (ibs.length === 0) { console.log("  No inbounds found — skipping"); continue; }

    for (const ib of ibs) {
      if (ib.protocol !== "vless") continue; // only VLESS Reality needs SNI fix
      console.log(`\n  Inbound #${ib.id} [${ib.protocol}] "${ib.tag}"`);
      console.log(`  -- Xray config (server-side SNI) --`);
      await fixInboundConfig(api, ib);
      console.log(`  -- Host record (client subscription SNI) --`);
      await fixHostRecord(api, ib, t.address);
    }
  }

  // ── Verification pass ─────────────────────────────────────────────────────
  console.log("\n\n=== Final State (re-fetched host records) ===");
  for (const t of TARGET_NODES) {
    console.log(`\n  ${t.name} (${t.address}):`);
    for (const ib of targetInbounds[t.address]) {
      if (ib.protocol !== "vless") continue;
      try {
        const { data: hostsData } = await api.get(`/api/inbounds/${ib.id}/hosts`);
        const hosts = hostsData?.items || (Array.isArray(hostsData) ? hostsData : []);
        if (hosts.length === 0) {
          console.log(`    Inbound #${ib.id}: ❌ no host records`);
        } else {
          for (const h of hosts) {
            const addrOk = (h.address || h.host) === t.address;
            const sniOk  = h.sni === CORRECT_SNI;
            const ok = addrOk && sniOk;
            console.log(`    Inbound #${ib.id}: ${ok ? "✅" : "❌"} address=${h.address || h.host} | sni=${h.sni || "(none)"}`);
          }
        }
      } catch (e) {
        console.error(`    Inbound #${ib.id}: ✗ ${e.message}`);
      }
    }
  }

  if (DRY_RUN) console.log("\n=== Dry run done. Re-run without --dry-run to apply. ===");
  else console.log("\n=== Done. Test your subscription URL in Steriszand. ===");
}

run().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
