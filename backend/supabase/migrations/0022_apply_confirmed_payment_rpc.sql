-- 0022_apply_confirmed_payment_rpc.sql
--
-- Batch B (trimmed) of the Final Data Model: make the payment-confirm path
-- atomic. Today confirmOrderPayments() updates each pending payment (confirmed +
-- applied) and THEN calls syncOrderPaymentSummary() to rewrite the order's
-- cached totals — separate PostgREST calls. A crash between them leaves payments
-- confirmed but the order's cached total_paid/review_status stale.
--
-- apply_confirmed_payment() does both in ONE transaction:
--   1. Confirm + apply every pending payment on the order, recomputing each
--      payment's commission/platform snapshot from its own commission_percent
--      (matches calculatePaymentAmounts(): floor(amount * pct / 100)).
--   2. Recompute the order's cached summary using the EXACT summarizePayments()
--      filter: review_status='confirmed' AND (apply_status is null or 'applied').
--
-- Tenant-guarded and service_role-only. No money semantics change — it mirrors
-- the existing JS exactly, just atomically. The cached columns stay (Decision 1
-- drop is deferred); order_view remains the canonical derived read.

begin;

create or replace function apply_confirmed_payment(
  p_order_id             uuid,
  p_reseller_id          uuid,
  p_reviewer_reseller_id uuid,
  p_reviewer_admin_id    uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner     uuid;
  v_total     int;
  v_comm      int;
  v_pending   int;
  v_confirmed int;
  v_rejected  int;
  v_review    text;
begin
  -- Tenant guard (P2/P5): lock the order and confirm ownership.
  select reseller_id into v_owner from vpn_orders where id = p_order_id for update;
  if v_owner is null then
    raise exception 'order % not found', p_order_id using errcode = 'no_data_found';
  end if;
  if v_owner is distinct from p_reseller_id then
    raise exception 'order % does not belong to reseller %', p_order_id, p_reseller_id
      using errcode = 'check_violation';
  end if;

  -- 1. Confirm + apply all pending payments. Recompute snapshot amounts from the
  --    payment's own commission_percent (clamped 0..100), matching
  --    calculatePaymentAmounts().
  update order_payments
     set commission_amount_mmk = floor(amount_mmk * least(100, greatest(0, commission_percent)) / 100.0),
         platform_due_mmk      = greatest(0, amount_mmk - floor(amount_mmk * least(100, greatest(0, commission_percent)) / 100.0)),
         review_status = 'confirmed',
         apply_status  = 'applied',
         applied_at    = now(),
         apply_error   = null,
         reviewed_at   = now(),
         reviewed_by_reseller_id = p_reviewer_reseller_id,
         reviewed_by_admin_id    = p_reviewer_admin_id,
         updated_at    = now()
   where order_id = p_order_id
     and review_status = 'pending_review';

  -- 2. Recompute the order's cached summary (same filter as summarizePayments()).
  select
    coalesce(sum(amount_mmk)            filter (where review_status='confirmed' and (apply_status is null or apply_status='applied')), 0),
    coalesce(sum(commission_amount_mmk) filter (where review_status='confirmed' and (apply_status is null or apply_status='applied')), 0),
    count(*) filter (where review_status='pending_review'),
    count(*) filter (where review_status='confirmed' and (apply_status is null or apply_status='applied')),
    count(*) filter (where review_status='rejected')
  into v_total, v_comm, v_pending, v_confirmed, v_rejected
  from order_payments
  where order_id = p_order_id;

  if    v_pending   > 0 then v_review := 'pending_review';
  elsif v_confirmed > 0 then v_review := 'confirmed';
  elsif v_rejected  > 0 then v_review := 'rejected';
  else  v_review := null;
  end if;

  update vpn_orders
     set total_paid_mmk        = v_total,
         commission_amount_mmk = v_comm,
         payment_status        = case when v_total > 0 then 'paid' else 'unpaid' end,
         review_status         = coalesce(v_review, review_status),
         updated_at            = now()
   where id = p_order_id;
end $$;

comment on function apply_confirmed_payment(uuid,uuid,uuid,uuid) is
  'Atomically confirm+apply all pending order_payments for an order and recompute the order cached summary, in one transaction. Mirrors confirmOrderPayments()/summarizePayments() exactly. Tenant-guarded.';

revoke execute on function apply_confirmed_payment(uuid,uuid,uuid,uuid) from public;
grant  execute on function apply_confirmed_payment(uuid,uuid,uuid,uuid) to service_role;

commit;
