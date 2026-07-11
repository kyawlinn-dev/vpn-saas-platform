#!/usr/bin/env node

/**
 * resetResellerPassword.js
 *
 * Set a NEW login password for an existing reseller (Supabase Auth email/password).
 * The original temp password is only shown once at creation and is not recoverable.
 *
 * Usage (run from inside the backend/ directory):
 *   node --env-file=.env scripts/resetResellerPassword.js <email> [newPassword]
 */

import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const email = String(process.argv[2] || "").trim().toLowerCase();
const providedPassword = process.argv[3];

if (!email) {
    console.error("Usage: node --env-file=.env scripts/resetResellerPassword.js <email> [newPassword]");
    process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

const newPassword = providedPassword || crypto.randomBytes(15).toString("base64url");

async function main() {
    const { data: reseller, error: resellerErr } = await supabase
        .from("resellers")
        .select("id, name, email, supabase_user_id, status")
        .eq("email", email)
        .maybeSingle();

    if (resellerErr) {
        console.error("Lookup failed:", resellerErr.message);
        process.exit(1);
    }

    const authUserId = reseller && reseller.supabase_user_id;

    if (!authUserId) {
        console.error("No reseller found for " + email + " (or it has no linked auth user).");
        process.exit(1);
    }

    const { error: updateErr } = await supabase.auth.admin.updateUserById(authUserId, {
        password: newPassword,
    });

    if (updateErr) {
        console.error("Password update failed:", updateErr.message);
        process.exit(1);
    }

    console.log("Password reset OK");
    console.log("  reseller :", reseller.name, "(" + reseller.email + ")");
    console.log("  status   :", reseller.status);
    console.log("  password :", newPassword);
    console.log("Save this now — it is not stored anywhere.");
}

main().catch(function(err) {
    console.error("Crash:", err.message);
    process.exit(1);
});