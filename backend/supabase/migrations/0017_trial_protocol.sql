-- Migration 0017: trial_protocol column on reseller_miniapps
--
-- Lets each reseller configure which VPN protocol is used when provisioning
-- trial keys for their customers. Defaults to shadowsocks for backward compat.
-- vless is the alternative (using Marzneshin's global VLESS Reality service).

ALTER TABLE reseller_miniapps
  ADD COLUMN IF NOT EXISTS trial_protocol text NOT NULL DEFAULT 'shadowsocks';

ALTER TABLE reseller_miniapps
  ADD CONSTRAINT reseller_miniapps_trial_protocol_check
  CHECK (trial_protocol IN ('shadowsocks', 'vless'));

COMMENT ON COLUMN reseller_miniapps.trial_protocol IS
  'VPN protocol for trial key provisioning: shadowsocks | vless';
