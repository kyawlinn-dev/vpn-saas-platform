#!/usr/bin/env node
/**
 * Smoke test: create a user on the SS - Trial-SGP service (id=4),
 * verify subscription returns SS config for trial node only.
 * Then test with VLESS Global service (id=5) too.
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

  // 1. Test SS service (Trial-SGP only)
  console.log("=== Test 1: SS - Trial-SGP (service 4) ===");
  const ssUsername = `testtriSS${Date.now().toString(36)}`;
  try {
    const { data: user } = await api.post("/api/users", {
      username: ssUsername,
      service_ids: [4],
      data_limit: 1073741824,
      expire_strategy: "never",
    });
    console.log(`✓ Created user: ${user.username} (key: ${user.key})`);

    // Fetch subscription
    const subUrl = `${PANEL_URL}/sub/${user.username}/${user.key}`;
    const { data: sub } = await axios.get(subUrl, { headers: { "User-Agent": "v2ray" } });
    const decoded = Buffer.from(sub, "base64").toString("utf-8");
    console.log(`  Subscription configs:`);
    for (const line of decoded.split("\n").filter(Boolean)) {
      console.log(`    ${line.substring(0, 120)}${line.length > 120 ? "..." : ""}`);
    }

    // Should only have SS config for 168.144.133.227
    const hasSS = decoded.includes("ss://");
    const hasTrialIP = decoded.includes("168.144.133.227");
    const hasOtherIP = decoded.includes("139.59.126.185");
    console.log(`  ✓ Has SS: ${hasSS}, Has trial IP: ${hasTrialIP}, Has other IPs: ${hasOtherIP}`);

    // Cleanup
    await api.delete(`/api/users/${user.username}`);
    console.log(`  ✓ Test user deleted`);
  } catch (e) {
    console.error("✗ Failed:", e.response?.status, JSON.stringify(e.response?.data || e.message));
  }

  // 2. Test VLESS Global service
  console.log("\n=== Test 2: VLESS Global (service 5) ===");
  const vlessUsername = `testtriVL${Date.now().toString(36)}`;
  try {
    const { data: user } = await api.post("/api/users", {
      username: vlessUsername,
      service_ids: [5],
      data_limit: 1073741824,
      expire_strategy: "never",
    });
    console.log(`✓ Created user: ${user.username} (key: ${user.key})`);

    // Fetch subscription
    const subUrl = `${PANEL_URL}/sub/${user.username}/${user.key}`;
    const { data: sub } = await axios.get(subUrl, { headers: { "User-Agent": "v2ray" } });
    const decoded = Buffer.from(sub, "base64").toString("utf-8");
    console.log(`  Subscription configs:`);
    for (const line of decoded.split("\n").filter(Boolean)) {
      console.log(`    ${line.substring(0, 120)}${line.length > 120 ? "..." : ""}`);
    }

    // Should have VLESS configs for ALL nodes
    const hasVless = decoded.includes("vless://");
    const nodeIPs = ["127.0.0.1", "139.59.126.185", "168.144.133.227"];
    for (const ip of nodeIPs) {
      console.log(`  ${ip}: ${decoded.includes(ip) ? "✓ present" : "✗ missing"}`);
    }

    // Cleanup
    await api.delete(`/api/users/${user.username}`);
    console.log(`  ✓ Test user deleted`);
  } catch (e) {
    console.error("✗ Failed:", e.response?.status, JSON.stringify(e.response?.data || e.message));
  }
}

run().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
