import express from "express";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase.js";

const router = express.Router();

function createAnonAuthClient() {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
  return createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

function isSecureRequest(req) {
  return req.secure || req.headers["x-forwarded-proto"] === "https";
}

function useCrossSiteCookies(req) {
  return process.env.NODE_ENV === "production" || isSecureRequest(req);
}

function accessCookieOptions(req) {
  const crossSite = useCrossSiteCookies(req);
  return {
    httpOnly: true,
    secure: crossSite,
    sameSite: crossSite ? "none" : "lax",
    path: "/",
    maxAge: 60 * 60 * 1000,
  };
}

function refreshCookieOptions(req) {
  const crossSite = useCrossSiteCookies(req);
  return {
    httpOnly: true,
    secure: crossSite,
    sameSite: crossSite ? "none" : "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

function setAdminCookies(req, res, session) {
  res.cookie("admin_access_token", session.access_token, accessCookieOptions(req));
  res.cookie("admin_refresh_token", session.refresh_token, refreshCookieOptions(req));
}

function clearAdminCookies(req, res) {
  const crossSite = useCrossSiteCookies(req);
  const opts = {
    path: "/",
    httpOnly: true,
    secure: crossSite,
    sameSite: crossSite ? "none" : "lax",
  };
  res.clearCookie("admin_access_token", opts);
  res.clearCookie("admin_refresh_token", opts);
}

async function lookupAdmin(supabaseUserId) {
  const { data, error } = await supabase
    .from("admins")
    .select("id, full_name, email, status")
    .eq("supabase_user_id", supabaseUserId)
    .maybeSingle();
  return { admin: data, error };
}

// POST /api/admin/auth/login
router.post("/login", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const authClient = createAnonAuthClient();
    const { data, error } = await authClient.auth.signInWithPassword({ email, password });

    if (error || !data?.session || !data?.user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const { admin, error: adminError } = await lookupAdmin(data.user.id);

    if (adminError) {
      console.error("admin login: admins table query failed:", adminError);
      return res.status(500).json({ error: "Internal server error" });
    }

    if (!admin || admin.status !== "active") {
      return res.status(403).json({ error: "Admin access required" });
    }

    setAdminCookies(req, res, data.session);

    return res.json({
      success: true,
      user: { id: data.user.id, email: data.user.email },
      admin: { name: admin.full_name, email: admin.email },
    });
  } catch (err) {
    console.error("admin login crash:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/auth/refresh
router.post("/refresh", async (req, res) => {
  try {
    const refreshToken = req.cookies?.admin_refresh_token;
    if (!refreshToken) {
      return res.status(401).json({ error: "Missing admin refresh session" });
    }

    const authClient = createAnonAuthClient();
    const { data, error } = await authClient.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error || !data?.session) {
      clearAdminCookies(req, res);
      return res.status(401).json({ error: "Invalid admin refresh session" });
    }

    setAdminCookies(req, res, data.session);
    return res.json({ success: true });
  } catch (err) {
    console.error("admin refresh crash:", err);
    clearAdminCookies(req, res);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/auth/logout
router.post("/logout", async (req, res) => {
  try {
    const accessToken = req.cookies?.admin_access_token;
    if (accessToken) {
      try {
        await supabase.auth.admin.signOut(accessToken);
      } catch (revokeErr) {
        console.warn("admin logout revoke failed:", revokeErr.message);
      }
    }
    clearAdminCookies(req, res);
    return res.json({ success: true });
  } catch (err) {
    console.error("admin logout crash:", err);
    clearAdminCookies(req, res);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/auth/me
router.get("/me", async (req, res) => {
  try {
    const accessToken = req.cookies?.admin_access_token;
    if (!accessToken) {
      return res.status(401).json({ error: "Missing admin session" });
    }

    const authClient = createAnonAuthClient();
    const {
      data: { user },
      error,
    } = await authClient.auth.getUser(accessToken);

    if (error || !user) {
      return res.status(401).json({ error: "Invalid or expired admin session" });
    }

    const { admin, error: adminError } = await lookupAdmin(user.id);

    if (adminError) {
      console.error("admin /me: admins table query failed:", adminError);
      return res.status(500).json({ error: "Internal server error" });
    }

    if (!admin || admin.status !== "active") {
      return res.status(403).json({ error: "Admin access required" });
    }

    return res.json({
      success: true,
      user: { id: user.id, email: user.email },
      admin: { name: admin.full_name, email: admin.email },
    });
  } catch (err) {
    console.error("admin /me crash:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
