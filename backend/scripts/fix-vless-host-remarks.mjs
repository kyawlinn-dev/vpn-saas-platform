#!/usr/bin/env node
/**
 * Fix duplicate VLESS host-record remarks that break Hiddify (sing-box).
 *
 * Hiddify uses each config's remark as the sing-box outbound TAG. SG#2 and Tokyo
 * were created with the remark "NovaNet ({USERNAME}) [VLESS Reality]" — no server
 * name — so both render to the same tag for a given user, and sing-box rejects
 * the profile: "duplicate outbound/endpoint tag". Trial-SGP and SG1 already have
 * server-specific remarks, so they're unique.
 *
 * This sets a unique, server-named remark on every VLESS Global host record so
 * every config's tag is distinct (and readable in the app). Idempotent.
 *
 * Reads panel creds from backend/.env.local. Run:
 *   node backend/scripts/fix-vless-host-remarks.mjs --dry-run
 *   node backend/scripts/fix-vless-host-remarks.mjs
 */
import axios from "axios";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env.local") });

const PANEL = process.env.MARZNESHIN_PANEL_URL;
const USER = process.env.MARZNESHIN_PANEL_USERNAME;
const PASS = process.env.MARZNESHIN_PANEL_PASSWORD;
const DRY = process.argv.includes("--dry-run");
const GLOBAL_VLESS_SERVICE_ID = 5;

if (!PANEL || !USER || !PASS) {
  console.error("Missing MARZNESHIN_PANEL_* in backend/.env.local");
  process.exit(1);
}

// Turn a server name into a short, unique, slug-ish label for the remark.
function label(name) {
  return String(name || "Server")
    .replace(/#/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function getToken() {
  const { data } = await axios.post(
    `${PANEL}/api/admins/token`,
    new URLSearchParams({ username: USER, password: PASS, grant_type: "password" }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 10000 }
  );
  return data.access_token;
}

async function run() {
  if (DRY) console.log("=== DRY RUN ===\n");
  const token = await getToken();
  const api = axios.create({ baseURL: PANEL, headers: { Authorization: `Bearer ${token}` }, timeout: 15000 });

  const nodes = await api.get("/api/nodes").then((r) => r.data.items || r.data);
  const nodeById = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const inbounds = await api.get("/api/inbounds").then((r) => r.data.items || r.data);
  const inboundById = Object.fromEntries(inbounds.map((ib) => [ib.id, ib]));

  const svc = await api.get(`/api/services/${GLOBAL_VLESS_SERVICE_ID}`).then((r) => r.data);
  const vlessInboundIds = svc.inbound_ids || [];
  console.log(`VLESS Global (#${GLOBAL_VLESS_SERVICE_ID}) inbound_ids: ${JSON.stringify(vlessInboundIds)}\n`);

  const seen = new Set();
  for (const ibId of vlessInboundIds) {
    const ib = inboundById[ibId];
    if (!ib || ib.protocol !== "vless") continue;
    const node = nodeById[ib.node_id ?? ib.node?.id];
    const serverLabel = label(node?.name);
    const newRemark = `NovaNet ${serverLabel} ({USERNAME}) [VLESS Reality]`;
    const address = node?.address;

    const hosts = await api.get(`/api/inbounds/${ibId}/hosts`).then((r) => r.data?.items || r.data || []);
    if (!hosts.length) {
      console.log(`  Inbound #${ibId} (${node?.name}): ❌ no host records — skipping`);
      continue;
    }
    for (const h of hosts) {
      const fp = h.fingerprint || "chrome";
      const current = h.remark || "(none)";
      // Skip hosts already correct (unique remark + fingerprint set) so working
      // nodes like SG1/Trial-SGP are never disturbed.
      if (current === newRemark && h.fingerprint) {
        console.log(`  Inbound #${ibId} host #${h.id} (${node?.name}): already correct — skip`);
        seen.add(newRemark);
        continue;
      }
      const dup = seen.has(newRemark) ? " ⚠️ still not unique!" : "";
      seen.add(newRemark);
      console.log(`  Inbound #${ibId} host #${h.id} (${node?.name})`);
      console.log(`     remark: ${current}  ->  ${newRemark}${dup}`);
      console.log(`     fingerprint: ${h.fingerprint || "(none)"}  ->  ${fp}`);
      if (!DRY) {
        await api.put(`/api/inbounds/hosts/${h.id}`, {
          remark: newRemark,
          address: address || h.address,
          sni: h.sni || "www.tiktok.com",
          fingerprint: fp,
        });
        console.log(`     ✓ updated`);
      }
    }
  }

  console.log(DRY ? "\n=== dry run done ===" : "\n=== done — re-import the premium VLESS subscription in Hiddify ===");
}

run().catch((e) => {
  console.error("Fatal:", e.response?.status, JSON.stringify(e.response?.data) || e.message);
  process.exit(1);
});
