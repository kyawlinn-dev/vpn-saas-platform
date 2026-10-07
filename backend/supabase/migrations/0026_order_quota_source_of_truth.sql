-- Canonical package-period quota state.
--
-- vpn_keys keeps immutable lifetime usage across server/protocol switches.
-- usage_baseline_bytes lets a current package exclude usage accumulated by a
-- legacy in-place extension, while quota_limit_bytes snapshots this package's
-- allowance so later plan edits cannot change an active customer's quota.

alter table public.vpn_orders
  add column if not exists usage_baseline_bytes bigint not null default 0,
  add column if not exists quota_limit_bytes bigint;

alter table public.vpn_orders
  drop constraint if exists vpn_orders_usage_baseline_nonnegative,
  add constraint vpn_orders_usage_baseline_nonnegative
    check (usage_baseline_bytes >= 0) not valid,
  drop constraint if exists vpn_orders_quota_limit_nonnegative,
  add constraint vpn_orders_quota_limit_nonnegative
    check (quota_limit_bytes is null or quota_limit_bytes >= 0) not valid;

-- Snapshot finite plan allowances for existing orders. A NULL value continues
-- to represent an unlimited plan or an unavailable historical allowance.
update public.vpn_orders as orders
set quota_limit_bytes = floor(plans.data_limit_gb::numeric * 1073741824)::bigint
from public.vpn_plans as plans
where plans.id = orders.plan_id
  and orders.quota_limit_bytes is null
  and plans.data_limit_gb > 0
  -- Older in-place extensions combined multiple package periods on one order.
  -- Leave those orders on the legacy key-history fallback until an audited
  -- repair records the exact period baseline and allowance.
  and not (
    exists (
      select 1
      from public.order_payments as extension_payment
      where extension_payment.order_id = orders.id
        and extension_payment.payment_type = 'extend'
        and extension_payment.review_status = 'confirmed'
        and coalesce(extension_payment.apply_status, 'applied') = 'applied'
    )
    and exists (
      select 1
      from public.order_payments as original_payment
      where original_payment.order_id = orders.id
        and original_payment.payment_type <> 'extend'
        and original_payment.review_status = 'confirmed'
        and coalesce(original_payment.apply_status, 'applied') = 'applied'
    )
  );

create or replace function public.set_order_quota_limit_from_plan()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  plan_limit_gb numeric;
begin
  if new.quota_limit_bytes is not null then
    return new;
  end if;

  select data_limit_gb
    into plan_limit_gb
  from public.vpn_plans
  where id = new.plan_id;

  if plan_limit_gb > 0 then
    new.quota_limit_bytes := floor(plan_limit_gb * 1073741824)::bigint;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_set_order_quota_limit on public.vpn_orders;
create trigger trg_set_order_quota_limit
  before insert on public.vpn_orders
  for each row execute function public.set_order_quota_limit_from_plan();

comment on column public.vpn_orders.usage_baseline_bytes is
  'Lifetime key usage accumulated before the current package period; subtracted by the canonical quota calculator.';
comment on column public.vpn_orders.quota_limit_bytes is
  'Snapshotted data allowance for the current package period. NULL means unlimited or unavailable.';
