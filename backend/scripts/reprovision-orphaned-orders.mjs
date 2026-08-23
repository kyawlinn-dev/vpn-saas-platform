// Re-provision fresh Outline keys for orders left keyless after retiring
// stale vpn_keys rows that pointed at a decommissioned server (see
// align-dev-servers-with-prod.mjs — 2026-08-23 dev/prod server drift fix).
//
// Reuses migrateActiveOrderToServer() — same function the reseller-dashboard
// "Switch Server" feature uses — since "give this active order a key on a
// specific server" is exactly that operation; there's just no old key to
// retire here (already deleted).
//
// Picks the least-loaded active PREMIUM server with spare capacity for each
// order (all 5 target orders are 'purchase' type, not trial).
//
//   node --env-file=.env.local scripts/reprovision-orphaned-orders.mjs

import { createClient } from "@supabase/supabase-js";
import { migrateActiveOrderToServer } from "../src/services/subscriptionProvisionService.js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

if (!/huqmzvlzfcexycdrsxpn/.test(process.env.SUPABASE_URL || "")) {
  console.error("⛔ Refusing to run — not the known dev project. Use --env-file=.env.local");
  process.exit(1);
}

const ORDER_IDS = [
  "b149ba7e", "1fa69c99", "b76b534f", "b4406203", "72a6f4ca",
];

async function main() {
  console.log("Target dev Supabase:", process.env.SUPABASE_URL);

  // Resolve short ids to full UUIDs + load order/customer/plan.
  const { data: allOrders, error } = await supabase
    .from("vpn_orders")
    .select(`
      id, customer_id, reseller_id, plan_id, status, order_type,
      customer:vpn_customers!vpn_orders_customer_id_fkey(id, full_name),
      plan:vpn_plans(id, name, data_limit_gb)
    `)
    .in("status", ["active"]);
  if (error) throw error;

  const targets = allOrders.filter((o) => ORDER_IDS.some((short) => o.id.startsWith(short)));
  console.log(`Matched ${targets.length}/${ORDER_IDS.length} target orders.\n`);

  for (const order of targets) {
    try {
      // Confirm this order really has no active key (idempotent re-run safety).
      const { data: existing } = await supabase
        .from("vpn_keys")
        .select("id")
        .eq("order_id", order.id)
        .eq("status", "active")
        .maybeSingle();
      if (existing) {
        console.log(`⏭  ${order.id.slice(0,8)} (${order.customer?.full_name}) already has an active key — skipping`);
        continue;
      }

      // Pick least-loaded active premium server with spare capacity.
      const { data: servers } = await supabase
        .from("vpn_servers")
        .select("id, name, region, server_tier, outline_api_url, outline_cert_sha256, current_active_keys, max_active_keys")
        .eq("status", "active")
        .eq("server_tier", "premium")
        .order("current_active_keys", { ascending: true });

      const server = (servers || []).find(
        (s) => Number(s.max_active_keys || 0) - Number(s.current_active_keys || 0) > 0
      );
      if (!server) {
        console.log(`⚠️  ${order.id.slice(0,8)} — no premium server with capacity, skipping`);
        continue;
      }

      const key = await migrateActiveOrderToServer({
        order,
        newServer: server,
        oldServerId: null, // no old server to conditionally update telegram_links against
      });

      console.log(`✓ ${order.id.slice(0,8)} (${order.customer?.full_name}) → new key on ${server.name} (${key.id.slice(0,8)})`);
    } catch (err) {
      console.log(`⚠️  ${order.id.slice(0,8)} FAILED: ${err.message}`);
    }
  }

  console.log("\nDone.");
}

main().catch((err) => { console.error("FATAL:", err); process.exit(1); });
