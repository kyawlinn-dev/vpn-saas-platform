-- Migration 0019: Add marzneshin_vless_trial_service_ids to vpn_servers
--
-- Purpose: Allow trial VLESS keys to be provisioned using a separate
-- Marzneshin service that includes ONLY the trial server's VLESS inbound.
-- Without this, trial users receive the global VLESS service which grants
-- access to all premium nodes.
--
-- Setup steps (after running this migration):
--   1. In the Marzneshin panel → Services → Create a new service
--      e.g. "Trial VLESS" — add ONLY the trial server's VLESS Reality inbound.
--   2. Note the numeric service ID.
--   3. Update the trial server row:
--      UPDATE vpn_servers
--      SET marzneshin_vless_trial_service_ids = '{<service_id>}'
--      WHERE server_tier = 'trial';

ALTER TABLE vpn_servers
  ADD COLUMN IF NOT EXISTS marzneshin_vless_trial_service_ids integer[] DEFAULT '{}';

COMMENT ON COLUMN vpn_servers.marzneshin_vless_trial_service_ids IS
  'Marzneshin service IDs for trial VLESS provisioning. '
  'These should reference a service containing only this trial server''s '
  'VLESS inbound — not the global all-nodes service. '
  'Populated on trial servers only; premium servers leave this empty.';
