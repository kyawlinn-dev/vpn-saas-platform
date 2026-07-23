-- 0003_add_order_payments.sql
-- Payment ledger for real business accounting. Each customer payment/recharge is
-- stored as its own reviewable row; vpn_orders keeps cached summary fields only.

create table if not exists order_payments (
  id                       uuid        primary key default gen_random_uuid(),
  order_id                 uuid        not null references vpn_orders(id),
  customer_id              uuid        not null references vpn_customers(id),
  reseller_id              uuid        not null references resellers(id),
  amount_mmk               integer     not null,
  commission_percent       numeric     not null,
  commission_amount_mmk    integer     not null default 0,
  platform_due_mmk         integer     not null default 0,
  payment_method           text,
  payment_note             text,
  payment_screenshot_url   text,
  review_status            text        not null default 'pending_review',
  source                   text,
  submitted_at             timestamptz not null default now(),
  reviewed_at              timestamptz,
  reviewed_by_reseller_id  uuid        references resellers(id),
  reviewed_by_admin_id     uuid        references admins(id),
  review_note              text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists idx_order_payments_reseller_created
  on order_payments (reseller_id, created_at desc);

create index if not exists idx_order_payments_order
  on order_payments (order_id);

create index if not exists idx_order_payments_review_status
  on order_payments (review_status);

create index if not exists idx_order_payments_customer
  on order_payments (customer_id);
