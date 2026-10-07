#!/usr/bin/env node
/**
 * Fully apply www.apple.com as the Reality SNI and dest across:
 * 1. Marzneshin Panel Inbound Host records
 * 2. Marzneshin Panel Node Xray configs
 * 3. Remote servers via SSH (xray_config.json update + clean docker compose recreate)
 * 4. Panel resync
 */
import axios from "axios";
import { config } from "dotenv";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env.local") });

const PANEL_URL = process.env.MARZNESHIN_PANEL_URL;
const USERNAME  = process.env.MARZNESHIN_PANEL_USERNAME;
const PASSWORD  = process.env.MARZNESHIN_PANEL_PASSWORD;

const NEW_SNI = "www.apple.com";
const ALLOWED_SERVER_NAMES = ["www.apple.com", "www.microsoft.com", "www.tiktok.com"];

const NODES = [
  { id: 2, ip: "139.59.126.185", name: "SG1" },
  { id: 3, ip: "168.144.133.227", name: "Trial-SGP" },
  { id: 4, ip: "165.22.242.245", name: "Singapore #2" },
  { id: 5, ip: "107.191.53.200", name: "Tokyo #1" },
];

async function getToken() {
  const { data } = await axios.post(
    `${PANEL_URL}/api/admins/token`,
    new URLSearchParams({ username: USERNAME, password: PASSWORD, grant_type: "password" }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );
  return data.access_token;
}

async function run() {
  console.log(`=== Setting VLESS Reality SNI to ${NEW_SNI} ===\n`);
  const token = await getToken();
  const api = axios.create({ baseURL: PANEL_URL, headers: { Authorization: `Bearer ${token}` } });

  // 1. Update Inbound Host Records in Marzneshin
  console.log("--- 1. Updating Marzneshin Host Records ---");
  const { data: ibData } = await api.get("/api/inbounds");
  for (const ib of ibData.items || ibData) {
    if (ib.protocol !== "vless" && ib.protocol !== "hysteria2") continue;
    if (ib.id === 3) continue; // skip local
    const { data: hostsData } = await api.get(`/api/inbounds/${ib.id}/hosts`);
    for (const h of hostsData.items || hostsData) {
      const payload = {
        remark: h.remark,
        address: h.address || h.host,
        sni: NEW_SNI,
        port: h.port,
        security: h.security,
        alpn: h.alpn,
        fingerprint: h.fingerprint || "chrome",
        allowinsecure: h.allowinsecure,
      };
      await api.put(`/api/inbounds/hosts/${h.id}`, payload);
      console.log(`  ✓ Host #${h.id} (${h.address}) sni -> ${NEW_SNI}`);
    }
  }

  // 2. Update Node Xray Config in Panel
  console.log("\n--- 2. Updating Node Xray Configs in Panel ---");
  for (const n of NODES) {
    try {
      const { data: nodeCfg } = await api.get(`/api/nodes/${n.id}/xray/config`);
      const parsed = JSON.parse(nodeCfg.config);
      const realityInbound = parsed.inbounds?.find(ib => ib.streamSettings?.security === "reality");
      if (realityInbound) {
        realityInbound.streamSettings.realitySettings.dest = `${NEW_SNI}:443`;
        realityInbound.streamSettings.realitySettings.serverNames = ALLOWED_SERVER_NAMES;
      }
      const payload = { config: JSON.stringify(parsed, null, 2), format: nodeCfg.format || "json" };
      await api.put(`/api/nodes/${n.id}/xray/config`, payload);
      console.log(`  ✓ Node #${n.id} (${n.name}) panel config updated`);
    } catch (e) {
      console.error(`  ✗ Node #${n.id} panel config error:`, e.message);
    }
  }

  // 3. Update Xray Config on Servers and Recreate Container Cleanly
  console.log("\n--- 3. Updating Servers via SSH ---");
  for (const n of NODES) {
    console.log(`  Updating ${n.name} (${n.ip})...`);
    const pyCmd = `python3 -c "
import json
with open('/var/lib/marznode/xray_config.json') as f:
    c = json.load(f)
for ib in c.get('inbounds', []):
    if ib.get('streamSettings', {}).get('security') == 'reality':
        rs = ib['streamSettings']['realitySettings']
        rs['dest'] = '${NEW_SNI}:443'
        rs['serverNames'] = ${JSON.stringify(ALLOWED_SERVER_NAMES)}
with open('/var/lib/marznode/xray_config.json', 'w') as f:
    json.dump(c, f, indent=2)
"`;
    try {
      execSync(`ssh -o StrictHostKeyChecking=no root@${n.ip} "${pyCmd} && cd /opt/marznode && docker compose down && docker compose up -d"`, { stdio: "pipe", timeout: 45000 });
      console.log(`  ✓ ${n.name} restarted cleanly`);
    } catch (e) {
      console.error(`  ✗ ${n.name} SSH error:`, e.message);
    }
  }

  // 4. Panel Resync
  console.log("\n--- 4. Resyncing Nodes from Panel ---");
  for (const n of NODES) {
    try {
      await api.post(`/api/nodes/${n.id}/resync`);
      console.log(`  ✓ Node #${n.id} resynced`);
    } catch (e) {
      console.error(`  ✗ Node #${n.id} resync error:`, e.message);
    }
  }

  console.log("\n=== Finished Successfully! ===");
}

run().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
