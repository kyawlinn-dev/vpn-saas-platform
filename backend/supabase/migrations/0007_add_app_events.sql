-- Application event ledger for business monitoring.
--
-- This table records backend-observed user and system events. It intentionally
-- stores only hashed/derived request context and safe metadata; secrets such as
-- Outline API URLs, access keys, Telegram init data, and screenshot URLs do not
-- belong here.

create table if not exists app_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  event_source text not null default 'backend',
  actor_type text,
  reseller_id uuid references resellers(id) on delete set null,
  customer_id uuid references vpn_customers(id) on delete set null,
  admin_id uuid references admins(id) on delete set null,
  telegram_user_id bigint,
  order_id uuid references vpn_orders(id) on delete set null,
  payment_id uuid references order_payments(id) on delete set null,
  server_id uuid references vpn_servers(id) on delete set null,
  plan_id uuid references vpn_plans(id) on delete set null,
  page text,
  route text,
  status text not null default 'info',
  metadata jsonb not null default '{}'::jsonb,
  session_id text,
  user_agent text,
  ip_hash text,
  created_at timestamptz not null default now(),

  constraint app_events_status_check
    check (status in ('info', 'success', 'blocked', 'failed'))
);

alter table app_events enable row level security;

create index if not exists idx_app_events_created_at
  on app_events (created_at desc);

create index if not exists idx_app_events_reseller_created
  on app_events (reseller_id, created_at desc);

create index if not exists idx_app_events_customer_created
  on app_events (customer_id, created_at desc);

create index if not exists idx_app_events_name_created
  on app_events (event_name, created_at desc);

create index if not exists idx_app_events_server_created
  on app_events (server_id, created_at desc)
  where server_id is not null;

create index if not exists idx_app_events_failed_recent
  on app_events (created_at desc)
  where status = 'failed';

comment on table app_events is
  'Backend-owned business event ledger for miniapp, reseller, admin, and server monitoring.';
