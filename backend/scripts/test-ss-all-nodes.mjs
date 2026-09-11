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

function decodeSub(b64) {
  return Buffer.from(b64, "base64").toString("utf-8");
}

async function run() {
  const token = await getToken();
  const api = axios.create({
    baseURL: PANEL_URL,
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15000,
  });

  // Test SS on each per-node service
  const tests = [
    { name: "SS-Local (svc 2)", service_ids: [2] },
    { name: "SS-SG1 (svc 3)",   service_ids: [3] },
    { name: "SS-Trial (svc 4)", service_ids: [4] },
    { name: "VLESS Global (svc 5)", service_ids: [5] },
    { name: "All-in-one (svc 1)", service_ids: [1] },
  ];

  for (const t of tests) {
    const uname = `nodetest${t.service_ids[0]}`;
    console.log(`\n=== ${t.name} ===`);
    try {
      const { data: user } = await api.post("/api/users", {
        username: uname,
        service_ids: t.service_ids,
        data_limit: 1073741824,
        expire_strategy: "never",
      });

      const subUrl = `${PANEL_URL}/sub/${user.username}/${user.key}`;
      const { data: sub } = await axios.get(subUrl, { headers: { "User-Agent": "v2ray" } });
      const decoded = decodeSub(sub);
      for (const line of decoded.split("\n").filter(Boolean)) {
        // Extract IP from the config
        const ipMatch = line.match(/@([\d.]+):/);
        const proto = line.startsWith("ss://") ? "SS" : line.startsWith("vless://") ? "VLESS" : line.startsWith("hysteria2://") ? "HY2" : "?";
        console.log(`  ${proto} → ${ipMatch?.[1] || "?"} : ${line.substring(0, 100)}`);
      }

      await api.delete(`/api/users/${uname}`);
    } catch (e) {
      console.error(`  Failed:`, e.response?.status, JSON.stringify(e.response?.data || e.message));
      try { await api.delete(`/api/users/${uname}`); } catch {}
    }
  }
}

run().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
