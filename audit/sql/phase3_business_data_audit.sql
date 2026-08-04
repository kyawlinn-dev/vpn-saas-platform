-- Phase 3A: production business data audit
-- Purpose: read-only checks before repairing legacy rows after the package-ledger migration.
--
-- Run in Supabase SQL Editor against the intended project. If the editor only
-- shows one result set clearly, highlight and run one numbered section at a
-- time.
-- This file only SELECTs data. It does not change customer, order, key, payment,
-- or settlement rows.

begin transaction read only;

-- 01. Environment marker. Confirm this is the expected Supabase project before
-- reading or copying any result set.
select
  current_database() as database_name,
  current_user as sql_role,
  now() as checked_at;

-- 02. Active reseller commission table. These percentages are the fallback
-- expected commission for paid non-trial package events that were created with
-- zero commission by the old trial-to-paid bug.
select
  id as reseller_id,
  name as reseller_name,
  email,
  status,
  commission_percent
from resellers
order by name;

-- 03. Paid non-trial payment events with suspicious zero commission.
-- Expected candidates include AK Midas-style rows: paid package event, linked
-- to a non-trial plan, but commission was snapshotted as 0.
select
  op.id as payment_id,
  op.order_id,
  op.created_at,
  op.payment_type,
  op.source as payment_source,
  op.amount_mmk,
  op.commission_percent as recorded_commission_percent,
  op.commission_amount_mmk as recorded_commission_mmk,
  op.platform_due_mmk as recorded_platform_due_mmk,
  r.id as reseller_id,
  r.name as reseller_name,
  r.commission_percent as reseller_commission_percent,
  floor(op.amount_mmk * r.commission_percent / 100) as expected_commission_mmk,
  op.amount_mmk - floor(op.amount_mmk * r.commission_percent / 100) as expected_platform_due_mmk,
  c.id as customer_id,
  c.full_name as customer_name,
  c.telegram_username,
  c.customer_type,
  p.id as plan_id,
  p.name as plan_name,
  p.duration_days,
  p.price_mmk as current_plan_price_mmk,
  p.is_trial,
  o.order_type,
  o.status as order_status,
  o.payment_status,
  o.review_status as order_review_status
from order_payments op
join vpn_orders o on o.id = op.order_id
join vpn_customers c on c.id = op.customer_id
join resellers r on r.id = op.reseller_id
left join vpn_plans p on p.id = coalesce(op.plan_id, o.plan_id)
where op.review_status = 'confirmed'
  and op.apply_status = 'applied'
  and op.amount_mmk > 0
  and coalesce(p.is_trial, false) = false
  and coalesce(op.commission_percent, 0) = 0
  and coalesce(r.commission_percent, 0) > 0
order by op.created_at desc;

-- 04. Orders that look paid but are still classified as trial.
-- These are the most likely rows needing order_type='purchase' after a paid
-- renew/extend/admin conversion.
select
  o.id as order_id,
  o.created_at,
  o.updated_at,
  o.status,
  o.order_type,
  o.source,
  o.payment_status,
  o.review_status,
  o.price_mmk,
  o.total_paid_mmk,
  o.commission_percent as order_commission_percent,
  o.commission_amount_mmk as order_commission_mmk,
  r.id as reseller_id,
  r.name as reseller_name,
  r.commission_percent as reseller_commission_percent,
  c.id as customer_id,
  c.full_name as customer_name,
  c.telegram_username,
  c.customer_type,
  p.id as plan_id,
  p.name as plan_name,
  p.duration_days,
  p.price_mmk as current_plan_price_mmk,
  p.is_trial,
  count(op.id) filter (
    where op.review_status = 'confirmed'
      and op.apply_status = 'applied'
      and op.amount_mmk > 0
  ) as confirmed_paid_payment_count,
  coalesce(sum(op.amount_mmk) filter (
    where op.review_status = 'confirmed'
      and op.apply_status = 'applied'
      and op.amount_mmk > 0
  ), 0) as confirmed_paid_mmk
from vpn_orders o
join vpn_customers c on c.id = o.customer_id
join resellers r on r.id = o.reseller_id
left join vpn_plans p on p.id = o.plan_id
left join order_payments op on op.order_id = o.id
where o.order_type = 'trial'
group by o.id, r.id, c.id, p.id
having coalesce(sum(op.amount_mmk) filter (
    where op.review_status = 'confirmed'
      and op.apply_status = 'applied'
      and op.amount_mmk > 0
  ), 0) > 0
  or (
    coalesce(p.is_trial, false) = false
    and coalesce(o.total_paid_mmk, 0) > 0
  )
order by o.updated_at desc;

-- 05. Order cached payment totals that disagree with order_payments.
-- Dashboard cards should be ledger-based now, but order cache drift can still
-- confuse detail pages and operators.
with payment_totals as (
  select
    order_id,
    coalesce(sum(amount_mmk) filter (
      where review_status = 'confirmed' and apply_status = 'applied'
    ), 0) as ledger_total_paid_mmk,
    coalesce(sum(commission_amount_mmk) filter (
      where review_status = 'confirmed' and apply_status = 'applied'
    ), 0) as ledger_commission_mmk,
    count(*) filter (
      where review_status = 'confirmed' and apply_status = 'applied'
    ) as confirmed_payment_count
  from order_payments
  group by order_id
)
select
  o.id as order_id,
  o.created_at,
  o.status,
  o.order_type,
  o.payment_status,
  o.review_status,
  o.price_mmk,
  o.total_paid_mmk as order_total_paid_mmk,
  pt.ledger_total_paid_mmk,
  o.commission_amount_mmk as order_commission_mmk,
  pt.ledger_commission_mmk,
  pt.confirmed_payment_count,
  r.name as reseller_name,
  c.full_name as customer_name,
  p.name as plan_name
from vpn_orders o
join payment_totals pt on pt.order_id = o.id
join resellers r on r.id = o.reseller_id
join vpn_customers c on c.id = o.customer_id
left join vpn_plans p on p.id = o.plan_id
where coalesce(o.total_paid_mmk, 0) <> pt.ledger_total_paid_mmk
   or coalesce(o.commission_amount_mmk, 0) <> pt.ledger_commission_mmk
order by o.updated_at desc;

-- 06. Confirmed paid orders that have no order_payments rows.
-- These are legacy rows. They may be acceptable if the admin analytics fallback
-- intentionally keeps them as legacy, but they cannot participate in package
-- event accounting unless backfilled.
select
  o.id as order_id,
  o.created_at,
  o.status,
  o.order_type,
  o.source,
  o.price_mmk,
  o.total_paid_mmk,
  o.commission_percent,
  o.commission_amount_mmk,
  r.name as reseller_name,
  c.full_name as customer_name,
  p.name as plan_name,
  p.duration_days,
  p.is_trial
from vpn_orders o
join resellers r on r.id = o.reseller_id
join vpn_customers c on c.id = o.customer_id
left join vpn_plans p on p.id = o.plan_id
left join order_payments op on op.order_id = o.id
where o.payment_status = 'paid'
  and coalesce(o.review_status, 'confirmed') = 'confirmed'
  and coalesce(o.order_type, 'purchase') <> 'trial'
  and coalesce(o.total_paid_mmk, o.price_mmk, 0) > 0
  and op.id is null
order by o.created_at desc;

-- 07. Active keys whose server tier does not match the order package type.
-- Trial orders should use trial servers. Paid purchase orders should use
-- premium servers.
select
  k.id as key_id,
  k.order_id,
  k.customer_id,
  k.server_id,
  k.outline_key_id,
  k.status as key_status,
  k.deleted_at,
  o.status as order_status,
  o.order_type,
  p.name as plan_name,
  p.is_trial,
  s.name as server_name,
  s.region,
  s.server_tier,
  case
    when coalesce(p.is_trial, false) = true or o.order_type = 'trial' then 'trial'
    else 'premium'
  end as expected_server_tier,
  r.name as reseller_name,
  c.full_name as customer_name
from vpn_keys k
join vpn_orders o on o.id = k.order_id
join vpn_customers c on c.id = k.customer_id
join resellers r on r.id = k.reseller_id
left join vpn_plans p on p.id = o.plan_id
left join vpn_servers s on s.id = k.server_id
where k.status = 'active'
  and k.deleted_at is null
  and k.server_id is not null
  and coalesce(s.server_tier, 'premium') <> case
    when coalesce(p.is_trial, false) = true or o.order_type = 'trial' then 'trial'
    else 'premium'
  end
order by r.name, c.full_name;

-- 08. Active order/key count mismatches by reseller.
-- One active order can have more than one key only if old/orphaned keys were not
-- cleaned after server moves.
with active_orders as (
  select reseller_id, count(*) as active_order_count
  from vpn_orders
  where status = 'active'
  group by reseller_id
),
active_keys as (
  select reseller_id, count(*) as active_key_count
  from vpn_keys
  where status = 'active' and deleted_at is null
  group by reseller_id
)
select
  r.id as reseller_id,
  r.name as reseller_name,
  coalesce(ao.active_order_count, 0) as active_orders,
  coalesce(ak.active_key_count, 0) as active_keys,
  coalesce(ak.active_key_count, 0) - coalesce(ao.active_order_count, 0) as key_delta
from resellers r
left join active_orders ao on ao.reseller_id = r.id
left join active_keys ak on ak.reseller_id = r.id
where coalesce(ao.active_order_count, 0) <> coalesce(ak.active_key_count, 0)
order by abs(coalesce(ak.active_key_count, 0) - coalesce(ao.active_order_count, 0)) desc;

-- 09. Active duplicate keys for the same order/server. Migration 0006 should
-- prevent this for new writes; any result here is legacy drift.
select
  k.order_id,
  k.server_id,
  count(*) as active_key_count,
  array_agg(k.id order by k.created_at) as key_ids,
  max(c.full_name) as customer_name,
  max(r.name) as reseller_name,
  max(s.name) as server_name
from vpn_keys k
join vpn_orders o on o.id = k.order_id
join vpn_customers c on c.id = k.customer_id
join resellers r on r.id = k.reseller_id
left join vpn_servers s on s.id = k.server_id
where k.status = 'active'
  and k.deleted_at is null
  and k.server_id is not null
group by k.order_id, k.server_id
having count(*) > 1
order by active_key_count desc;

-- 10. Recomputed monthly settlement totals from order_payments by Bangkok
-- business month. Compare this with monthly_settlements in the next query.
with payment_months as (
  select
    op.reseller_id,
    date_trunc('month', op.created_at at time zone 'Asia/Bangkok')::date as settlement_month,
    sum(op.amount_mmk) filter (
      where op.review_status = 'confirmed' and op.apply_status = 'applied'
    ) as gross_paid_mmk,
    sum(op.commission_amount_mmk) filter (
      where op.review_status = 'confirmed' and op.apply_status = 'applied'
    ) as reseller_commission_mmk,
    sum(op.platform_due_mmk) filter (
      where op.review_status = 'confirmed' and op.apply_status = 'applied'
    ) as platform_due_mmk,
    sum(op.amount_mmk) filter (where op.review_status = 'pending_review') as pending_review_mmk,
    sum(op.amount_mmk) filter (where op.review_status = 'rejected') as rejected_mmk,
    count(*) filter (
      where op.review_status = 'confirmed' and op.apply_status = 'applied'
    ) as confirmed_order_count,
    count(*) filter (where op.review_status = 'pending_review') as pending_review_count,
    count(*) filter (where op.review_status = 'rejected') as rejected_order_count,
    count(*) as payment_row_count
  from order_payments op
  group by op.reseller_id, date_trunc('month', op.created_at at time zone 'Asia/Bangkok')::date
)
select
  r.name as reseller_name,
  pm.reseller_id,
  pm.settlement_month,
  coalesce(pm.gross_paid_mmk, 0) as gross_paid_mmk,
  coalesce(pm.reseller_commission_mmk, 0) as reseller_commission_mmk,
  coalesce(pm.platform_due_mmk, 0) as platform_due_mmk,
  coalesce(pm.pending_review_mmk, 0) as pending_review_mmk,
  coalesce(pm.rejected_mmk, 0) as rejected_mmk,
  pm.confirmed_order_count,
  pm.pending_review_count,
  pm.rejected_order_count,
  pm.payment_row_count
from payment_months pm
join resellers r on r.id = pm.reseller_id
order by pm.settlement_month desc, r.name;

-- 11. Saved monthly settlement snapshots that differ from recomputed ledger
-- totals. These are stale snapshot candidates.
with recomputed as (
  select
    op.reseller_id,
    date_trunc('month', op.created_at at time zone 'Asia/Bangkok')::date as settlement_month,
    coalesce(sum(op.amount_mmk) filter (
      where op.review_status = 'confirmed' and op.apply_status = 'applied'
    ), 0)::integer as gross_paid_mmk,
    coalesce(sum(op.commission_amount_mmk) filter (
      where op.review_status = 'confirmed' and op.apply_status = 'applied'
    ), 0)::integer as reseller_commission_mmk,
    coalesce(sum(op.platform_due_mmk) filter (
      where op.review_status = 'confirmed' and op.apply_status = 'applied'
    ), 0)::integer as platform_due_mmk,
    coalesce(sum(op.amount_mmk) filter (where op.review_status = 'pending_review'), 0)::integer as pending_review_mmk,
    coalesce(sum(op.amount_mmk) filter (where op.review_status = 'rejected'), 0)::integer as rejected_mmk,
    count(*) filter (
      where op.review_status = 'confirmed' and op.apply_status = 'applied'
    )::integer as confirmed_order_count,
    count(*) filter (where op.review_status = 'pending_review')::integer as pending_review_count,
    count(*) filter (where op.review_status = 'rejected')::integer as rejected_order_count,
    count(distinct op.order_id)::integer as total_order_count
  from order_payments op
  group by op.reseller_id, date_trunc('month', op.created_at at time zone 'Asia/Bangkok')::date
)
select
  r.name as reseller_name,
  ms.reseller_id,
  ms.settlement_month,
  ms.status,
  ms.gross_paid_mmk as saved_gross_paid_mmk,
  rc.gross_paid_mmk as recomputed_gross_paid_mmk,
  ms.reseller_commission_mmk as saved_commission_mmk,
  rc.reseller_commission_mmk as recomputed_commission_mmk,
  ms.platform_due_mmk as saved_platform_due_mmk,
  rc.platform_due_mmk as recomputed_platform_due_mmk,
  ms.confirmed_order_count as saved_confirmed_count,
  rc.confirmed_order_count as recomputed_confirmed_count,
  ms.updated_at as settlement_updated_at
from monthly_settlements ms
join resellers r on r.id = ms.reseller_id
left join recomputed rc
  on rc.reseller_id = ms.reseller_id
 and rc.settlement_month = ms.settlement_month
where coalesce(ms.gross_paid_mmk, 0) <> coalesce(rc.gross_paid_mmk, 0)
   or coalesce(ms.reseller_commission_mmk, 0) <> coalesce(rc.reseller_commission_mmk, 0)
   or coalesce(ms.platform_due_mmk, 0) <> coalesce(rc.platform_due_mmk, 0)
   or coalesce(ms.confirmed_order_count, 0) <> coalesce(rc.confirmed_order_count, 0)
order by ms.settlement_month desc, r.name;

commit;
