// One-off migration: move active trial-order keys off whatever server they
// currently sit on (premium, pre-tier-separation) onto a dedicated
// server_tier='trial' server, without touching purchase-order keys or
// disturbing the servers themselves.
//
// Prerequisites (must already be true when you run this):
//   1. Migration 0005_add_server_tier.sql has been applied to this DB.
//   2. At least one vpn_servers row exists with server_tier='trial',
//      status='active', and a working outline_api_url/outline_cert_sha256
//      (e.g. provisioned via the admin dashboard's "Provision server" with
//      tier=trial, or the DO droplet you already have set up for this).
//
// Usage:
//   node scripts/migrate-trial-keys-to-trial-server.mjs            # dry run (default)
//   node scripts/migrate-trial-keys-to-trial-server.mjs --apply    # actually migrate
//
// Dry run prints exactly what would move without calling the Outline API or
// writing anything to the DB. Review that output before ever passing --apply.
//
// Safety order per key: create the NEW key first and confirm it's stored,
// THEN delete the OLD key. If creating the new key fails, nothing is torn
// down — the customer keeps working on their current server and the script
// just reports the failure and moves to the next one.

import { supabase } from "../src/lib/supabase.js";
import { getActiveServers } from "../src/services/serverService.js";
import { migrateActiveOrderToServer } from "../src/services/subscriptionProvisionService.js";
import { deleteOutlineKey } from "../src/services/outlineService.js";

const APPLY = process.argv.includes("--apply");

async function findTrialTargetServer() {
  const [server] = await getActiveServers({ serverTier: "trial", limit: 1 });
  if (!server) {
    throw new Error(
      "No active, ready server_tier='trial' server found. Provision one first " +
        "(admin dashboard → Servers → Provision, tier=trial), then re-run this script."
    );
  }
  return server;
}

async function findTrialKeysNeedingMigration(trialServerId) {
  const { data, error } = await supabase
    .from("vpn_keys")
    .select(
      "id, order_id, customer_id, reseller_id, server_id, outline_key_id, status, deleted_at, " +
        "vpn_orders(id, customer_id, reseller_id, status, order_type, plan_id, " +
        "customer:vpn_customers(id, full_name), plan:vpn_plans(id, name, data_limit_gb)), " +
        "vpn_servers(outline_api_url, outline_cert_sha256)"
    )
    .eq("status", "active")
    .is("deleted_at", null);

  if (error) throw new Error(error.message);

  return (data || []).filter(
    (k) =>
      k.vpn_orders?.order_type === "trial" &&
      k.vpn_orders?.status === "active" &&
      k.server_id !== trialServerId
  );
}

async function main() {
  const trialServer = await findTrialTargetServer();
  console.log(`Trial target server: ${trialServer.name} (${trialServer.id})`);

  const affected = await findTrialKeysNeedingMigration(trialServer.id);
  console.log(`Found ${affected.length} active trial key(s) that need to move.\n`);

  if (affected.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  const results = { migrated: 0, failed: 0 };

  for (const key of affected) {
    const order = key.vpn_orders;
    const label = `key ${key.id} (order ${order.id}, customer "${order.customer?.full_name}")`;

    if (!APPLY) {
      console.log(`[DRY RUN] Would migrate ${label} from server ${key.server_id} -> ${trialServer.id}`);
      continue;
    }

    try {
      console.log(`Migrating ${label}...`);

      const newKey = await migrateActiveOrderToServer({
        order: {
          id: order.id,
          customer_id: order.customer_id,
          reseller_id: order.reseller_id,
          plan: order.plan,
          customer: order.customer,
        },
        newServer: trialServer,
        oldServerId: key.server_id,
      });

      console.log(`  new key created: ${newKey.id} on ${trialServer.name}`);

      if (key.outline_key_id) {
        try {
          await deleteOutlineKey({
            apiUrl: key.vpn_servers?.outline_api_url,
            certSha256: key.vpn_servers?.outline_cert_sha256,
            outlineKeyId: key.outline_key_id,
          });
        } catch (delErr) {
          console.warn(`  old Outline key deletion failed (non-fatal): ${delErr.message}`);
        }
      }

      await supabase
        .from("vpn_keys")
        .update({ status: "deleted", deleted_at: new Date().toISOString() })
        .eq("id", key.id);

      console.log(`  old key ${key.id} marked deleted.`);
      results.migrated++;
    } catch (err) {
      console.error(`  FAILED: ${err.message}`);
      results.failed++;
    }
  }

  console.log("\nSummary:", results);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal error:", err.message);
    process.exit(1);
  });
