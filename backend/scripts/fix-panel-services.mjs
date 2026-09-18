#!/usr/bin/env node
/**
 * Fix Marzneshin panel service configuration:
 *   1. VLESS Global (service #5): remove inbound #3 (local/127.0.0.1 dev node)
 *      Keeps: [8, 5, 10, 12]  (Trial-SGP, SG1, SG#2, Tokyo#1 VLESS)
 *   2. Delete service #6 "SS - SGP1-3111" (stale, inbound_ids=[])
 *   3. Delete service #7 "SS - Osaka"     (stale, inbound_ids=[])
 *
 * Usage:
 *   node backend/scripts/fix-panel-services.mjs --dry-run
 *   node backend/scripts/fix-panel-services.mjs
 */
import axios from "axios";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env.local") });

const PANEL_URL = process.env.MARZNESHIN_PANEL_URL;
const USERNAME  = process.env.MARZNESHIN_PANEL_USERNAME;
const PASSWORD  = process.env.MARZNESHIN_PANEL_PASSWORD;
const DRY_RUN   = process.argv.includes("--dry-run");

if (!PANEL_URL || !USERNAME || !PASSWORD) {
  console.error("Missing MARZNESHIN_PANEL_URL / _USERNAME / _PASSWORD in backend/.env.local");
  process.exit(1);
}

const VLESS_GLOBAL_ID          = 5;
const LOCAL_INBOUND_TO_REMOVE  = 3;   // VLESS TCP REALITY on 127.0.0.1
const STALE_SERVICE_IDS        = [6, 7]; // SS - SGP1-3111, SS - Osaka

async function getToken() {
  const { data } = await axios.post(
    `${PANEL_URL}/api/admins/token`,
    new URLSearchParams({ username: USERNAME, password: PASSWORD, grant_type: "password" }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 10000 }
  );
  return data.access_token;
}

async function run() {
  if (DRY_RUN) console.log("=== DRY RUN — no changes ===\n");

  const token = await getToken();
  const api = axios.create({
    baseURL: PANEL_URL,
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15000,
  });

  // ── 1. Fix VLESS Global: remove inbound #3 ──────────────────────────────
  console.log(`=== Fix VLESS Global (service #${VLESS_GLOBAL_ID}) ===`);
  const { data: vless } = await api.get(`/api/services/${VLESS_GLOBAL_ID}`);
  const before = vless.inbound_ids || [];
  const after  = before.filter(id => id !== LOCAL_INBOUND_TO_REMOVE);

  console.log(`  Before: inbound_ids=${JSON.stringify(before)}`);
  console.log(`  After:  inbound_ids=${JSON.stringify(after)}`);
  console.log(`  Removing: #${LOCAL_INBOUND_TO_REMOVE} (VLESS local/127.0.0.1 dev node)`);

  if (before.length === after.length) {
    console.log("  ℹ️  Inbound #3 not present — nothing to remove");
  } else if (!DRY_RUN) {
    const { data: updated } = await api.put(`/api/services/${VLESS_GLOBAL_ID}`, {
      name: vless.name,
      inbound_ids: after,
    });
    console.log(`  ✓ Updated: inbound_ids=${JSON.stringify(updated.inbound_ids)}`);
  } else {
    console.log("  (dry run — would apply above change)");
  }

  // ── 2. Delete stale services ─────────────────────────────────────────────
  console.log("\n=== Delete Stale Services ===");
  for (const svcId of STALE_SERVICE_IDS) {
    try {
      const { data: svc } = await api.get(`/api/services/${svcId}`);
      const ids = svc.inbound_ids || [];
      console.log(`  Service #${svcId} "${svc.name}" — inbound_ids=${JSON.stringify(ids)}`);
      if (ids.length > 0) {
        console.log(`  ⚠️  Skipping #${svcId} — still has inbounds! Remove them manually first.`);
        continue;
      }
      if (!DRY_RUN) {
        await api.delete(`/api/services/${svcId}`);
        console.log(`  ✓ Deleted service #${svcId} "${svc.name}"`);
      } else {
        console.log(`  (dry run — would delete service #${svcId} "${svc.name}")`);
      }
    } catch (e) {
      const status = e.response?.status;
      if (status === 404) {
        console.log(`  ℹ️  Service #${svcId} not found (already deleted)`);
      } else {
        console.error(`  ✗ Service #${svcId}: HTTP ${status} — ${e.message}`);
      }
    }
  }

  // ── 3. Final state ───────────────────────────────────────────────────────
  console.log("\n=== Final VLESS Global State ===");
  const { data: final } = await api.get(`/api/services/${VLESS_GLOBAL_ID}`);
  const { data: ibData } = await api.get("/api/inbounds");
  const inbounds = (ibData.items || ibData).reduce((m, ib) => { m[ib.id] = ib; return m; }, {});
  const { data: nodesData } = await api.get("/api/nodes");
  const nodeMap = (nodesData.items || nodesData).reduce((m, n) => { m[n.id] = n; return m; }, {});

  for (const ibId of (final.inbound_ids || [])) {
    const ib = inbounds[ibId];
    const nodeId = ib?.node_id ?? ib?.node?.id;
    const node = nodeMap[nodeId];
    console.log(`  ✅ #${ibId} [${ib?.protocol}] "${ib?.tag}" → ${node?.name} (${node?.address}) [${node?.status}]`);
  }

  if (DRY_RUN) console.log("\n=== Dry run done. Re-run without --dry-run to apply. ===");
  else console.log("\n=== Done ===");
}

run().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
