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

  // Check hosts
  const endpoints = ["/api/hosts", "/api/hosts/"];
  for (const ep of endpoints) {
    try {
      const { data } = await api.get(ep);
      console.log(`${ep}:`, JSON.stringify(data, null, 2));
    } catch (e) {
      console.log(`${ep}: ${e.response?.status} ${JSON.stringify(e.response?.data || e.message)}`);
    }
  }

  // Check inbound hosts
  for (const ibId of [2, 3, 4, 5, 7, 8]) {
    try {
      const { data } = await api.get(`/api/hosts?inbound_id=${ibId}`);
      console.log(`\nHosts for inbound #${ibId}:`, JSON.stringify(data, null, 2));
    } catch (e) {
      // Try alternative endpoint
      try {
        const { data } = await api.get(`/api/inbounds/${ibId}/hosts`);
        console.log(`\nHosts for inbound #${ibId}:`, JSON.stringify(data, null, 2));
      } catch (e2) {
        console.log(`Inbound #${ibId} hosts: ${e2.response?.status}`);
      }
    }
  }
}

run().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
