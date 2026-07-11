-- seed.sql
-- NovaNet MM — demo seed data for a fresh project
--
-- Prerequisites (do these first in the Supabase Dashboard):
--   1. Authentication → Users → Add user:  admin@novanet.mm  (note the generated UUID → ADMIN_UUID)
--   2. Authentication → Users → Add user:  reseller@demo.mm  (note the generated UUID → RESELLER_UUID)
--   3. Replace ADMIN_UUID and RESELLER_UUID placeholders below before running.

-- ─────────────────────────────────────────────
-- Admin
-- ─────────────────────────────────────────────
insert into admins (supabase_user_id, full_name, email, status)
values
  ('ADMIN_UUID', 'NovaNet Admin', 'admin@novanet.mm', 'active');

-- ─────────────────────────────────────────────
-- Demo reseller
-- ─────────────────────────────────────────────
insert into resellers (id, supabase_user_id, name, email, commission_percent, status)
values
  ('11111111-0000-0000-0000-000000000001', 'RESELLER_UUID', 'Demo Reseller', 'reseller@demo.mm', 20, 'active');

insert into reseller_miniapps
  (reseller_id, miniapp_slug, brand_name, primary_color, trial_enabled, trial_data_limit_gb, trial_duration_days, is_enabled, payment_info)
values
  (
    '11111111-0000-0000-0000-000000000001',
    'demo',
    'Demo VPN',
    '#2f7bff',
    true,
    5,
    7,
    true,
    '[{"method":"KBZPay","account_name":"Demo Reseller","account_number":"09123456789"}]'
  );

-- ─────────────────────────────────────────────
-- VPN Servers
-- ─────────────────────────────────────────────
insert into vpn_servers
  (id, name, provider, region, region_code, status, is_default, max_active_keys, current_active_keys, display_country, display_city, flag_emoji, server_number, sort_order)
values
  (
    '22222222-0000-0000-0000-000000000001',
    'Singapore 1',
    'digitalocean', 'sgp1', 'SG',
    'active', true, 100, 0,
    'Singapore', 'Singapore', '🇸🇬', 1, 1
  ),
  (
    '22222222-0000-0000-0000-000000000002',
    'Amsterdam 1',
    'digitalocean', 'ams3', 'NL',
    'active', false, 100, 0,
    'Netherlands', 'Amsterdam', '🇳🇱', 2, 2
  );

-- ─────────────────────────────────────────────
-- VPN Plans
-- ─────────────────────────────────────────────
insert into vpn_plans
  (id, name, price_mmk, data_limit_gb, duration_days, max_devices, is_active, is_trial, features, sort_order)
values
  (
    '33333333-0000-0000-0000-000000000001',
    'Free Trial',
    0, 5, 7, 1,
    true, true,
    '["5 GB data","7 days","1 device"]',
    0
  ),
  (
    '33333333-0000-0000-0000-000000000002',
    'Basic',
    5000, 30, 30, 2,
    true, false,
    '["30 GB data","30 days","2 devices"]',
    1
  ),
  (
    '33333333-0000-0000-0000-000000000003',
    'Standard',
    9000, 100, 30, 3,
    true, false,
    '["100 GB data","30 days","3 devices"]',
    2
  ),
  (
    '33333333-0000-0000-0000-000000000004',
    'Unlimited',
    15000, 0, 30, 5,
    true, false,
    '["Unlimited data","30 days","5 devices"]',
    3
  );
