#!/usr/bin/env node
/**
 * Update VLESS Reality (and Hysteria2) SNI across all inbounds and host records
 * in the Marzneshin panel.
 *
 * Usage:
 *   node backend/scripts/update-vless-sni.mjs --dry-run
 *   node backend/scripts/update-vless-sni.mjs --sni=www.microsoft.com
 */
import axios from "axios";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env.local") });

const PANEL_URL = process.env.MARZNESHIN_PANEL_URL;
const USERNAME  = process.env.MARZNESHIN_PANEL_USERNAME;
const PASSWORD  = process.env.MARZNESHIN_PANEL_PASSWORD;

const DRY_RUN = process.argv.includes("--dry-run");

const sniArg = process.argv.find(a => a.startsWith("--sni="));
const NEW_SNI = sniArg ? sniArg.split("=")[1] : "www.microsoft.com";

if (!PANEL_URL || !USERNAME || !PASSWORD) {
  console.error("Missing MARZNESHIN_PANEL_URL / _USERNAME / _PASSWORD in backend/.env.local");
  process.exit(1);
}

async function getToken() {
  const { data } = await axios.post(
    `${PANEL_URL}/api/admins/token`,
    new URLSearchParams({ username: USERNAME, password: PASSWORD, grant_type: "password" }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 10000 }
  );
  return data.access_token;
}

async function run() {
  console.log(`=== Updating VLESS / Hysteria2 SNI to: ${NEW_SNI} ===`);
  if (DRY_RUN) console.log(">>> DRY RUN MODE (no changes will be applied) <<<\n");

  const token = await getToken();
  const api = axios.create({
    baseURL: PANEL_URL,
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15000,
  });

  const { data: ibData } = await api.get("/api/inbounds");
  const inbounds = ibData.items || ibData;

  for (const ib of inbounds) {
    if (ib.protocol !== "vless" && ib.protocol !== "hysteria2") continue;
    // Skip disabled local testing inbounds
    if (ib.id === 3) continue;

    console.log(`\n----------------------------------------`);
    console.log(`Inbound #${ib.id} [${ib.protocol}] "${ib.tag}" (Node ID: ${ib.node_id ?? ib.node?.id})`);

    // 1. Update Inbound Config JSON if VLESS Reality
    if (ib.protocol === "vless") {
      let cfg;
      try {
        cfg = typeof ib.config === "string" ? JSON.parse(ib.config) : ib.config;
      } catch (err) {
        console.warn(`  ⚠️ Could not parse config JSON: ${err.message}`);
      }

      if (cfg) {
        const oldSni = cfg.sni;
        console.log(`  Current config.sni: ${JSON.stringify(oldSni)}`);
        const updatedConfig = { ...cfg, sni: [NEW_SNI] };

        if (!DRY_RUN) {
          try {
            await api.put(`/api/inbounds/${ib.id}`, {
              tag: ib.tag,
              protocol: ib.protocol,
              node_id: ib.node_id ?? ib.node?.id,
              config: JSON.stringify(updatedConfig),
            });
            console.log(`  ✓ Updated config.sni -> ["${NEW_SNI}"]`);
          } catch (e) {
            console.error(`  ✗ Failed to update config: HTTP ${e.response?.status} — ${JSON.stringify(e.response?.data)}`);
          }
        } else {
          console.log(`  (dry run) Would update config.sni -> ["${NEW_SNI}"]`);
        }
      }
    }

    // 2. Update Inbound Host Records
    try {
      const { data: hostsData } = await api.get(`/api/inbounds/${ib.id}/hosts`);
      const hosts = hostsData.items || hostsData;
      for (const h of hosts) {
        console.log(`  Host #${h.id}: addr=${h.address || h.host} | current sni=${h.sni}`);
        if (h.sni === NEW_SNI) {
          console.log(`  ✓ Host #${h.id} already has sni=${NEW_SNI}`);
          continue;
        }

        const payload = {
          remark: h.remark,
          address: h.address || h.host,
          sni: NEW_SNI,
          port: h.port,
          security: h.security,
          alpn: h.alpn,
          fingerprint: h.fingerprint,
          allowinsecure: h.allowinsecure,
        };

        if (!DRY_RUN) {
          try {
            await api.put(`/api/inbounds/hosts/${h.id}`, payload);
            console.log(`  ✓ Updated Host #${h.id} sni -> "${NEW_SNI}"`);
          } catch (e) {
            console.error(`  ✗ Failed to update host #${h.id}: HTTP ${e.response?.status} — ${JSON.stringify(e.response?.data)}`);
          }
        } else {
          console.log(`  (dry run) Would update Host #${h.id} sni -> "${NEW_SNI}"`);
        }
      }
    } catch (e) {
      console.error(`  ✗ Failed to query hosts for inbound #${ib.id}: ${e.message}`);
    }
  }

  // 3. Update Node Xray Configs (realitySettings.serverNames & dest)
  console.log(`\n========================================`);
  console.log(`=== Updating Node Xray Configurations ===`);
  const { data: nodesData } = await api.get("/api/nodes");
  const nodes = nodesData.items || nodesData;
  for (const node of nodes) {
    if (node.id === 1) continue; // skip local
    console.log(`\nProcessing Node #${node.id} (${node.name} - ${node.address})...`);
    try {
      const { data: nodeCfg } = await api.get(`/api/nodes/${node.id}/xray/config`);
      const parsed = JSON.parse(nodeCfg.config);
      const realityInbound = parsed.inbounds?.find(ib => ib.streamSettings?.security === "reality");
      if (realityInbound) {
        const rs = realityInbound.streamSettings.realitySettings;
        rs.dest = `${NEW_SNI}:443`;
        const names = new Set(rs.serverNames || []);
        names.add(NEW_SNI);
        names.add("www.tiktok.com");
        rs.serverNames = Array.from(names);
        console.log(`  realitySettings: dest=${rs.dest}, serverNames=${JSON.stringify(rs.serverNames)}`);
      }
      if (!DRY_RUN) {
        const payload = { config: JSON.stringify(parsed, null, 2), format: nodeCfg.format || "json" };
        await api.put(`/api/nodes/${node.id}/xray/config`, payload);
        console.log(`  ✓ Node #${node.id} Xray config updated`);
        await api.post(`/api/nodes/${node.id}/resync`);
        console.log(`  ✓ Node #${node.id} resynced`);
      } else {
        console.log(`  (dry run) Would update Xray config & resync`);
      }
    } catch (err) {
      console.error(`  ✗ Node #${node.id} error: ${err.message}`);
    }
  }

  // 4. Verification: fetch a user subscription and inspect
  console.log(`\n========================================`);
  console.log(`=== Verification via Test Subscription ===`);
  const fullUrl = `${PANEL_URL}/sub/testkyaw/b9db9437bece50775fb2ce68564daf37`;
  try {
    const subResp = await axios.get(fullUrl, { headers: { "User-Agent": "v2rayNG/1.8.5" } });
    const decoded = Buffer.from(subResp.data, "base64").toString("utf8");
    console.log("Decoded subscription links:");
    decoded.split("\n").filter(Boolean).forEach(line => console.log("  ", line));
  } catch (e) {
    console.log("Could not fetch test subscription:", e.message);
  }
}

run().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
