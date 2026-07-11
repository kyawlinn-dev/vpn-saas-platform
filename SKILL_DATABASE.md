# SKILL_DATABASE.md

## Skill Name

NovaNet MM — Supabase Database Skill

## Use This Skill When

Designing or changing the Supabase schema, writing migration SQL, seeding data, adding columns, changing enums, or reasoning about reseller isolation at the data layer.

## Required Context

Read before making schema decisions:

- `SCHEMA.md` — authoritative column reference (auto-generated from live Supabase)
- `SYSTEM_DESIGN.md` — tenancy model and data isolation rules
- `backend/supabase/migrations/` — version-controlled schema history

## Database Setup (New Project)

1. Create a new Supabase project at supabase.com.
2. Run `backend/supabase/migrations/0001_initial_schema.sql` in the SQL Editor.
3. Create auth users (admin + first reseller) via Authentication → Users.
4. Replace UUID placeholders in `backend/supabase/seed.sql` and run it.
5. Update `backend/.env` with the new project URL and service-role key.

## Tables

| Table | Role |
|-------|------|
| `resellers` | Tenants; one row per reseller business |
| `admins` | Platform owner accounts |
| `reseller_miniapps` | Per-reseller Mini App config (slug, brand, bot, payments) |
| `vpn_servers` | Outline servers; Outline API URL + cert per row |
| `vpn_plans` | Subscription catalogue shared across resellers |
| `vpn_orders` | A customer's subscription period |
| `vpn_keys` | Active/historical Outline VPN keys |
| `vpn_customers` | End customers, scoped to a reseller |
| `telegram_links` | Maps Telegram user ID → vpn_customer per reseller |
| `commission_ledger` | Reseller earnings per paid order |
| `access_tokens` | Legacy tok_xxx portal (retire when worker is removed) |
| `token_server_assignments` | Legacy tok_xxx portal (retire with access_tokens) |

## Column Name Traps

These three tables use different name columns — this has caused bugs:

| Table | Column |
|-------|--------|
| `resellers` | `name` |
| `admins` | `full_name` |
| `vpn_customers` | `full_name` |

## Enum Values (stored as plain text — no DB constraint)

| Table.column | Values |
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

## Reseller Isolation Rule

Every record that belongs to a reseller carries `reseller_id`. All queries in backend services MUST include a `reseller_id` filter when the operation is reseller-scoped. Admin routes intentionally omit the filter (cross-reseller oversight). Violation: a customer of reseller A must never see or touch reseller B's data.

## reseller_miniapps INSERT Rule

`primary_color`, `trial_data_limit_gb`, and `trial_duration_days` are NOT NULL with DB defaults. Passing explicit `null` overrides the default and causes a NOT NULL violation. Always supply values — never `null`.

## Migration Conventions

- Files go in `backend/supabase/migrations/`.
- Name format: `NNNN_description.sql` (e.g. `0002_add_ssconf_token.sql`).
- Each migration is idempotent where possible (`create table if not exists`, `alter table … add column if not exists`).
- Never modify `0001_initial_schema.sql` after it has been applied to a live project — write a new migration instead.

## Seed Rules

- Seed goes in `backend/supabase/seed.sql`.
- Use fixed UUIDs for seed rows so the seed is idempotent (`insert … on conflict do nothing`).
- Auth users (admin, reseller) must be created via Supabase Auth first; paste their UUIDs into seed.sql.
- Seed must include: 1 admin, 1 reseller + miniapp, 2 servers, 4 plans (1 trial + 3 paid).
- Use fake names, contacts, and `outline_api_url` values — never real credentials in seed data.
