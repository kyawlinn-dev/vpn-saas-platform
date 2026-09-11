import { supabase } from "../lib/supabase.js";

// Soft reseller gate for the hybrid-onboarding model.
//
// Unlike requireActiveReseller (which demands status === 'active'), this lets a
// PENDING reseller through so they can log in, see their profile, and set up
// their brand/payment info while they wait for approval. Only 'disabled'
// accounts (and non-resellers) are blocked.
//
// Use this ONLY on read/profile/settings routes a pending reseller legitimately
// needs. Anything that provisions or mutates customer data must stay behind
// requireActiveReseller so real keys can't be created until approval.
export async function requireReseller(req, res, next) {
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
      console.error("requireReseller query error:", error);
      return res.status(500).json({ error: "Failed to verify reseller" });
    }

    if (!reseller) {
      return res.status(403).json({ error: "Reseller access required" });
    }

    if (reseller.status === "disabled") {
      return res.status(403).json({ error: "Reseller account is disabled" });
    }

    req.reseller = reseller;
    return next();
  } catch (error) {
    console.error("requireReseller error:", error);
    return res.status(500).json({ error: "Reseller authorization failed" });
  }
}
