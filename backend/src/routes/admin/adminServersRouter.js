import express from "express";
import { supabase } from "../../lib/supabase.js";
import { startProvisionOutlineServer } from "../../services/serverProvisionService.js";
import { getServerInventorySummary } from "../../services/serverService.js";

const router = express.Router();

function isAutoProvisionEnabled() {
  return (
    String(process.env.DO_AUTO_PROVISION_ENABLED || "false").toLowerCase() ===
    "true"
  );
}

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
    outline_api_url: server.outline_api_url || null,
    outline_cert_sha256: server.outline_cert_sha256 || null,
    current_active_keys: currentActiveKeys,
    max_active_keys: maxActiveKeys,
    remaining_capacity: Math.max(maxActiveKeys - currentActiveKeys, 0),
    is_default: Boolean(server.is_default),
    last_error: server.last_error || null,
    created_at: server.created_at || null,
    updated_at: server.updated_at || null,
  };
}

router.get("/", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("vpn_servers")
      .select("*")
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json({
      success: true,
      servers: (data || []).map(toServerResponse),
    });
  } catch (error) {
    console.error("Admin list servers crash:", error);
    return res.status(500).json({ error: error.message });
  }
});

router.get("/inventory", async (req, res) => {
  try {
    const summary = await getServerInventorySummary();

    return res.json({
      success: true,
      counts: summary.counts,
      servers: summary.servers,
    });
  } catch (error) {
    console.error("Admin server inventory crash:", error);
    return res.status(500).json({ error: error.message });
  }
});

router.get("/:serverId", async (req, res) => {
  try {
    const { serverId } = req.params;

    const { data, error } = await supabase
      .from("vpn_servers")
      .select("*")
      .eq("id", serverId)
      .maybeSingle();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    if (!data) {
      return res.status(404).json({ error: "Server not found" });
    }

    return res.json({
      success: true,
      server: toServerResponse(data),
    });
  } catch (error) {
    console.error("Admin get server crash:", error);
    return res.status(500).json({ error: error.message });
  }
});

router.post("/provision", async (req, res) => {
  try {
    if (!isAutoProvisionEnabled()) {
      return res.status(400).json({
        error: "Automatic provisioning is disabled",
        code: "AUTO_PROVISION_DISABLED",
      });
    }

    const server = await startProvisionOutlineServer();

    return res.status(202).json({
      success: true,
      message: "Server provisioning started",
      server: toServerResponse(server),
    });
  } catch (error) {
    console.error("Admin provision server crash:", error);
    return res.status(500).json({
      error: error.message,
      code: "SERVER_PROVISION_START_FAILED",
    });
  }
});

router.patch("/:serverId/capacity", async (req, res) => {
  try {
    const { serverId } = req.params;
    const maxActiveKeys = Number(req.body?.max_active_keys);

    if (!Number.isInteger(maxActiveKeys) || maxActiveKeys <= 0) {
      return res.status(400).json({
        error: "max_active_keys must be a positive integer",
      });
    }

    const { data, error } = await supabase
      .from("vpn_servers")
      .update({
        max_active_keys: maxActiveKeys,
        updated_at: new Date().toISOString(),
      })
      .eq("id", serverId)
      .select()
      .maybeSingle();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    if (!data) {
      return res.status(404).json({ error: "Server not found" });
    }

    return res.json({
      success: true,
      message: "Server capacity updated",
      server: toServerResponse(data),
    });
  } catch (error) {
    console.error("Admin update server capacity crash:", error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;