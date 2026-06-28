/**
 * resellerMeRouter.js
 *
 * Mounted at: /api/reseller/me
 * Already protected by: requireAuth + requireActiveReseller (in server.js)
 *
 * Returns a clean, whitelisted shape — never the raw DB row.
 */

import express from "express";

const router = express.Router();

router.get("/", (req, res) => {
  const r = req.reseller;

  return res.json({
    id: r.id,
    name: r.name,
    email: r.email ?? null,
    status: r.status,
    commission_percent: r.commission_percent ?? 20,
    created_at: r.created_at ?? null,
    // Expose the linked Supabase user info from req.user (already verified)
    user: {
      id: req.user.id,
      email: req.user.email ?? null,
    },
  });
});

export default router;