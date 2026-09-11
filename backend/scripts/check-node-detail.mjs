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

  const { data: node } = await api.get("/api/nodes/3");
  console.log("Node 3:", JSON.stringify(node, null, 2));

  // Check inbound 7 and 8 detail
  for (const id of [7, 8]) {
    const { data: ib } = await api.get(`/api/inbounds/${id}`);
    console.log(`\nInbound #${id}:`, JSON.stringify(ib, null, 2));
  }
}

run().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
