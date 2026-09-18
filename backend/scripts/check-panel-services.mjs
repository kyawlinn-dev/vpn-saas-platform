#!/usr/bin/env node
/**
 * Audit Marzneshin panel: nodes, inbounds, and services.
 * Shows which inbounds in VLESS Global (#5) belong to dead/removed nodes.
 *
 * Reads panel credentials from env (backend/.env.local):
 *   MARZNESHIN_PANEL_URL       e.g. https://panel.novanetmm.com
 *   MARZNESHIN_PANEL_USERNAME  admin username
 *   MARZNESHIN_PANEL_PASSWORD  admin password
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

async function getToken() {
  const { data } = await axios.post(
    `${PANEL_URL}/api/admins/token`,
    new URLSearchParams({ username: USERNAME, password: PASSWORD, grant_type: "password" }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 10000 }
  );
  return data.access_token;
}

async function run() {
  const token = await getToken();
  const api = axios.create({
    baseURL: PANEL_URL,
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15000,
  });

  // ── Nodes ────────────────────────────────────────────────────────────────
  console.log("=== Panel Nodes ===");
  const { data: nodesData } = await api.get("/api/nodes");
  const nodes = nodesData.items || nodesData;
  const nodeById = {};
  for (const n of nodes) {
    nodeById[n.id] = n;
    const flag = n.status === "healthy" ? "✅" : n.status === "disabled" ? "🔴" : "⚠️ ";
    console.log(`  #${n.id}: [${flag} ${n.status}] ${n.name} — ${n.address}:${n.port}`);
  }

  // ── All Inbounds ─────────────────────────────────────────────────────────
  console.log("\n=== Panel Inbounds ===");
  const { data: ibData } = await api.get("/api/inbounds");
  const inbounds = ibData.items || ibData;
  const inboundById = {};
  for (const ib of inbounds) {
    inboundById[ib.id] = ib;
    const nodeId = ib.node_id ?? ib.node?.id;
    const node = nodeById[nodeId];
    const nodeInfo = node ? `${node.name} (${node.address}) [${node.status}]` : `node_id=${nodeId} ← NOT IN PANEL`;
    console.log(`  Inbound #${ib.id}: [${ib.protocol}] "${ib.tag}" → ${nodeInfo}`);
  }

  // ── All Services ─────────────────────────────────────────────────────────
  console.log("\n=== Panel Services ===");
  const { data: svcData } = await api.get("/api/services");
  const services = svcData.items || svcData;
  for (const svc of services) {
    const ids = svc.inbound_ids || [];
    console.log(`\n  Service #${svc.id}: "${svc.name}" — inbound_ids=${JSON.stringify(ids)}`);
    for (const ibId of ids) {
      const ib = inboundById[ibId];
      if (!ib) {
        console.log(`    ❌ Inbound #${ibId}: NOT FOUND IN PANEL (stale)`);
        continue;
      }
      const nodeId = ib.node_id ?? ib.node?.id;
      const node = nodeById[nodeId];
      const nodeStatus = node ? `[${node.status}] ${node.name} ${node.address}` : `ORPHAN (node_id=${nodeId} missing)`;
      const flag = node?.status === "healthy" ? "✅" : "❌";
      console.log(`    ${flag} Inbound #${ibId} [${ib.protocol}] "${ib.tag}" → ${nodeStatus}`);
    }
  }

  // ── VLESS Global (#5) deep audit ─────────────────────────────────────────
  console.log("\n=== VLESS Global Service #5 — Detailed Audit ===");
  let vlessInboundIds = [];
  try {
    const { data: vless } = await api.get("/api/services/5");
    vlessInboundIds = vless.inbound_ids || [];
    console.log(`  Current inbound_ids: ${JSON.stringify(vlessInboundIds)}`);
    const stale   = vlessInboundIds.filter(id => {
      const ib = inboundById[id];
      if (!ib) return true;
      const node = nodeById[ib.node_id ?? ib.node?.id];
      return !node || node.status !== "healthy";
    });
    const healthy = vlessInboundIds.filter(id => {
      const ib = inboundById[id];
      if (!ib) return false;
      const node = nodeById[ib.node_id ?? ib.node?.id];
      return node && node.status === "healthy";
    });
    console.log(`  Healthy: ${JSON.stringify(healthy)}`);
    console.log(`  Stale/dead: ${JSON.stringify(stale)}`);
    if (stale.length > 0) {
      console.log(`\n  ⚠️  RECOMMENDED FIX: update service #5 inbound_ids to ${JSON.stringify(healthy)}`);
      console.log(`  (removes ${stale.length} inbound(s) tied to non-healthy/missing nodes)`);
    } else {
      console.log("  ✅ All inbounds in VLESS Global are healthy");
    }
  } catch (e) {
    console.error("  Failed to fetch service #5:", e.message);
  }

  // ── Host records for every inbound in VLESS Global ────────────────────────
  // This reveals whether each inbound has a correct public IP in its host config.
  // A missing or localhost address here causes "127.0.0.1" in the subscription
  // and prevents clients from connecting to that node.
  console.log("\n=== Host Records for VLESS Global Inbounds ===");
  for (const ibId of vlessInboundIds) {
    const ib = inboundById[ibId];
    const nodeId = ib?.node_id ?? ib?.node?.id;
    const node = nodeById[nodeId];
    console.log(`\n  Inbound #${ibId} [${ib?.protocol || "?"}] "${ib?.tag || "?"}" → ${node?.name || "unknown"} (${node?.address || "?"})`);
    try {
      const { data: hostsData } = await api.get(`/api/inbounds/${ibId}/hosts`);
      const hosts = hostsData?.items || (Array.isArray(hostsData) ? hostsData : []);
      if (hosts.length === 0) {
        console.log("    ❌ NO HOST RECORDS — subscription will use fallback/internal address");
      } else {
        for (const h of hosts) {
          const addr = h.address || h.host || "(empty)";
          const isBad = !addr || addr === "(empty)" || addr.startsWith("127.") || addr.startsWith("{");
          const flag = isBad ? "❌ BAD" : "✅";
          console.log(`    ${flag} Host #${h.id}: address=${addr} | port=${h.port ?? "inherited"} | sni=${h.sni || "(none)"} | remark=${h.remark || "(none)"}`);
        }
      }
    } catch (e) {
      console.error(`    ✗ Failed to fetch hosts for inbound #${ibId}: ${e.message}`);
    }
  }
}

run().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
