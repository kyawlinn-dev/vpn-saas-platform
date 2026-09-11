#!/usr/bin/env node
/**
 * Add SS and VLESS inbounds for the Trial-SGP node (id=3) in Marzneshin panel.
 */
import "dotenv/config";
import axios from "axios";

const PANEL_URL = "https://panel.novanetmm.com";
const USERNAME = "novanet-admin";
const PASSWORD = "NovaNet3xuiTest2026!";
const NODE_ID = 3;

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

  // 1. Add SS inbound
  console.log("=== Adding Shadowsocks TCP inbound for Node 3 ===");
  try {
    const ssConfig = {
      tag: "Shadowsocks TCP",
      protocol: "shadowsocks",
      port: 1080,
      network: null,
      tls: "none",
      sni: [],
      host: [],
      path: null,
      header_type: null,
      flow: null,
      is_fallback: false,
    };
    const { data: ssInbound } = await api.post("/api/inbounds", {
      tag: "Shadowsocks TCP",
      protocol: "shadowsocks",
      node_id: NODE_ID,
      config: JSON.stringify(ssConfig),
    });
    console.log("✓ SS Inbound created:", JSON.stringify(ssInbound, null, 2));
  } catch (e) {
    console.error("✗ SS Failed:", e.response?.status, JSON.stringify(e.response?.data));
  }

  // 2. Add VLESS Reality inbound
  console.log("\n=== Adding VLESS TCP REALITY inbound for Node 3 ===");
  try {
    const vlessConfig = {
      tag: "VLESS TCP REALITY",
      protocol: "vless",
      port: 2443,
      network: "tcp",
      tls: "reality",
      sni: ["www.yahoo.com"],
      host: [],
      path: null,
      header_type: null,
      flow: "xtls-rprx-vision",
      is_fallback: false,
      fp: "chrome",
      pbk: "D4K2Z8XBtBU9aGidaknYxqZ7aJcCOGfWGiZ7pcHhpE0",
      sid: "0df541a43ebe02e0",
    };
    const { data: vlessInbound } = await api.post("/api/inbounds", {
      tag: "VLESS TCP REALITY",
      protocol: "vless",
      node_id: NODE_ID,
      config: JSON.stringify(vlessConfig),
    });
    console.log("✓ VLESS Inbound created:", JSON.stringify(vlessInbound, null, 2));
  } catch (e) {
    console.error("✗ VLESS Failed:", e.response?.status, JSON.stringify(e.response?.data));
  }

  // 3. List all inbounds to confirm
  console.log("\n=== All inbounds ===");
  const { data: inboundsData } = await api.get("/api/inbounds");
  const inbounds = inboundsData.items || inboundsData;
  for (const ib of inbounds) {
    console.log(`  Inbound #${ib.id}: tag=${ib.tag}, protocol=${ib.protocol}, node=${ib.node?.name || "?"}`);
  }
}

run().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
