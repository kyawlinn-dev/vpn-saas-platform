import express from "express";
import { supabase } from "../../lib/supabase.js";
import { getServerInventorySummary } from "../../services/serverService.js";

const router = express.Router();

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toServerResponse(server) {
  const currentActiveKeys = toNumber(server?.current_active_keys, 0);
  const maxActiveKeys = toNumber(server?.max_active_keys, 0);

  return {
    id: server.id,
    name: server.name,
    provider: server.provider || null,
    region: server.region || null,
    droplet_id: server.droplet_id || null,
    host_ip: server.host_ip || null,
    status: server.status,
    panel_type: server.panel_type || null,
    server_tier: server.server_tier || "premium",
    current_active_keys: currentActiveKeys,
    max_active_keys: maxActiveKeys,
    remaining_capacity: Math.max(maxActiveKeys - currentActiveKeys, 0),
    is_default: Boolean(server.is_default),
    last_error: server.last_error || null,
    created_at: server.created_at || null,
    updated_at: server.updated_at || null,
  };
}

function normalizeServerTier(value) {
  return String(value || "").trim().toLowerCase() === "trial" ? "trial" : "premium";
}

async function countActiveServerKeys(serverId) {
  const { count, error } = await supabase
    .from("vpn_keys")
    .select("id", { count: "exact", head: true })
    .eq("server_id", serverId)
    .eq("status", "active")
    .is("deleted_at", null);

  if (error) throw new Error(error.message);
  return count || 0;
}

// ─── List all servers ────────────────────────────────────────────────────────

router.get("/", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("vpn_servers")
      .select("*")
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    return res.json({ success: true, servers: (data || []).map(toServerResponse) });
  } catch (error) {
    console.error("Admin list servers crash:", error);
    return res.status(500).json({ error: error.message });
  }
});

// ─── Server inventory summary ─────────────────────────────────────────────────

router.get("/inventory", async (req, res) => {
  try {
    const summary = await getServerInventorySummary();
    return res.json({ success: true, counts: summary.counts, servers: summary.servers });
  } catch (error) {
    console.error("Admin server inventory crash:", error);
    return res.status(500).json({ error: error.message });
  }
});

// ─── Get single server ────────────────────────────────────────────────────────

router.get("/:serverId", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("vpn_servers")
      .select("*")
      .eq("id", req.params.serverId)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: "Server not found" });

    return res.json({ success: true, server: toServerResponse(data) });
  } catch (error) {
    console.error("Admin get server crash:", error);
    return res.status(500).json({ error: error.message });
  }
});

// Automated server provisioning is unavailable until the Marzneshin flow is implemented.
router.post("/provision", (_req, res) => {
  return res.status(410).json({ error: "Automatic server provisioning is unavailable", code: "PROVISIONING_UNAVAILABLE" });
});

// ─── Decommission server ──────────────────────────────────────────────────────
// Deletes all active Outline keys on this server, stops their orders,
// destroys the DigitalOcean droplet (unless force=true), and marks the
// server as 'decommissioned'.
//
// body: { force?: boolean }  — force=true skips droplet deletion
//                              (use when the server/IP is already banned/gone)

router.patch("/:serverId/tier", async (req, res) => {
  try {
    const { serverId } = req.params;
    const serverTier = String(req.body?.server_tier || "").trim().toLowerCase();

    if (!["trial", "premium"].includes(serverTier)) {
      return res.status(400).json({ error: "server_tier must be trial or premium" });
    }

    const { data: existingServer, error: readError } = await supabase
      .from("vpn_servers")
      .select("*")
      .eq("id", serverId)
      .maybeSingle();

    if (readError) return res.status(500).json({ error: readError.message });
    if (!existingServer) return res.status(404).json({ error: "Server not found" });

    const currentTier = normalizeServerTier(existingServer.server_tier);
    const activeKeyCount = await countActiveServerKeys(serverId);

    if (currentTier !== serverTier && activeKeyCount > 0) {
      return res.status(409).json({
        error: `Server tier is locked while ${activeKeyCount} active key${activeKeyCount === 1 ? "" : "s"} remain on this server. Decommission/migrate customers first, then change tier.`,
        code: "SERVER_TIER_LOCKED_ACTIVE_KEYS",
        active_keys: activeKeyCount,
        current_tier: currentTier,
        requested_tier: serverTier,
      });
    }

    const { data, error } = await supabase
      .from("vpn_servers")
      .update({
        server_tier: serverTier,
        updated_at: new Date().toISOString(),
      })
      .eq("id", serverId)
      .select()
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: "Server not found" });

    return res.json({ success: true, message: "Server tier updated", server: toServerResponse(data) });
  } catch (error) {
    console.error("Admin update server tier crash:", error);
    return res.status(500).json({ error: error.message });
  }
});

// Retiring a provider must not destroy a droplet that also runs Marznode.
router.post("/:serverId/decommission", (_req, res) => {
  return res.status(410).json({ error: "Automatic decommissioning is unavailable", code: "DECOMMISSION_UNAVAILABLE" });
});

// ─── Edit capacity ────────────────────────────────────────────────────────────

router.patch("/:serverId/capacity", async (req, res) => {
  try {
    const { serverId } = req.params;
    const maxActiveKeys = Number(req.body?.max_active_keys);

    if (!Number.isInteger(maxActiveKeys) || maxActiveKeys <= 0) {
      return res.status(400).json({ error: "max_active_keys must be a positive integer" });
    }

    const { data, error } = await supabase
      .from("vpn_servers")
      .update({ max_active_keys: maxActiveKeys, updated_at: new Date().toISOString() })
      .eq("id", serverId)
      .select()
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: "Server not found" });

    return res.json({ success: true, message: "Server capacity updated", server: toServerResponse(data) });
  } catch (error) {
    console.error("Admin update server capacity crash:", error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;
