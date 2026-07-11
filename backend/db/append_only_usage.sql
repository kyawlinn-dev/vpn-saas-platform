-- Drop the old full uniqueness on (order_id, server_id), whether constraint or index:
ALTER TABLE vpn_keys DROP CONSTRAINT IF EXISTS uq_vpn_keys_order_server;
DROP INDEX IF EXISTS uq_vpn_keys_order_server;

-- Append-only: allow many rows per (order_id, server_id), but only ONE active at a time:
CREATE UNIQUE INDEX IF NOT EXISTS uq_vpn_keys_active_order_server
  ON vpn_keys (order_id, server_id)
  WHERE status = 'active' AND deleted_at IS NULL;
