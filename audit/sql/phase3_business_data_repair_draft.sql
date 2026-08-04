-- Phase 3B: business data repair draft
-- Purpose: controlled repair for rows identified by phase3_business_data_audit.sql.
--
-- IMPORTANT:
-- - This file defaults to ROLLBACK.
-- - Do not run it until the audit output has been reviewed.
-- - Replace the values in target_* CTEs with confirmed row IDs only.
-- - After reviewing the returned result sets, change the final ROLLBACK to
--   COMMIT in a fresh SQL Editor run.

begin;

-- 01. Paid non-trial payment rows that accidentally recorded zero commission.
-- Add only confirmed payment IDs from audit section 03.
with target_payments(payment_id, expected_commission_percent) as (
  values
    -- Example:
    -- ('00000000-0000-0000-0000-000000000000'::uuid, 20::numeric)
    (null::uuid, null::numeric)
),
clean_targets as (
  select payment_id, expected_commission_percent
  from target_payments
  where payment_id is not null
    and expected_commission_percent is not null
),
updated_payments as (
  update order_payments op
  set
    commission_percent = ct.expected_commission_percent,
    commission_amount_mmk = floor(op.amount_mmk * ct.expected_commission_percent / 100),
    platform_due_mmk = op.amount_mmk - floor(op.amount_mmk * ct.expected_commission_percent / 100),
    updated_at = now()
  from clean_targets ct
  where op.id = ct.payment_id
    and op.review_status = 'confirmed'
    and op.apply_status = 'applied'
    and op.amount_mmk > 0
    and exists (
      select 1
      from vpn_orders o
      join vpn_plans p on p.id = coalesce(op.plan_id, o.plan_id)
      where o.id = op.order_id
        and coalesce(p.is_trial, false) = false
    )
  returning
    op.id,
    op.order_id,
    op.amount_mmk,
    op.commission_percent,
    op.commission_amount_mmk,
    op.platform_due_mmk
)
select * from updated_payments;

-- 02. Paid orders incorrectly left as trial after conversion.
-- Add only confirmed order IDs from audit section 04.
with target_orders(order_id, expected_commission_percent) as (
  values
    -- Example:
    -- ('00000000-0000-0000-0000-000000000000'::uuid, 20::numeric)
    (null::uuid, null::numeric)
),
clean_targets as (
  select order_id, expected_commission_percent
  from target_orders
  where order_id is not null
    and expected_commission_percent is not null
),
payment_totals as (
  select
    op.order_id,
    sum(op.amount_mmk) filter (
      where op.review_status = 'confirmed' and op.apply_status = 'applied'
    )::integer as confirmed_total_paid_mmk,
    sum(op.commission_amount_mmk) filter (
      where op.review_status = 'confirmed' and op.apply_status = 'applied'
    )::integer as confirmed_commission_mmk
  from order_payments op
  join clean_targets ct on ct.order_id = op.order_id
  group by op.order_id
),
updated_orders as (
  update vpn_orders o
  set
    order_type = 'purchase',
    payment_status = 'paid',
    review_status = 'confirmed',
    commission_percent = ct.expected_commission_percent,
    total_paid_mmk = coalesce(pt.confirmed_total_paid_mmk, o.total_paid_mmk, o.price_mmk, 0),
    commission_amount_mmk = coalesce(
      pt.confirmed_commission_mmk,
      floor(coalesce(o.total_paid_mmk, o.price_mmk, 0) * ct.expected_commission_percent / 100)
    ),
    stopped_at = null,
    updated_at = now()
  from clean_targets ct
  left join payment_totals pt on pt.order_id = ct.order_id
  where o.id = ct.order_id
    and o.order_type = 'trial'
    and exists (
      select 1
      from vpn_plans p
      where p.id = o.plan_id
        and coalesce(p.is_trial, false) = false
    )
  returning
    o.id,
    o.customer_id,
    o.reseller_id,
    o.order_type,
    o.payment_status,
    o.review_status,
    o.total_paid_mmk,
    o.commission_percent,
    o.commission_amount_mmk
)
select * from updated_orders;

-- 03. Sync order cached totals from payment ledger for confirmed/applied rows.
-- Add only order IDs from audit section 05 after checking that the payment
-- ledger values are the desired source of truth.
with target_orders(order_id) as (
  values
    -- Example:
    -- ('00000000-0000-0000-0000-000000000000'::uuid)
    (null::uuid)
),
clean_targets as (
  select order_id
  from target_orders
  where order_id is not null
),
payment_totals as (
  select
    op.order_id,
    coalesce(sum(op.amount_mmk) filter (
      where op.review_status = 'confirmed' and op.apply_status = 'applied'
    ), 0)::integer as total_paid_mmk,
    coalesce(sum(op.commission_amount_mmk) filter (
      where op.review_status = 'confirmed' and op.apply_status = 'applied'
    ), 0)::integer as commission_amount_mmk,
    count(*) filter (
      where op.review_status = 'confirmed' and op.apply_status = 'applied'
    ) as confirmed_payment_count
  from order_payments op
  join clean_targets ct on ct.order_id = op.order_id
  group by op.order_id
),
updated_orders as (
  update vpn_orders o
  set
    total_paid_mmk = pt.total_paid_mmk,
    commission_amount_mmk = pt.commission_amount_mmk,
    payment_status = case when pt.total_paid_mmk > 0 then 'paid' else 'unpaid' end,
    review_status = case when pt.confirmed_payment_count > 0 then 'confirmed' else o.review_status end,
    updated_at = now()
  from payment_totals pt
  where o.id = pt.order_id
  returning
    o.id,
    o.total_paid_mmk,
    o.commission_amount_mmk,
    o.payment_status,
    o.review_status
)
select * from updated_orders;

-- 04. Refresh unconfirmed monthly settlement snapshots from order_payments.
-- This intentionally skips confirmed settlements. Add only reseller/month pairs
-- from audit section 11 after reviewing the totals.
with target_settlements(reseller_id, settlement_month) as (
  values
    -- Example:
    -- ('00000000-0000-0000-0000-000000000000'::uuid, '2026-08-01'::date)
    (null::uuid, null::date)
),
clean_targets as (
  select reseller_id, settlement_month
  from target_settlements
  where reseller_id is not null
    and settlement_month is not null
),
recomputed as (
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
  join clean_targets ct
    on ct.reseller_id = op.reseller_id
   and ct.settlement_month = date_trunc('month', op.created_at at time zone 'Asia/Bangkok')::date
  group by op.reseller_id, date_trunc('month', op.created_at at time zone 'Asia/Bangkok')::date
),
updated_settlements as (
  update monthly_settlements ms
  set
    gross_paid_mmk = rc.gross_paid_mmk,
    reseller_commission_mmk = rc.reseller_commission_mmk,
    platform_due_mmk = rc.platform_due_mmk,
    pending_review_mmk = rc.pending_review_mmk,
    unpaid_mmk = 0,
    rejected_mmk = rc.rejected_mmk,
    confirmed_order_count = rc.confirmed_order_count,
    pending_review_count = rc.pending_review_count,
    unpaid_order_count = 0,
    rejected_order_count = rc.rejected_order_count,
    total_order_count = rc.total_order_count,
    snapshot_basis = jsonb_build_object(
      'period_field', 'order_payments.created_at',
      'included_orders', 'confirmed order_payments rows',
      'platform_due_formula', 'order_payments.platform_due_mmk = amount_mmk - commission_amount_mmk',
      'refreshed_by', 'phase3_business_data_repair_draft.sql',
      'refreshed_at', now()
    ),
    updated_at = now()
  from recomputed rc
  where ms.reseller_id = rc.reseller_id
    and ms.settlement_month = rc.settlement_month
    and ms.status <> 'confirmed'
  returning
    ms.id,
    ms.reseller_id,
    ms.settlement_month,
    ms.status,
    ms.gross_paid_mmk,
    ms.reseller_commission_mmk,
    ms.platform_due_mmk,
    ms.confirmed_order_count
)
select * from updated_settlements;

-- Safety default. Change to COMMIT only after reviewing the returned rows.
rollback;
