#!/usr/bin/env node
/**
 * Update hosts for Trial-SGP inbounds to use the correct IP address
 * instead of {SERVER_IP} template.
 */
import "dotenv/config";
import axios from "axios";

const PANEL_URL = "https://panel.novanetmm.com";
const USERNAME = "novanet-admin";
const PASSWORD = "NovaNet3xuiTest2026!";
const TRIAL_IP = "168.144.133.227";

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

  // Host ID 6 = inbound #7 (SS Trial-SGP)
  // Host ID 7 = inbound #8 (VLESS Trial-SGP)
  const updates = [
    {
      hostId: 6,
      inboundId: 7,
      data: {
        remark: "NovaNet Trial-SGP ({USERNAME}) [Shadowsocks]",
        address: TRIAL_IP,
        is_disabled: false,
      },
    },
    {
      hostId: 7,
      inboundId: 8,
      data: {
        remark: "NovaNet Trial-SGP ({USERNAME}) [VLESS Reality]",
        address: TRIAL_IP,
        sni: "www.yahoo.com",
        is_disabled: false,
      },
    },
  ];

  for (const u of updates) {
    console.log(`Updating host #${u.hostId} (inbound #${u.inboundId})...`);
    try {
      const { data } = await api.put(`/api/inbounds/${u.inboundId}/hosts/${u.hostId}`, u.data);
      console.log(`  ✓ Updated: address=${data.address}, remark=${data.remark}`);
    } catch (e) {
      console.error(`  ✗ PUT failed:`, e.response?.status, JSON.stringify(e.response?.data));
      // Try PATCH
      try {
        const { data } = await api.patch(`/api/inbounds/${u.inboundId}/hosts/${u.hostId}`, u.data);
        console.log(`  ✓ Patched: address=${data.address}, remark=${data.remark}`);
      } catch (e2) {
        console.error(`  ✗ PATCH also failed:`, e2.response?.status, JSON.stringify(e2.response?.data));
      }
    }
  }

  // Verify
  console.log("\n=== Verification ===");
  for (const ibId of [7, 8]) {
    const { data } = await api.get(`/api/inbounds/${ibId}/hosts`);
    const host = data.items?.[0];
    console.log(`  Inbound #${ibId}: address=${host?.address}, remark=${host?.remark}, disabled=${host?.is_disabled}`);
  }
}

run().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
