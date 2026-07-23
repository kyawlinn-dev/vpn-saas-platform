-- 0002_add_monthly_settlements.sql
-- Month-end platform settlement ledger for reseller accounting.

create table if not exists monthly_settlements (
  id                         uuid        primary key default gen_random_uuid(),
  reseller_id                uuid        not null references resellers(id),
  settlement_month           date        not null,
  status                     text        not null default 'draft',

  gross_paid_mmk             integer     not null default 0,
  reseller_commission_mmk    integer     not null default 0,
  platform_due_mmk           integer     not null default 0,
  pending_review_mmk         integer     not null default 0,
  unpaid_mmk                 integer     not null default 0,
  rejected_mmk               integer     not null default 0,

  confirmed_order_count      integer     not null default 0,
  pending_review_count       integer     not null default 0,
  unpaid_order_count         integer     not null default 0,
  rejected_order_count       integer     not null default 0,
  total_order_count          integer     not null default 0,

  transfer_note              text,
  transfer_reference         text,
  transfer_proof_url         text,
  submitted_at               timestamptz,
  confirmed_at               timestamptz,
  confirmed_by_admin_id      uuid        references admins(id),
  reopened_at                timestamptz,
  admin_note                 text,
  snapshot_basis             jsonb       not null default '{}',

  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),

  unique (reseller_id, settlement_month)
);

create index if not exists idx_monthly_settlements_month
  on monthly_settlements (settlement_month desc);

create index if not exists idx_monthly_settlements_status
  on monthly_settlements (status);

create index if not exists idx_monthly_settlements_reseller_month
  on monthly_settlements (reseller_id, settlement_month desc);
