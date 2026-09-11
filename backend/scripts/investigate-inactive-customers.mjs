// READ-ONLY investigation for a one-shot "get your key" nudge broadcast.
//
// For each active reseller bot, classifies customers with a telegram_link
// into buckets so we can decide who to DM.
//
// Buckets (in priority order — mutually exclusive):
//   A. no_orders           — customer exists but has never placed any order
//   B. trial_no_keys       — has an active trial order but no vpn_keys row
//   C. trial_zero_usage    — has active trial + at least one key, but total
//                            used_bytes across their keys is 0 (never
//                            connected)
//   D. trial_used          — actively using their trial. Skip nudge.
//   E. active_paid_used    — has active paid subscription with usage. Skip.
//   F. active_paid_unused  — active paid with 0 usage (edge case worth
//                            flagging separately)
//   G. expired_only        — orders exist but none active. Skip for now
//                            (different messaging surface — expired-package
//                            reminder is Phase 1a's scheduled event).
//
// The intended nudge broadcast targets buckets A + B + C (and maybe F).
//
// Run against PROD by loading only .env (not .env.local):
//   node --env-file=.env scripts/investigate-inactive-customers.mjs

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log("=".repeat(70));
console.log("Investigating inactive-customer segments for nudge broadcast");
console.log("Supabase project:", process.env.SUPABASE_URL);
console.log("=".repeat(70));

// 1. Active reseller bots
const { data: resellers, error: resErr } = await supabase
  .from("reseller_miniapps")
  .select("reseller_id, brand_name, is_enabled")
  .eq("is_enabled", true)
  .not("bot_token_encrypted", "is", null);
if (resErr) { console.error(resErr); process.exit(1); }

console.log(`\n${resellers.length} active reseller bot(s):`);
for (const r of resellers) console.log(`  • ${r.brand_name} (${r.reseller_id.slice(0, 8)})`);

const summary = { total_dmable_customers: 0, per_reseller: {} };

for (const r of resellers) {
  console.log(`\n${"─".repeat(70)}\n▶ ${r.brand_name} (${r.reseller_id.slice(0, 8)})\n${"─".repeat(70)}`);

  // 2. Customers under this reseller with a telegram_link (i.e. DM-able)
  const { data: customers } = await supabase
    .from("vpn_customers")
    .select("id, full_name, telegram_username, telegram_links(telegram_user_id)")
    .eq("reseller_id", r.reseller_id);

  const dmable = (customers || []).filter(
    (c) => Array.isArray(c.telegram_links) && c.telegram_links[0]?.telegram_user_id
  );
  console.log(`  customers total: ${customers?.length || 0}   with telegram_link: ${dmable.length}`);

  const buckets = {
    A_no_orders: [],
    B_trial_no_keys: [],
    C_trial_zero_usage: [],
    D_trial_used: [],
    E_active_paid_used: [],
    F_active_paid_unused: [],
    G_expired_only: [],
  };

  // 3. For each dmable customer, classify
  const customerIds = dmable.map((c) => c.id);
  if (customerIds.length === 0) {
    summary.per_reseller[r.reseller_id] = { brand: r.brand_name, dmable: 0, buckets: {} };
    continue;
  }

  // Pull orders + keys in bulk (single query each)
  const { data: allOrders } = await supabase
    .from("vpn_orders")
    .select("id, customer_id, order_type, status")
    .in("customer_id", customerIds);
  const { data: allKeys } = await supabase
    .from("vpn_keys")
    .select("id, customer_id, order_id, used_bytes, status")
    .in("customer_id", customerIds);

  const ordersByCustomer = new Map();
  for (const o of allOrders || []) {
    const arr = ordersByCustomer.get(o.customer_id) || [];
    arr.push(o);
    ordersByCustomer.set(o.customer_id, arr);
  }
  const keysByCustomer = new Map();
  for (const k of allKeys || []) {
    const arr = keysByCustomer.get(k.customer_id) || [];
    arr.push(k);
    keysByCustomer.set(k.customer_id, arr);
  }

  for (const c of dmable) {
    const orders = ordersByCustomer.get(c.id) || [];
    const keys = keysByCustomer.get(c.id) || [];

    if (orders.length === 0) { buckets.A_no_orders.push(c); continue; }

    const active = orders.filter((o) => o.status === "active");
    if (active.length === 0) { buckets.G_expired_only.push(c); continue; }

    const activeTrial = active.find((o) => o.order_type === "trial");
    const activePaid = active.find((o) => o.order_type !== "trial");

    // Total usage across all this customer's keys
    const totalBytes = keys.reduce((sum, k) => sum + Number(k.used_bytes || 0), 0);

    if (activeTrial) {
      const trialKeys = keys.filter((k) => k.order_id === activeTrial.id && k.status === "active");
      if (trialKeys.length === 0) { buckets.B_trial_no_keys.push(c); continue; }
      const trialBytes = trialKeys.reduce((s, k) => s + Number(k.used_bytes || 0), 0);
      if (trialBytes === 0) { buckets.C_trial_zero_usage.push(c); continue; }
      buckets.D_trial_used.push(c);
      continue;
    }

    if (activePaid) {
      if (totalBytes > 0) buckets.E_active_paid_used.push(c);
      else buckets.F_active_paid_unused.push(c);
    }
  }

  for (const [name, arr] of Object.entries(buckets)) {
    if (arr.length > 0) console.log(`  ${name.padEnd(26)} ${arr.length}`);
  }
  const nudgeTargets = buckets.A_no_orders.length + buckets.B_trial_no_keys.length + buckets.C_trial_zero_usage.length;
  console.log(`  ---`);
  console.log(`  → nudge candidates (A+B+C): ${nudgeTargets}`);
  console.log(`  → active users (D+E):        ${buckets.D_trial_used.length + buckets.E_active_paid_used.length}`);

  summary.per_reseller[r.reseller_id] = {
    brand: r.brand_name,
    dmable: dmable.length,
    buckets: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length])),
    nudge_candidates: nudgeTargets,
  };
  summary.total_dmable_customers += dmable.length;
}

console.log(`\n${"=".repeat(70)}\nSUMMARY: ${summary.total_dmable_customers} DM-able customer(s) across ${resellers.length} bot(s)\n${"=".repeat(70)}`);
for (const [rid, r] of Object.entries(summary.per_reseller)) {
  console.log(`  ${r.brand.padEnd(30)} nudge candidates: ${r.nudge_candidates ?? 0}`);
}
