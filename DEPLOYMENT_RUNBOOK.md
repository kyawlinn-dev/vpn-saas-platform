# Deployment Runbook — Trial/Premium Server Separation + Backend Catch-Up Deploy

Working notes from a production readiness check on 2026-07-24. This is a
one-time runbook, not a standing doc like `DEPLOYMENT.md` — delete or archive
it once this deploy is done.

**Status: READY AFTER LOCAL VERIFICATION - do not run this against production
until the exact commit has passed local tests/builds and the production
migration preflight below is clean.**

Scope note: Mini App early renewal/top-up while a customer already has an
active package is intentionally deferred to the next update. Do not use that
deferred feature as a release blocker for this deployment.

## Why this deploy is needed

Production (`novanet-sg1`, 178.128.127.163) was last deployed **~2026-07-12**
and is running code from before several `main` commits, confirmed by diffing
deployed source against `main` via read-only SSH:

- Deployed `backend/src/bot/manager.js` has **zero** `secret_token`
  references — the webhook auth restore fix (commit `f68d483`) is on `main`
  but **not deployed**. Telegram webhook auth is effectively open right now.
- Deployed backend has **no `server_tier` column/code anywhere** — the
  trial/premium separation feature (commit `9a77c22`) has never been
  deployed.
- Rate limiting and the reworked reseller-workspace router ARE already
  present in the deployed code, so this is a partial/stale deploy, not "no
  deploy since day one."

## Current production state (read-only, verified 2026-07-24)

- Real production Supabase project (confirmed via the Droplet's own
  `/var/www/novanet/backend/.env`, NOT the same project as local dev): 3
  resellers, 48 customers, 64 orders, 102 keys total.
- Only 2 real VPN servers exist, both undifferentiated (no tier column yet):
  - **Outline SG 01** (178.128.85.40): 32 active keys — 20 trial, 12 purchase
  - **Outline India 01** (139.59.85.134): 4 active keys — all purchase
- A candidate trial-dedicated droplet already exists in DO
  (`sgp1-6607-trial`, 168.144.133.227, tagged `vpn-reseller`/`outline-server`,
  created 2026-07-22) but is **not registered** in `vpn_servers`, and its
  Outline-install status is unconfirmed.
- `SERVER_BOOTSTRAP_PRIVATE_KEY_PATH` in production's `.env` is a **Windows
  path** (`C:\Users\hp\.ssh\id_ed25519`) — breaks metrics-sync SSH to both
  real VPN servers (recurring `ENOENT` in PM2 logs).
- `/var/www/novanet/backend` and its files are world-writable (777) on the
  Droplet.
- One `vpn_customers` row has `reseller_id IS NULL` (pre-dates the tenancy
  constraint added in migration 0006).
- `ansible/group_vars/novanet/vault.yml` doesn't exist yet — only the
  `.example` template. Production secrets are hand-placed in a plain `.env`,
  not the documented `.env.production` flow.

## Ordered runbook

1. **Fill and encrypt the Ansible Vault** (do this yourself — see
   `ansible/scripts/build-vault.sh`, run from `ansible/`):
   ```bash
   bash scripts/build-vault.sh
   # review group_vars/novanet/vault.yml, fill in anything left blank
   ansible-vault encrypt group_vars/novanet/vault.yml
   ansible-playbook env.yml --ask-vault-pass
   ```
   This also fixes the `SERVER_BOOTSTRAP_PRIVATE_KEY_PATH` bug — the script
   writes the correct Linux path.

2. **Back up production Supabase before changing schema.**
   Use the Supabase dashboard backup/export flow or a `pg_dump` from a trusted
   machine. Record the backup timestamp in your release notes before continuing.

3. **Run the production migration preflight in Supabase SQL Editor.**
   If either query returns rows, stop and clean that data intentionally before
   applying migrations:
   ```sql
   -- 0006 will refuse to add the active-purchase uniqueness rule if this returns rows.
   select reseller_id, customer_id, count(*) as active_purchase_count
   from vpn_orders
   where status = 'active' and order_type = 'purchase'
   group by reseller_id, customer_id
   having count(*) > 1;

   -- 0006 will refuse to add the active-key uniqueness rule if this returns rows.
   select order_id, server_id, count(*) as active_key_count
   from vpn_keys
   where status = 'active' and deleted_at is null and server_id is not null
   group by order_id, server_id
   having count(*) > 1;
   ```

4. **Inventory the production schema before applying migrations.**
   Production was previously observed in a partial migration state:
   `vpn_customers.customer_type` existed while `vpn_servers.server_tier` did
   not. Do not assume migrations were applied in filename order.

   Run this first and record what already exists:
   ```sql
   select
     to_regclass('public.monthly_settlements') as monthly_settlements,
     to_regclass('public.order_payments') as order_payments;

   select table_name, column_name
   from information_schema.columns
   where table_schema = 'public'
     and (
       (table_name = 'vpn_servers' and column_name = 'server_tier')
       or (table_name = 'vpn_customers' and column_name = 'customer_type')
       or (table_name = 'order_payments' and column_name in (
         'payment_type',
         'apply_status',
         'plan_id',
         'package_duration_days',
         'package_data_limit_gb',
         'idempotency_key'
       ))
     )
   order by table_name, column_name;

   select conrelid::regclass as table_name, conname
   from pg_constraint
   where conname in (
     'vpn_customers_customer_type_check',
     'vpn_customers_reseller_required',
     'vpn_orders_reseller_required',
     'vpn_orders_status_check',
     'vpn_orders_type_check',
     'vpn_orders_review_status_check',
     'vpn_orders_money_nonnegative',
     'vpn_keys_tenant_required',
     'vpn_keys_status_check',
     'vpn_keys_usage_nonnegative',
     'order_payments_review_status_check',
     'order_payments_apply_status_check',
     'order_payments_type_check',
     'order_payments_money_check',
     'monthly_settlements_status_check',
     'vpn_orders_customer_tenant_fk',
     'vpn_keys_customer_tenant_fk',
     'vpn_keys_order_tenant_fk'
   )
   order by table_name, conname;

   select schemaname, tablename, indexname
   from pg_indexes
   where schemaname = 'public'
     and indexname in (
       'idx_vpn_customers_id_reseller',
       'idx_vpn_orders_id_reseller',
       'idx_vpn_orders_one_active_purchase',
       'idx_vpn_keys_one_active_order_server',
       'idx_vpn_servers_tier_status_region',
       'idx_order_payments_type_status',
       'idx_order_payments_plan',
       'idx_order_payments_reseller_idempotency'
     )
   order by tablename, indexname;
   ```

   Note: the known orphaned `vpn_customers.reseller_id IS NULL` row does not
   block migration `0006` because the tenant-required constraints are added as
   `NOT VALID`. Keep it as explicit cleanup after deploy.

5. **Apply only the missing Supabase migration pieces before backend deploy.**
   Use the inventory from step 4 instead of blindly replaying every file.
   Production must have the effects of these migrations before the new backend
   starts:
   ```text
   0002_add_monthly_settlements.sql
   0003_add_order_payments.sql
   0004_package_payment_events.sql
   0005_add_server_tier.sql
   0006_business_integrity_constraints.sql
   ```
   These migrations add the tables/columns the current backend expects,
   including `monthly_settlements`, `order_payments`, package payment event
   fields, `vpn_servers.server_tier`, and business integrity constraints.

   For `0002` through `0005`, the migrations are mostly idempotent. Apply any
   migration whose table/columns/indexes are missing.

   Treat `0006_business_integrity_constraints.sql` specially because
   production may already contain some of its changes. Do not rerun it
   wholesale if step 4 shows partial `0006` state. Instead, apply it
   statement-by-statement and skip constraints/indexes already listed by the
   inventory query. Its first `do $$ ... $$` preflight block is still safe and
   should run before adding the uniqueness indexes.

   Verify the final schema before continuing:
   ```sql
   select
     to_regclass('public.monthly_settlements') as monthly_settlements,
     to_regclass('public.order_payments') as order_payments;

   select column_name
   from information_schema.columns
   where table_schema = 'public'
     and (
       (table_name = 'vpn_servers' and column_name = 'server_tier')
       or (table_name = 'vpn_customers' and column_name = 'customer_type')
       or (table_name = 'order_payments' and column_name in (
         'payment_type',
         'apply_status',
         'plan_id',
         'package_duration_days',
         'package_data_limit_gb',
         'idempotency_key'
       ))
     )
   order by table_name, column_name;
   ```

   The currently deployed July-12 backend can keep running during this
   migration window. The new constraints are either `NOT VALID` or uniqueness
   rules that the old backend already attempted to enforce in application
   logic, so the important rule is "migrate first, then deploy backend," not
   "rush both at exactly the same second."

6. **Deploy current `main` to the Droplet**:
   ```bash
   cd ansible
   ansible-playbook deploy.yml
   ```
   This alone fixes the live webhook-auth gap (H-2) and brings the
   `server_tier` code online.

7. **Get a `server_tier='trial'` server active.** Open decision, not yet
   made:
   - (a) Use the admin dashboard's "Provision server" button with
     `server_tier=trial` — fully automated, but creates a **brand-new**
     droplet (the existing provision code has no path to adopt an existing
     one).
   - (b) Manually finish Outline setup on the existing `sgp1-6607-trial`
     droplet and hand-insert its `vpn_servers` row — no tested code path,
     more manual risk.
   Decide, then also decide what to do with whichever droplet ends up
   unused.

8. **Migrate the 20 existing active trial keys** off Outline SG 01 onto the
   trial server:
   ```bash
   cd backend
   node scripts/migrate-trial-keys-to-trial-server.mjs        # dry run first
   node scripts/migrate-trial-keys-to-trial-server.mjs --apply
   ```
   Reuses the app's existing `migrateActiveOrderToServer` service function.
   `ssconf_token` stays stable across the move — no customer notification
   needed. Only touches trial-order keys; the 16 paying customers are never
   moved.

9. **Fix file permissions** on `/var/www/novanet/backend` (currently 777).

10. **Resolve the orphaned `vpn_customers` row** with `reseller_id IS NULL` —
   assign it to a reseller or archive it.

## Verification after deploy

- Re-run the read-only checks from 2026-07-24: `grep secret_token` on
  deployed `manager.js` should now match; `vpn_servers.server_tier` should
  exist; no active trial-order key should remain on a `premium`-tagged
  server.
- Confirm a real Telegram bot webhook still round-trips after the deploy
  (PM2 restart resets bot manager state).
- Watch PM2 logs for the metrics-sync `ENOENT` errors to confirm they've
  stopped.
