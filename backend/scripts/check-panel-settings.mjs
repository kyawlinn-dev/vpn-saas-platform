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

  // Check panel settings/config
  const endpoints = ["/api/system", "/api/system/settings", "/api/core/config", "/api/config"];
  for (const ep of endpoints) {
    try {
      const { data } = await api.get(ep);
      console.log(`${ep}:`, JSON.stringify(data, null, 2));
    } catch (e) {
      console.log(`${ep}: ${e.response?.status || e.message}`);
    }
  }

  // Check the full test user subscription (re-create briefly)
  console.log("\n=== Full subscription test ===");
  const { data: user } = await api.post("/api/users", {
    username: "subtest001",
    service_ids: [4], // SS Trial-SGP
    data_limit: 1073741824,
    expire_strategy: "never",
  });

  const subUrl = `${PANEL_URL}/sub/${user.username}/${user.key}`;
  console.log(`Sub URL: ${subUrl}`);

  // Try different User-Agents
  for (const ua of ["v2ray", "Outline", "Hiddify", "clash"]) {
    try {
      const { data: sub, headers } = await axios.get(subUrl, { headers: { "User-Agent": ua } });
      console.log(`\n--- User-Agent: ${ua} ---`);
      console.log(`Content-Type: ${headers["content-type"]}`);
      try {
        const decoded = Buffer.from(sub, "base64").toString("utf-8");
        console.log(decoded.substring(0, 500));
      } catch {
        console.log(typeof sub === "string" ? sub.substring(0, 500) : JSON.stringify(sub).substring(0, 500));
      }
    } catch (e) {
      console.log(`UA ${ua}: ${e.response?.status}`);
    }
  }

  await api.delete("/api/users/subtest001");
  console.log("\n✓ Test user cleaned up");
}

run().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
