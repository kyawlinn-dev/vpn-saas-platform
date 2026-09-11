#!/usr/bin/env node
/**
 * Create per-protocol services in Marzneshin panel:
 * - 1 SS service per node (containing only that node's SS inbound)
 * - 1 global VLESS service (containing all nodes' VLESS inbounds)
 *
 * Current inbounds:
 *   #2: SS     — Node 1 (local)
 *   #3: VLESS  — Node 1 (local)
 *   #4: SS     — Node 2 (SG1)
 *   #5: VLESS  — Node 2 (SG1)
 *   #6: Hyst2  — Node 2 (SG1)
 *   #7: SS     — Node 3 (Trial-SGP)
 *   #8: VLESS  — Node 3 (Trial-SGP)
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

  const services = [
    { name: "SS - Local",     inbound_ids: [2] },      // Node 1 SS only
    { name: "SS - SG1",       inbound_ids: [4] },      // Node 2 SS only
    { name: "SS - Trial-SGP", inbound_ids: [7] },      // Node 3 SS only
    { name: "VLESS Global",   inbound_ids: [3, 5, 8] }, // All VLESS inbounds
  ];

  for (const svc of services) {
    console.log(`Creating service: ${svc.name} — inbounds: [${svc.inbound_ids}]`);
    try {
      const { data } = await api.post("/api/services", svc);
      console.log(`  ✓ Created service #${data.id}: ${data.name}`);
    } catch (e) {
      console.error(`  ✗ Failed:`, e.response?.status, JSON.stringify(e.response?.data));
    }
  }

  // List all services
  console.log("\n=== All services ===");
  const { data: svcData } = await api.get("/api/services");
  const allSvc = svcData.items || svcData;
  for (const s of allSvc) {
    console.log(`  Service #${s.id}: ${s.name} — inbounds: [${s.inbound_ids?.join(",")}]`);
  }
}

run().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
