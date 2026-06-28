import crypto from "crypto";
import { supabase } from "../lib/supabase.js";

export function generateAccessToken() {
  return `tok_${crypto.randomBytes(24).toString("hex")}`;
}

function normalizeTokenStatus(status) {
  return String(status || "").trim().toLowerCase();
}

export async function getTokenByOrderId(orderId) {
  const { data, error } = await supabase
    .from("access_tokens")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const rows = data || [];
  if (!rows.length) return null;

  const active = rows.find((row) => normalizeTokenStatus(row.status) === "active");
  return active || rows[0];
}

export async function createAccessToken({
  customerId,
  resellerId,
  orderId,
  expiresAt,
}) {
  const token = generateAccessToken();

  const { data, error } = await supabase
    .from("access_tokens")
    .insert({
      customer_id: customerId,
      reseller_id: resellerId,
      order_id: orderId,
      token,
      status: "active",
      expires_at: expiresAt,
      last_used_at: null,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Failed to create access token");
  }

  return data;
}

export async function ensureOrderToken({
  customerId,
  resellerId,
  orderId,
  expiresAt,
}) {
  const existing = await getTokenByOrderId(orderId);

  if (existing) {
    const { data, error } = await supabase
      .from("access_tokens")
      .update({
        status: "active",
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select()
      .single();

    if (error || !data) {
      throw new Error(error?.message || "Failed to update access token");
    }

    return data;
  }

  try {
    return await createAccessToken({
      customerId,
      resellerId,
      orderId,
      expiresAt,
    });
  } catch (err) {
    const racedExisting = await getTokenByOrderId(orderId);

    if (racedExisting) {
      const { data, error } = await supabase
        .from("access_tokens")
        .update({
          status: "active",
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", racedExisting.id)
        .select()
        .single();

      if (error || !data) {
        throw new Error(error?.message || "Failed to recover existing access token");
      }

      return data;
    }

    throw err;
  }
}

export async function deactivateToken(tokenId) {
  const { error } = await supabase
    .from("access_tokens")
    .update({
      status: "inactive",
      updated_at: new Date().toISOString(),
    })
    .eq("id", tokenId);

  if (error) throw new Error(error.message);
}

export async function activateToken(tokenId, expiresAt) {
  const { data, error } = await supabase
    .from("access_tokens")
    .update({
      status: "active",
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", tokenId)
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Failed to activate token");
  }

  return data;
}