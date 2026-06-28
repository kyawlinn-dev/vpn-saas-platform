import { createClient } from "@supabase/supabase-js";

function readAdminToken(req) {
  const token = req.cookies?.admin_access_token;
  return typeof token === "string" && token.trim() ? token.trim() : null;
}

export async function requireAdminAuth(req, res, next) {
  try {
    const token = readAdminToken(req);
    if (!token) {
      return res.status(401).json({ error: "Missing admin session" });
    }

    const url = process.env.SUPABASE_URL;
    const anon = process.env.SUPABASE_ANON_KEY;
    if (!url || !anon) throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");

    const authClient = createClient(url, anon, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });

    const {
      data: { user },
      error,
    } = await authClient.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: "Invalid or expired admin session" });
    }

    req.user = user;
    return next();
  } catch (err) {
    console.error("requireAdminAuth crash:", err);
    return res.status(500).json({ error: "Admin authorization failed" });
  }
}
