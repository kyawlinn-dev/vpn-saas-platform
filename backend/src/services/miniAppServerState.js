export function isCurrentMiniAppServer({ key, order, server, canAccess }) {
  if (!key?.server_id) return false;
  if (key.server_id === server?.id) return true;

  if (key.protocol === "vless" && order?.order_type === "purchase") {
    return Boolean(canAccess && server?.marzneshin_vless_service_ids?.length);
  }

  return key.server_id === server?.id;
}
