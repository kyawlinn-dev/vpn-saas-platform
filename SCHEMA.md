# NovaNet MM — Database Schema Reference

**Source:** Live Supabase project (`huqmzvlzfcexycdrsxpn`), queried via PostgREST OpenAPI spec.  
**Last updated:** 2026-08-10

> **NOT NULL semantics:** The `Required` column below means the column is `NOT NULL` in Postgres.  
> Many required columns have server-side defaults (UUIDs, timestamps, booleans) — they don't need to be  
> supplied in INSERTs. Columns marked `NOT NULL · no default` **must** be supplied explicitly.

---

## Tables

- [access\_tokens](#access_tokens)
- [admins](#admins)
- [app\_events](#app_events)
- [commission\_ledger](#commission_ledger)
- [monthly\_settlements](#monthly_settlements)
- [order\_payments](#order_payments)
- [reseller\_miniapps](#reseller_miniapps)
- [resellers](#resellers)
- [server\_health\_status](#server_health_status)
- [system\_job\_runs](#system_job_runs)
- [telegram\_links](#telegram_links)
- [token\_server\_assignments](#token_server_assignments)
- [vpn\_customers](#vpn_customers)
- [vpn\_keys](#vpn_keys)
- [vpn\_orders](#vpn_orders)
- [vpn\_plans](#vpn_plans)
- [vpn\_servers](#vpn_servers)

---

## access_tokens

Legacy token-based portal. Generated when a reseller activates an order and sends a `tok_xxx` URL to the customer.

| Column | Type | NOT NULL | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | ✓ | gen_random_uuid() | PK |
| `customer_id` | uuid | ✓ | — | FK → vpn_customers.id |
| `reseller_id` | uuid | ✓ | — | FK → resellers.id |
| `order_id` | uuid | | — | FK → vpn_orders.id |
| `token` | text | ✓ | — | `tok_xxx` access token |
| `status` | text | ✓ | — | `active` \| `expired` \| `revoked` |
| `expires_at` | timestamptz | | — | |
| `last_used_at` | timestamptz | | — | |
| `created_at` | timestamptz | ✓ | now() | |
| `updated_at` | timestamptz | ✓ | now() | |

---

## admins

Super-admin accounts. Login via Supabase email+password auth; backend checks this table before issuing admin cookies.

| Column | Type | NOT NULL | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | ✓ | gen_random_uuid() | PK |
| `supabase_user_id` | uuid | ✓ | — | FK → auth.users.id |
| `full_name` | text | | — | Display name (NOT `name`) |
| `email` | text | | — | |
| `status` | text | ✓ | — | `active` \| `disabled` |
| `created_at` | timestamptz | ✓ | now() | |

> **Column trap:** this table uses `full_name`, not `name`. See also `vpn_customers.full_name`.

---

## app_events

Backend-owned business event ledger for monitoring Mini App usage, checkout
flow, server selection, and provisioning health. Frontends never write this
table directly; backend service-role code records safe events only.

| Column | Type | NOT NULL | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | ✓ | gen_random_uuid() | PK |
| `event_name` | text | ✓ | — | e.g. `miniapp_config_loaded`, `miniapp_authenticated`, `server_selected`, `key_provisioned` |
| `event_source` | text | ✓ | `'backend'` | `backend`, `miniapp`, `bot`, `admin`, `reseller` |
| `actor_type` | text | | — | `customer`, `reseller`, `admin`, `system`, `anonymous` |
| `reseller_id` | uuid | | — | FK → resellers.id |
| `customer_id` | uuid | | — | FK → vpn_customers.id |
| `admin_id` | uuid | | — | FK → admins.id |
| `telegram_user_id` | bigint | | — | Safe Telegram numeric ID, no init data |
| `order_id` | uuid | | — | FK → vpn_orders.id |
| `payment_id` | uuid | | — | FK → order_payments.id |
| `server_id` | uuid | | — | FK → vpn_servers.id |
| `plan_id` | uuid | | — | FK → vpn_plans.id |
| `page` | text | | — | Logical app page |
| `route` | text | | — | Backend route path without query string |
| `status` | text | ✓ | `'info'` | `info` \| `success` \| `blocked` \| `failed` |
| `metadata` | jsonb | ✓ | `'{}'` | Safe allowlisted metadata only |
| `session_id` | text | | — | Optional anonymous session correlation |
| `user_agent` | text | | — | Request user agent |
| `ip_hash` | text | | — | Salted hash, never raw IP |
| `created_at` | timestamptz | ✓ | now() | |

> **Privacy rule:** never store Outline API URLs, Outline access URLs, Telegram
> init data, bot tokens, payment screenshot paths, or other secrets in
> `app_events.metadata`.

Monitoring query indexes:

- `idx_app_events_created_at` on `created_at desc`
- `idx_app_events_reseller_created` on `(reseller_id, created_at desc)`
- `idx_app_events_customer_created` on `(customer_id, created_at desc)`
- `idx_app_events_name_created` on `(event_name, created_at desc)`
- `idx_app_events_server_created` on `(server_id, created_at desc)` where `server_id is not null`
- `idx_app_events_failed_recent` on `created_at desc` where `status = 'failed'`
- `idx_app_events_session_created` on `(session_id, created_at desc)` where `session_id is not null`
- `idx_app_events_status_created` on `(status, created_at desc)`
- `idx_app_events_telegram_created` on `(telegram_user_id, created_at desc)` where `telegram_user_id is not null`

Admin monitoring uses service-role-only RPC helpers:

- `admin_monitoring_summary`
- `admin_monitoring_funnel`
- `admin_monitoring_daily`
- `admin_monitoring_server_events`

---

## server_health_status

Compact operational health state for Outline servers. Backend service-role code
updates this table from usage sync and periodic Outline API health checks.

| Column | Type | NOT NULL | Default | Notes |
|--------|------|----------|---------|-------|
| `server_id` | uuid | ✓ | — | PK, FK → vpn_servers.id |
| `outline_api_status` | text | ✓ | `'unknown'` | `unknown` \| `healthy` \| `degraded` \| `failed` \| `stale` |
| `last_checked_at` | timestamptz | | — | Last Outline API health check attempt |
| `last_success_at` | timestamptz | | — | Last successful Outline API health check |
| `last_usage_sync_at` | timestamptz | | — | Last successful usage sync for this server |
| `last_error` | text | | — | Sanitized operational error only |
| `response_ms` | integer | | — | Outline API health check duration |
| `active_key_count_seen` | integer | | — | Key count observed from Outline API |
| `consecutive_failures` | integer | ✓ | `0` | |
| `updated_at` | timestamptz | ✓ | now() | |

Indexes:

- `idx_server_health_status_status` on `(outline_api_status, updated_at desc)`
- `idx_server_health_status_usage_sync` on `(last_usage_sync_at desc)`

---

## system_job_runs

Compact operational health state for backend jobs such as usage sync and
Outline health checks.

| Column | Type | NOT NULL | Default | Notes |
|--------|------|----------|---------|-------|
| `job_name` | text | ✓ | — | PK, e.g. `usage_sync`, `outline_health_check` |
| `status` | text | ✓ | `'idle'` | `idle` \| `running` \| `success` \| `failed` \| `stale` |
| `last_started_at` | timestamptz | | — | |
| `last_finished_at` | timestamptz | | — | |
| `last_success_at` | timestamptz | | — | |
| `last_error` | text | | — | Sanitized operational error only |
| `consecutive_failures` | integer | ✓ | `0` | |
| `run_count` | integer | ✓ | `0` | |
| `updated_at` | timestamptz | ✓ | now() | |

Indexes:

- `idx_system_job_runs_status` on `(status, updated_at desc)`

---

## commission_ledger

Records commission earned by resellers on paid orders.

| Column | Type | NOT NULL | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | ✓ | gen_random_uuid() | PK |
| `order_id` | uuid | ✓ | — | FK → vpn_orders.id |
| `reseller_id` | uuid | ✓ | — | FK → resellers.id |
| `amount_mmk` | integer | ✓ | — | Commission in MMK |
| `status` | text | ✓ | — | `pending` \| `paid` |
| `created_at` | timestamptz | ✓ | now() | |
| `paid_at` | timestamptz | | — | |
| `updated_at` | timestamptz | ✓ | now() | |

---

## monthly_settlements

Month-end reseller transfer snapshots. Resellers submit transfer details after
paying the platform owner; admins confirm or reopen the submitted settlement.

| Column | Type | NOT NULL | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | ✓ | gen_random_uuid() | PK |
| `reseller_id` | uuid | ✓ | — | FK → resellers.id |
| `settlement_month` | date | ✓ | — | First day of the settlement month |
| `status` | text | ✓ | `'draft'` | `draft` \| `submitted` \| `confirmed` \| `reopened` |
| `gross_paid_mmk` | integer | ✓ | `0` | Confirmed paid purchase total |
| `reseller_commission_mmk` | integer | ✓ | `0` | Commission retained by reseller |
| `platform_due_mmk` | integer | ✓ | `0` | Amount reseller transfers to platform owner |
| `pending_review_mmk` | integer | ✓ | `0` | Pending payment review total at submission time |
| `unpaid_mmk` | integer | ✓ | `0` | Unpaid purchase total at submission time |
| `rejected_mmk` | integer | ✓ | `0` | Rejected purchase total at submission time |
| `confirmed_order_count` | integer | ✓ | `0` | |
| `pending_review_count` | integer | ✓ | `0` | |
| `unpaid_order_count` | integer | ✓ | `0` | |
| `rejected_order_count` | integer | ✓ | `0` | |
| `total_order_count` | integer | ✓ | `0` | |
| `transfer_note` | text | | — | Reseller note |
| `transfer_reference` | text | | — | Transaction/account reference |
| `transfer_proof_url` | text | | — | Optional proof URL/path |
| `submitted_at` | timestamptz | | — | |
| `confirmed_at` | timestamptz | | — | |
| `confirmed_by_admin_id` | uuid | | — | FK → admins.id |
| `reopened_at` | timestamptz | | — | |
| `admin_note` | text | | — | |
| `snapshot_basis` | jsonb | ✓ | `'{}'` | Frozen calculation details |
| `created_at` | timestamptz | ✓ | now() | |
| `updated_at` | timestamptz | ✓ | now() | |

Unique constraint: `(reseller_id, settlement_month)`.

---

## order_payments

Payment ledger rows. Each customer payment/recharge is recorded separately and
reviewed independently. This table is the source of truth for gross paid,
commission, and platform due calculations; `vpn_orders` keeps cached summary
fields for compatibility and fast dashboard display.

| Column | Type | NOT NULL | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | ✓ | gen_random_uuid() | PK |
| `order_id` | uuid | ✓ | — | FK → vpn_orders.id |
| `customer_id` | uuid | ✓ | — | FK → vpn_customers.id |
| `reseller_id` | uuid | ✓ | — | FK → resellers.id |
| `amount_mmk` | integer | ✓ | — | Actual paid/submitted amount |
| `commission_percent` | numeric | ✓ | — | Snapshotted at payment creation |
| `commission_amount_mmk` | integer | ✓ | `0` | `floor(amount_mmk * commission_percent / 100)` |
| `platform_due_mmk` | integer | ✓ | `0` | `amount_mmk - commission_amount_mmk` |
| `payment_method` | text | | — | Optional method label |
| `payment_note` | text | | — | Customer/reseller note |
| `payment_screenshot_url` | text | | — | Private storage path |
| `review_status` | text | ✓ | `'pending_review'` | `pending_review` \| `confirmed` \| `rejected` |
| `payment_type` | text | ✓ | `'initial'` | `initial` \| `extend` \| `renew` |
| `apply_status` | text | ✓ | `'applied'` | `pending` \| `applied` \| `failed` \| `reversed` |
| `plan_id` | uuid | | — | FK → vpn_plans.id; plan bought for this package event |
| `package_duration_days` | integer | | — | Snapshotted plan duration for this package event |
| `package_data_limit_gb` | numeric | | — | Snapshotted plan data limit for this package event |
| `applied_at` | timestamptz | | — | Set when package duration/data has been applied |
| `apply_error` | text | | — | Failure reason when `apply_status = failed` |
| `idempotency_key` | text | | — | Optional duplicate-protection key per reseller |
| `source` | text | | — | `miniapp` \| `dashboard` \| future sources |
| `submitted_at` | timestamptz | ✓ | now() | |
| `reviewed_at` | timestamptz | | — | |
| `reviewed_by_reseller_id` | uuid | | — | FK → resellers.id |
| `reviewed_by_admin_id` | uuid | | — | FK → admins.id |
| `review_note` | text | | — | |
| `created_at` | timestamptz | ✓ | now() | |
| `updated_at` | timestamptz | ✓ | now() | |

---

## reseller_miniapps

One row per reseller — configures the Telegram Mini App experience for that reseller's customers. The `miniapp_slug` is the URL identifier.

**Ownership:** `bot_token_encrypted`, `miniapp_slug`, `brand_logo_url`,
`primary_color`, and the `trial_*` columns are admin-managed only, via
`PATCH /api/admin/resellers/:id/workspace`. `brand_name`, `support_username`,
and `payment_info` stay reseller-managed via `PATCH /api/reseller/workspace`,
which also exposes `bot_connected`/bot status read-only so a reseller can
tell whether to contact the admin.

| Column | Type | NOT NULL | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | ✓ | gen_random_uuid() | PK |
| `reseller_id` | uuid | ✓ | — | FK → resellers.id · UNIQUE |
| `miniapp_slug` | text | ✓ | — | URL slug, a-z 0-9 hyphens only · UNIQUE |
| `bot_token_encrypted` | text | | — | AES-256-GCM encrypted; never returned to frontend |
| `bot_username` | text | | — | Set after successful webhook registration |
| `bot_id` | bigint | | — | Telegram bot numeric ID |
| `bot_connected` | boolean | ✓ | false | True after webhook registration succeeds |
| `brand_name` | text | ✓ | — | **Must supply in INSERT** |
| `brand_logo_url` | text | | — | |
| `support_username` | text | | — | Telegram username without @ |
| `primary_color` | text | ✓ | `'#2f7bff'` | Hex colour; has DB default but **cannot pass null** |
| `trial_enabled` | boolean | ✓ | false | |
| `trial_data_limit_gb` | integer | ✓ | `5` | Has DB default but **cannot pass null** |
| `trial_duration_days` | integer | ✓ | `7` | Has DB default but **cannot pass null** |
| `trial_protocol` | text | ✓ | `'shadowsocks'` | `shadowsocks` or `vless` — protocol used when provisioning trial keys |
| `is_enabled` | boolean | ✓ | true | Disabling blocks all miniapp routes for this slug |
| `payment_info` | jsonb | | `'[]'` | Array of `{method, account_name, account_number, qr_url?}` |
| `created_at` | timestamptz | ✓ | now() | |
| `updated_at` | timestamptz | ✓ | now() | |

> **INSERT rule:** `primary_color`, `trial_data_limit_gb`, and `trial_duration_days` are NOT NULL with  
> DB defaults. Passing explicit `null` overrides the default and causes a NOT NULL violation.  
> Always supply `'#2f7bff'`, `5`, `7` (or real values) — never `null`.

---

## resellers

One row per reseller business. Auth is via Supabase email+password; `supabase_user_id` links to `auth.users`.

| Column | Type | NOT NULL | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | ✓ | gen_random_uuid() | PK |
| `name` | text | ✓ | — | Business/display name (NOT `full_name`) |
| `email` | text | | — | |
| `telegram_username` | text | | — | |
| `phone` | text | | — | |
| `commission_percent` | numeric | ✓ | — | 0–100 |
| `status` | text | ✓ | — | `active` \| `disabled` |
| `created_at` | timestamptz | ✓ | now() | |
| `updated_at` | timestamptz | ✓ | now() | |
| `supabase_user_id` | uuid | | — | FK → auth.users.id |

> **Column trap:** this table uses `name`, not `full_name`. Contrast with `admins.full_name` and `vpn_customers.full_name`.

---

## telegram_links

One row per (reseller, Telegram user) pair. Connects a Telegram user identity to a `vpn_customers` record and tracks trial usage.

| Column | Type | NOT NULL | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | ✓ | gen_random_uuid() | PK |
| `telegram_user_id` | bigint | ✓ | — | Telegram numeric user ID |
| `telegram_username` | text | | — | May be null if user has no username |
| `customer_id` | uuid | ✓ | — | FK → vpn_customers.id |
| `reseller_id` | uuid | ✓ | — | FK → resellers.id |
| `created_at` | timestamptz | ✓ | now() | |
| `updated_at` | timestamptz | ✓ | now() | |
| `trial_used_at` | timestamptz | | — | Set when trial order is created |
| `trial_order_id` | uuid | | — | FK → vpn_orders.id |

Unique constraint: `(reseller_id, telegram_user_id)`.

---

## token_server_assignments

Legacy token portal. Maps an `access_token` to a specific server and VPN key.

| Column | Type | NOT NULL | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | ✓ | gen_random_uuid() | PK |
| `token_id` | uuid | ✓ | — | FK → access_tokens.id |
| `server_id` | uuid | ✓ | — | FK → vpn_servers.id |
| `vpn_key_id` | uuid | | — | FK → vpn_keys.id |
| `is_active` | boolean | ✓ | — | |
| `created_at` | timestamptz | ✓ | now() | |

---

## vpn_customers

End customers (VPN subscribers). One customer belongs to one reseller. Telegram Mini App users are auto-created here on first auth.

| Column | Type | NOT NULL | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | ✓ | gen_random_uuid() | PK |
| `reseller_id` | uuid | | — | FK → resellers.id |
| `full_name` | text | ✓ | — | Display name (NOT `name`) |
| `telegram_username` | text | | — | |
| `phone` | text | | — | |
| `notes` | text | | — | |
| `status` | text | ✓ | — | `active` \| `inactive` |
| `created_at` | timestamptz | ✓ | now() | |
| `updated_at` | timestamptz | ✓ | now() | |
| `ssconf_token` | text | | — | Permanent per-customer token for ssconf:// URLs · UNIQUE |

| `customer_type` | text | yes | `'normal'` | `normal` \| `telegram` |

> **Column trap:** this table uses `full_name`, not `name`.

---

## vpn_keys

Active and historical Outline VPN keys. One key per order (swapped when customer changes server).

| Column | Type | NOT NULL | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | ✓ | gen_random_uuid() | PK |
| `order_id` | uuid | | — | FK → vpn_orders.id |
| `customer_id` | uuid | | — | FK → vpn_customers.id |
| `reseller_id` | uuid | | — | FK → resellers.id |
| `server_id` | uuid | | — | FK → vpn_servers.id |
| `outline_key_id` | text | | — | Numeric key ID from Outline API |
| `key_name` | text | ✓ | — | Human-readable label on the Outline server |
| `access_url` | text | | — | `ss://…` Shadowsocks URL |
| `data_limit_bytes` | bigint | | — | null = unlimited |
| `used_bytes` | bigint | ✓ | — | |
| `status` | text | ✓ | — | `active` \| `deleted` |
| `is_used` | boolean | | — | |
| `used_at` | timestamptz | | — | |
| `ssconf_token` | text | | — | Per-key token (legacy; current flow uses customer ssconf_token) |
| `created_at` | timestamptz | ✓ | now() | |
| `updated_at` | timestamptz | ✓ | now() | |
| `deleted_at` | timestamptz | | — | |

---

Partial unique index: one active, non-deleted key per `(order_id, server_id)`.

## vpn_orders

A customer's VPN subscription period. Drives billing, key provisioning, and expiry.

| Column | Type | NOT NULL | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | ✓ | gen_random_uuid() | PK |
| `customer_id` | uuid | ✓ | — | FK → vpn_customers.id |
| `reseller_id` | uuid | | — | FK → resellers.id |
| `plan_id` | uuid | ✓ | — | FK → vpn_plans.id |
| `status` | text | ✓ | — | `pending` \| `active` \| `expired` \| `stopped` |
| `price_mmk` | integer | ✓ | — | Snapshotted at order creation |
| `commission_percent` | numeric | ✓ | — | Snapshotted at order creation |
| `commission_amount_mmk` | integer | ✓ | — | |
| `total_paid_mmk` | integer | ✓ | — | |
| `start_date` | date | | — | |
| `expiry_date` | date | | — | Used by autoStopJob |
| `payment_status` | text | ✓ | — | `unpaid` \| `paid` \| `overdue` |
| `payment_note` | text | | — | |
| `payment_screenshot_url` | text | | — | Storage path (not public URL) |
| `activated_at` | timestamptz | | — | |
| `stopped_at` | timestamptz | | — | |
| `order_type` | text | | — | `trial` \| `purchase` |
| `review_status` | text | | — | `pending_review` \| `confirmed` \| `rejected` |
| `source` | text | | — | `miniapp` \| `dashboard` |
| `created_at` | timestamptz | ✓ | now() | |
| `updated_at` | timestamptz | ✓ | now() | |

---

Partial unique index: one active purchase per `(reseller_id, customer_id)`.
Migration `0006_business_integrity_constraints.sql` also enforces composite
customer/order/key tenant ownership for all new writes.

## vpn_plans

Subscription plan catalogue. Shared across resellers. `is_trial = true` rows are used for free trial orders.

| Column | Type | NOT NULL | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | ✓ | gen_random_uuid() | PK |
| `name` | text | ✓ | — | |
| `price_mmk` | integer | ✓ | — | 0 for trial plans |
| `data_limit_gb` | integer | ✓ | — | 0 = unlimited |
| `duration_days` | integer | ✓ | — | |
| `max_devices` | integer | ✓ | — | |
| `is_active` | boolean | ✓ | — | Inactive plans are hidden from reseller dashboard |
| `is_trial` | boolean | ✓ | — | |
| `features` | jsonb | ✓ | `'{}'` | Array of feature strings for display |
| `sort_order` | integer | ✓ | — | Controls display order |
| `allowed_regions` | text[] | | — | null = all regions |
| `created_at` | timestamptz | ✓ | now() | |
| `updated_at` | timestamptz | ✓ | now() | |

---

## vpn_servers

VPN servers (DigitalOcean droplets). Managed by Marzneshin panel.

| Column | Type | NOT NULL | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | ✓ | gen_random_uuid() | PK |
| `name` | text | ✓ | — | |
| `provider` | text | ✓ | — | `digitalocean` |
| `region` | text | ✓ | — | e.g. `sgp1` |
| `region_code` | text | | — | Display code e.g. `SG` |
| `droplet_id` | bigint | | — | DigitalOcean droplet ID |
| `host_ip` | text | | — | |
| `outline_api_url` | text | | — | ⚠️ LEGACY — not used by Marzneshin |
| `outline_cert_sha256` | text | | — | ⚠️ LEGACY — not used by Marzneshin |
| `panel_type` | text | ✓ | `'marzneshin'` | `marzneshin` |
| `panel_url` | text | | — | Marzneshin panel API URL (e.g. `http://127.0.0.1:8000`) |
| `panel_public_url` | text | | — | Public HTTPS URL for subscription links |
| `panel_username` | text | | — | Marzneshin admin username |
| `panel_password_encrypted` | text | | — | Encrypted admin password |
| `marzneshin_service_ids` | integer[] | | `'{}'` | Per-server SS service IDs (one node's SS inbound only) |
| `marzneshin_vless_service_ids` | integer[] | | `'{}'` | Global VLESS service IDs (all nodes' VLESS inbounds — same value on every server row) |
| `marzneshin_vless_trial_service_ids` | integer[] | | `'{}'` | Trial-only VLESS service IDs — references a Marzneshin service containing ONLY this trial server's VLESS inbound. Set on trial servers only; empty on premium servers. |
| `status` | text | ✓ | — | `active` \| `provisioning` \| `error` \| `inactive` |
| `is_active` | boolean | | — | |
| `is_default` | boolean | ✓ | — | One server is the default for new mini-app orders |
| `max_active_keys` | integer | ✓ | — | Capacity ceiling |
| `current_active_keys` | integer | ✓ | — | Managed with optimistic-concurrency loop |
| `last_error` | text | | — | |
| `display_country` | text | | — | e.g. `Singapore` |
| `display_city` | text | | — | e.g. `Singapore` |
| `flag_emoji` | text | | — | e.g. `🇸🇬` |
| `server_number` | integer | | — | Display number |
| `sort_order` | integer | ✓ | — | Controls display order |
| `created_at` | timestamptz | ✓ | now() | |
| `updated_at` | timestamptz | | — | |

---

## Foreign Key Map

> `vpn_servers.server_tier` was added in migration `0005_add_server_tier.sql`.
> It is NOT NULL, defaults to `'premium'`, and accepts `trial` or `premium`.
> Trial orders select only `trial` servers; paid purchase/renew orders select
> only `premium` servers.

| Column | References |
|--------|-----------|
| `access_tokens.customer_id` | `vpn_customers.id` |
| `access_tokens.reseller_id` | `resellers.id` |
| `access_tokens.order_id` | `vpn_orders.id` |
| `admins.supabase_user_id` | `auth.users.id` (Supabase auth) |
| `commission_ledger.order_id` | `vpn_orders.id` |
| `commission_ledger.reseller_id` | `resellers.id` |
| `monthly_settlements.reseller_id` | `resellers.id` |
| `monthly_settlements.confirmed_by_admin_id` | `admins.id` |
| `app_events.reseller_id` | `resellers.id` |
| `app_events.customer_id` | `vpn_customers.id` |
| `app_events.admin_id` | `admins.id` |
| `app_events.order_id` | `vpn_orders.id` |
| `app_events.payment_id` | `order_payments.id` |
| `app_events.server_id` | `vpn_servers.id` |
| `app_events.plan_id` | `vpn_plans.id` |
| `order_payments.order_id` | `vpn_orders.id` |
| `order_payments.customer_id` | `vpn_customers.id` |
| `order_payments.reseller_id` | `resellers.id` |
| `order_payments.plan_id` | `vpn_plans.id` |
| `order_payments.reviewed_by_reseller_id` | `resellers.id` |
| `order_payments.reviewed_by_admin_id` | `admins.id` |
| `reseller_miniapps.reseller_id` | `resellers.id` |
| `resellers.supabase_user_id` | `auth.users.id` (Supabase auth) |
| `server_health_status.server_id` | `vpn_servers.id` |
| `telegram_links.customer_id` | `vpn_customers.id` |
| `telegram_links.reseller_id` | `resellers.id` |
| `telegram_links.trial_order_id` | `vpn_orders.id` |
| `token_server_assignments.token_id` | `access_tokens.id` |
| `token_server_assignments.server_id` | `vpn_servers.id` |
| `token_server_assignments.vpn_key_id` | `vpn_keys.id` |
| `vpn_customers.reseller_id` | `resellers.id` |
| `vpn_keys.order_id` | `vpn_orders.id` |
| `vpn_keys.customer_id` | `vpn_customers.id` |
| `vpn_keys.reseller_id` | `resellers.id` |
| `vpn_keys.server_id` | `vpn_servers.id` |
| `vpn_orders.customer_id` | `vpn_customers.id` |
| `vpn_orders.reseller_id` | `resellers.id` |
| `vpn_orders.plan_id` | `vpn_plans.id` |

---

## Column Name Traps

Three tables use different name columns — this has caused bugs:

| Table | Name column |
|-------|------------|
| `resellers` | `name` |
| `admins` | `full_name` |
| `vpn_customers` | `full_name` |

---

## Key Enumerations

These are stored as `text`. Critical customer, order, key, payment, settlement,
and server lifecycle values have DB-level CHECK constraints; the remaining rows
document accepted application values.

| Table.column | Known values |
|---|---|
| `resellers.status` | `active`, `disabled` |
| `admins.status` | `active`, `disabled` |
| `vpn_customers.status` | `active`, `inactive` |
| `vpn_servers.status` | `active`, `provisioning`, `error`, `inactive` |
| `vpn_orders.status` | `pending`, `active`, `expired`, `stopped` |
| `vpn_orders.payment_status` | `unpaid`, `paid`, `overdue` |
| `vpn_orders.order_type` | `trial`, `purchase` |
| `vpn_orders.review_status` | `pending_review`, `confirmed`, `rejected` |
| `vpn_orders.source` | `miniapp`, `dashboard` |
| `vpn_keys.status` | `active`, `deleted` |
| `access_tokens.status` | `active`, `expired`, `revoked` |
| `commission_ledger.status` | `pending`, `paid` |
| `monthly_settlements.status` | `draft`, `submitted`, `confirmed`, `reopened` |
| `order_payments.review_status` | `pending_review`, `confirmed`, `rejected` |
| `order_payments.payment_type` | `initial`, `extend`, `renew`, `adjustment` |
| `order_payments.apply_status` | `pending`, `applied`, `failed`, `reversed` |
| `app_events.status` | `info`, `success`, `blocked`, `failed` |
| `system_job_runs.status` | `idle`, `running`, `success`, `failed`, `stale` |
| `server_health_status.outline_api_status` | `unknown`, `healthy`, `degraded`, `failed`, `stale` |
| `vpn_servers.provider` | `digitalocean` |
| `vpn_servers.panel_type` | `marzneshin` |
