-- 0004_package_payment_events.sql
-- Turns order_payments into a package-payment event ledger. Each initial
-- purchase, top-up/extend, renew, or future upgrade is recorded separately.

alter table order_payments
  add column if not exists payment_type text not null default 'initial',
  add column if not exists apply_status text not null default 'applied',
  add column if not exists plan_id uuid references vpn_plans(id),
  add column if not exists package_duration_days integer,
  add column if not exists package_data_limit_gb numeric,
  add column if not exists applied_at timestamptz,
  add column if not exists apply_error text,
  add column if not exists idempotency_key text;

update order_payments
set
  payment_type = coalesce(nullif(payment_type, ''), 'initial'),
  apply_status = case
    when review_status = 'rejected' then 'reversed'
    when review_status = 'confirmed' then 'applied'
    else 'pending'
  end,
  applied_at = case
    when review_status = 'confirmed' then coalesce(applied_at, reviewed_at, updated_at, created_at)
    else applied_at
  end
where payment_type is null
   or payment_type = ''
   or apply_status is null
   or applied_at is null;

create index if not exists idx_order_payments_type_status
  on order_payments (payment_type, review_status, apply_status);

create index if not exists idx_order_payments_plan
  on order_payments (plan_id);

create unique index if not exists idx_order_payments_reseller_idempotency
  on order_payments (reseller_id, idempotency_key)
  where idempotency_key is not null;
