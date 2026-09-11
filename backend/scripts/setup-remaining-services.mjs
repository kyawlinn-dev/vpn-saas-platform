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

  // 1. Create per-node SS services for new nodes
  const newServices = [
    { name: "SS - SGP1-3111", inbound_ids: [9] },   // Node 4 SS only
    { name: "SS - Osaka",     inbound_ids: [11] },   // Node 5 SS only
  ];

  for (const svc of newServices) {
    console.log(`Creating service: ${svc.name}...`);
    try {
      const { data } = await api.post("/api/services", svc);
      console.log(`  ✓ Service #${data.id}: ${data.name} — inbounds: [${data.inbound_ids}]`);
    } catch (e) {
      console.error(`  ✗ Failed:`, e.response?.status, JSON.stringify(e.response?.data));
    }
  }

  // 2. Update VLESS Global service (id=5) to include new VLESS inbounds (10, 12)
  // Current: [3, 5, 8] → New: [3, 5, 8, 10, 12]
  console.log("\nUpdating VLESS Global service to include new VLESS inbounds...");
  try {
    const { data } = await api.put("/api/services/5", {
      name: "VLESS Global",
      inbound_ids: [3, 5, 8, 10, 12],
    });
    console.log(`  ✓ Updated: inbounds: [${data.inbound_ids}]`);
  } catch (e) {
    console.error(`  ✗ Failed:`, e.response?.status, JSON.stringify(e.response?.data));
  }

  // 3. Fix hosts for new inbounds (set correct IPs instead of {SERVER_IP})
  const hostFixes = [
    // Need to find host IDs first
  ];

  // Get hosts for new inbounds
  for (const ibId of [9, 10, 11, 12]) {
    const { data: hosts } = await api.get(`/api/inbounds/${ibId}/hosts`);
    const host = hosts.items?.[0];
    if (host) {
      console.log(`\n  Inbound #${ibId} host #${host.id}: address=${host.address}, remark=${host.remark}`);
      hostFixes.push({ hostId: host.id, inboundId: ibId });
    }
  }

  // Fix host addresses
  const ipMap = {
    9: { ip: "165.22.110.55", name: "SGP1-3111", proto: "Shadowsocks" },
    10: { ip: "165.22.110.55", name: "SGP1-3111", proto: "VLESS Reality" },
    11: { ip: "64.176.61.174", name: "Osaka", proto: "Shadowsocks" },
    12: { ip: "64.176.61.174", name: "Osaka", proto: "VLESS Reality" },
  };

  console.log("\nFixing host addresses...");
  for (const { hostId, inboundId } of hostFixes) {
    const info = ipMap[inboundId];
    const payload = {
      remark: `NovaNet ${info.name} ({USERNAME}) [${info.proto}]`,
      address: info.ip,
    };
    if (info.proto === "VLESS Reality") {
      payload.sni = "www.yahoo.com";
    }
    try {
      const { data } = await api.put(`/api/inbounds/hosts/${hostId}`, payload);
      console.log(`  ✓ Host #${hostId} (inbound #${inboundId}): ${data.address} — ${data.remark}`);
    } catch (e) {
      console.error(`  ✗ Host #${hostId}:`, e.response?.status, JSON.stringify(e.response?.data));
    }
  }

  // 4. Final overview
  console.log("\n=== Final Service Overview ===");
  const { data: svcData } = await api.get("/api/services");
  const allSvc = svcData.items || svcData;
  for (const s of allSvc) {
    console.log(`  Service #${s.id}: ${s.name} — inbounds: [${s.inbound_ids?.join(",")}]`);
  }
}

run().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
