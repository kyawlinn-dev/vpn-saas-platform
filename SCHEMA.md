# NovaNet MM — Database Schema Reference

## Scope and verification

Verified read-only on 2026-10-15 using service-role PostgREST OpenAPI, separately for production and development.

| Environment | Project | Observed API relations |
| --- | --- | --- |
| Production | daenwuszqdfkbjiatsjs | 20 tables and 3 views |
| Development | huqmzvlzfcexycdrsxpn | Production-compatible core plus development channel additions below |

This is a column/type/required/default snapshot, not proof of every live SQL CHECK, trigger, grant or migration execution. Validate migration DDL independently before a release. Source code and migrations live under backend/src and backend/supabase/migrations. Production secrets are never documented here.

Required means NOT NULL in the API schema, not necessarily caller-supplied: defaults may satisfy it. Column names retain compatibility history. Do not rename/drop outline_* fields or legacy tables without tracing current references.

## Production tables

- [access_tokens](#access_tokens)
- [admins](#admins)
- [app_events](#app_events)
- [commission_ledger](#commission_ledger)
- [monthly_settlements](#monthly_settlements)
- [notifications_sent](#notifications_sent)
- [order_payments](#order_payments)
- [platform_settings](#platform_settings)
- [reseller_miniapps](#reseller_miniapps)
- [reseller_notification_templates](#reseller_notification_templates)
- [resellers](#resellers)
- [server_health_status](#server_health_status)
- [system_job_runs](#system_job_runs)
- [telegram_links](#telegram_links)
- [token_server_assignments](#token_server_assignments)
- [vpn_customers](#vpn_customers)
- [vpn_keys](#vpn_keys)
- [vpn_orders](#vpn_orders)
- [vpn_plans](#vpn_plans)
- [vpn_servers](#vpn_servers)

## access_tokens

Legacy internal token rows; old public portal routes are unmounted.

| Column | PostgreSQL type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | uuid | yes | "gen_random_uuid()" | PK |
| `customer_id` | uuid | yes | — | FK → vpn_customers.id |
| `reseller_id` | uuid | yes | — | FK → resellers.id |
| `order_id` | uuid | no | — | FK → vpn_orders.id |
| `token` | text | yes | — | `tok_xxx` access token |
| `status` | text | yes | — | `active` \ \| `expired` \ \| `revoked` |
| `expires_at` | timestamp with time zone | no | — |  |
| `last_used_at` | timestamp with time zone | no | — |  |
| `created_at` | timestamp with time zone | yes | "now()" |  |
| `updated_at` | timestamp with time zone | yes | "now()" |  |

## admins

Platform owner accounts.

| Column | PostgreSQL type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | uuid | yes | "gen_random_uuid()" | PK |
| `supabase_user_id` | uuid | yes | — | FK → auth.users.id |
| `full_name` | text | no | — | Display name (NOT `name`) |
| `email` | text | no | — |  |
| `status` | text | yes | — | `active` \ \| `disabled` |
| `created_at` | timestamp with time zone | yes | "now()" |  |

## app_events

Backend-owned business telemetry; do not store credentials or receipt/access URLs.

| Column | PostgreSQL type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | uuid | yes | "gen_random_uuid()" | PK |
| `event_name` | text | yes | — | e.g. `miniapp_config_loaded`, `miniapp_authenticated`, `server_selected`, `key_provisioned` |
| `event_source` | text | yes | "backend" | `backend`, `miniapp`, `bot`, `admin`, `reseller` |
| `actor_type` | text | no | — | `customer`, `reseller`, `admin`, `system`, `anonymous` |
| `reseller_id` | uuid | no | — | FK → resellers.id |
| `customer_id` | uuid | no | — | FK → vpn_customers.id |
| `admin_id` | uuid | no | — | FK → admins.id |
| `telegram_user_id` | bigint | no | — | Safe Telegram numeric ID, no init data |
| `order_id` | uuid | no | — | FK → vpn_orders.id |
| `payment_id` | uuid | no | — | FK → order_payments.id |
| `server_id` | uuid | no | — | FK → vpn_servers.id |
| `plan_id` | uuid | no | — | FK → vpn_plans.id |
| `page` | text | no | — | Logical app page |
| `route` | text | no | — | Backend route path without query string |
| `status` | text | yes | "info" | `info` \ \| `success` \ \| `blocked` \ \| `failed` |
| `metadata` | jsonb | yes | — | Safe allowlisted metadata only |
| `session_id` | text | no | — | Optional anonymous session correlation |
| `user_agent` | text | no | — | Request user agent |
| `ip_hash` | text | no | — | Salted hash, never raw IP |
| `created_at` | timestamp with time zone | yes | "now()" |  |

## commission_ledger

Retained commission compatibility/history; payment ledger remains accounting source.

| Column | PostgreSQL type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | uuid | yes | "gen_random_uuid()" | PK |
| `order_id` | uuid | yes | — | FK → vpn_orders.id |
| `reseller_id` | uuid | yes | — | FK → resellers.id |
| `amount_mmk` | integer | yes | — | Commission in MMK |
| `status` | text | yes | — | `pending` \ \| `paid` |
| `created_at` | timestamp with time zone | yes | "now()" |  |
| `paid_at` | timestamp with time zone | no | — |  |
| `updated_at` | timestamp with time zone | yes | "now()" |  |

## monthly_settlements

Month-end submission snapshots; live month totals are separate from submitted/confirmed snapshots.

| Column | PostgreSQL type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | uuid | yes | "gen_random_uuid()" | PK |
| `reseller_id` | uuid | yes | — | FK → resellers.id |
| `settlement_month` | date | yes | — | First day of the settlement month |
| `status` | text | yes | "draft" | `draft` \ \| `submitted` \ \| `confirmed` \ \| `reopened` |
| `gross_paid_mmk` | integer | yes | 0 | Confirmed paid purchase total |
| `reseller_commission_mmk` | integer | yes | 0 | Commission retained by reseller |
| `platform_due_mmk` | integer | yes | 0 | Amount reseller transfers to platform owner |
| `pending_review_mmk` | integer | yes | 0 | Pending payment review total at submission time |
| `unpaid_mmk` | integer | yes | 0 | Unpaid purchase total at submission time |
| `rejected_mmk` | integer | yes | 0 | Rejected purchase total at submission time |
| `confirmed_order_count` | integer | yes | 0 |  |
| `pending_review_count` | integer | yes | 0 |  |
| `unpaid_order_count` | integer | yes | 0 |  |
| `rejected_order_count` | integer | yes | 0 |  |
| `total_order_count` | integer | yes | 0 |  |
| `transfer_note` | text | no | — | Reseller note |
| `transfer_reference` | text | no | — | Transaction/account reference |
| `transfer_proof_url` | text | no | — | Optional proof URL/path |
| `submitted_at` | timestamp with time zone | no | — |  |
| `confirmed_at` | timestamp with time zone | no | — |  |
| `confirmed_by_admin_id` | uuid | no | — | FK → admins.id |
| `reopened_at` | timestamp with time zone | no | — |  |
| `admin_note` | text | no | — |  |
| `snapshot_basis` | jsonb | yes | — | Frozen calculation details |
| `created_at` | timestamp with time zone | yes | "now()" |  |
| `updated_at` | timestamp with time zone | yes | "now()" |  |

## notifications_sent

Production Telegram notification deduplication ledger.

| Column | PostgreSQL type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | uuid | yes | "gen_random_uuid()" |  |
| `customer_id` | uuid | yes | — |  |
| `event_type` | text | yes | — |  |
| `order_id` | uuid | no | — |  |
| `channel` | text | yes | "telegram" |  |
| `sent_at` | timestamp with time zone | yes | "now()" |  |

## order_payments

Payment events and accounting source of truth. Recognized revenue requires confirmed and applied events.

| Column | PostgreSQL type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | uuid | yes | "gen_random_uuid()" | PK |
| `order_id` | uuid | yes | — | FK → vpn_orders.id |
| `customer_id` | uuid | yes | — | FK → vpn_customers.id |
| `reseller_id` | uuid | yes | — | FK → resellers.id |
| `amount_mmk` | integer | yes | — | Actual paid/submitted amount |
| `commission_percent` | numeric | yes | — | Snapshotted at payment creation |
| `commission_amount_mmk` | integer | yes | 0 | `floor(amount_mmk * commission_percent / 100)` |
| `platform_due_mmk` | integer | yes | 0 | `amount_mmk - commission_amount_mmk` |
| `payment_method` | text | no | — | Optional method label |
| `payment_note` | text | no | — | Customer/reseller note |
| `payment_screenshot_url` | text | no | — | Private storage path |
| `review_status` | text | yes | "pending_review" | `pending_review` \ \| `confirmed` \ \| `rejected` |
| `source` | text | no | — | `miniapp` \ \| `dashboard` \ \| future sources |
| `submitted_at` | timestamp with time zone | yes | "now()" |  |
| `reviewed_at` | timestamp with time zone | no | — |  |
| `reviewed_by_reseller_id` | uuid | no | — | FK → resellers.id |
| `reviewed_by_admin_id` | uuid | no | — | FK → admins.id |
| `review_note` | text | no | — |  |
| `created_at` | timestamp with time zone | yes | "now()" |  |
| `updated_at` | timestamp with time zone | yes | "now()" |  |
| `payment_type` | text | yes | "initial" | `initial` \ \| `extend` \ \| `renew` |
| `apply_status` | text | yes | "applied" | `pending` \ \| `applied` \ \| `failed` \ \| `reversed` |
| `plan_id` | uuid | no | — | FK → vpn_plans.id; plan bought for this package event |
| `package_duration_days` | integer | no | — | Purchased duration snapshot when recorded; do not infer exact historical duration from current catalogue. |
| `package_data_limit_gb` | numeric | no | — | Purchased allowance snapshot when recorded. |
| `applied_at` | timestamp with time zone | no | — | Set when package duration/data has been applied |
| `apply_error` | text | no | — | Failure reason when `apply_status = failed` |
| `idempotency_key` | text | no | — | Optional duplicate-protection key per reseller |

## platform_settings

Singleton platform configuration.

| Column | PostgreSQL type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | boolean | yes | true | Singleton boolean key; existing configuration is backend-managed. |
| `payment_accounts` | jsonb | yes | — |  |
| `settlement_instructions` | text | no | — |  |
| `updated_at` | timestamp with time zone | yes | "now()" |  |

## reseller_miniapps

Tenant workspace configuration. Bot/slug/logo/color/trial/reviewer are admin-managed; brand/support/payment information are reseller-managed.

| Column | PostgreSQL type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | uuid | yes | "gen_random_uuid()" | PK |
| `reseller_id` | uuid | yes | — | FK → resellers.id · UNIQUE |
| `miniapp_slug` | text | yes | — | URL slug, a-z 0-9 hyphens only · UNIQUE |
| `bot_token_encrypted` | text | no | — | AES-256-GCM encrypted; never returned to frontend |
| `bot_username` | text | no | — | Set after successful webhook registration |
| `bot_id` | bigint | no | — | Telegram bot numeric ID |
| `bot_connected` | boolean | yes | false | True after webhook registration succeeds |
| `brand_name` | text | yes | — | **Must supply in INSERT** |
| `brand_logo_url` | text | no | — |  |
| `support_username` | text | no | — | Telegram username without @ |
| `primary_color` | text | yes | "#2f7bff" | Hex colour; has DB default but **cannot pass null** |
| `trial_enabled` | boolean | yes | false | Admin-managed eligibility switch; default false. Check the actual workspace, not a global trial promise. |
| `trial_data_limit_gb` | integer | yes | 5 | Has DB default but **cannot pass null** |
| `trial_duration_days` | integer | yes | 7 | Has DB default but **cannot pass null** |
| `is_enabled` | boolean | yes | true | Disabling blocks all miniapp routes for this slug |
| `payment_info` | jsonb | no | — | Array of `{method, account_name, account_number, qr_url?}` |
| `created_at` | timestamp with time zone | yes | "now()" |  |
| `updated_at` | timestamp with time zone | yes | "now()" |  |
| `trial_protocol` | text | yes | "shadowsocks" | Admin-managed trial protocol; validate trial-only service assignments. |
| `admin_telegram_user_id` | bigint | no | — | Configured Telegram reviewer/receipt-alert identity; admin-managed. |

## reseller_notification_templates

Per-reseller notification text overrides.

| Column | PostgreSQL type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | uuid | yes | "gen_random_uuid()" |  |
| `reseller_id` | uuid | yes | — |  |
| `event_type` | text | yes | — |  |
| `custom_text` | text | yes | — |  |
| `updated_at` | timestamp with time zone | yes | "now()" |  |

## resellers

Tenant businesses and account status.

| Column | PostgreSQL type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | uuid | yes | "gen_random_uuid()" | PK |
| `name` | text | yes | — | Business/display name (NOT `full_name`) |
| `email` | text | no | — |  |
| `telegram_username` | text | no | — |  |
| `phone` | text | no | — |  |
| `commission_percent` | numeric | yes | — | 0–100 |
| `status` | text | yes | — | `active` \ \| `disabled` |
| `created_at` | timestamp with time zone | yes | "now()" |  |
| `updated_at` | timestamp with time zone | yes | "now()" |  |
| `supabase_user_id` | uuid | no | — | FK → auth.users.id |
| `notifications_paused` | boolean | yes | false | Pauses applicable customer notification delivery for this workspace. |

## server_health_status

Panel/usage-sync operational readings. outline_api_status is a retained compatibility column name.

| Column | PostgreSQL type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `server_id` | uuid | yes | — | PK, FK → vpn_servers.id |
| `outline_api_status` | text | yes | "unknown" | `unknown` \ \| `healthy` \ \| `degraded` \ \| `failed` \ \| `stale` |
| `last_checked_at` | timestamp with time zone | no | — | Last panel API health check attempt |
| `last_success_at` | timestamp with time zone | no | — | Last successful panel API health check |
| `last_usage_sync_at` | timestamp with time zone | no | — | Last successful usage sync for this server |
| `last_error` | text | no | — | Sanitized operational error only |
| `response_ms` | integer | no | — | panel API health check duration |
| `active_key_count_seen` | integer | no | — | Key count observed from panel API |
| `consecutive_failures` | integer | yes | 0 |  |
| `updated_at` | timestamp with time zone | yes | "now()" |  |

## system_job_runs

Backend job health; successful metadata does not replace inspecting a failed component.

| Column | PostgreSQL type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `job_name` | text | yes | — | PK, e.g. `usage_sync`, `outline_health_check` |
| `status` | text | yes | "idle" | `idle` \ \| `running` \ \| `success` \ \| `failed` \ \| `stale` |
| `last_started_at` | timestamp with time zone | no | — |  |
| `last_finished_at` | timestamp with time zone | no | — |  |
| `last_success_at` | timestamp with time zone | no | — |  |
| `last_error` | text | no | — | Sanitized operational error only |
| `consecutive_failures` | integer | yes | 0 |  |
| `run_count` | integer | yes | 0 |  |
| `updated_at` | timestamp with time zone | yes | "now()" |  |

## telegram_links

Production reseller-scoped Telegram/customer linkage and trial history.

| Column | PostgreSQL type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | uuid | yes | "gen_random_uuid()" | PK |
| `telegram_user_id` | bigint | yes | — | Telegram numeric user ID |
| `telegram_username` | text | no | — | May be null if user has no username |
| `customer_id` | uuid | yes | — | FK → vpn_customers.id |
| `reseller_id` | uuid | yes | — | FK → resellers.id |
| `created_at` | timestamp with time zone | yes | "now()" |  |
| `updated_at` | timestamp with time zone | yes | "now()" |  |
| `trial_used_at` | timestamp with time zone | no | — | Set when trial order is created |
| `trial_order_id` | uuid | no | — | FK → vpn_orders.id |

## token_server_assignments

Legacy internal token-to-server links still used by provisioning; do not drop based on public-route retirement.

| Column | PostgreSQL type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | uuid | yes | "gen_random_uuid()" | PK |
| `token_id` | uuid | yes | — | FK → access_tokens.id |
| `server_id` | uuid | yes | — | FK → vpn_servers.id |
| `vpn_key_id` | uuid | no | — | FK → vpn_keys.id |
| `is_active` | boolean | yes | — |  |
| `created_at` | timestamp with time zone | yes | "now()" |  |

## vpn_customers

Customers isolated by reseller; full_name is the display-name column.

| Column | PostgreSQL type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | uuid | yes | "gen_random_uuid()" | PK |
| `reseller_id` | uuid | no | — | FK → resellers.id |
| `full_name` | text | yes | — | Display name (NOT `name`) |
| `telegram_username` | text | no | — |  |
| `phone` | text | no | — |  |
| `notes` | text | no | — |  |
| `status` | text | yes | — | `active` \ \| `inactive` |
| `created_at` | timestamp with time zone | yes | "now()" |  |
| `updated_at` | timestamp with time zone | yes | "now()" |  |
| `ssconf_token` | text | no | — | Permanent per-customer token for ssconf:// URLs · UNIQUE |
| `customer_type` | text | yes | "normal" | normal or telegram in production; development additionally supports messenger. |
| `protocol_preference` | text | yes | "shadowsocks" | Intent for next provisioning; active key.protocol is current access. |

## vpn_keys

Active Marzneshin keys and immutable historical key usage.

| Column | PostgreSQL type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | uuid | yes | "gen_random_uuid()" | PK |
| `order_id` | uuid | no | — | FK → vpn_orders.id |
| `customer_id` | uuid | no | — | FK → vpn_customers.id |
| `reseller_id` | uuid | no | — | FK → resellers.id |
| `server_id` | uuid | no | — | FK → vpn_servers.id |
| `outline_key_id` | text | no | — | Marzneshin username for active keys; numeric Outline ID only in historical rows. |
| `key_name` | text | yes | — | Human-readable key label; not a provider credential. |
| `access_url` | text | no | — | Provider subscription URL on Marzneshin keys. Backend projects protocol-specific customer access URLs. |
| `data_limit_bytes` | bigint | no | — | Per-key enforcement cap. After a switch this is carried balance, not the full package allowance; null is an unlimited/legacy marker requiring canonical quota interpretation. |
| `used_bytes` | bigint | yes | — | Synced per-key usage; historical deleted-key readings are retained for package accounting. |
| `status` | text | yes | — | `active` \ \| `deleted` |
| `is_used` | boolean | no | — |  |
| `used_at` | timestamp with time zone | no | — |  |
| `ssconf_token` | text | no | — | Per-key token (legacy; current flow uses customer ssconf_token) |
| `created_at` | timestamp with time zone | yes | "now()" |  |
| `updated_at` | timestamp with time zone | yes | "now()" |  |
| `deleted_at` | timestamp with time zone | no | — |  |
| `protocol` | text | yes | "shadowsocks" | Authoritative protocol of this key: shadowsocks, vless or historical/supported hysteria2. |
| `key_credentials` | jsonb | no | — | Provider metadata; backend-only, may include subscription credentials. |

## vpn_orders

Package containers, dates, quota snapshots and compatibility payment fields.

| Column | PostgreSQL type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | uuid | yes | "gen_random_uuid()" | PK |
| `customer_id` | uuid | yes | — | FK → vpn_customers.id |
| `reseller_id` | uuid | no | — | FK → resellers.id |
| `plan_id` | uuid | yes | — | FK → vpn_plans.id |
| `status` | text | yes | — | pending, active, expired, stopped or scheduled; do not conflate with payment review. |
| `price_mmk` | integer | yes | — | Snapshotted at order creation |
| `commission_percent` | numeric | yes | — | Snapshotted at order creation |
| `commission_amount_mmk` | integer | yes | — |  |
| `total_paid_mmk` | integer | yes | — |  |
| `start_date` | date | no | — |  |
| `expiry_date` | date | no | — | Used by autoStopJob |
| `payment_status` | text | yes | — | `unpaid` \ \| `paid` \ \| `overdue` |
| `payment_note` | text | no | — |  |
| `payment_screenshot_url` | text | no | — | Storage path (not public URL) |
| `activated_at` | timestamp with time zone | no | — |  |
| `stopped_at` | timestamp with time zone | no | — |  |
| `order_type` | text | no | — | `trial` \ \| `purchase` |
| `review_status` | text | no | — | `pending_review` \ \| `confirmed` \ \| `rejected` |
| `source` | text | no | — | `miniapp` \ \| `dashboard` |
| `created_at` | timestamp with time zone | yes | "now()" |  |
| `updated_at` | timestamp with time zone | yes | "now()" |  |
| `usage_baseline_bytes` | bigint | yes | 0 | Historical key usage before the current package period; subtracted by canonical quota. |
| `quota_limit_bytes` | bigint | no | — | Snapshotted current package allowance. Use the canonical quota service to distinguish finite, unlimited and unavailable. |

## vpn_plans

Shared current catalogue. Zero data_limit_gb means unlimited; max_devices is catalogue metadata, not proof of device enforcement.

| Column | PostgreSQL type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | uuid | yes | "gen_random_uuid()" | PK |
| `name` | text | yes | — |  |
| `price_mmk` | integer | yes | — | 0 for trial plans |
| `data_limit_gb` | integer | yes | — | 0 = unlimited |
| `duration_days` | integer | yes | — |  |
| `max_devices` | integer | yes | — |  |
| `is_active` | boolean | yes | — | Inactive plans are hidden from reseller dashboard |
| `is_trial` | boolean | yes | — |  |
| `features` | jsonb | yes | — | Array of feature strings for display |
| `sort_order` | integer | yes | — | Controls display order |
| `allowed_regions` | text[] | no | — | null = all regions |
| `created_at` | timestamp with time zone | yes | "now()" |  |
| `updated_at` | timestamp with time zone | yes | "now()" |  |

## vpn_servers

Marzneshin service/node capacity and historical provider rows.

| Column | PostgreSQL type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | uuid | yes | "gen_random_uuid()" | PK |
| `name` | text | yes | — |  |
| `provider` | text | yes | — | `digitalocean` |
| `region` | text | yes | — | e.g. `sgp1` |
| `region_code` | text | no | — | Display code e.g. `SG` |
| `droplet_id` | bigint | no | — | DigitalOcean droplet ID |
| `host_ip` | text | no | — |  |
| `outline_api_url` | text | no | — | Legacy column; credentials cleared after Outline retirement |
| `outline_cert_sha256` | text | no | — | Legacy column; credentials cleared after Outline retirement |
| `status` | text | yes | — | Runtime active/provisioning/error states and historical inactive/decommissioned rows; selectable capacity uses existing status guards. |
| `is_active` | boolean | no | — |  |
| `is_default` | boolean | yes | — | One server is the default for new mini-app orders |
| `max_active_keys` | integer | yes | — | Capacity ceiling |
| `current_active_keys` | integer | yes | — | Database-owned capacity counter in the current code path; do not write directly. |
| `last_error` | text | no | — |  |
| `display_country` | text | no | — | e.g. `Singapore` |
| `display_city` | text | no | — | e.g. `Singapore` |
| `flag_emoji` | text | no | — | e.g. `🇸🇬` |
| `server_number` | integer | no | — | Display number |
| `sort_order` | integer | yes | — | Controls display order |
| `created_at` | timestamp with time zone | yes | "now()" |  |
| `updated_at` | timestamp with time zone | no | — |  |
| `server_tier` | text | yes | "premium" | trial or premium. Trial cannot use premium; paid manual switching may use eligible trial capacity. |
| `panel_type` | text | yes | "outline" | marzneshin for active access; outline retained only for historical rows. |
| `panel_url` | text | no | — | Marzneshin panel API URL (e.g. `http://127.0.0.1:8000`) |
| `panel_public_url` | text | no | — | Public HTTPS URL for subscription links |
| `panel_username` | text | no | — | Marzneshin admin username |
| `panel_password_encrypted` | text | no | — | Encrypted admin password |
| `marzneshin_service_ids` | integer[] | no | — | Per-server SS service IDs (one node's SS inbound only) |
| `marzneshin_vless_service_ids` | integer[] | no | — | Global VLESS service IDs (all nodes' VLESS inbounds — same value on every server row) |
| `marzneshin_vless_trial_service_ids` | integer[] | no | — | Trial-only VLESS service IDs — references a Marzneshin service containing ONLY this trial server's VLESS inbound. Set on trial servers only; empty on premium servers. |

## Production canonical views

These are service-layer read helpers; frontends still use authenticated Express routes. They do not mean every existing route already reads exclusively from a view.

## customer_view

Canonical backend read view; inspect migration 0023 for derivation and privileges.

| Column | PostgreSQL type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | uuid | no | — |  |
| `reseller_id` | uuid | no | — |  |
| `display_name` | text | no | — |  |
| `telegram_username` | text | no | — |  |
| `phone` | text | no | — |  |
| `notes` | text | no | — |  |
| `status` | text | no | — |  |
| `customer_type` | text | no | — |  |
| `protocol_preference` | text | no | — |  |
| `ssconf_token` | text | no | — |  |
| `created_at` | timestamp with time zone | no | — |  |
| `updated_at` | timestamp with time zone | no | — |  |
| `reseller_display_name` | text | no | — |  |
| `active_order_id` | uuid | no | — |  |

## order_view

Canonical backend read view; inspect migration 0023 for derivation and privileges.

| Column | PostgreSQL type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | uuid | no | — |  |
| `customer_id` | uuid | no | — |  |
| `reseller_id` | uuid | no | — |  |
| `plan_id` | uuid | no | — |  |
| `status` | text | no | — |  |
| `price_mmk` | integer | no | — |  |
| `commission_percent` | numeric | no | — |  |
| `start_date` | date | no | — |  |
| `expiry_date` | date | no | — |  |
| `payment_note` | text | no | — |  |
| `payment_status` | text | no | — |  |
| `activated_at` | timestamp with time zone | no | — |  |
| `stopped_at` | timestamp with time zone | no | — |  |
| `order_type` | text | no | — |  |
| `review_status` | text | no | — |  |
| `payment_screenshot_url` | text | no | — |  |
| `source` | text | no | — |  |
| `created_at` | timestamp with time zone | no | — |  |
| `updated_at` | timestamp with time zone | no | — |  |
| `total_paid_mmk` | bigint | no | — |  |
| `commission_amount_mmk` | bigint | no | — |  |
| `platform_due_mmk` | bigint | no | — |  |
| `protocol` | text | no | — |  |
| `active_key_id` | uuid | no | — |  |
| `active_key_access_url` | text | no | — |  |
| `active_key_protocol` | text | no | — |  |
| `active_key_server_id` | uuid | no | — |  |
| `customer_display_name` | text | no | — |  |
| `customer_ssconf_token` | text | no | — |  |
| `customer_protocol_preference` | text | no | — |  |
| `reseller_display_name` | text | no | — |  |
| `plan_name` | text | no | — |  |

## server_view

Canonical backend read view; inspect migration 0023 for derivation and privileges.

| Column | PostgreSQL type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | uuid | no | — |  |
| `name` | text | no | — |  |
| `provider` | text | no | — |  |
| `region` | text | no | — |  |
| `region_code` | text | no | — |  |
| `droplet_id` | bigint | no | — |  |
| `host_ip` | text | no | — |  |
| `outline_api_url` | text | no | — |  |
| `outline_cert_sha256` | text | no | — |  |
| `status` | text | no | — |  |
| `is_active` | boolean | no | — |  |
| `is_default` | boolean | no | — |  |
| `max_active_keys` | integer | no | — |  |
| `current_active_keys` | integer | no | — |  |
| `last_error` | text | no | — |  |
| `display_country` | text | no | — |  |
| `display_city` | text | no | — |  |
| `flag_emoji` | text | no | — |  |
| `server_number` | integer | no | — |  |
| `sort_order` | integer | no | — |  |
| `created_at` | timestamp with time zone | no | — |  |
| `updated_at` | timestamp with time zone | no | — |  |
| `server_tier` | text | no | — |  |
| `panel_type` | text | no | — |  |
| `panel_url` | text | no | — |  |
| `panel_public_url` | text | no | — |  |
| `panel_username` | text | no | — |  |
| `panel_password_encrypted` | text | no | — |  |
| `marzneshin_service_ids` | integer[] | no | — |  |
| `marzneshin_vless_service_ids` | integer[] | no | — |  |
| `marzneshin_vless_trial_service_ids` | integer[] | no | — |  |
| `outline_api_status` | text | no | — |  |
| `last_checked_at` | timestamp with time zone | no | — |  |
| `last_success_at` | timestamp with time zone | no | — |  |
| `last_usage_sync_at` | timestamp with time zone | no | — |  |
| `health_consecutive_failures` | integer | no | — |  |
| `live_active_key_count` | bigint | no | — |  |

## Production RPCs and concurrency

Observed RPC paths:

- `activate_vpn_key`
- `admin_monitoring_daily`
- `admin_monitoring_funnel`
- `admin_monitoring_server_events`
- `admin_monitoring_summary`
- `apply_confirmed_payment`
- `cleanup_old_app_events`
- `fail_pending_key`
- `reserve_pending_key`
- `rls_auto_enable`

Provisioning calls reserve_pending_key, activate_vpn_key and fail_pending_key. apply_confirmed_payment keeps relevant payment/cache updates atomic. Current serverService treats capacity as database-owned (migration 0021); do not bypass reservation/ownership/retry guards or write counters directly. RPC exposure alone does not verify live trigger DDL. RLS/grants must be checked against the migration and intended caller.

## Foreign key reference

The following logical map is carried from the migration reference; OpenAPI column verification above is not a fresh constraint audit.

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

## Naming, states and source-of-truth rules

- resellers.name differs from admins.full_name and vpn_customers.full_name. No physical display_name rename has been completed.
- vpn_orders: pending/active/expired/stopped/scheduled. Access state differs from payment review.
- vpn_keys: pending reservation, active or deleted; protocol is the live key fact.
- Payment review: pending_review/confirmed/rejected. Application: pending/applied/failed/reversed. Payment types: initial/extend/renew.
- Production sources include miniapp, dashboard, bot and admin where accepted by the existing route. Messenger is a development addition, not a production source claim.
- Canonical package quota uses quota_limit_bytes and usage_baseline_bytes with key history. Per-key cap is not the package total.
- Confirmed/applied payment entries drive recognized revenue/commission; preserve submitted settlement snapshots.
- reseller_miniapps has defaults for color/trial quota/duration. Explicit null does not invoke a default. Bot tokens and panel passwords remain backend-only.

## Development-only additions (0027–0036)

Verified in development, absent from the production OpenAPI snapshot. Existence here is not production migration/deployment authorization. The shared purchase callers need their migrations even when Messenger is disabled.

## customer_trial_claims

Development-only channel table; see the migration semantics below.

| Column | PostgreSQL type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `reseller_id` | uuid | yes | — |  |
| `customer_id` | uuid | yes | — |  |
| `used_at` | timestamp with time zone | yes | "now()" |  |
| `order_id` | uuid | no | — |  |
| `plan_snapshot` | jsonb | no | — |  |
| `protocol` | text | no | — |  |
| `provision_status` | text | yes | "ready" |  |
| `provision_owner` | uuid | no | — |  |

## messenger_events

Development-only channel table; see the migration semantics below.

| Column | PostgreSQL type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | uuid | yes | "gen_random_uuid()" |  |
| `reseller_id` | uuid | yes | — |  |
| `page_id` | text | yes | — |  |
| `sender_id` | text | yes | — |  |
| `message_id` | text | yes | — |  |
| `payload` | jsonb | yes | — |  |
| `status` | text | yes | "pending" |  |
| `attempts` | integer | yes | 0 |  |
| `lease_owner` | uuid | no | — |  |
| `lease_until` | timestamp with time zone | no | — |  |
| `retry_at` | timestamp with time zone | yes | "now()" |  |
| `created_at` | timestamp with time zone | yes | "now()" |  |
| `updated_at` | timestamp with time zone | yes | "now()" |  |

## messenger_links

Development-only channel table; see the migration semantics below.

| Column | PostgreSQL type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | uuid | yes | "gen_random_uuid()" |  |
| `reseller_id` | uuid | yes | — |  |
| `page_id` | text | yes | — |  |
| `sender_id` | text | yes | — |  |
| `customer_id` | uuid | yes | — |  |
| `last_interaction_at` | timestamp with time zone | yes | "now()" |  |
| `created_at` | timestamp with time zone | yes | "now()" |  |
| `profile_name` | text | no | — |  |
| `profile_checked_at` | timestamp with time zone | no | — |  |
| `profile_applied_name` | text | no | — |  |

## notification_deliveries

Development-only channel table; see the migration semantics below.

| Column | PostgreSQL type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | uuid | yes | "gen_random_uuid()" |  |
| `reseller_id` | uuid | yes | — |  |
| `record_id` | uuid | yes | — |  |
| `event_type` | text | yes | — |  |
| `channel` | text | yes | — |  |
| `recipient_id` | text | yes | — |  |
| `status` | text | yes | "pending" |  |
| `owner_token` | uuid | no | — |  |
| `lease_until` | timestamp with time zone | no | — |  |
| `attempt_count` | integer | yes | 0 |  |
| `next_attempt_at` | timestamp with time zone | yes | "now()" |  |
| `provider_message_id` | text | no | — |  |
| `error_code` | text | no | — |  |
| `created_at` | timestamp with time zone | yes | "now()" |  |
| `updated_at` | timestamp with time zone | yes | "now()" |  |
| `event_key` | text | yes | "" |  |

## purchase_operations

Development-only channel table; see the migration semantics below.

| Column | PostgreSQL type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | uuid | yes | "gen_random_uuid()" |  |
| `reseller_id` | uuid | yes | — |  |
| `customer_id` | uuid | yes | — |  |
| `order_id` | uuid | no | — |  |
| `request_key` | text | yes | — |  |
| `command` | jsonb | yes | — |  |
| `policy` | text | yes | — |  |
| `is_queued` | boolean | yes | false |  |
| `status` | text | yes | "created" |  |
| `lease_owner` | uuid | no | — |  |
| `lease_until` | timestamp with time zone | no | — |  |
| `created_at` | timestamp with time zone | yes | "now()" |  |
| `updated_at` | timestamp with time zone | yes | "now()" |  |

### Development-only RPCs

- `claim_messenger_event`
- `claim_notification_delivery`
- `claim_purchase_execution`
- `claim_trial_provisioning`
- `create_customer_trial`
- `customer_trial_eligibility`
- `decrement_server_usage_atomic`
- `finish_messenger_event`
- `finish_notification_delivery`
- `finish_purchase_execution`
- `finish_trial_provisioning`
- `increment_server_usage_atomic`
- `resolve_messenger_customer`
- `submit_purchase`

### Development migration semantics

- `notification_deliveries`: backend-only delivery ledger. UUID ID, reseller_id,
  record_id (scoped order FK), event_type, channel, recipient_id, event_key,
  status, owner_token, lease_until, attempt_count, next_attempt_at,
  provider_message_id, error_code, created_at, updated_at. Unique identity is
  reseller/event/order/channel/recipient/event_key. Payment event_key is the
  reviewed payment UUID; other events use an empty string.
- Statuses: pending, sending, sent, retryable, uncertain, skipped. A claim leases
  for 60 seconds; expired sending is uncertain, not automatically resent. Only
  explicit retryable failures permit at most three attempts.
- Service-role-only RPCs: `claim_notification_delivery` and
  `finish_notification_delivery`, with owner fencing and reseller validation.
- `enqueue_purchase_admin_notification` trigger records a pending admin alert
  atomically when a customer purchase operation completes (0034).
- `messenger_links` adds profile_name, profile_checked_at, profile_applied_name
  (0032). Profile enrichment caches name-only requests for 24 hours and uses
  compare-and-set customer updates to preserve staff edits.
- `customer_trial_claims`: composite PK reseller_id/customer_id, used_at,
  nullable order_id, plan_snapshot, protocol, provision_status, provision_owner.
  Both customer and order FKs are reseller-scoped. Deleting an order clears its
  reference, never consumed eligibility. RLS enabled; service-role access only.
- Service-role-only trial RPCs: customer_trial_eligibility,
  create_customer_trial, claim_trial_provisioning, finish_trial_provisioning.
  Order creation and claim are atomic; Telegram link fields remain compatibility
  projections. Existing Telegram and trial-order history is backfilled. Trial
  quota/duration are snapshotted from reseller_miniapps; capacity stays trial-only.
- 0035 reapplies reviewed recovery and authorization rules so an earlier 0033
  application does not retain stale retry behavior. Development verification and
  production application are separate gates.
- 0036 corrects the trial-claim record name in create_customer_trial so it cannot
  conflict with the SQL customer alias. This is a function-only forward fix;
  used history, customer records, and order data are unchanged.

### Shared purchases and Messenger (0027–0030)

Applied and tested in development only. Production requires an explicit rollout.

- `vpn_customers.customer_type` additionally accepts `messenger`; identities are
  not automatically linked to Telegram customers.
- `vpn_orders.source` and `order_payments.source` additionally accept `messenger`.
  Migration 0028 preserves existing source whitelists.
- `purchase_operations`: UUID `id`, tenant/customer/order IDs, `request_key`, JSON
  `command`, `policy` (`customer`/`staff`), `is_queued`, `status`
  (`created`/`processing`/`completed`/`recovery_required`), lease owner/expiry and
  timestamps. Unique `(reseller_id,request_key)`. Customer and order references
  include tenant IDs. `order_id` is nullable after 0028: cancellation leaves an
  idempotency tombstone rather than allowing replay to create another order.
- `messenger_links`: UUID ID, reseller/Page/sender/customer IDs, interaction and
  creation timestamps. Unique `(reseller_id,page_id,sender_id)`, tenant-aware
  customer FK. Stores Page-scoped identity, not a Facebook login identity.
- `messenger_events`: UUID ID, reseller/Page/sender/message IDs, JSON payload,
  status (`pending`/`processing`/`completed`/`failed`), attempts, lease fields,
  retry/creation/update timestamps. Unique `(page_id,message_id)`. Durable
  checkpoints live in payload; successful delivery clears that payload.

All three tables have RLS enabled and no anon/authenticated grants. Their RPCs
are `SECURITY DEFINER`, fixed `search_path=public`, service-role-only:
`submit_purchase`, `claim_purchase_execution`, `finish_purchase_execution`,
`resolve_messenger_customer`, `claim_messenger_event`, `finish_messenger_event`.
`submit_purchase` locks the scoped customer and atomically records the order,
payment and operation. External panel provisioning remains in the existing
reservation/concurrency services, outside that transaction. Execution leases
last 15 minutes; ambiguous pending panel keys require operator recovery.
Migration 0029 prevents later events from overtaking an earlier same-sender retry
and treats null review status as unconfirmed. Apply it before enabling purchases.
Migration 0030 preserves staff preparation for inactive customers while still
rejecting customer-initiated checkout for inactive identities.

## Related references

- SYSTEM_DESIGN.md: production architecture and separately labelled local work.
- SKILL_DATABASE.md: tenancy, migration and snapshot rules.
- DEPLOYMENT.md: verified production release process and development migration gates.
- FINAL_DATA_MODEL.md: historical target design with partial implementation status; not permission to drop current fields.
- docs/DOCUMENTATION.md: document authority and stage index.
