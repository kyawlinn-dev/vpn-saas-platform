import { supabase } from "../lib/supabase.js";

export async function requireAdmin(req, res, next) {
  try {
    const authUserId = req.user?.id;

    if (!authUserId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { data: admin, error } = await supabase
      .from("admins")
      .select("*")
      .eq("supabase_user_id", authUserId)
      .maybeSingle();

    if (error) {
      console.error("requireAdmin query error:", error);
      return res.status(500).json({ error: "Failed to verify admin" });
    }

    if (!admin) {
      return res.status(403).json({ error: "Admin access required" });
    }

    if (admin.status !== "active") {
      return res.status(403).json({ error: "Admin account is not active" });
    }

    req.admin = admin;
    return next();
  } catch (error) {
    console.error("requireAdmin error:", error);
    return res.status(500).json({ error: "Admin authorization failed" });
  }
}