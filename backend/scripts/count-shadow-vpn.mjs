// Scope how much data we would delete for reseller Shadow VPN.
// READ-ONLY — just counts, does not modify anything.

import { createClient } from "@supabase/supabase-js";

const RESELLER_ID = "e51b3a9f-dca4-450a-aeb4-147064420a88"; // Shadow VPN

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function countRows(table, filter) {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .match(filter);
  if (error) return `ERR: ${error.message}`;
  return count;
}

console.log("=== Shadow VPN reseller counts ===\n");
console.log("SUPABASE_URL:", process.env.SUPABASE_URL);
console.log("reseller_id:", RESELLER_ID);
console.log();

// Customers scoped to this reseller
console.log("vpn_customers:      ", await countRows("vpn_customers", { reseller_id: RESELLER_ID }));

// Orders
console.log("vpn_orders:         ", await countRows("vpn_orders", { reseller_id: RESELLER_ID }));

// Payments
console.log("order_payments:     ", await countRows("order_payments", { reseller_id: RESELLER_ID }));

// Keys
console.log("vpn_keys:           ", await countRows("vpn_keys", { reseller_id: RESELLER_ID }));

// Telegram links (via customers)
const { data: customerIds } = await supabase
  .from("vpn_customers")
  .select("id")
  .eq("reseller_id", RESELLER_ID);
const ids = (customerIds || []).map(r => r.id);
if (ids.length > 0) {
  const { count: linkCount } = await supabase
    .from("telegram_links")
    .select("*", { count: "exact", head: true })
    .in("customer_id", ids);
  console.log("telegram_links:     ", linkCount);
  const { count: tokenCount } = await supabase
    .from("customer_ssconf_tokens")
    .select("*", { count: "exact", head: true })
    .in("customer_id", ids);
  console.log("customer_ssconf_tokens:", tokenCount);
  const { count: assignmentCount } = await supabase
    .from("token_server_assignments")
    .select("*", { count: "exact", head: true });
  console.log("(token_server_assignments — total across all resellers):", assignmentCount);
} else {
  console.log("telegram_links:      0 (no customers)");
  console.log("customer_ssconf_tokens: 0 (no customers)");
}

// app_events
console.log("app_events:         ", await countRows("app_events", { reseller_id: RESELLER_ID }));
