#!/usr/bin/env node
import "../src/lib/loadEnv.js";
import axios from "axios";

const PANEL_URL = process.env.MARZNESHIN_PANEL_URL;
const USERNAME = process.env.MARZNESHIN_PANEL_USERNAME;
const PASSWORD = process.env.MARZNESHIN_PANEL_PASSWORD;
if (!PANEL_URL || !USERNAME || !PASSWORD) {
  throw new Error("MARZNESHIN_PANEL_URL, MARZNESHIN_PANEL_USERNAME, and MARZNESHIN_PANEL_PASSWORD are required");
}
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

  // Try various host update endpoints
  const hostId = 6;
  const inboundId = 7;
  const payload = {
    remark: "NovaNet Trial-SGP ({USERNAME}) [Shadowsocks]",
    address: TRIAL_IP,
  };

  const endpoints = [
    { method: "put", url: `/api/hosts/${hostId}` },
    { method: "patch", url: `/api/hosts/${hostId}` },
    { method: "put", url: `/api/inbounds/${inboundId}/hosts/${hostId}` },
    { method: "put", url: `/api/inbounds/hosts/${hostId}` },
    { method: "put", url: `/api/host/${hostId}` },
  ];

  for (const ep of endpoints) {
    try {
      const { data } = await api[ep.method](ep.url, payload);
      console.log(`✓ ${ep.method.toUpperCase()} ${ep.url} worked:`, JSON.stringify(data));
      return;
    } catch (e) {
      console.log(`✗ ${ep.method.toUpperCase()} ${ep.url}: ${e.response?.status} ${JSON.stringify(e.response?.data?.detail || "")}`);
    }
  }

  // Try to find the API docs
  console.log("\n--- Trying to find API routes ---");
  try {
    const { data } = await api.get("/docs");
    console.log("Docs available at /docs");
  } catch (e) {
    console.log(`/docs: ${e.response?.status}`);
  }
  try {
    const { data } = await api.get("/openapi.json");
    // Find host-related endpoints
    const paths = Object.keys(data.paths || {}).filter(p => p.includes("host"));
    console.log("Host endpoints:", paths);
  } catch (e) {
    console.log(`/openapi.json: ${e.response?.status}`);
  }
}

run().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
