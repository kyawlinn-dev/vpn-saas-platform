import { supabase } from "../lib/supabase.js";
import { getOutlineTransferMetrics } from "../services/outlineService.js";

const INTERVAL_MS = 60 * 60 * 1000; // 1 hour

async function syncUsage() {
  const { data: servers, error: serverError } = await supabase
    .from("vpn_servers")
    .select("id, outline_api_url, outline_cert_sha256")
    .eq("is_active", true)
    .not("outline_api_url", "is", null);

  if (serverError) {
    console.error("[syncUsage] Failed to fetch servers:", serverError.message);
    return;
  }

  if (!servers?.length) return;

  for (const server of servers) {
    try {
      const metricsMap = await getOutlineTransferMetrics({
        apiUrl: server.outline_api_url,
        certSha256: server.outline_cert_sha256,
      });

      if (!Object.keys(metricsMap).length) continue;

      const { data: keys, error: keysError } = await supabase
        .from("vpn_keys")
        .select("id, outline_key_id, used_bytes")
        .eq("server_id", server.id)
        .eq("status", "active")
        .is("deleted_at", null);

      if (keysError) {
        console.warn(
          `[syncUsage] Failed to fetch keys for server ${server.id}:`,
          keysError.message
        );
        continue;
      }

      if (!keys?.length) continue;

      let updated = 0;

      for (const key of keys) {
        const newBytes = metricsMap[String(key.outline_key_id)];
        if (newBytes === undefined) continue;
        if (Number(newBytes) === Number(key.used_bytes)) continue;

        const { error: updateError } = await supabase
          .from("vpn_keys")
          .update({ used_bytes: newBytes })
          .eq("id", key.id);

        if (updateError) {
          console.warn(
            `[syncUsage] Failed to update used_bytes for key ${key.id}:`,
            updateError.message
          );
        } else {
          updated += 1;
        }
      }

      console.log(`[syncUsage] Server ${server.id}: updated ${updated} key(s).`);
    } catch (err) {
      console.error(`[syncUsage] Error syncing server ${server.id}:`, err.message);
    }
  }
}

async function runSyncUsage() {
  console.log("[syncUsage] Running...");
  await syncUsage();
}

export function startSyncUsageJob() {
  runSyncUsage().catch((err) =>
    console.error("[syncUsage] Initial run error:", err.message)
  );

  setInterval(() => {
    runSyncUsage().catch((err) =>
      console.error("[syncUsage] Interval run error:", err.message)
    );
  }, INTERVAL_MS);

  console.log("[syncUsage] Job scheduled (every 1 hour).");
}
