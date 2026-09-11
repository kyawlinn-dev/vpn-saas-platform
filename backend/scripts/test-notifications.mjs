// Manual test harness for the customer-notification pipeline. Three modes:
//
//   node --env-file=.env --env-file=.env.local scripts/test-notifications.mjs
//     Dry-run — for each event type, list the customers/orders that match
//     the raw trigger + show how many have already been notified. Ignores
//     quiet hours (informational only). Safe to run any time.
//
//   node ... scripts/test-notifications.mjs --preview-templates
//     Print all 6 rendered Burmese templates with sample data. No DB or
//     Telegram calls. Fastest sanity check that copy looks right.
//
//   curl -X POST -b "novanet_admin_session=<cookie>" http://localhost:3000/api/admin/monitoring/notifications/run-pass
//     Actually fire the pass NOW inside the running backend. Bypasses quiet
//     hours (force:true). Still respects dedup + daily cap + kill switch.
//     Uses the same in-memory bots the scheduled job uses. This is the
//     supported "fire now" path — the standalone script's --send flag was
//     removed because a separate Node process has no active bots loaded.

import { createClient } from "@supabase/supabase-js";
import {
  renderNotification,
  formatBurmeseDate,
  NOTIFICATION_EVENT_TYPES,
} from "../src/bot/notificationTemplates.js";

const PREVIEW = process.argv.includes("--preview-templates");

// ── Preview mode — render every template with sample data ────────────────────
if (PREVIEW) {
  const sample = {
    brand_name: "Shadow VPN",
    plan_name: "Premium 30 Days",
    expiry_date: formatBurmeseDate("2026-09-15"),
    support_username: "shadowvpnsupport",
    deep_link_url: "https://app.novanetmm.com/?slug=shadow-vpn",
    reject_reason: "လွှဲပြောင်းငွေပမာဏ မကိုက်ညီပါ",
  };

  for (const type of NOTIFICATION_EVENT_TYPES) {
    console.log(`\n${"═".repeat(60)}`);
    console.log(`▶  ${type}`);
    console.log("═".repeat(60));
    console.log(renderNotification(type, sample));
  }
  console.log(`\n${"═".repeat(60)}`);
  console.log("(preview only — no DB or Telegram calls made)");
  process.exit(0);
}

// ── Dry-run / send mode — need DB access ─────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function yangonDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Yangon", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}
function shiftDate(ymd, days) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

const today = yangonDate();
const t1 = shiftDate(today, 1);
const t3 = shiftDate(today, 3);

console.log("=".repeat(60));
console.log("MODE: DRY RUN (no DMs — see header for how to actually send)");
console.log("today (yangon):", today, " target+1:", t1, " target+3:", t3);
console.log("=".repeat(60));

// ── Dry-run: eligibility summary per event ───────────────────────────────────
const eventDefs = [
  { type: "trial_ending_24h",         table: "vpn_orders",     filter: (q) => q.eq("order_type", "trial").eq("status", "active").eq("expiry_date", t1) },
  { type: "trial_expired",            table: "vpn_orders",     filter: (q) => q.eq("order_type", "trial").eq("expiry_date", today) },
  { type: "subscription_expiring_3d", table: "vpn_orders",     filter: (q) => q.neq("order_type", "trial").eq("status", "active").eq("expiry_date", t3) },
  { type: "subscription_expired",     table: "vpn_orders",     filter: (q) => q.neq("order_type", "trial").eq("expiry_date", today) },
  { type: "payment_confirmed",        table: "order_payments", filter: (q) => q.eq("review_status", "confirmed").gte("updated_at", new Date(Date.now() - 24*60*60*1000).toISOString()) },
  { type: "payment_rejected",         table: "order_payments", filter: (q) => q.eq("review_status", "rejected").gte("updated_at", new Date(Date.now() - 24*60*60*1000).toISOString()) },
];

console.log("\n=== ELIGIBILITY (raw trigger match, before dedup / cap / kill-switch) ===\n");
for (const def of eventDefs) {
  // vpn_orders has `id`; order_payments has both `id` and `order_id`.
  const cols = def.table === "order_payments" ? "id, order_id, customer_id" : "id, customer_id";
  const q = def.filter(supabase.from(def.table).select(cols));
  const { data, error } = await q;
  if (error) { console.log(`  ${def.type.padEnd(30)} ERROR: ${error.message}`); continue; }
  console.log(`  ${def.type.padEnd(30)} ${data?.length || 0} match(es)`);
  for (const row of (data || []).slice(0, 5)) {
    const orderKey = row.order_id || row.id || "";
    console.log(`     order id=${orderKey.slice(0,8)}  customer=${(row.customer_id || "").slice(0,8)}`);
  }
}

// ── Already-sent tally ───────────────────────────────────────────────────────
console.log("\n=== notifications_sent rows to date ===\n");
for (const type of NOTIFICATION_EVENT_TYPES) {
  const { count } = await supabase
    .from("notifications_sent")
    .select("*", { count: "exact", head: true })
    .eq("event_type", type);
  console.log(`  ${type.padEnd(30)} ${count ?? 0} recorded`);
}

console.log(`
To actually SEND, run this from a shell logged in as admin (grab the
novanet_admin_session cookie from your admin dashboard tab and paste below):

  curl -X POST \\
    -b "novanet_admin_session=<PASTE_COOKIE>" \\
    http://localhost:3000/api/admin/monitoring/notifications/run-pass

The backend will run the pass immediately, bypass quiet hours, and use its
in-memory bots to deliver Telegram DMs.
`);
