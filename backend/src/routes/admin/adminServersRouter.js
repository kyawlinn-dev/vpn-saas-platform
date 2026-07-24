import express from "express";
import { supabase } from "../../lib/supabase.js";
import { startProvisionOutlineServer } from "../../services/serverProvisionService.js";
import { getServerInventorySummary, getActiveServers } from "../../services/serverService.js";
import { destroyDroplet } from "../../services/digitalOceanService.js";
import { deleteOutlineKey } from "../../services/outlineService.js";
import { migrateActiveOrderToServer } from "../../services/subscriptionProvisionService.js";

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
    server_tier: server.server_tier || "premium",
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

// ─── Provision new server ─────────────────────────────────────────────────────
// Accepts optional body: { region, name, size, server_tier }
// Falls back to env vars DIGITALOCEAN_REGION / DIGITALOCEAN_SIZE if not provided.

router.post("/provision", async (req, res) => {
  try {
    const { region, name, size, server_tier } = req.body ?? {};

    const server = await startProvisionOutlineServer({
      region: region?.trim() || undefined,
      name: name?.trim() || undefined,
      size: size?.trim() || undefined,
      serverTier: server_tier?.trim() || undefined,
    });

    return res.status(202).json({
      success: true,
      message: "Server provisioning started",
      server: toServerResponse(server),
    });
  } catch (error) {
    console.error("Admin provision server crash:", error);
    return res.status(500).json({ error: error.message, code: "SERVER_PROVISION_START_FAILED" });
  }
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

router.post("/:serverId/decommission", async (req, res) => {
  const { serverId } = req.params;
  const force = req.body?.force === true;

  try {
    // 1. Fetch the server row
    const { data: server, error: serverErr } = await supabase
      .from("vpn_servers")
      .select("*")
      .eq("id", serverId)
      .maybeSingle();

    if (serverErr) return res.status(500).json({ error: serverErr.message });
    if (!server) return res.status(404).json({ error: "Server not found" });
    if (server.status === "decommissioned") {
      return res.status(400).json({ error: "Server is already decommissioned", code: "ALREADY_DECOMMISSIONED" });
    }

    // 2. Mark server decommissioned FIRST so getActiveServers() excludes it
    //    when picking a migration target for customers on this server.
    await supabase
      .from("vpn_servers")
      .update({
        status: "decommissioned",
        current_active_keys: 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", serverId);

    // 3. Fetch all active VPN keys on this server
    const { data: activeKeys, error: keysErr } = await supabase
      .from("vpn_keys")
      .select("id, outline_key_id, order_id")
      .eq("server_id", serverId)
      .eq("status", "active");

    if (keysErr) return res.status(500).json({ error: keysErr.message });

    const keys = activeKeys || [];
    const orderIds = [...new Set(keys.map((k) => k.order_id).filter(Boolean))];

    // 4. Delete each Outline key from the VPN server API (best-effort)
    if (server.outline_api_url && server.outline_cert_sha256) {
      for (const key of keys) {
        if (!key.outline_key_id) continue;
        try {
          await deleteOutlineKey({
            apiUrl: server.outline_api_url,
            certSha256: server.outline_cert_sha256,
            outlineKeyId: key.outline_key_id,
          });
        } catch (err) {
          console.warn(`[decommission] Outline key ${key.outline_key_id} deletion failed:`, err.message);
        }
      }
    }

    // 5. Mark all active keys on this server as deleted in DB
    if (keys.length > 0) {
      await supabase
        .from("vpn_keys")
        .update({ status: "deleted", deleted_at: new Date().toISOString() })
        .eq("server_id", serverId)
        .eq("status", "active");
    }

    // 6. Migrate every active order to the least-loaded available server.
    //    The decommissioned server (step 2) is already excluded from candidates.
    let ordersMigrated = 0;
    let ordersFailed = 0;

    if (orderIds.length > 0) {
      const { data: orders } = await supabase
        .from("vpn_orders")
        .select(`
          id, customer_id, reseller_id, status, order_type,
          customer:vpn_customers!vpn_orders_customer_id_fkey(id, full_name),
          plan:vpn_plans(id, name, data_limit_gb, allowed_regions, is_trial)
        `)
        .in("id", orderIds)
        .eq("status", "active");

      for (const order of orders || []) {
        try {
          // Respect the plan's region restrictions; NULL / empty = any region
          const allowedRegions = Array.isArray(order.plan?.allowed_regions)
            ? order.plan.allowed_regions.filter(Boolean)
            : [];

          const serverTier = order.order_type === "trial" || order.plan?.is_trial ? "trial" : "premium";
          const [newServer] = await getActiveServers({ regions: allowedRegions, limit: 1, serverTier });

          if (!newServer) {
            console.warn(`[decommission] No available server for order ${order.id} — no migration possible`);
            ordersFailed++;
            continue;
          }

          await migrateActiveOrderToServer({ order, newServer, oldServerId: serverId });
          console.log(`[decommission] Migrated order ${order.id} → server ${newServer.name} (${newServer.id})`);
          ordersMigrated++;
        } catch (err) {
          console.error(`[decommission] Failed to migrate order ${order.id}:`, err.message);
          ordersFailed++;
        }
      }
    }

    // 7. Destroy the DigitalOcean droplet (skipped when force=true, e.g. IP already banned)
    let dropletDestroyed = false;
    if (server.droplet_id && !force) {
      try {
        await destroyDroplet(server.droplet_id);
        dropletDestroyed = true;
      } catch (err) {
        console.warn(`[decommission] Droplet ${server.droplet_id} destruction failed:`, err.message);
      }
    }

    return res.json({
      success: true,
      keys_deleted: keys.length,
      orders_migrated: ordersMigrated,
      orders_failed: ordersFailed,
      droplet_destroyed: dropletDestroyed,
    });
  } catch (error) {
    console.error("Admin decommission server crash:", error);
    return res.status(500).json({ error: error.message });
  }
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
