import { supabase } from "../lib/supabase.js";

// Platform-level settings (singleton row id=true). Holds the platform owner's
// payout accounts shown to resellers so they know where/how to settle.

function normalizeAccount(a) {
  if (!a || typeof a !== "object") return null;
  const method = String(a.method || "").trim().slice(0, 60);
  const account_name = String(a.account_name || "").trim().slice(0, 120);
  const account_number = String(a.account_number || "").trim().slice(0, 120);
  const note = String(a.note || "").trim().slice(0, 200);
  if (!method && !account_number && !account_name) return null;
  return { method, account_name, account_number, note };
}

export function normalizePaymentAccounts(input) {
  if (!Array.isArray(input)) return [];
  return input.map(normalizeAccount).filter(Boolean).slice(0, 20);
}

export async function getPlatformSettings() {
  const { data, error } = await supabase
    .from("platform_settings")
    .select("payment_accounts, settlement_instructions, updated_at")
    .eq("id", true)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return {
    payment_accounts: Array.isArray(data?.payment_accounts) ? data.payment_accounts : [],
    settlement_instructions: data?.settlement_instructions ?? null,
    updated_at: data?.updated_at ?? null,
  };
}

export async function updatePlatformSettings({ payment_accounts, settlement_instructions }) {
  const patch = { updated_at: new Date().toISOString() };
  if (payment_accounts !== undefined) {
    patch.payment_accounts = normalizePaymentAccounts(payment_accounts);
  }
  if (settlement_instructions !== undefined) {
    patch.settlement_instructions =
      settlement_instructions == null ? null : String(settlement_instructions).trim().slice(0, 1000) || null;
  }

  // Upsert the singleton so it exists even if the seed insert didn't run.
  const { data, error } = await supabase
    .from("platform_settings")
    .upsert({ id: true, ...patch }, { onConflict: "id" })
    .select("payment_accounts, settlement_instructions, updated_at")
    .single();

  if (error) throw new Error(error.message);
  return data;
}
