import express from "express";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase.js";

const router = express.Router();

const DEFAULT_COMMISSION_PERCENT = 20;

function slugifyBusiness(name) {
  const base = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || "reseller";
  const rand = Math.random().toString(36).slice(2, 8);
  return `${base}-${rand}`;
}

function getSupabaseEnv() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("Missing SUPABASE_URL");
  }

  return {
    supabaseUrl,
    supabaseAnonKey,
    supabaseServiceRoleKey,
  };
}

function createSupabaseAuthClient() {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

  if (!supabaseAnonKey) {
    throw new Error("Missing SUPABASE_ANON_KEY");
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

function createSupabaseAdminClient() {
  const { supabaseUrl, supabaseServiceRoleKey } = getSupabaseEnv();

  if (!supabaseServiceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function isSecureRequest(req) {
  return req.secure || req.headers["x-forwarded-proto"] === "https";
}

function useCrossSiteCookies(req) {
  return isProduction() || isSecureRequest(req);
}

function getAccessCookieOptions(req) {
  const crossSite = useCrossSiteCookies(req);

  return {
    httpOnly: true,
    secure: crossSite,
    sameSite: crossSite ? "none" : "lax",
    path: "/",
    maxAge: 60 * 60 * 1000,
  };
}

function getRefreshCookieOptions(req) {
  const crossSite = useCrossSiteCookies(req);

  return {
    httpOnly: true,
    secure: crossSite,
    sameSite: crossSite ? "none" : "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

function setSessionCookies(req, res, session) {
  res.cookie(
    "reseller_access_token",
    session.access_token,
    getAccessCookieOptions(req)
  );

  res.cookie(
    "reseller_refresh_token",
    session.refresh_token,
    getRefreshCookieOptions(req)
  );
}

function clearSessionCookies(req, res) {
  const crossSite = useCrossSiteCookies(req);

  res.clearCookie("reseller_access_token", {
    path: "/",
    httpOnly: true,
    secure: crossSite,
    sameSite: crossSite ? "none" : "lax",
  });

  res.clearCookie("reseller_refresh_token", {
    path: "/",
    httpOnly: true,
    secure: crossSite,
    sameSite: crossSite ? "none" : "lax",
  });
}

// Forgot password — sends a Supabase recovery email to the reseller's address.
// Uses implicit flow so the recovery link carries the access_token in the URL
// fragment (no PKCE code verifier required on the server side).
// Always returns 200 to avoid email-enumeration attacks.
router.post("/forgot-password", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ error: "Email is required" });

    // Confirm this email belongs to a reseller before spending an email send.
    const { data: reseller } = await supabase
      .from("resellers")
      .select("id")
      .ilike("email", email)
      .maybeSingle();

    if (!reseller) {
      // Return success to avoid revealing which emails are registered.
      return res.json({ success: true });
    }

    const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();
    if (!supabaseAnonKey) throw new Error("Missing SUPABASE_ANON_KEY");

    // Use implicit flow so the reset link delivers access_token in the hash
    // fragment — the frontend can extract it without a PKCE code verifier.
    const resetClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
        flowType: "implicit",
      },
    });

    const dashboardUrl = process.env.RESELLER_DASHBOARD_URL || "http://localhost:3002";
    await resetClient.auth.resetPasswordForEmail(email, {
      redirectTo: `${dashboardUrl}/reset-password`,
    });

    return res.json({ success: true });
  } catch (err) {
    console.error("forgot-password crash:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Confirm password reset — verifies the recovery access_token from the email
// link and updates the reseller's password via the admin API.
router.post("/confirm-reset", async (req, res) => {
  try {
    const accessToken = String(req.body?.access_token || "").trim();
    const password = String(req.body?.password || "");

    if (!accessToken) return res.status(400).json({ error: "Missing reset token" });
    if (!password || password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();
    if (!supabaseAnonKey) throw new Error("Missing SUPABASE_ANON_KEY");

    // Verify the recovery token by calling getUser with it as a bearer token.
    const verifyClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });

    const { data: { user }, error: userError } = await verifyClient.auth.getUser();
    if (userError || !user) {
      return res.status(401).json({ error: "Invalid or expired reset link. Please request a new one." });
    }

    // Update the password via the admin API (doesn't need the user's own session).
    const admin = createSupabaseAdminClient();
    const { error: updateError } = await admin.auth.admin.updateUserById(user.id, { password });
    if (updateError) {
      console.error("confirm-reset updateUser error:", updateError);
      return res.status(400).json({ error: "Failed to update password. Please try again." });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("confirm-reset crash:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const authClient = createSupabaseAuthClient();
    const { data, error } = await authClient.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data?.session || !data?.user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    setSessionCookies(req, res, data.session);

    return res.json({
      success: true,
      user: {
        id: data.user.id,
        email: data.user.email,
      },
    });
  } catch (err) {
    console.error("reseller login crash:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/refresh", async (req, res) => {
  try {
    const refreshToken = req.cookies?.reseller_refresh_token;

    if (!refreshToken) {
      return res.status(401).json({ error: "Missing refresh session" });
    }

    const authClient = createSupabaseAuthClient();
    const { data, error } = await authClient.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error || !data?.session) {
      clearSessionCookies(req, res);
      return res.status(401).json({ error: "Invalid refresh session" });
    }

    setSessionCookies(req, res, data.session);

    return res.json({ success: true });
  } catch (err) {
    console.error("session refresh crash:", err);
    clearSessionCookies(req, res);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/logout", async (req, res) => {
  try {
    const accessToken = req.cookies?.reseller_access_token;

    if (accessToken) {
      try {
        const adminClient = createSupabaseAdminClient();
        await adminClient.auth.admin.signOut(accessToken);
      } catch (revokeErr) {
        console.warn("Logout revoke failed:", revokeErr.message);
      }
    }

    clearSessionCookies(req, res);
    return res.json({ success: true });
  } catch (err) {
    console.error("logout crash:", err);
    clearSessionCookies(req, res);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/me", async (req, res) => {
  try {
    const accessToken = req.cookies?.reseller_access_token;

    if (!accessToken) {
      return res.status(401).json({ error: "Missing auth session" });
    }

    const authClient = createSupabaseAuthClient();
    const {
      data: { user },
      error,
    } = await authClient.auth.getUser(accessToken);

    if (error || !user) {
      return res.status(401).json({ error: "Invalid or expired session" });
    }

    return res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
      },
    });
  } catch (err) {
    console.error("session me crash:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
