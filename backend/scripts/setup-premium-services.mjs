#!/usr/bin/env node
/**
 * Create inbounds + services for Singapore #2 and Tokyo #1 in Marzneshin panel.
 *
 * Run AFTER:
 *   1. setup-marznode-premium.sh (on each server) — captures PUBLIC_KEY + SHORT_ID per server
 *   2. add-premium-nodes.mjs — nodes must be connected
 *
 * Run: node backend/scripts/setup-premium-services.mjs \
 *        --sg-pubkey <SG_REALITY_PUBLIC_KEY> \
 *        --sg-sid    <SG_SHORT_ID>           \
 *        --tk-pubkey <TK_REALITY_PUBLIC_KEY> \
 *        --tk-sid    <TK_SHORT_ID>
 *
 * All four arguments are required (output by setup-marznode-premium.sh).
 *
 * This script:
 *   1. Finds node IDs for 165.22.242.245 (SG#2) and 107.191.53.200 (TK#1)
 *   2. Creates SS + VLESS inbounds for each node
 *   3. Creates per-server SS service for each node
 *   4. Updates VLESS Global service (id=5) to include the new VLESS inbounds
 *   5. Fixes host addresses (replaces {SERVER_IP} placeholder with real IPs)
 *   6. Prints a summary of service IDs for update-dev-db-premium-nodes.mjs
 */
import axios from "axios";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env.local") });

const PANEL_URL = process.env.MARZNESHIN_PANEL_URL;
const USERNAME  = process.env.MARZNESHIN_PANEL_USERNAME;
const PASSWORD  = process.env.MARZNESHIN_PANEL_PASSWORD;

if (!PANEL_URL || !USERNAME || !PASSWORD) {
  console.error("Missing MARZNESHIN_PANEL_URL / _USERNAME / _PASSWORD in backend/.env.local");
  process.exit(1);
}

const GLOBAL_VLESS_SERVICE_ID = 5; // "VLESS Global" service — add new VLESS inbounds here

// ── Parse CLI args ──────────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : null;
  };
  return {
    sgPubkey: get("--sg-pubkey"),
    sgSid:    get("--sg-sid"),
    tkPubkey: get("--tk-pubkey"),
    tkSid:    get("--tk-sid"),
  };
}

const { sgPubkey, sgSid, tkPubkey, tkSid } = parseArgs();
if (!sgPubkey || !sgSid || !tkPubkey || !tkSid) {
  console.error("Usage: node setup-premium-services.mjs \\");
  console.error("         --sg-pubkey <SG_PUBLIC_KEY> --sg-sid <SG_SHORT_ID> \\");
  console.error("         --tk-pubkey <TK_PUBLIC_KEY> --tk-sid <TK_SHORT_ID>");
  console.error("\nAll four values come from setup-marznode-premium.sh output.");
  process.exit(1);
}

const SERVERS = [
  {
    name: "Singapore #2",
    address: "165.22.242.245",
    pubkey: sgPubkey,
    sid: sgSid,
    ssServiceName: "SS - Singapore-2",
  },
  {
    name: "Tokyo #1",
    address: "107.191.53.200",
    pubkey: tkPubkey,
    sid: tkSid,
    ssServiceName: "SS - Tokyo-1",
  },
];

async function getToken() {
  const { data } = await axios.post(
    `${PANEL_URL}/api/admins/token`,
    new URLSearchParams({ username: USERNAME, password: PASSWORD, grant_type: "password" }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );
  return data.access_token;
}

async function createInbound(api, label, nodeId, payload) {
  try {
    const { data } = await api.post("/api/inbounds", payload);
    console.log(`  ✓ ${label} inbound created: id=${data.id}`);
    return data;
  } catch (e) {
    const s = e.response?.status;
    const d = JSON.stringify(e.response?.data);
    if (s === 409 || d?.toLowerCase().includes("already")) {
      console.log(`  ✓ ${label} inbound already exists`);
      return null; // caller should look it up
    }
    console.error(`  ✗ Failed to create ${label} inbound: HTTP ${s} — ${d}`);
    return null;
  }
}

async function createService(api, name, inboundIds) {
  try {
    const existing = await api.get("/api/services").then(r => (r.data.items || r.data) ?? []);
    const found = existing.find(s => s.name === name);
    if (found) {
      console.log(`  ✓ Service "${name}" already exists: id=${found.id}`);
      return found;
    }
    const { data } = await api.post("/api/services", { name, inbound_ids: inboundIds });
    console.log(`  ✓ Service "${name}" created: id=${data.id} inbounds=[${data.inbound_ids}]`);
    return data;
  } catch (e) {
    console.error(`  ✗ Failed to create service "${name}": ${e.response?.status} — ${JSON.stringify(e.response?.data)}`);
    return null;
  }
}

async function fixHostAddress(api, inboundId, address, proto) {
  try {
    const { data: hostsData } = await api.get(`/api/inbounds/${inboundId}/hosts`);
    const hosts = hostsData.items || hostsData || [];
    if (hosts.length === 0) {
      console.log(`    No hosts for inbound #${inboundId} — skipping`);
      return;
    }
    const host = hosts[0];
    const payload = {
      remark: `NovaNet ({USERNAME}) [${proto}]`,
      address,
    };
    if (proto === "VLESS Reality") payload.sni = "www.yahoo.com";
    await api.put(`/api/inbounds/hosts/${host.id}`, payload);
    console.log(`    ✓ Host #${host.id} → address=${address} [${proto}]`);
  } catch (e) {
    console.warn(`    ⚠️  Could not fix host for inbound #${inboundId}: ${e.message}`);
  }
}

async function run() {
  const token = await getToken();
  const api = axios.create({
    baseURL: PANEL_URL,
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15000,
  });

  // ── 1. Find our target nodes ─────────────────────────────────────────────
  console.log("=== Finding target nodes ===");
  const { data: nodesData } = await api.get("/api/nodes");
  const nodes = nodesData.items || nodesData;
  const nodeMap = {}; // address → node object
  for (const n of nodes) {
    console.log(`  #${n.id}: ${n.name} — ${n.address} (${n.status})`);
    if (SERVERS.some(s => s.address === n.address)) nodeMap[n.address] = n;
  }

  for (const s of SERVERS) {
    if (!nodeMap[s.address]) {
      console.error(`\n✗ Node not found: ${s.name} (${s.address})`);
      console.error("  Run add-premium-nodes.mjs first.");
      process.exit(1);
    }
    // Marzneshin panel uses "healthy" (not "connected") for active nodes
    if (nodeMap[s.address].status !== "healthy" && nodeMap[s.address].status !== "connected") {
      console.warn(`  ⚠️  ${s.name} status=${nodeMap[s.address].status} (not yet healthy)`);
    }
  }

  // ── 2. Create inbounds per server ────────────────────────────────────────
  const results = {}; // address → { ssInboundId, vlessInboundId, ssServiceId }

  for (const server of SERVERS) {
    const node = nodeMap[server.address];
    console.log(`\n=== ${server.name} (node #${node.id}) ===`);
    results[server.address] = {};

    // SS inbound
    const ssPayload = {
      tag: "Shadowsocks TCP",
      protocol: "shadowsocks",
      node_id: node.id,
      config: JSON.stringify({
        tag: "Shadowsocks TCP",
        protocol: "shadowsocks",
        port: 1080,
        network: null,
        tls: "none",
        sni: [],
        host: [],
        path: null,
        header_type: null,
        flow: null,
        is_fallback: false,
      }),
    };
    const ssInbound = await createInbound(api, "SS", node.id, ssPayload);

    // Resolve SS inbound ID (may already exist)
    let ssInboundId = ssInbound?.id;
    if (!ssInboundId) {
      const { data: ibData } = await api.get("/api/inbounds");
      const all = ibData.items || ibData;
      const found = all.find(ib =>
        (ib.node?.id === node.id || ib.node_id === node.id) &&
        (ib.protocol === "shadowsocks" || ib.tag?.includes("Shadowsocks"))
      );
      if (found) {
        ssInboundId = found.id;
        console.log(`  (found existing SS inbound #${ssInboundId})`);
      }
    }
    results[server.address].ssInboundId = ssInboundId;

    // VLESS Reality inbound
    const vlessPayload = {
      tag: "VLESS TCP REALITY",
      protocol: "vless",
      node_id: node.id,
      config: JSON.stringify({
        tag: "VLESS TCP REALITY",
        protocol: "vless",
        port: 2443,
        network: "tcp",
        tls: "reality",
        sni: ["www.yahoo.com"],
        host: [],
        path: null,
        header_type: null,
        flow: "xtls-rprx-vision",
        is_fallback: false,
        fp: "chrome",
        pbk: server.pubkey,
        sid: server.sid,
      }),
    };
    const vlessInbound = await createInbound(api, "VLESS", node.id, vlessPayload);

    let vlessInboundId = vlessInbound?.id;
    if (!vlessInboundId) {
      const { data: ibData } = await api.get("/api/inbounds");
      const all = ibData.items || ibData;
      const found = all.find(ib =>
        (ib.node?.id === node.id || ib.node_id === node.id) &&
        (ib.protocol === "vless" || ib.tag?.includes("VLESS"))
      );
      if (found) {
        vlessInboundId = found.id;
        console.log(`  (found existing VLESS inbound #${vlessInboundId})`);
      }
    }
    results[server.address].vlessInboundId = vlessInboundId;

    // Fix host addresses
    console.log("  Fixing host addresses...");
    if (ssInboundId)    await fixHostAddress(api, ssInboundId,    server.address, "Shadowsocks");
    if (vlessInboundId) await fixHostAddress(api, vlessInboundId, server.address, "VLESS Reality");

    // Per-server SS service
    if (ssInboundId) {
      const svc = await createService(api, server.ssServiceName, [ssInboundId]);
      results[server.address].ssServiceId = svc?.id;
    }
  }

  // ── 3. Update VLESS Global service ──────────────────────────────────────
  console.log(`\n=== Updating VLESS Global service (id=${GLOBAL_VLESS_SERVICE_ID}) ===`);
  try {
    const { data: vlessSvc } = await api.get(`/api/services/${GLOBAL_VLESS_SERVICE_ID}`);
    const existingIds = vlessSvc.inbound_ids || [];
    const newVlessIds = Object.values(results)
      .map(r => r.vlessInboundId)
      .filter(Boolean);
    const merged = [...new Set([...existingIds, ...newVlessIds])];
    console.log(`  Current inbound_ids: [${existingIds}]`);
    console.log(`  Adding VLESS inbound IDs: [${newVlessIds}]`);
    console.log(`  Merged: [${merged}]`);
    const { data: updated } = await api.put(`/api/services/${GLOBAL_VLESS_SERVICE_ID}`, {
      name: vlessSvc.name,
      inbound_ids: merged,
    });
    console.log(`  ✓ Updated: inbound_ids=[${updated.inbound_ids}]`);
  } catch (e) {
    if (e.response?.status === 404) {
      console.warn(`  ⚠️  VLESS Global service id=${GLOBAL_VLESS_SERVICE_ID} not found!`);
      console.warn("  Recreate it in the panel UI or update GLOBAL_VLESS_SERVICE_ID in this script.");
    } else {
      console.error(`  ✗ Failed: ${e.response?.status} — ${JSON.stringify(e.response?.data)}`);
    }
  }

  // ── 4. Summary ───────────────────────────────────────────────────────────
  console.log("\n=== SUMMARY — fill these into update-dev-db-premium-nodes.mjs ===\n");
  for (const server of SERVERS) {
    const r = results[server.address];
    const ssIds = r.ssServiceId ? `[${r.ssServiceId}]` : "NULL — check panel";
    const vlessIds = `[${GLOBAL_VLESS_SERVICE_ID}]`;
    console.log(`  ${server.name} (${server.address}):`);
    console.log(`    marzneshin_service_ids:       [${r.ssServiceId || "?"}]`);
    console.log(`    marzneshin_vless_service_ids: ${vlessIds}`);
    console.log();
  }
  console.log("Next: edit update-dev-db-premium-nodes.mjs with the service IDs above,");
  console.log("      then: node backend/scripts/update-dev-db-premium-nodes.mjs --dry-run");
}

run().catch(e => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
