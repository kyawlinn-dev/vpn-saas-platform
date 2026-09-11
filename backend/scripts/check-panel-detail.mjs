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

  // Get detailed node info
  console.log("\n=== NODE DETAILS ===");
  for (const nodeId of [1, 2]) {
    try {
      const { data } = await api.get(`/api/nodes/${nodeId}`);
      console.log(`\n  Node #${nodeId}:`, JSON.stringify(data, null, 4));
    } catch (e) { console.error(`  Node #${nodeId} failed:`, e.response?.status); }
  }

  // Get detailed inbound info
  console.log("\n=== INBOUND DETAILS ===");
  for (const ibId of [2, 3, 4, 5, 6]) {
    try {
      const { data } = await api.get(`/api/inbounds/${ibId}`);
      console.log(`\n  Inbound #${ibId}:`, JSON.stringify(data, null, 4));
    } catch (e) { console.error(`  Inbound #${ibId} failed:`, e.response?.status); }
  }

  // Get detailed service info
  console.log("\n=== SERVICE DETAILS ===");
  try {
    const { data } = await api.get(`/api/services/1`);
    console.log(`  Service #1:`, JSON.stringify(data, null, 4));
  } catch (e) { console.error(`  Service #1 failed:`, e.response?.status, e.response?.data); }

  // Test user subscription URL
  console.log("\n=== TEST USER SUBSCRIPTION ===");
  try {
    const { data: user } = await api.get("/api/users/testkyaw");
    console.log(`  Username: ${user.username}`);
    console.log(`  Key: ${user.key}`);
    console.log(`  Sub URL: ${PANEL_URL}/sub/${user.username}/${user.key}`);
    console.log(`  Services: [${user.service_ids?.join(",")}]`);
    console.log(`  Status: ${user.status}`);
    console.log(`  Data limit: ${user.data_limit}`);
    console.log(`  Used traffic: ${user.used_traffic}`);

    // Fetch the subscription
    const subUrl = `${PANEL_URL}/sub/${user.username}/${user.key}`;
    const { data: subData } = await axios.get(subUrl, {
      headers: { "User-Agent": "v2ray" },
      timeout: 10000,
    });
    const decoded = Buffer.from(subData, "base64").toString("utf-8");
    console.log(`\n  Subscription configs:`);
    for (const line of decoded.split("\n").filter(Boolean)) {
      console.log(`    ${line.substring(0, 120)}${line.length > 120 ? "..." : ""}`);
    }
  } catch (e) { console.error("  Failed:", e.response?.status, e.message); }
}

run().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
