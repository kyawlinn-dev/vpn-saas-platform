#!/usr/bin/env node
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

  // Fix VLESS host (id=7, inbound #8)
  console.log("Updating VLESS host #7...");
  const { data } = await api.put("/api/inbounds/hosts/7", {
    remark: "NovaNet Trial-SGP ({USERNAME}) [VLESS Reality]",
    address: TRIAL_IP,
    sni: "www.yahoo.com",
  });
  console.log(`✓ Updated: address=${data.address}, sni=${data.sni}, remark=${data.remark}`);

  // Verify both hosts
  console.log("\n=== Verification ===");
  for (const ibId of [7, 8]) {
    const { data: hosts } = await api.get(`/api/inbounds/${ibId}/hosts`);
    const h = hosts.items?.[0];
    console.log(`  Inbound #${ibId}: address=${h?.address}, remark=${h?.remark}`);
  }

  // Now test subscription
  console.log("\n=== Subscription test ===");
  const { data: user } = await api.post("/api/users", {
    username: "hostfixtest1",
    service_ids: [4], // SS Trial-SGP
    data_limit: 1073741824,
    expire_strategy: "never",
  });

  const subUrl = `${PANEL_URL}/sub/${user.username}/${user.key}`;
  const { data: sub } = await axios.get(subUrl, { headers: { "User-Agent": "v2ray" } });
  const decoded = Buffer.from(sub, "base64").toString("utf-8");
  for (const line of decoded.split("\n").filter(Boolean)) {
    const ipMatch = line.match(/@([\d.]+):/);
    console.log(`  ${line.startsWith("ss://") ? "SS" : "VLESS"} → ${ipMatch?.[1] || "?"}`);
  }

  await api.delete("/api/users/hostfixtest1");

  // Test VLESS Global too
  const { data: user2 } = await api.post("/api/users", {
    username: "hostfixtest2",
    service_ids: [5], // VLESS Global
    data_limit: 1073741824,
    expire_strategy: "never",
  });

  const subUrl2 = `${PANEL_URL}/sub/${user2.username}/${user2.key}`;
  const { data: sub2 } = await axios.get(subUrl2, { headers: { "User-Agent": "v2ray" } });
  const decoded2 = Buffer.from(sub2, "base64").toString("utf-8");
  console.log("\n  VLESS Global:");
  for (const line of decoded2.split("\n").filter(Boolean)) {
    const ipMatch = line.match(/@([\d.]+):/);
    console.log(`    VLESS → ${ipMatch?.[1] || "?"}`);
  }

  await api.delete("/api/users/hostfixtest2");
  console.log("\n✓ All tests cleaned up");
}

run().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
