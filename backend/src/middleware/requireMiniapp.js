import { supabase } from "../lib/supabase.js";

/**
 * requireMiniapp
 *
 * Route-level middleware: ensures the authenticated reseller has a connected
 * Telegram bot (reseller_miniapps.bot_connected = true).  Apply it on any
 * route that backs a miniapp-only page so direct URL / API access is blocked
 * at the data layer, not just hidden in the sidebar nav.
 *
 * Expects req.reseller to already be set (run after requireActiveReseller).
 *
 * Returns 403 on failure — not 404 — so callers can distinguish "you're not
 * allowed" from "this resource doesn't exist".
 */
export async function requireMiniapp(req, res, next) {
  try {
    const { data } = await supabase
      .from("reseller_miniapps")
      .select("bot_connected")
      .eq("reseller_id", req.reseller.id)
      .maybeSingle();

    if (!data?.bot_connected) {
      return res.status(403).json({
        error: "Miniapp feature not available for your account",
        code: "MINIAPP_REQUIRED",
      });
    }

    return next();
  } catch (err) {
    console.error("requireMiniapp error:", err);
    return res.status(500).json({ error: "Authorization check failed" });
  }
}
