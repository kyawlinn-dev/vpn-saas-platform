-- Per-reseller customizable notification message text.
--
-- One row per (reseller_id, event_type) that a reseller has customized.
-- No row = use the platform default template (see
-- backend/src/bot/notificationTemplates.js DEFAULT_TEMPLATES). This keeps
-- the vast majority of resellers at zero extra rows.

create table if not exists reseller_notification_templates (
  id uuid primary key default gen_random_uuid(),
  reseller_id uuid not null references resellers(id) on delete cascade,
  event_type text not null,
  custom_text text not null,
  updated_at timestamptz not null default now(),

  constraint reseller_notification_templates_unique unique (reseller_id, event_type),
  constraint reseller_notification_templates_event_type_check
    check (event_type in (
      'trial_ending_24h',
      'trial_expired',
      'subscription_expiring_3d',
      'subscription_expired',
      'payment_confirmed',
      'payment_rejected',
      'data_limit_reached',
      'data_limit_warning'
    ))
);

create index if not exists idx_reseller_notification_templates_reseller
  on reseller_notification_templates (reseller_id);

alter table reseller_notification_templates enable row level security;
