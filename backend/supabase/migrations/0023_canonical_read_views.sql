-- 0023_canonical_read_views.sql
--
-- Phase 3 of the Final Data Model (FINAL_DATA_MODEL.md §7): one canonical read
-- layer so the Mini App, Admin dashboard, and Reseller dashboard never derive
-- the same field three different ways (the root cause of the 2026-09 protocol
-- bug). Each derived field is computed ONCE here:
--
--   * protocol            — from the active key (authoritative), falling back to
--                           the customer's preference only when no key exists.
--   * total_paid / commission / platform_due — summed from order_payments (the
--                           money source of truth), using the exact same filter
--                           as summarizePayments(): review_status='confirmed'
--                           AND (apply_status is null or apply_status='applied').
--   * display_name        — one consistent alias over resellers.name /
--                           vpn_customers.full_name (Decision 3: standardize at
--                           the view layer; physical rename deferred).
--
-- Additive and non-breaking: these are new views; nothing is dropped. Access is
-- restricted to service_role (the only DB client) so PostgREST cannot expose
-- cross-tenant rows to the anon/authenticated keys.

begin;

-- ── order_view ──────────────────────────────────────────────────────────────
create or replace view order_view as
select
  o.id,
  o.customer_id,
  o.reseller_id,
  o.plan_id,
  o.status,
  o.price_mmk,
  o.commission_percent,
  o.start_date,
  o.expiry_date,
  o.payment_note,
  o.payment_status,
  o.activated_at,
  o.stopped_at,
  o.order_type,
  o.review_status,
  o.payment_screenshot_url,
  o.source,
  o.created_at,
  o.updated_at,

  -- Derived money (canonical). Replaces the cached vpn_orders.total_paid_mmk /
  -- commission_amount_mmk columns, which Batch B drops.
  money.total_paid_mmk,
  money.commission_amount_mmk,
  money.platform_due_mmk,

  -- Derived protocol (canonical): the active key's protocol is the ground truth;
  -- protocol_preference is only the intent for the NEXT provision.
  coalesce(ak.protocol, c.protocol_preference, 'shadowsocks') as protocol,

  -- Active key surface (so consumers resolve the live URL consistently).
  ak.id          as active_key_id,
  ak.access_url  as active_key_access_url,
  ak.protocol    as active_key_protocol,
  ak.server_id   as active_key_server_id,

  -- Consistent display names + fields the read paths need.
  c.full_name        as customer_display_name,
  c.ssconf_token     as customer_ssconf_token,
  c.protocol_preference as customer_protocol_preference,
  r.name             as reseller_display_name,
  p.name             as plan_name
from vpn_orders o
left join vpn_customers c on c.id = o.customer_id
left join resellers r     on r.id = o.reseller_id
left join vpn_plans p     on p.id = o.plan_id
left join lateral (
  select k.id, k.access_url, k.protocol, k.server_id
  from vpn_keys k
  where k.order_id = o.id and k.status = 'active' and k.deleted_at is null
  order by k.created_at desc
  limit 1
) ak on true
left join lateral (
  select
    coalesce(sum(op.amount_mmk)             filter (where op.review_status = 'confirmed' and (op.apply_status is null or op.apply_status = 'applied')), 0) as total_paid_mmk,
    coalesce(sum(op.commission_amount_mmk)  filter (where op.review_status = 'confirmed' and (op.apply_status is null or op.apply_status = 'applied')), 0) as commission_amount_mmk,
    coalesce(sum(op.platform_due_mmk)       filter (where op.review_status = 'confirmed' and (op.apply_status is null or op.apply_status = 'applied')), 0) as platform_due_mmk
  from order_payments op
  where op.order_id = o.id
) money on true;

-- ── customer_view ───────────────────────────────────────────────────────────
create or replace view customer_view as
select
  c.id,
  c.reseller_id,
  c.full_name        as display_name,
  c.telegram_username,
  c.phone,
  c.notes,
  c.status,
  c.customer_type,
  c.protocol_preference,
  c.ssconf_token,
  c.created_at,
  c.updated_at,
  r.name as reseller_display_name,
  -- The customer's current active purchase (if any).
  (
    select o.id from vpn_orders o
    where o.customer_id = c.id and o.status = 'active'
    order by o.created_at desc limit 1
  ) as active_order_id
from vpn_customers c
left join resellers r on r.id = c.reseller_id;

-- ── server_view ─────────────────────────────────────────────────────────────
create or replace view server_view as
select
  s.*,
  h.outline_api_status,
  h.last_checked_at,
  h.last_success_at,
  h.last_usage_sync_at,
  h.consecutive_failures as health_consecutive_failures,
  -- Live recount for cross-checking the trigger-maintained counter (0021).
  (
    select count(*) from vpn_keys k
    where k.server_id = s.id and k.status in ('active', 'pending')
  ) as live_active_key_count
from vpn_servers s
left join server_health_status h on h.server_id = s.id;

-- Least privilege (P5 / Decision 4): only the backend's service_role connection
-- reads these. They carry cross-tenant data, so keep them off the anon and
-- authenticated PostgREST roles.
revoke all on order_view    from anon, authenticated;
revoke all on customer_view from anon, authenticated;
revoke all on server_view   from anon, authenticated;
grant select on order_view    to service_role;
grant select on customer_view to service_role;
grant select on server_view   to service_role;

comment on view order_view is
  'Canonical order read model: derived protocol (from active key), derived money (summed from order_payments, confirmed+applied), consistent display_name. All 3 frontends read this instead of re-deriving. See FINAL_DATA_MODEL.md §7.';
comment on view customer_view is
  'Canonical customer read model with display_name alias and current active_order_id.';
comment on view server_view is
  'Canonical server read model: server + health + live_active_key_count cross-check for the trigger-maintained counter.';

commit;
