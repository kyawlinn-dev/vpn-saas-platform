-- Customer notification ledger + reseller kill-switch.
--
-- Phase 1a of the bot v2 notifications work — customer-facing Telegram DMs
-- only. Reseller-facing events (dashboard bell feed + reseller DM) come in
-- Phase 1b/1c and add their own tables/columns later.
--
-- The unique constraint (customer_id, event_type, order_id) is the primary
-- dedup mechanism. Any second insert for the same event on the same order
-- fails silently at the service layer, so double-fires (parallel job runs,
-- race conditions) can't spam customers.

create table if not exists notifications_sent (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references vpn_customers(id) on delete cascade,
  event_type text not null,
  order_id uuid references vpn_orders(id) on delete set null,
  channel text not null default 'telegram',
  sent_at timestamptz not null default now(),

  constraint notifications_sent_unique unique (customer_id, event_type, order_id),
  constraint notifications_sent_event_type_check
    check (event_type in (
      'trial_ending_24h',
      'trial_expired',
      'subscription_expiring_3d',
      'subscription_expired',
      'payment_confirmed',
      'payment_rejected',
      'data_limit_reached',
      'data_limit_warning'
    )),
  constraint notifications_sent_channel_check
    check (channel in ('telegram'))
);

create index if not exists idx_notifications_sent_customer_sent
  on notifications_sent (customer_id, sent_at desc);

create index if not exists idx_notifications_sent_event_sent
  on notifications_sent (event_type, sent_at desc);

alter table notifications_sent enable row level security;

-- Reseller kill-switch. When true, no customer notifications are sent for
-- any customer belonging to this reseller. Reseller-facing alerts (added
-- later) are unaffected.
alter table resellers
  add column if not exists notifications_paused boolean not null default false;
