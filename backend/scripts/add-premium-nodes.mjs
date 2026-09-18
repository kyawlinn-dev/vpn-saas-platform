#!/usr/bin/env node
/**
 * Register Singapore #2 and Tokyo #1 as nodes in the Marzneshin panel,
 * then clean up stale nodes pointing at decommissioned server IPs.
 *
 * Prerequisites:
 *   - Marznode must be running on both servers (run setup-marznode-premium.sh first)
 *
 * Run: node backend/scripts/add-premium-nodes.mjs
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

// New premium nodes to register
const NEW_NODES = [
  { name: "Singapore #2", address: "165.22.242.245", port: 62050 },
  { name: "Tokyo #1",     address: "107.191.53.200", port: 62050 },
];

// Stale node IPs to remove from the panel (decommissioned servers)
const STALE_IPS = new Set([
  "165.22.110.55",   // Singapore #1 (retired 2026-09-09)
  "64.176.61.174",   // Osaka #1 (Vultr, IP-blocked)
  "64.176.63.188",   // Osaka #2 (Vultr, decommissioned)
  "207.148.72.190",  // Singapore #2 Vultr (decommissioned)
]);

async function getToken() {
  const { data } = await axios.post(
    `${PANEL_URL}/api/admins/token`,
    new URLSearchParams({ username: USERNAME, password: PASSWORD, grant_type: "password" }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );
  return data.access_token;
}

async function listNodes(api) {
  const { data } = await api.get("/api/nodes");
  return data.items || data;
}

async function addNode(api, { name, address, port }) {
  console.log(`\n--- Adding node: ${name} (${address}:${port}) ---`);
  try {
    const { data: node } = await api.post("/api/nodes", {
      name,
      address,
      port,
      connection_backend: "grpclib",
      usage_coefficient: 1,
    });
    console.log(`✓ Node created: id=${node.id}, status=${node.status}`);
    return node;
  } catch (e) {
    const status = e.response?.status;
    const detail = JSON.stringify(e.response?.data);
    if (status === 409 || detail?.toLowerCase().includes("already")) {
      console.log(`  Node already exists — skipping creation`);
      return null; // will be found in the list below
    }
    console.error(`✗ Failed to add node ${name}: HTTP ${status} — ${detail}`);
    throw e;
  }
}

async function removeStaleNodes(api, nodes) {
  const stale = nodes.filter(n => STALE_IPS.has(n.address));
  if (stale.length === 0) {
    console.log("\n✓ No stale nodes found in panel");
    return;
  }
  console.log(`\n--- Removing ${stale.length} stale node(s) ---`);
  for (const n of stale) {
    try {
      await api.delete(`/api/nodes/${n.id}`);
      console.log(`  ✓ Removed: ${n.name} (${n.address}) id=${n.id}`);
    } catch (e) {
      console.warn(`  ✗ Failed to remove ${n.name} (${n.address}): ${e.response?.status} ${JSON.stringify(e.response?.data)}`);
    }
  }
}

async function waitForConnected(api, addresses, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  console.log(`\n--- Waiting for nodes to connect (up to ${timeoutMs / 1000}s) ---`);
  while (Date.now() < deadline) {
    const nodes = await listNodes(api);
    const targets = nodes.filter(n => addresses.includes(n.address));
    // Marzneshin panel uses "healthy" (not "connected") for active nodes
    const connected = targets.filter(n => n.status === "healthy" || n.status === "connected");
    const pending = targets.filter(n => n.status !== "healthy" && n.status !== "connected");

    for (const n of connected) {
      console.log(`  ✓ ${n.name} (${n.address}) — connected`);
    }
    for (const n of pending) {
      console.log(`  ⏳ ${n.name} (${n.address}) — ${n.status}`);
    }

    if (pending.length === 0 && connected.length === addresses.length) {
      console.log("✓ All target nodes connected!\n");
      return targets;
    }

    await new Promise(r => setTimeout(r, 5000));
  }
  console.warn("⚠️  Timeout waiting for nodes to connect. Check marznode Docker containers.");
  return await listNodes(api).then(nodes => nodes.filter(n => addresses.includes(n.address)));
}

async function run() {
  const token = await getToken();
  const api = axios.create({
    baseURL: PANEL_URL,
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15000,
  });

  // 1. List current nodes
  console.log("=== Current nodes in panel ===");
  let nodes = await listNodes(api);
  for (const n of nodes) {
    const staleFlag = STALE_IPS.has(n.address) ? " ← STALE" : "";
    console.log(`  #${n.id}: ${n.name} — ${n.address}:${n.port} (${n.status})${staleFlag}`);
  }

  // 2. Remove stale nodes
  await removeStaleNodes(api, nodes);

  // 3. Add new nodes
  const targetAddresses = NEW_NODES.map(n => n.address);
  for (const nodeSpec of NEW_NODES) {
    await addNode(api, nodeSpec);
  }

  // 4. Wait for connections
  const connectedNodes = await waitForConnected(api, targetAddresses);

  // 5. Final summary
  console.log("=== Final node list ===");
  const allNodes = await listNodes(api);
  for (const n of allNodes) {
    console.log(`  #${n.id}: ${n.name} — ${n.address}:${n.port} (${n.status})`);
  }

  console.log("\n=== Node IDs for next step (setup-premium-services.mjs) ===");
  for (const n of allNodes) {
    if (targetAddresses.includes(n.address)) {
      console.log(`  ${n.name}: node_id=${n.id}`);
    }
  }
  console.log("\nNext: node backend/scripts/setup-premium-services.mjs");
}

run().catch(e => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
