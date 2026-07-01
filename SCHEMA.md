# NovaNet MM — Database Schema Reference

**Source:** Live Supabase project (`huqmzvlzfcexycdrsxpn`), queried via PostgREST OpenAPI spec.  
**Last updated:** 2026-07-01

> **NOT NULL semantics:** The `Required` column below means the column is `NOT NULL` in Postgres.  
> Many required columns have server-side defaults (UUIDs, timestamps, booleans) — they don't need to be  
> supplied in INSERTs. Columns marked `NOT NULL · no default` **must** be supplied explicitly.

---

## Tables

- [access\_tokens](#access_tokens)
- [admins](#admins)
- [commission\_ledger](#commission_ledger)
- [reseller\_miniapps](#reseller_miniapps)
- [resellers](#resellers)
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

## reseller_miniapps

One row per reseller — configures the Telegram Mini App experience for that reseller's customers. The `miniapp_slug` is the URL identifier.

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

Outline VPN servers (DigitalOcean droplets). Provisioned automatically or added manually.

| Column | Type | NOT NULL | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | ✓ | gen_random_uuid() | PK |
| `name` | text | ✓ | — | |
| `provider` | text | ✓ | — | `digitalocean` |
| `region` | text | ✓ | — | e.g. `sgp1` |
| `region_code` | text | | — | Display code e.g. `SG` |
| `droplet_id` | bigint | | — | DigitalOcean droplet ID |
| `host_ip` | text | | — | |
| `outline_api_url` | text | | — | Management API URL (includes path + secret) |
| `outline_cert_sha256` | text | | — | TLS cert fingerprint for pinning |
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

| Column | References |
|--------|-----------|
| `access_tokens.customer_id` | `vpn_customers.id` |
| `access_tokens.reseller_id` | `resellers.id` |
| `access_tokens.order_id` | `vpn_orders.id` |
| `admins.supabase_user_id` | `auth.users.id` (Supabase auth) |
| `commission_ledger.order_id` | `vpn_orders.id` |
| `commission_ledger.reseller_id` | `resellers.id` |
| `reseller_miniapps.reseller_id` | `resellers.id` |
| `resellers.supabase_user_id` | `auth.users.id` (Supabase auth) |
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

These are stored as plain `text` with no DB-level enum constraint:

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
| `vpn_servers.provider` | `digitalocean` |
