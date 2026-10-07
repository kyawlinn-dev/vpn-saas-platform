import "../src/lib/loadEnv.js";
import { supabase } from "../src/lib/supabase.js";
import { getKey, updateKeyDataLimit } from "../src/services/vpnProviderService.js";
import { getServerById } from "../src/services/serverService.js";
import { businessDateOnly } from "../src/utils/businessTime.js";
import { panelExpireDateForOrder } from "../src/services/marzneshinService.js";

const DEV_PROJECT_REF = "huqmzvlzfcexycdrsxpn";
const apply = process.argv.includes("--apply");

if (process.env.NODE_ENV === "production" || !String(process.env.SUPABASE_URL).includes(DEV_PROJECT_REF)) {
  throw new Error("This backfill is restricted to the development Supabase project");
}

const { data: keys, error } = await supabase
  .from("vpn_keys")
  .select("id, server_id, outline_key_id, access_url, order:vpn_orders!vpn_keys_order_id_fkey(status, expiry_date)")
  .eq("status", "active")
  .is("deleted_at", null);
if (error) throw error;

const summary = { checked: 0, already_set: 0, eligible: 0, updated: 0, skipped: 0 };
const servers = new Map();

for (const key of keys || []) {
  if (!key.outline_key_id || /^\d+$/.test(key.outline_key_id)) continue;
  summary.checked += 1;

  const order = key.order;
  if (order?.status !== "active" || !order.expiry_date || order.expiry_date < businessDateOnly()) {
    summary.skipped += 1;
    continue;
  }

  panelExpireDateForOrder(order.expiry_date);
  let server = servers.get(key.server_id);
  if (!server) {
    server = await getServerById(key.server_id);
    servers.set(key.server_id, server);
  }

  const user = await getKey({ server, keyId: key.outline_key_id });
  const savedPath = key.access_url && new URL(key.access_url).pathname;
  const panelPath = user?.subscription_url && new URL(user.subscription_url, server.panel_url).pathname;
  if (!user || user.username !== key.outline_key_id || !savedPath || savedPath !== panelPath) {
    summary.skipped += 1;
    continue;
  }

  const expectedExpiry = panelExpireDateForOrder(order.expiry_date);
  if (user.expire_strategy === "fixed_date" &&
      [expectedExpiry, expectedExpiry.replace(".000Z", "")].includes(user.expire_date)) {
    summary.already_set += 1;
    continue;
  }
  if (user.expire_strategy !== "never") {
    summary.skipped += 1;
    continue;
  }

  summary.eligible += 1;
  if (apply) {
    await updateKeyDataLimit({
      server,
      keyId: key.outline_key_id,
      dataLimitBytes: user.data_limit,
      expiryDate: order.expiry_date,
    });
    summary.updated += 1;
  }
}

console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", ...summary }));
