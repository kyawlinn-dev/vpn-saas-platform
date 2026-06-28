import { createClient } from "@supabase/supabase-js";

function readCookieToken(req) {
  const token = req.cookies?.reseller_access_token;
  return typeof token === "string" && token.trim() ? token.trim() : null;
}

function getSupabaseEnv() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
  }

  return { supabaseUrl, supabaseAnonKey };
}

function createSupabaseAuthClient() {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

export async function requireAuth(req, res, next) {
  try {
    const token = readCookieToken(req);

    if (!token) {
      return res.status(401).json({ error: "Missing auth session" });
    }

    const authClient = createSupabaseAuthClient();
    const {
      data: { user },
      error,
    } = await authClient.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: "Invalid or expired session" });
    }

    req.user = user;
    return next();
  } catch (err) {
    console.error("requireAuth crash:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}