export const publicPool = { id: "dev-public", environment: "development", panel_identity: "shared-panel", vless_service_id: 502 };
export const publicAccessContext = { publicAccessEnabled: true, environment: "development", poolId: publicPool.id, pool: publicPool };
export function publicServer(overrides = {}) {
  return {
    id: "dev-node", name: "DEV Dual", status: "active", is_active: true, panel_type: "marzneshin", server_tier: "premium",
    environment: "development", access_pool_id: publicPool.id, panel_node_id: 51,
    panel_url: "https://panel.example", panel_username: "admin", panel_password_encrypted: "test-only",
    supported_protocols: ["shadowsocks", "vless"], marzneshin_service_ids: [501],
    current_active_keys: 1, max_active_keys: 10, region: "sgp1",
    server_health_status: { outline_api_status: "healthy" },
    ownership_provenance: { method: "adopted", environment: "development", access_pool_id: publicPool.id, panel_identity: "shared-panel", panel_node_id: 51, ss_service_ids: [501], verified_at: "2026-10-21T00:00:00Z" },
    ...overrides,
  };
}
