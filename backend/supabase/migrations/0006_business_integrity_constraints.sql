-- 0006_business_integrity_constraints.sql
-- Reproducible customer classification and database-enforced tenant/lifecycle invariants.

-- Fail before changing the schema if live data would violate the uniqueness
-- rules. Resolve the reported duplicates explicitly instead of deleting data
-- from a migration.
do $$
begin
  if exists (
    select 1
    from vpn_orders
    where status = 'active' and order_type = 'purchase'
    group by reseller_id, customer_id
    having count(*) > 1
  ) then
    raise exception 'Cannot enforce one active purchase: duplicate active purchase orders exist';
  end if;

  if exists (
    select 1
    from vpn_keys
    where status = 'active' and deleted_at is null and server_id is not null
    group by order_id, server_id
    having count(*) > 1
  ) then
    raise exception 'Cannot enforce one active key: duplicate order/server keys exist';
  end if;
end $$;

alter table vpn_customers
  add column if not exists customer_type text;

update vpn_customers
set customer_type = 'normal'
where customer_type is null;

update vpn_customers
set customer_type = 'telegram'
where id in (
  select distinct customer_id
  from telegram_links
  where customer_id is not null
);

alter table vpn_customers
  alter column customer_type set default 'normal',
  alter column customer_type set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'vpn_customers'::regclass
      and conname = 'vpn_customers_customer_type_check'
  ) then
    alter table vpn_customers
      add constraint vpn_customers_customer_type_check
      check (customer_type in ('normal', 'telegram')) not valid;
  end if;
end $$;

-- New writes must always carry tenant ownership. Existing legacy orphans remain
-- visible for explicit cleanup because these checks are intentionally NOT VALID.
alter table vpn_customers
  add constraint vpn_customers_reseller_required
  check (reseller_id is not null) not valid;

alter table vpn_orders
  add constraint vpn_orders_reseller_required
  check (reseller_id is not null) not valid,
  add constraint vpn_orders_status_check
  check (status in ('pending', 'active', 'expired', 'stopped')) not valid,
  add constraint vpn_orders_type_check
  check (order_type is not null and order_type in ('trial', 'purchase')) not valid,
  add constraint vpn_orders_review_status_check
  check (
    review_status is not null
    and review_status in ('pending_review', 'confirmed', 'rejected')
  ) not valid,
  add constraint vpn_orders_money_nonnegative
  check (
    price_mmk >= 0 and total_paid_mmk >= 0 and commission_amount_mmk >= 0
    and commission_percent >= 0 and commission_percent <= 100
  ) not valid;

alter table vpn_keys
  add constraint vpn_keys_tenant_required
  check (reseller_id is not null and customer_id is not null and order_id is not null) not valid,
  add constraint vpn_keys_status_check
  check (status in ('active', 'deleted')) not valid,
  add constraint vpn_keys_usage_nonnegative
  check (used_bytes >= 0 and (data_limit_bytes is null or data_limit_bytes >= 0)) not valid;

alter table order_payments
  add constraint order_payments_review_status_check
  check (review_status in ('pending_review', 'confirmed', 'rejected')) not valid,
  add constraint order_payments_apply_status_check
  check (apply_status in ('pending', 'applied', 'failed', 'reversed')) not valid,
  add constraint order_payments_type_check
  check (payment_type in ('initial', 'extend', 'renew', 'adjustment')) not valid,
  add constraint order_payments_money_check
  check (
    amount_mmk >= 0 and commission_amount_mmk >= 0 and platform_due_mmk >= 0
    and commission_percent >= 0 and commission_percent <= 100
    and amount_mmk = commission_amount_mmk + platform_due_mmk
  ) not valid;

alter table monthly_settlements
  add constraint monthly_settlements_status_check
  check (status in ('draft', 'submitted', 'confirmed', 'reopened')) not valid;

-- Composite keys let the database reject cross-tenant relationships even when
-- the backend is using Supabase's service role.
create unique index if not exists idx_vpn_customers_id_reseller
  on vpn_customers (id, reseller_id);

create unique index if not exists idx_vpn_orders_id_reseller
  on vpn_orders (id, reseller_id);

alter table vpn_orders
  add constraint vpn_orders_customer_tenant_fk
  foreign key (customer_id, reseller_id)
  references vpn_customers (id, reseller_id) not valid;

alter table vpn_keys
  add constraint vpn_keys_customer_tenant_fk
  foreign key (customer_id, reseller_id)
  references vpn_customers (id, reseller_id) not valid,
  add constraint vpn_keys_order_tenant_fk
  foreign key (order_id, reseller_id)
  references vpn_orders (id, reseller_id) not valid;

-- These indexes close the application-level check-then-write race windows.
create unique index if not exists idx_vpn_orders_one_active_purchase
  on vpn_orders (reseller_id, customer_id)
  where status = 'active' and order_type = 'purchase';

create unique index if not exists idx_vpn_keys_one_active_order_server
  on vpn_keys (order_id, server_id)
  where status = 'active' and deleted_at is null and server_id is not null;
