#!/usr/bin/env node
import "../src/lib/loadEnv.js";
import axios from "axios";

const PANEL_URL = process.env.MARZNESHIN_PANEL_URL;
const USERNAME = process.env.MARZNESHIN_PANEL_USERNAME;
const PASSWORD = process.env.MARZNESHIN_PANEL_PASSWORD;
if (!PANEL_URL || !USERNAME || !PASSWORD) {
  throw new Error("MARZNESHIN_PANEL_URL, MARZNESHIN_PANEL_USERNAME, and MARZNESHIN_PANEL_PASSWORD are required");
}

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
