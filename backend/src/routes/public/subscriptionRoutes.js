import express from "express";
import { supabase } from "../../lib/supabase.js";
import { parseSsUrl } from "../../utils/parseSsUrl.js";

const router = express.Router();

router.get("/subscription", async (req, res) => {
  try {
    const token = String(req.query.token || "").trim();
    if (!token) return res.status(400).json({ error: "Missing token" });

    const { data: tokenRow, error: tokenErr } = await supabase
      .from("access_tokens")
      .select(`
        *,
        customer:vpn_customers(id, full_name, telegram_username, phone)
      `)
      .eq("token", token)
      .eq("status", "active")
      .single();

    if (tokenErr || !tokenRow) {
      return res.status(404).json({ error: "Invalid token" });
    }

    if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date()) {
      return res.status(403).json({ error: "Token expired" });
    }

    const { data: assignments, error: assignmentErr } = await supabase
      .from("token_server_assignments")
      .select(`
        *,
        server:vpn_servers(id, name, region, status),
        vpn_key:vpn_keys(id, access_url, status)
      `)
      .eq("token_id", tokenRow.id)
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    if (assignmentErr) throw new Error(assignmentErr.message);

    const servers = [];

    for (const row of assignments || []) {
      if (
        row.server?.status !== "active" ||
        row.vpn_key?.status !== "active" ||
        !row.vpn_key?.access_url
      ) {
        continue;
      }

      try {
        const parsed = parseSsUrl(row.vpn_key.access_url);

        servers.push({
          id: row.server.id,
          tag: row.server.name,
          region: row.server.region,
          server: parsed.server,
          port: parsed.port,
          method: parsed.method,
          password: parsed.password,
          remarks: row.server.name,
        });
      } catch (parseError) {
        console.warn(
          `[subscription] Skipping malformed access URL for token assignment ${row.id}:`,
          parseError.message
        );
      }
    }

    await supabase
      .from("access_tokens")
      .update({
        last_used_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", tokenRow.id);

    return res.json({
      ok: true,
      token: tokenRow.token,
      customer: tokenRow.customer,
      expires_at: tokenRow.expires_at,
      server_count: servers.length,
      servers,
    });
  } catch (err) {
    console.error("GET /api/public/subscription crash:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
});

export default router;