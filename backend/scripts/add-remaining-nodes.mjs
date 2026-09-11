#!/usr/bin/env node
import "dotenv/config";
import axios from "axios";

const PANEL_URL = "https://panel.novanetmm.com";
const USERNAME = "novanet-admin";
const PASSWORD = "NovaNet3xuiTest2026!";

async function getToken() {
  const { data } = await axios.post(
    `${PANEL_URL}/api/admins/token`,
    new URLSearchParams({ username: USERNAME, password: PASSWORD, grant_type: "password" }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
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

  // Add sgp1-3111
  console.log("=== Adding SGP1-3111 node ===");
  try {
    const { data } = await api.post("/api/nodes", {
      name: "SGP1-3111",
      address: "165.22.110.55",
      port: 62050,
      connection_backend: "grpclib",
      usage_coefficient: 1,
    });
    console.log(`✓ Node #${data.id}: ${data.name} — status: ${data.status}`);
  } catch (e) {
    console.error("✗", e.response?.status, JSON.stringify(e.response?.data));
  }

  // Add Osaka
  console.log("\n=== Adding Osaka node ===");
  try {
    const { data } = await api.post("/api/nodes", {
      name: "Osaka",
      address: "64.176.61.174",
      port: 62050,
      connection_backend: "grpclib",
      usage_coefficient: 1,
    });
    console.log(`✓ Node #${data.id}: ${data.name} — status: ${data.status}`);
  } catch (e) {
    console.error("✗", e.response?.status, JSON.stringify(e.response?.data));
  }

  // Wait a moment for nodes to connect
  console.log("\nWaiting 5s for nodes to connect...");
  await new Promise(r => setTimeout(r, 5000));

  // List all nodes
  console.log("\n=== All nodes ===");
  const { data: nodesData } = await api.get("/api/nodes");
  const nodes = nodesData.items || nodesData;
  for (const n of nodes) {
    console.log(`  Node #${n.id}: ${n.name} — ${n.address}:${n.port} (status: ${n.status}, inbounds: [${n.inbound_ids}])`);
  }

  // List all inbounds
  console.log("\n=== All inbounds ===");
  const { data: ibData } = await api.get("/api/inbounds");
  const inbounds = ibData.items || ibData;
  for (const ib of inbounds) {
    console.log(`  Inbound #${ib.id}: ${ib.tag} (${ib.protocol}) — node: ${ib.node?.name}`);
  }
}

run().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
