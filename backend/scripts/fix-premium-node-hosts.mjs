#!/usr/bin/env node
/**
 * Fix Marzneshin panel host records for Singapore #2 and Tokyo #1 inbounds.
 *
 * Without a correct host record, Marzneshin falls back to an internal address
 * (127.0.0.1) in the generated VLESS subscription, causing client connection
 * failures for those nodes.
 *
 * For each inbound belonging to SG#2 or Tokyo #1:
 *   - If a host record exists → PUT to update the address/SNI
 *   - If no host records exist → POST to create one
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

// Premium nodes to fix — address is the public IP clients connect to
const TARGET_NODES = [
  { address: "165.22.242.245", name: "Singapore #2" },
  { address: "107.191.53.200", name: "Tokyo #1" },
];

async function getToken() {
  const { data } = await axios.post(
    `${PANEL_URL}/api/admins/token`,
    new URLSearchParams({ username: USERNAME, password: PASSWORD, grant_type: "password" }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 10000 }
  );
  return data.access_token;
}

function hostPayload(address, protocol) {
  const isVless = protocol === "vless";
  const payload = {
    remark: isVless ? "NovaNet ({USERNAME}) [VLESS Reality]" : "NovaNet ({USERNAME}) [SS]",
    address,
  };
  if (isVless) payload.sni = "www.yahoo.com";
  return payload;
}

async function fixInboundHosts(api, inbound, serverAddress) {
  const ibId = inbound.id;
  const proto = inbound.protocol || "unknown";
  const label = `Inbound #${ibId} [${proto}] "${inbound.tag}"`;

  console.log(`\n  ${label}`);

  let hosts = [];
  try {
    const { data: hostsData } = await api.get(`/api/inbounds/${ibId}/hosts`);
    hosts = hostsData?.items || (Array.isArray(hostsData) ? hostsData : []);
  } catch (e) {
    console.error(`    ✗ Failed to fetch hosts: ${e.message}`);
    return;
  }

  const payload = hostPayload(serverAddress, proto);

  if (hosts.length > 0) {
    // Update the first host record
    const host = hosts[0];
    const currentAddr = host.address || host.host || "(empty)";
    console.log(`    Current host #${host.id}: address=${currentAddr} | sni=${host.sni || "(none)"}`);
    console.log(`    → SET address=${serverAddress}${payload.sni ? `, sni=${payload.sni}` : ""}`);
    if (!DRY_RUN) {
      try {
        await api.put(`/api/inbounds/hosts/${host.id}`, payload);
        console.log("    ✓ Updated");
      } catch (e) {
        console.error(`    ✗ PUT failed: HTTP ${e.response?.status} — ${JSON.stringify(e.response?.data)}`);
      }
    } else {
      console.log("    (dry run — would PUT)");
    }
  } else {
    // No host records — create one
    console.log("    No host records found — will CREATE");
    console.log(`    → CREATE address=${serverAddress}${payload.sni ? `, sni=${payload.sni}` : ""}`);
    if (!DRY_RUN) {
      try {
        // Try nested POST first (Marzneshin ≥ 0.6 style)
        const { data: created } = await api.post(`/api/inbounds/${ibId}/hosts`, payload);
        console.log(`    ✓ Created host #${created?.id}`);
      } catch (e) {
        const status = e.response?.status;
        if (status === 404 || status === 405) {
          console.warn("    ⚠️  POST /api/inbounds/{id}/hosts not supported by this panel version");
          console.warn("    → Add host manually in the panel UI for this inbound, then re-run to verify");
        } else {
          console.error(`    ✗ POST failed: HTTP ${status} — ${JSON.stringify(e.response?.data)}`);
        }
      }
    } else {
      console.log("    (dry run — would POST to create)");
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

  // ── 1. Resolve target node IDs ───────────────────────────────────────────
  console.log("=== Panel Nodes ===");
  const { data: nodesData } = await api.get("/api/nodes");
  const nodes = nodesData.items || nodesData;
  const targetNodeMap = {}; // address → node

  for (const n of nodes) {
    const flag = n.status === "healthy" ? "✅" : "⚠️ ";
    console.log(`  #${n.id}: [${flag} ${n.status}] ${n.name} — ${n.address}`);
    if (TARGET_NODES.some(t => t.address === n.address)) {
      targetNodeMap[n.address] = n;
    }
  }

  const missing = TARGET_NODES.filter(t => !targetNodeMap[t.address]);
  if (missing.length > 0) {
    console.error(`\n✗ Target node(s) not found in panel: ${missing.map(t => `${t.name} (${t.address})`).join(", ")}`);
    console.error("  Run add-premium-nodes.mjs first.");
    process.exit(1);
  }

  // ── 2. Find all inbounds for the target nodes ────────────────────────────
  console.log("\n=== Inbounds for Target Nodes ===");
  const { data: ibData } = await api.get("/api/inbounds");
  const inbounds = ibData.items || ibData;

  const targetInbounds = {}; // serverAddress → [inbound, ...]
  for (const t of TARGET_NODES) targetInbounds[t.address] = [];

  for (const ib of inbounds) {
    const nodeId = ib.node_id ?? ib.node?.id;
    for (const t of TARGET_NODES) {
      if (targetNodeMap[t.address]?.id === nodeId) {
        targetInbounds[t.address].push(ib);
        console.log(`  ${t.name}: Inbound #${ib.id} [${ib.protocol}] "${ib.tag}"`);
      }
    }
  }

  // ── 3. Fix host records ───────────────────────────────────────────────────
  console.log("\n=== Fixing Host Records ===");
  for (const t of TARGET_NODES) {
    console.log(`\n--- ${t.name} (${t.address}) ---`);
    const ibs = targetInbounds[t.address];
    if (ibs.length === 0) {
      console.log("  No inbounds found for this node — skipping");
      continue;
    }
    for (const ib of ibs) {
      await fixInboundHosts(api, ib, t.address);
    }
  }

  // ── 4. Verification pass ─────────────────────────────────────────────────
  console.log("\n\n=== Final Host State (re-fetched) ===");
  for (const t of TARGET_NODES) {
    console.log(`\n  ${t.name} (${t.address}):`);
    for (const ib of targetInbounds[t.address]) {
      try {
        const { data: hostsData } = await api.get(`/api/inbounds/${ib.id}/hosts`);
        const hosts = hostsData?.items || (Array.isArray(hostsData) ? hostsData : []);
        if (hosts.length === 0) {
          console.log(`    Inbound #${ib.id} [${ib.protocol}]: ❌ still no host records`);
        } else {
          for (const h of hosts) {
            const addr = h.address || h.host || "(empty)";
            const ok = addr === t.address;
            console.log(`    Inbound #${ib.id} [${ib.protocol}]: ${ok ? "✅" : "❌"} address=${addr} | sni=${h.sni || "(none)"}`);
          }
        }
      } catch (e) {
        console.error(`    Inbound #${ib.id}: ✗ ${e.message}`);
      }
    }
  }

  if (DRY_RUN) console.log("\n=== Dry run done. Re-run without --dry-run to apply. ===");
  else console.log("\n=== Done. Test your subscription URL in Steriszand/Hiddify. ===");
}

run().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
