/**
 * Legacy reseller auth router.
 *
 * Mounted at: /api/auth/reseller-legacy
 * This is kept temporarily for older flows during migration.
 */

import express from "express";
import { supabase } from "../../lib/supabase.js";

const router = express.Router();

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data?.session) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  return res.json({
    access_token: data.session.access_token,
    user: data.user,
  });
});

export default router;