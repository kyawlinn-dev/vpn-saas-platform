/**
 * resellerMeRouter.js
 *
 * Mounted at: /api/reseller/me
 * Already protected by: requireAuth + requireActiveReseller (in server.js)
 *
 * Returns a clean, whitelisted shape — never the raw DB row.
 */

import express from "express";
import { supabase } from "../../lib/supabase.js";

const router = express.Router();

router.get("/", async (req, res) => {
  const r = req.reseller;

  // "Has a miniapp" = the reseller actually configured a Telegram bot. This
  // (not reseller_miniapps.is_enabled, which the admin approve toggle also
  // flips) is what gates the miniapp-only tabs. Dashboard-only resellers never
  // connect a bot, so their nav stays lean.
  let hasMiniapp = false;
  try {
    const { data } = await supabase
      .from("reseller_miniapps")
      .select("bot_connected")
      .eq("reseller_id", r.id)
      .maybeSingle();
    hasMiniapp = Boolean(data?.bot_connected);
  } catch {
    hasMiniapp = false;
  }

  return res.json({
    id: r.id,
    name: r.name,
    email: r.email ?? null,
    status: r.status,
    commission_percent: r.commission_percent ?? 20,
    has_miniapp: hasMiniapp,
    created_at: r.created_at ?? null,
    // Expose the linked Supabase user info from req.user (already verified)
    user: {
      id: req.user.id,
      email: req.user.email ?? null,
    },
  });
});

export default router;