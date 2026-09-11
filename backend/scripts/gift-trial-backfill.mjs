// One-off admin backfill: gift a 5GB trial to inactive customers (bucket G),
// and nudge zero-usage-trial customers to grab their existing key (bucket C).
//
// Runs OUTSIDE the backend process — talks to Supabase directly for DB writes
// and creates a fresh Telegraf instance per reseller for outbound DMs. Uses
// each reseller's own bot token so customers get the DM from the bot they
// already know.
//
// Dry-run by default (safe). Pass --confirm to actually mutate state.
//
// Because this script imports backend modules that transitively load
// backend/src/lib/loadEnv.js — which auto-applies .env.local as an override
// unless NODE_ENV=production — you MUST set NODE_ENV=production when
// targeting PROD, otherwise your local .env.local will override the prod
// SUPABASE_URL and the script will silently hit dev.
//
//   # dev (loads .env + .env.local by default)
//   node --env-file=.env.local scripts/gift-trial-backfill.mjs
//   node --env-file=.env.local scripts/gift-trial-backfill.mjs --confirm
//
//   # PROD (NODE_ENV=production prevents .env.local override)
//   NODE_ENV=production node --env-file=.env scripts/gift-trial-backfill.mjs
//   NODE_ENV=production node --env-file=.env scripts/gift-trial-backfill.mjs --confirm
//
// Watch the first log line — the script prints the actual Supabase URL in
// use so you can confirm which project you're about to modify.
//
// Dedup file: scripts/gift-trial-sent.json
//   Records each processed customer so re-running skips them.
//   Manually delete or edit entries if you need to force a repeat.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { Telegraf } from "telegraf";
import { decrypt } from "../src/lib/tokenEncryption.js";
import { createOutlineKey } from "../src/services/outlineService.js";
import {
  getActiveServers,
  incrementServerUsage,
  decrementServerUsage,
} from "../src/services/serverService.js";
import { businessDateOnly, addDaysToDateOnly } from "../src/utils/businessTime.js";

// ── Config ───────────────────────────────────────────────────────────────────
const CONFIRM = process.argv.includes("--confirm");
const DM_SLEEP_MS = 200;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEDUP_PATH = path.join(__dirname, "gift-trial-sent.json");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Dedup file helpers ───────────────────────────────────────────────────────

function loadDedup() {
  if (!fs.existsSync(DEDUP_PATH)) return { gifts: [], nudges: [] };
  try { return JSON.parse(fs.readFileSync(DEDUP_PATH, "utf8")); }
  catch { return { gifts: [], nudges: [] }; }
}

function saveDedup(state) {
  fs.writeFileSync(DEDUP_PATH, JSON.stringify(state, null, 2));
}

// ── Burmese templates ────────────────────────────────────────────────────────

const KEY_BUTTON = { text: "🔑 Outline Key ရယူရန်", callback_data: "start:get_key" };

function giftMessage(brandName) {
  return [
    `🎁 <b>${brandName} မှ လက်ဆောင်</b>`,
    ``,
    `မင်္ဂလာပါ! သင့်အတွက် <b>5GB အခမဲ့ VPN</b> ကို လက်ဆောင်ပေးထားပါသည်။`,
    ``,
    `သင့် Outline Key ကို ရယူပြီး Outline app ထဲ ထည့်ကာ ချက်ချင်း အသုံးပြုနိုင်ပါပြီ 👇`,
  ].join("\n");
}

function nudgeMessage(brandName) {
  return [
    `💡 <b>${brandName}</b>`,
    ``,
    `သင့်အတွက် <b>5GB Trial Package</b> အသင့်ရှိပါသည်!`,
    ``,
    `Outline Key ကို မယူရသေးပါ။ အောက်ပါခလုတ်ကို နှိပ်၍ ချက်ချင်း ရယူပါ 👇`,
  ].join("\n");
}

const DM_OPTIONS = {
  parse_mode: "HTML",
  disable_web_page_preview: true,
  reply_markup: { inline_keyboard: [[KEY_BUTTON]] },
};

// ── Investigation: split customers into buckets ──────────────────────────────

async function loadBucketedCustomers(resellerId) {
  const { data: customers } = await supabase
    .from("vpn_customers")
    .select("id, full_name, telegram_username, telegram_links(id, telegram_user_id, trial_used_at)")
    .eq("reseller_id", resellerId);

  const dmable = (customers || []).filter(
    (c) => Array.isArray(c.telegram_links) && c.telegram_links[0]?.telegram_user_id
  );
  if (dmable.length === 0) return { G: [], C: [] };

  const ids = dmable.map((c) => c.id);
  const [{ data: orders }, { data: keys }] = await Promise.all([
    supabase.from("vpn_orders").select("id, customer_id, order_type, status").in("customer_id", ids),
    supabase.from("vpn_keys").select("id, customer_id, order_id, used_bytes, status").in("customer_id", ids),
  ]);

  const ordersByCustomer = new Map();
  for (const o of orders || []) {
    const arr = ordersByCustomer.get(o.customer_id) || [];
    arr.push(o); ordersByCustomer.set(o.customer_id, arr);
  }
  const keysByCustomer = new Map();
  for (const k of keys || []) {
    const arr = keysByCustomer.get(k.customer_id) || [];
    arr.push(k); keysByCustomer.set(k.customer_id, arr);
  }

  const G = []; // expired_only — gift a fresh trial
  const C = []; // active trial + key + 0 usage — nudge only

  for (const c of dmable) {
    const cOrders = ordersByCustomer.get(c.id) || [];
    if (cOrders.length === 0) { G.push(c); continue; } // no_orders — treat as G

    const active = cOrders.filter((o) => o.status === "active");
    if (active.length === 0) { G.push(c); continue; } // all expired

    const activeTrial = active.find((o) => o.order_type === "trial");
    const activePaid = active.find((o) => o.order_type !== "trial");
    if (activePaid) continue; // has paid subscription — skip

    if (activeTrial) {
      const cKeys = (keysByCustomer.get(c.id) || []).filter(
        (k) => k.order_id === activeTrial.id && k.status === "active"
      );
      if (cKeys.length === 0) continue; // B_trial_no_keys (rare, unclear intent — skip)
      const bytes = cKeys.reduce((s, k) => s + Number(k.used_bytes || 0), 0);
      if (bytes === 0) { C.push(c); continue; } // C — nudge
      // D — actively using — skip
    }
  }

  return { G, C };
}

// ── Trial creation (inline — doesn't rely on trialService imports) ──────────
// Mirrors production createTrialOrder + provisionTrialKey but SKIPS the
// trial_used_at claim + skips appEventService (which may not exist on prod
// yet). Deliberate: this is an admin gift, not a self-service trial.

async function fetchGlobalTrialPlan() {
  const { data, error } = await supabase
    .from("vpn_plans")
    .select("id, name, price_mmk, data_limit_gb, duration_days, max_devices, allowed_regions, is_trial")
    .eq("is_trial", true)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Trial plan lookup failed: ${error.message}`);
  if (!data) throw new Error("No is_trial=true, is_active=true plan configured");
  return data;
}

async function totalTrialServerCapacity() {
  const servers = await getActiveServers({ limit: 0, serverTier: "trial" });
  return servers.reduce(
    (sum, s) => sum + Math.max(0, Number(s.max_active_keys || 0) - Number(s.current_active_keys || 0)),
    0
  );
}

function gbToBytes(gb) {
  const n = Number(gb);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n * 1024 * 1024 * 1024);
}

async function resetTrialClaim(telegramLinkId) {
  const { error } = await supabase
    .from("telegram_links")
    .update({ trial_used_at: null, trial_order_id: null, updated_at: new Date().toISOString() })
    .eq("id", telegramLinkId);
  if (error) throw new Error(`Reset trial claim failed: ${error.message}`);
}

async function createGiftOrder({ customerId, resellerId, plan }) {
  const startDate = businessDateOnly();
  const expiryDate = addDaysToDateOnly(startDate, plan.duration_days);
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("vpn_orders")
    .insert({
      customer_id: customerId,
      reseller_id: resellerId,
      plan_id: plan.id,
      status: "active",
      price_mmk: 0,
      commission_percent: 0,
      commission_amount_mmk: 0,
      start_date: startDate,
      expiry_date: expiryDate,
      payment_status: "paid",
      activated_at: now,
      total_paid_mmk: 0,
      order_type: "trial",
      review_status: "confirmed",
      source: "admin_backfill",
    })
    .select("id, expiry_date")
    .single();
  if (error || !data) throw new Error(`Order insert failed: ${error?.message || "no row"}`);
  return data;
}

async function provisionGiftKey({ customerId, resellerId, orderId, plan, customerFullName }) {
  const servers = await getActiveServers({ limit: 0, serverTier: "trial" });
  if (!servers.length) throw new Error("No trial servers available");

  const dataLimitBytes = gbToBytes(plan.data_limit_gb);

  for (const server of servers) {
    if (String(server.server_tier || "").toLowerCase() !== "trial") continue;

    let incremented = false;
    let outlineKey = null;
    try {
      await incrementServerUsage(server.id);
      incremented = true;

      const keyName = [
        customerFullName || "Customer",
        server.name,
        plan.name || "Trial",
        `ORD-${orderId}`,
      ].join(" | ");

      outlineKey = await createOutlineKey({
        apiUrl: server.outline_api_url,
        certSha256: server.outline_cert_sha256,
        name: keyName,
        dataLimitBytes,
      });

      const { data: inserted, error: insErr } = await supabase
        .from("vpn_keys")
        .insert({
          order_id: orderId,
          customer_id: customerId,
          reseller_id: resellerId,
          server_id: server.id,
          outline_key_id: outlineKey.outline_key_id,
          key_name: outlineKey.key_name,
          access_url: outlineKey.access_url,
          data_limit_bytes: dataLimitBytes,
          used_bytes: 0,
          status: "active",
          is_used: true,
          used_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (insErr || !inserted) throw new Error(`vpn_keys insert failed: ${insErr?.message}`);

      return { serverId: server.id, serverName: server.name, outlineKeyId: outlineKey.outline_key_id };
    } catch (err) {
      if (incremented) { try { await decrementServerUsage(server.id); } catch {} }
      // Try next server on capacity/race errors; propagate real errors
      if (err?.code === "SERVER_FULL" || err?.code === "SERVER_USAGE_RACE") continue;
      throw err;
    }
  }
  throw new Error("All trial servers full");
}

// ── Bot DM helpers ───────────────────────────────────────────────────────────

async function makeBotClient(resellerRow) {
  let token;
  try { token = decrypt(resellerRow.bot_token_encrypted); }
  catch (err) { return { bot: null, error: `token decrypt: ${err.message}` }; }
  const bot = new Telegraf(token);
  try {
    await bot.telegram.getMe();
    return { bot, error: null };
  } catch (err) {
    return { bot: null, error: `getMe: ${err?.description || err?.message || err}` };
  }
}

async function sendDM(bot, chatId, text) {
  try {
    await bot.telegram.sendMessage(chatId, text, DM_OPTIONS);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      code: err?.code || err?.response?.error_code || "send_failed",
      message: err?.description || err?.message || String(err),
    };
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=".repeat(72));
  console.log(CONFIRM ? "MODE: CONFIRM — real orders + real DMs" : "MODE: DRY RUN — no side effects");
  console.log("Supabase:", process.env.SUPABASE_URL);
  console.log("Dedup file:", DEDUP_PATH);
  console.log("=".repeat(72));

  // Preflight: trial plan + capacity
  const plan = await fetchGlobalTrialPlan();
  console.log(`\nTrial plan: "${plan.name}" — ${plan.data_limit_gb}GB, ${plan.duration_days} day(s)`);
  const capacity = await totalTrialServerCapacity();
  console.log(`Trial server capacity available: ${capacity}\n`);

  const dedup = loadDedup();
  const alreadyGifted = new Set(dedup.gifts.map((g) => g.customer_id));
  const alreadyNudged = new Set(dedup.nudges.map((n) => n.customer_id));
  console.log(`Dedup — already gifted: ${alreadyGifted.size}, already nudged: ${alreadyNudged.size}\n`);

  // Load active reseller bots
  const { data: resellers } = await supabase
    .from("reseller_miniapps")
    .select("reseller_id, brand_name, bot_token_encrypted, is_enabled")
    .eq("is_enabled", true)
    .not("bot_token_encrypted", "is", null);

  // Precompute totals for capacity check
  let plannedGifts = 0;
  const perReseller = [];
  for (const r of resellers) {
    const { G, C } = await loadBucketedCustomers(r.reseller_id);
    const giftTargets = G.filter((c) => !alreadyGifted.has(c.id));
    const nudgeTargets = C.filter((c) => !alreadyNudged.has(c.id));
    plannedGifts += giftTargets.length;
    perReseller.push({ r, giftTargets, nudgeTargets });
  }

  const totalGifts = perReseller.reduce((s, x) => s + x.giftTargets.length, 0);
  const totalNudges = perReseller.reduce((s, x) => s + x.nudgeTargets.length, 0);

  console.log(`${"─".repeat(72)}\nPlanned actions:\n${"─".repeat(72)}`);
  for (const { r, giftTargets, nudgeTargets } of perReseller) {
    if (giftTargets.length === 0 && nudgeTargets.length === 0) continue;
    console.log(`  ▸ ${r.brand_name.padEnd(24)} gifts: ${giftTargets.length}   nudges: ${nudgeTargets.length}`);
  }
  console.log(`  ${"─".repeat(60)}`);
  console.log(`  TOTAL                     gifts: ${totalGifts}   nudges: ${totalNudges}`);

  // Capacity guard
  if (totalGifts > capacity) {
    console.error(`\n⛔  Not enough trial server capacity: need ${totalGifts}, have ${capacity}. Aborting.`);
    process.exit(1);
  }

  // Preview sample DM contents (dry-run only)
  if (!CONFIRM && perReseller.length > 0) {
    const sample = perReseller.find((x) => x.giftTargets.length > 0) || perReseller.find((x) => x.nudgeTargets.length > 0);
    if (sample) {
      console.log(`\n${"─".repeat(72)}\nSample DM previews (using "${sample.r.brand_name}")\n${"─".repeat(72)}`);
      if (sample.giftTargets.length > 0) {
        console.log("\n--- GIFT ---\n" + giftMessage(sample.r.brand_name));
        console.log("\n[button] " + KEY_BUTTON.text);
      }
      if (sample.nudgeTargets.length > 0) {
        console.log("\n--- NUDGE ---\n" + nudgeMessage(sample.r.brand_name));
        console.log("\n[button] " + KEY_BUTTON.text);
      }
    }
    console.log(`\n${"─".repeat(72)}`);
    console.log("Dry-run only. Re-run with --confirm to actually create orders and send DMs.");
    return;
  }

  if (totalGifts === 0 && totalNudges === 0) {
    console.log("\nNothing to do. All eligible customers already processed (see dedup file).");
    return;
  }

  // ── CONFIRM: execute per reseller ──────────────────────────────────────────
  console.log(`\n${"═".repeat(72)}\nEXECUTING\n${"═".repeat(72)}`);

  for (const { r, giftTargets, nudgeTargets } of perReseller) {
    if (giftTargets.length === 0 && nudgeTargets.length === 0) continue;

    console.log(`\n▶ ${r.brand_name} (${r.reseller_id.slice(0, 8)})`);
    const { bot, error: botErr } = await makeBotClient(r);
    if (!bot) {
      console.log(`  ⚠️  bot unavailable (${botErr}) — skipping ${giftTargets.length + nudgeTargets.length} customer(s)`);
      continue;
    }

    // Gifts first (mutations before DMs, so if DM fails the gift stands)
    for (const c of giftTargets) {
      const label = `${(c.full_name || c.telegram_username || "customer").slice(0, 24)} (${c.id.slice(0,8)})`;
      try {
        const tgLink = c.telegram_links[0];
        await resetTrialClaim(tgLink.id);
        const order = await createGiftOrder({ customerId: c.id, resellerId: r.reseller_id, plan });
        const key = await provisionGiftKey({
          customerId: c.id, resellerId: r.reseller_id, orderId: order.id, plan,
          customerFullName: c.full_name,
        });
        // Mark trial as used on the link with the new gift order
        await supabase
          .from("telegram_links")
          .update({ trial_used_at: new Date().toISOString(), trial_order_id: order.id })
          .eq("id", tgLink.id);

        const dm = await sendDM(bot, Number(tgLink.telegram_user_id), giftMessage(r.brand_name));
        const dmStatus = dm.ok ? "DM✓" : `DM✗ (${dm.code}: ${dm.message})`;
        console.log(`  🎁 gifted ${label} → order ${order.id.slice(0,8)} on ${key.serverName} — ${dmStatus}`);

        dedup.gifts.push({
          customer_id: c.id, reseller_id: r.reseller_id, order_id: order.id,
          server_id: key.serverId, outline_key_id: key.outlineKeyId,
          dm_ok: dm.ok, dm_error: dm.ok ? null : `${dm.code}:${dm.message}`,
          sent_at: new Date().toISOString(),
        });
        saveDedup(dedup);
        await sleep(DM_SLEEP_MS);
      } catch (err) {
        console.log(`  ⚠️  gift FAILED for ${label}: ${err.message}`);
        // Not added to dedup — safe to retry
      }
    }

    // Nudges — DM only
    for (const c of nudgeTargets) {
      const label = `${(c.full_name || c.telegram_username || "customer").slice(0, 24)} (${c.id.slice(0,8)})`;
      const tgLink = c.telegram_links[0];
      const dm = await sendDM(bot, Number(tgLink.telegram_user_id), nudgeMessage(r.brand_name));
      if (dm.ok) {
        console.log(`  💡 nudged ${label}`);
        dedup.nudges.push({
          customer_id: c.id, reseller_id: r.reseller_id,
          sent_at: new Date().toISOString(),
        });
        saveDedup(dedup);
      } else {
        console.log(`  ⚠️  nudge failed for ${label}: ${dm.code}: ${dm.message}`);
      }
      await sleep(DM_SLEEP_MS);
    }
  }

  console.log(`\n${"═".repeat(72)}\n✅ Run complete. Dedup file updated: ${DEDUP_PATH}\n${"═".repeat(72)}`);
}

main().catch((err) => { console.error("FATAL:", err); process.exit(1); });
