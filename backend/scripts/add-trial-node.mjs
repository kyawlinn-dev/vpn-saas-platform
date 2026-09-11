#!/usr/bin/env node
/**
 * Add the trial server as a new node in the Marzneshin panel,
 * then create its inbounds (SS + VLESS).
 */
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

  // 1. Add the node
  console.log("=== Adding Trial-SGP node ===");
  try {
    const { data: node } = await api.post("/api/nodes", {
      name: "Trial-SGP",
      address: "168.144.133.227",
      port: 62050,
      connection_backend: "grpclib",
      usage_coefficient: 1,
    });
    console.log("✓ Node created:", JSON.stringify(node, null, 2));
  } catch (e) {
    if (e.response?.status === 409 || e.response?.data?.detail?.includes?.("already")) {
      console.log("Node may already exist, checking...");
    } else {
      console.error("✗ Failed:", e.response?.status, JSON.stringify(e.response?.data));
    }
  }

  // 2. Check all nodes
  console.log("\n=== Current nodes ===");
  const { data: nodesData } = await api.get("/api/nodes");
  const nodes = nodesData.items || nodesData;
  for (const n of nodes) {
    console.log(`  Node #${n.id}: ${n.name} — ${n.address}:${n.port} (status: ${n.status})`);
  }
}

run().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
