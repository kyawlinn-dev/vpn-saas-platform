// One-time dev-DB alignment: fix vpn_servers rows that have drifted from
// production reality. Discovered 2026-08-23 — dev's "Outline Singapore 1"
// was still marked active while the same physical box (matched by
// outline_api_url) was long decommissioned in prod, causing real timeout/
// unhealthy errors in local testing that looked like network flakiness but
// were actually "this server doesn't exist anymore."
//
// Dry-run by default. Pass --confirm to apply.
//   node --env-file=.env.local scripts/align-dev-servers-with-prod.mjs
//   node --env-file=.env.local scripts/align-dev-servers-with-prod.mjs --confirm
//
// Only touches DEV (reads SUPABASE_URL from whatever env is loaded — this
// script does NOT read .env, only the caller's chosen file, so run it with
// --env-file=.env.local to guarantee dev). Prints the dev URL up front so
// you can double check before --confirm executes.

import { createClient } from "@supabase/supabase-js";

const CONFIRM = process.argv.includes("--confirm");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log("=".repeat(70));
console.log(CONFIRM ? "MODE: CONFIRM — applying changes" : "MODE: DRY RUN — no changes");
console.log("Target Supabase (should be DEV):", process.env.SUPABASE_URL);
console.log("=".repeat(70));

if (!/huqmzvlzfcexycdrsxpn/.test(process.env.SUPABASE_URL || "")) {
  console.error("\n⛔ Refusing to run — SUPABASE_URL does not look like the known dev project.");
  console.error("   Run with --env-file=.env.local to target dev.");
  process.exit(1);
}

const steps = [];

// 1. Mark "Outline Singapore 1" decommissioned — matches prod's Outline SG 01
//    (same outline_api_url: 178.128.85.40:3742), which prod already tore down.
steps.push({
  label: "Decommission 'Outline Singapore 1' (matches prod's decommissioned Outline SG 01)",
  run: async () => {
    const { data, error } = await supabase
      .from("vpn_servers")
      .update({ status: "decommissioned", current_active_keys: 0, updated_at: new Date().toISOString() })
      .eq("name", "Outline Singapore 1")
      .eq("outline_api_url", "https://178.128.85.40:3742/wNBpYCBX2wtEmqbT0ZEXew")
      .select("id, name, status");
    if (error) throw error;
    return data;
  },
});

// 2. Rename "Outline Japan 01" -> "Outline Japan Osaka 01", bump capacity 25 -> 100
//    Matches prod's rename + capacity increase on the same physical box.
steps.push({
  label: "Rename 'Outline Japan 01' -> 'Outline Japan Osaka 01', max_active_keys 25 -> 100",
  run: async () => {
    const { data, error } = await supabase
      .from("vpn_servers")
      .update({ name: "Outline Japan Osaka 01", max_active_keys: 100, updated_at: new Date().toISOString() })
      .eq("name", "Outline Japan 01")
      .eq("outline_api_url", "https://64.176.61.174:57742/4a88lhk8nVK_UdYmBidZgA")
      .select("id, name, max_active_keys");
    if (error) throw error;
    return data;
  },
});

// 3. Bump sgp1-6607-trial max_active_keys 100 -> 150, matching prod
steps.push({
  label: "Bump 'sgp1-6607-trial' max_active_keys 100 -> 150",
  run: async () => {
    const { data, error } = await supabase
      .from("vpn_servers")
      .update({ max_active_keys: 150, updated_at: new Date().toISOString() })
      .eq("name", "sgp1-6607-trial")
      .eq("outline_api_url", "https://168.144.133.227:58938/_yF6V6OqUj8HS_MfYcOjvg")
      .select("id, name, max_active_keys");
    if (error) throw error;
    return data;
  },
});

// 4. Insert the missing 'sgp1-3111' server — real active prod server, absent from dev.
//    Fresh id (let DB default generate it); everything else cloned from prod.
steps.push({
  label: "Insert missing 'sgp1-3111' server (active in prod, absent in dev)",
  run: async () => {
    const { data: existing } = await supabase
      .from("vpn_servers")
      .select("id")
      .eq("name", "sgp1-3111")
      .maybeSingle();
    if (existing) return [{ id: existing.id, name: "sgp1-3111", note: "already exists — skipped" }];

    const { data, error } = await supabase
      .from("vpn_servers")
      .insert({
        name: "sgp1-3111",
        provider: "digitalocean",
        region: "sgp1",
        region_code: null,
        droplet_id: 593185157,
        host_ip: "165.22.110.55",
        outline_api_url: "https://165.22.110.55:32819/SB-hd_o0x93AKyAMsSpkYQ",
        outline_cert_sha256: "9859B8DD3D7753855FA476421E845CE2897AF85A6CBCBEC4A058635A7B480DD1",
        status: "active",
        is_default: false,
        max_active_keys: 100,
        current_active_keys: 0, // dev has no real keys on this box yet
        server_tier: "premium",
      })
      .select("id, name, status")
      .single();
    if (error) throw error;
    return [data];
  },
});

// 5. Leave the 14 dev-only decommissioned rows alone — already inert,
//    deleting risks FK breakage on old test orders/keys. No-op, documented.
steps.push({
  label: "(step 5) Leave 14 dev-only decommissioned rows untouched — no-op, for the record",
  run: async () => [],
});

for (const step of steps) {
  console.log(`\n▶ ${step.label}`);
  if (!CONFIRM) {
    console.log("  (dry run — skipped)");
    continue;
  }
  try {
    const result = await step.run();
    if (result.length === 0) {
      console.log("  no matching rows (already correct, or nothing to do)");
    } else {
      for (const row of result) console.log("  ✓", JSON.stringify(row));
    }
  } catch (err) {
    console.error("  ⚠️  FAILED:", err.message);
  }
}

console.log(`\n${"=".repeat(70)}`);
if (!CONFIRM) {
  console.log("Dry run only. Re-run with --confirm to apply.");
} else {
  console.log("Done. Verify with:");
  console.log("  node --env-file=.env.local scripts/diagnose-servers.mjs");
}
console.log("=".repeat(70));
