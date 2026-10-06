# Outline and Marzneshin Coexistence Release

This is a preparation runbook, not authorization to deploy. Existing Outline
access must remain valid while Marzneshin is introduced. Do not bulk-convert
active orders or rewrite their payment history.

## Gates Before Production SQL

1. Freeze a tested source revision, including migrations `0013` through `0025`.
2. Take and restore-test a production database backup. Back up Outline and
   Marzneshin panel configuration separately; database rollback cannot recreate
   deleted external VPN keys.
3. Rehearse the full migration sequence against a production-data copy. Verify
   migration objects individually because older production migrations were
   sometimes applied out of order.
4. Reconcile active order/key counts, server counters, quota snapshots,
   scheduled-order duplicates, and payment status before and after rehearsal.
5. Test both providers: create, usage sync, server switch, stop, expiry,
   trial, queued extension, client import, and `ssconf` retrieval.
6. Rotate the development Supabase service-role credential and panel password
   previously embedded in tracked scripts. Scan other tracked scripts and Git
   history for credentials; a working-tree edit does not revoke leaked values.

Read-only preflight queries for Supabase SQL Editor:

```sql
select status, order_type, count(*) from vpn_orders group by 1, 2 order by 1, 2;
select status, count(*) from vpn_keys group by 1 order by 1;
select s.id, s.name, s.current_active_keys, s.max_active_keys,
       count(k.id) filter (where k.status = 'active' and k.deleted_at is null) as actual_active_keys
from vpn_servers s left join vpn_keys k on k.server_id = s.id
group by s.id, s.name, s.current_active_keys, s.max_active_keys
order by s.name;
-- 0021 owns a different counter: active + pending, regardless of deleted_at.
-- Any mismatch or active/pending key with deleted_at set needs investigation.
select s.id, s.name, s.current_active_keys, s.max_active_keys,
       count(k.id) filter (where k.status in ('active', 'pending')) as trigger_count,
       count(k.id) filter (where k.status in ('active', 'pending')
                           and k.deleted_at is not null) as inconsistent_keys
from vpn_servers s left join vpn_keys k on k.server_id = s.id
group by s.id, s.name, s.current_active_keys, s.max_active_keys
order by s.name;
select reseller_id, customer_id, count(*) as scheduled_count
from vpn_orders where status = 'scheduled' and order_type = 'purchase'
group by reseller_id, customer_id having count(*) > 1;
```

The following checks distinguish an already-applied migration from a missing
one. Run them before any migration and again after rehearsal. Presence of one
column is not proof that the whole file ran; inspect constraints, indexes,
functions, views, and triggers too. These queries do not change data.

```sql
select table_name, column_name
from information_schema.columns
where table_schema = 'public' and (
  (table_name = 'vpn_servers' and column_name in
    ('panel_type', 'panel_url', 'marzneshin_vless_trial_service_ids')) or
  (table_name = 'vpn_customers' and column_name = 'protocol_preference') or
  (table_name = 'vpn_keys' and column_name in ('protocol', 'key_credentials')) or
  (table_name = 'reseller_miniapps' and column_name in
    ('trial_protocol', 'admin_telegram_user_id'))
)
order by table_name, column_name;

select to_regclass('public.platform_settings') as platform_settings,
       to_regclass('public.order_view') as order_view,
       to_regclass('public.customer_view') as customer_view,
       to_regclass('public.server_view') as server_view;

select conrelid::regclass::text as table_name, conname, convalidated
from pg_constraint
where connamespace = 'public'::regnamespace
  and conname in ('vpn_servers_panel_type_check', 'vpn_orders_status_check',
                  'vpn_keys_status_check', 'resellers_status_check',
                  'reseller_miniapps_trial_protocol_check')
order by table_name, conname;

select tablename, indexname
from pg_indexes
where schemaname = 'public'
  and indexname in ('idx_vpn_orders_scheduled_queue',
                    'idx_vpn_orders_one_scheduled_purchase')
order by tablename, indexname;

select p.proname as function_name
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('reserve_pending_key', 'activate_vpn_key',
                    'fail_pending_key', 'sync_server_active_keys',
                    'apply_confirmed_payment')
order by p.proname;

select tgname, tgenabled
from pg_trigger
where tgrelid = 'public.vpn_keys'::regclass and not tgisinternal
order by tgname;
```

Read-only production snapshot, 2026-10-06: 60 active orders and 60 active,
non-deleted keys; 52 purchases and 8 trials. All active keys still use Outline
`ss://` URLs. The four active servers' stored counters matched their active
key counts (17, 9, 9, 25). The trial-tier server held 17 paid and 8 trial
keys; paid customers' access to it is intentional and must be preserved.
`panel_type` and the new protocol columns were absent, while some earlier
migration objects were already present. This snapshot came from read-only API
checks, not a complete SQL catalog audit. Re-run all checks at release time.

The local `backups/prod-2026-09-09T09-24-34-713Z` folder is a dated JSON row
export, not a PostgreSQL dump: it cannot restore constraints, functions,
triggers, indexes, policies, or the current production rows. Do not use it as
the backup or staging source for this release. A fresh full backup and an
isolated staging database are prerequisites for the rehearsal. The development
Supabase project is in active use and must not be overwritten as staging.

## Migration And Backend Sequence

- Apply the current `0013` in order; it leaves existing rows as
  `panel_type='outline'`. Apply `0025` later in order as the correction for
  databases that previously ran the old `0013`. Verify provider identity
  before enabling the new backend. New Marzneshin rows must explicitly set
  `panel_type='marzneshin'`.
- Apply and verify the other pending additive migrations in file order.
  Do not assume `0024` can create its unique index until its duplicate check
  returns no rows.
- `0020`/`0021` change key reservation and counter ownership. Do not let old
  app-side counter writes overlap the `0021` trigger without a proven
  compatibility rollout. If the rehearsal cannot demonstrate this safely,
  stop here and postpone production deployment rather than risk live orders.
- The new hourly usage job audits counter drift without correcting the value;
  `0021` must be the sole writer. Investigate any drift alert before rollout.
- Reload the PostgREST schema after function/view migrations. Confirm all
  required RPCs and views exist before enabling the new backend.
- Deploy the dual-provider backend with Marzneshin new provisioning OFF in
  production. Existing Outline keys continue to use Outline for sync and stop.
- Add a separate Marzneshin server row for each new provisionable node; do
  not relabel a row carrying Outline keys. Test one named canary reseller via
  `VPN_MARZNESHIN_CANARY_RESELLER_IDS`. Expand only after the release gates pass.

## Release Gates And Rollback

- Existing Outline `ssconf` links still return usable configurations.
- Every active key exists on its recorded provider, with the correct cap.
- Active order/key counts and per-server counters match the baseline except
  for intentional new orders.
- Outline and Marzneshin usage sync both advance without errors.
- Trial VLESS is limited to the trial service. Paid VLESS access includes its
  configured eligible nodes, including a trial-tier node when intentionally
  allowed; do not remove paid users' existing trial-tier access.
- Mini App, reseller, and admin views agree on status, expiry, and usage.

On a failed canary, remove the reseller from the canary allowlist and keep
Outline serving existing access. Do not delete panel users or revert DB rows
blindly: reconcile external keys, orders, and payments first. A DB restore is
last-resort recovery and requires panel-state reconciliation.

Legacy in-place extensions (including Phyo Thida) are not transformed into
scheduled orders by these migrations. Preserve paid entitlements; queued
plans apply only to new extensions after the backend cutover.
