-- 0001_initial_schema.sql
-- NovaNet MM — full schema for a fresh Supabase project
-- Run in: Supabase Dashboard → SQL Editor, or via `supabase db push`
-- auth.users is provided by Supabase Auth — do not create it here

-- resellers
create table resellers (
  id                  uuid        primary key default gen_random_uuid(),
  name                text        not null,
  email               text,
  telegram_username   text,
  phone               text,
  commission_percent  numeric     not null,
  status              text        not null,   -- active | disabled
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  supabase_user_id    uuid        references auth.users(id)
);

-- admins
create table admins (
  id                uuid        primary key default gen_random_uuid(),
  supabase_user_id  uuid        not null references auth.users(id),
  full_name         text,
  email             text,
  status            text        not null,   -- active | disabled
  created_at        timestamptz not null default now()
);

-- vpn_servers
create table vpn_servers (
  id                    uuid        primary key default gen_random_uuid(),
  name                  text        not null,
  provider              text        not null,   -- digitalocean
  region                text        not null,
  region_code           text,
  droplet_id            bigint,
  host_ip               text,
  outline_api_url       text,
  outline_cert_sha256   text,
  status                text        not null,   -- active | provisioning | error | inactive
  is_active             boolean,
  is_default            boolean     not null,
  max_active_keys       integer     not null,
  current_active_keys   integer     not null,
  last_error            text,
  display_country       text,
  display_city          text,
  flag_emoji            text,
  server_number         integer,
  sort_order            integer     not null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz
);

-- vpn_plans
create table vpn_plans (
  id              uuid        primary key default gen_random_uuid(),
  name            text        not null,
  price_mmk       integer     not null,
  data_limit_gb   integer     not null,   -- 0 = unlimited
  duration_days   integer     not null,
  max_devices     integer     not null,
  is_active       boolean     not null,
  is_trial        boolean     not null,
  features        jsonb       not null default '{}',
  sort_order      integer     not null,
  allowed_regions text[],
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- vpn_customers
create table vpn_customers (
  id                  uuid        primary key default gen_random_uuid(),
  reseller_id         uuid        references resellers(id),
  full_name           text        not null,
  telegram_username   text,
  phone               text,
  notes               text,
  status              text        not null,   -- active | inactive
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  ssconf_token        text        unique
);

-- reseller_miniapps
create table reseller_miniapps (
  id                    uuid        primary key default gen_random_uuid(),
  reseller_id           uuid        not null unique references resellers(id),
  miniapp_slug          text        not null unique,
  bot_token_encrypted   text,
  bot_username          text,
  bot_id                bigint,
  bot_connected         boolean     not null default false,
  brand_name            text        not null,
  brand_logo_url        text,
  support_username      text,
  primary_color         text        not null default '#2f7bff',
  trial_enabled         boolean     not null default false,
  trial_data_limit_gb   integer     not null default 5,
  trial_duration_days   integer     not null default 7,
  is_enabled            boolean     not null default true,
  payment_info          jsonb       default '[]',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- vpn_orders
create table vpn_orders (
  id                      uuid        primary key default gen_random_uuid(),
  customer_id             uuid        not null references vpn_customers(id),
  reseller_id             uuid        references resellers(id),
  plan_id                 uuid        not null references vpn_plans(id),
  status                  text        not null,   -- pending | active | expired | stopped
  price_mmk               integer     not null,
  commission_percent      numeric     not null,
  commission_amount_mmk   integer     not null,
  total_paid_mmk          integer     not null,
  start_date              date,
  expiry_date             date,
  payment_status          text        not null,   -- unpaid | paid | overdue
  payment_note            text,
  payment_screenshot_url  text,
  activated_at            timestamptz,
  stopped_at              timestamptz,
  order_type              text,                   -- trial | purchase
  review_status           text,                   -- pending_review | confirmed | rejected
  source                  text,                   -- miniapp | dashboard
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- vpn_keys
create table vpn_keys (
  id               uuid        primary key default gen_random_uuid(),
  order_id         uuid        references vpn_orders(id),
  customer_id      uuid        references vpn_customers(id),
  reseller_id      uuid        references resellers(id),
  server_id        uuid        references vpn_servers(id),
  outline_key_id   text,
  key_name         text        not null,
  access_url       text,
  data_limit_bytes bigint,
  used_bytes       bigint      not null,
  status           text        not null,   -- active | deleted
  is_used          boolean,
  used_at          timestamptz,
  ssconf_token     text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

-- access_tokens  (legacy tok_xxx portal — keep until worker is retired)
create table access_tokens (
  id            uuid        primary key default gen_random_uuid(),
  customer_id   uuid        not null references vpn_customers(id),
  reseller_id   uuid        not null references resellers(id),
  order_id      uuid        references vpn_orders(id),
  token         text        not null,
  status        text        not null,   -- active | expired | revoked
  expires_at    timestamptz,
  last_used_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- token_server_assignments  (legacy tok_xxx portal)
create table token_server_assignments (
  id          uuid        primary key default gen_random_uuid(),
  token_id    uuid        not null references access_tokens(id),
  server_id   uuid        not null references vpn_servers(id),
  vpn_key_id  uuid        references vpn_keys(id),
  is_active   boolean     not null,
  created_at  timestamptz not null default now()
);

-- telegram_links
create table telegram_links (
  id                  uuid        primary key default gen_random_uuid(),
  telegram_user_id    bigint      not null,
  telegram_username   text,
  customer_id         uuid        not null references vpn_customers(id),
  reseller_id         uuid        not null references resellers(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  trial_used_at       timestamptz,
  trial_order_id      uuid        references vpn_orders(id),
  unique (reseller_id, telegram_user_id)
);

-- commission_ledger
create table commission_ledger (
  id            uuid        primary key default gen_random_uuid(),
  order_id      uuid        not null references vpn_orders(id),
  reseller_id   uuid        not null references resellers(id),
  amount_mmk    integer     not null,
  status        text        not null,   -- pending | paid
  created_at    timestamptz not null default now(),
  paid_at       timestamptz,
  updated_at    timestamptz not null default now()
);
