// One-time bootstrap seed for the notifications_sent table.
//
// Run this ONCE AFTER migration 0011 is applied but BEFORE the backend
// starts running the customer-notifications job in a given environment
// (dev or prod). It records placeholder rows for every currently-eligible
// order/payment so the first scheduled tick does NOT retroactively spam
// existing customers whose trigger happened to already pass.
//
//   node --env-file=.env --env-file=.env.local scripts/seed-notifications-sent.mjs
//
// Idempotent: uses the notifications_sent unique constraint to no-op on
// re-runs. Safe to run multiple times.

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function yangonDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Yangon",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}
function shiftDate(ymd, days) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

async function seedForOrders(eventType, filter) {
  const { data, error } = await supabase.from("vpn_orders").select("id, customer_id").match(filter);
  if (error) { console.error(`  ! ${eventType}:`, error.message); return 0; }
  if (!data?.length) return 0;

  const rows = data.map((o) => ({
    customer_id: o.customer_id, event_type: eventType, order_id: o.id, channel: "telegram",
  }));
  const { error: insErr, count } = await supabase
    .from("notifications_sent")
    .upsert(rows, { onConflict: "customer_id,event_type,order_id", ignoreDuplicates: true, count: "exact" });
  if (insErr) { console.error(`  ! ${eventType} insert:`, insErr.message); return 0; }
  return count ?? rows.length;
}

async function seedForPayments(eventType, reviewStatus) {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("order_payments")
    .select("order_id, customer_id")
    .eq("review_status", reviewStatus)
    .gte("updated_at", dayAgo);
  if (error) { console.error(`  ! ${eventType}:`, error.message); return 0; }
  if (!data?.length) return 0;

  const rows = data
    .filter((p) => p.order_id && p.customer_id)
    .map((p) => ({ customer_id: p.customer_id, event_type: eventType, order_id: p.order_id, channel: "telegram" }));
  if (!rows.length) return 0;
  const { error: insErr, count } = await supabase
    .from("notifications_sent")
    .upsert(rows, { onConflict: "customer_id,event_type,order_id", ignoreDuplicates: true, count: "exact" });
  if (insErr) { console.error(`  ! ${eventType} insert:`, insErr.message); return 0; }
  return count ?? rows.length;
}

const today = yangonDate();
const t1 = shiftDate(today, 1);
const t3 = shiftDate(today, 3);

console.log("=== notifications_sent seed ===");
console.log("today (yangon):", today);
console.log("supabase:", process.env.SUPABASE_URL);
console.log();

const results = {
  trial_ending_24h:         await seedForOrders("trial_ending_24h",         { order_type: "trial", status: "active", expiry_date: t1 }),
  trial_expired:            await seedForOrders("trial_expired",            { order_type: "trial", expiry_date: today }),
  subscription_expiring_3d: 0, // handled below (needs neq filter)
  subscription_expired:     0,
  payment_confirmed:        await seedForPayments("payment_confirmed", "confirmed"),
  payment_rejected:         await seedForPayments("payment_rejected", "rejected"),
};

// Subscription events use neq('order_type', 'trial'), can't use .match() cleanly.
{
  const { data } = await supabase.from("vpn_orders").select("id, customer_id").neq("order_type", "trial").eq("status", "active").eq("expiry_date", t3);
  if (data?.length) {
    const rows = data.map((o) => ({ customer_id: o.customer_id, event_type: "subscription_expiring_3d", order_id: o.id, channel: "telegram" }));
    const { count } = await supabase.from("notifications_sent").upsert(rows, { onConflict: "customer_id,event_type,order_id", ignoreDuplicates: true, count: "exact" });
    results.subscription_expiring_3d = count ?? rows.length;
  }
}
{
  const { data } = await supabase.from("vpn_orders").select("id, customer_id").neq("order_type", "trial").eq("expiry_date", today);
  if (data?.length) {
    const rows = data.map((o) => ({ customer_id: o.customer_id, event_type: "subscription_expired", order_id: o.id, channel: "telegram" }));
    const { count } = await supabase.from("notifications_sent").upsert(rows, { onConflict: "customer_id,event_type,order_id", ignoreDuplicates: true, count: "exact" });
    results.subscription_expired = count ?? rows.length;
  }
}

for (const [event, seeded] of Object.entries(results)) {
  console.log(`  ${event.padEnd(30)} seeded ${seeded} placeholder row(s)`);
}
console.log("\n✅ Seed complete. Safe to start the backend now.");
