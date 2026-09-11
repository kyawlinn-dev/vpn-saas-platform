-- Migrate from Outline Manager to Marzneshin panel (multi-protocol).
--
-- Marzneshin supports Shadowsocks + VLESS Reality + Hysteria2 from a
-- single panel via its "services" concept (bundles of inbounds).
-- Outline Manager integration is retired.
--
-- Purely additive: new columns have safe defaults so existing rows
-- are unaffected until explicitly updated.

-- Panel type column. All servers will be Marzneshin going forward.
-- Existing rows get 'marzneshin' since Outline is retired.
alter table vpn_servers
  add column if not exists panel_type text not null default 'marzneshin'
    check (panel_type = 'marzneshin');

-- Marzneshin panel credentials. Password is encrypted at rest by the
-- application layer (same pattern as bot_token_encrypted on resellers),
-- never stored plaintext.
alter table vpn_servers
  add column if not exists panel_url text,
  add column if not exists panel_public_url text,
  add column if not exists panel_username text,
  add column if not exists panel_password_encrypted text,
  add column if not exists marzneshin_service_ids integer[] default '{}',
  add column if not exists marzneshin_vless_service_ids integer[] default '{}';

-- Per-customer protocol choice. Marzneshin subscription URLs include all
-- protocols, but this tracks the customer's preference for UI display.
alter table vpn_customers
  add column if not exists protocol_preference text not null default 'shadowsocks'
    check (protocol_preference in ('shadowsocks', 'vless', 'hysteria2'));

-- Which protocol a given key was issued on. For Marzneshin, access_url
-- is the subscription URL and key_credentials stores the username +
-- subscription_key.
alter table vpn_keys
  add column if not exists protocol text not null default 'shadowsocks'
    check (protocol in ('shadowsocks', 'vless', 'hysteria2')),
  add column if not exists key_credentials jsonb;

comment on column vpn_servers.panel_type is
  'Server management panel: marzneshin (Marzneshin panel, multi-protocol: SS + VLESS Reality + Hysteria2).';
comment on column vpn_servers.panel_public_url is
  'Public-facing HTTPS URL for the Marzneshin panel (e.g. https://panel.novanetmm.com). Used to build subscription URLs for customers. Falls back to panel_url if null.';
comment on column vpn_servers.marzneshin_service_ids is
  'Per-server Shadowsocks service IDs. Each server row has its own SS service containing only that node''s SS inbound. Used when protocol_preference = shadowsocks.';
comment on column vpn_servers.marzneshin_vless_service_ids is
  'Global VLESS service IDs (same value on every server row). One service containing VLESS inbounds from ALL nodes. Used when protocol_preference = vless — gives the customer access to all servers via one subscription link.';
comment on column vpn_customers.protocol_preference is
  'Customer''s preferred VPN protocol for display/defaults. Marzneshin subscription links include all protocols regardless.';
comment on column vpn_keys.protocol is
  'Protocol this key was issued on. For Marzneshin keys, access_url is the subscription URL (all protocols available via that URL).';
comment on column vpn_keys.key_credentials is
  'Marzneshin credential payload: { username, subscription_key, service_ids }. Used to manage the user on the panel API.';
