import { supabase } from "../lib/supabase.js";

export async function requireActiveReseller(req, res, next) {
  try {
    const authUserId = req.user?.id;

    if (!authUserId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { data: reseller, error } = await supabase
      .from("resellers")
      .select("*")
      .eq("supabase_user_id", authUserId)
      .maybeSingle();

    if (error) {
      console.error("requireActiveReseller query error:", error);
      return res.status(500).json({ error: "Failed to verify reseller" });
    }

    if (!reseller) {
      return res.status(403).json({ error: "Reseller access required" });
    }

    if (reseller.status !== "active") {
      return res.status(403).json({ error: "Reseller account is not active" });
    }

    req.reseller = reseller;
    return next();
  } catch (error) {
    console.error("requireActiveReseller error:", error);
    return res.status(500).json({ error: "Reseller authorization failed" });
  }
}