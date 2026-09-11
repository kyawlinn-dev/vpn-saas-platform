#!/usr/bin/env node
/**
 * Quick check of Marzneshin panel: nodes, inbounds, services, users
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

  console.log("\n=== NODES ===");
  try {
    const { data } = await api.get("/api/nodes");
    const nodes = data.items || data;
    for (const n of nodes) {
      console.log(`  Node #${n.id}: ${n.name} — ${n.address}:${n.port} (status: ${n.status})`);
    }
  } catch (e) { console.error("  Failed:", e.response?.status, e.response?.data || e.message); }

  console.log("\n=== INBOUNDS ===");
  try {
    const { data } = await api.get("/api/inbounds");
    const inbounds = data.items || data;
    for (const ib of inbounds) {
      console.log(`  Inbound #${ib.id}: tag=${ib.tag}, protocol=${ib.protocol}, node_id=${ib.node_id}`);
    }
  } catch (e) { console.error("  Failed:", e.response?.status, e.response?.data || e.message); }

  console.log("\n=== SERVICES ===");
  try {
    const { data } = await api.get("/api/services");
    const services = data.items || data;
    for (const s of services) {
      console.log(`  Service #${s.id}: ${s.name} — inbound_ids: [${s.inbound_ids?.join(",")}]`);
    }
  } catch (e) { console.error("  Failed:", e.response?.status, e.response?.data || e.message); }

  console.log("\n=== USERS (first 10) ===");
  try {
    const { data } = await api.get("/api/users?limit=10&offset=0");
    const users = data.items || data;
    for (const u of users) {
      console.log(`  ${u.username} — status: ${u.status}, services: [${u.service_ids?.join(",")}], traffic: ${u.used_traffic || 0}`);
    }
    console.log(`  Total: ${data.total ?? users.length}`);
  } catch (e) { console.error("  Failed:", e.response?.status, e.response?.data || e.message); }

  console.log("\n=== SYSTEM ===");
  try {
    const { data } = await api.get("/api/system");
    console.log(`  Version: ${data.version}, Uptime: ${data.uptime}`);
    console.log(`  Nodes: ${JSON.stringify(data.nodes_status || {})}`);
  } catch (e) { console.error("  Failed:", e.response?.status, e.response?.data || e.message); }
}

run().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
