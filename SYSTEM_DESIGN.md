# NovaNet MM - System Design

NovaNet MM is a multi-tenant VPN reseller platform. One platform owner manages
servers, plans, resellers, and oversight. Each reseller owns a branded Telegram
Mini App workspace and sells Outline VPN access to their own customers.

## Tenancy Model

```text
ADMIN
  controls servers, plans, resellers, enable/disable, oversight
       |
       v
RESELLER
  owns miniapp_slug, brand, bot token, payment info
       |
       v
MINI APP
  runtime slug comes from Telegram start_param
       |
       v
CUSTOMER
  trial, buy, pay, receive key, connect through Outline
```

Every reseller-owned record must be scoped by `reseller_id`. A customer of
reseller A must never see or modify reseller B's data.

## Production Architecture

Customer-facing production traffic avoids Cloudflare-hosted runtimes.

```text
api.novanetmm.com
  -> DigitalOcean Droplet
  -> Nginx
  -> PM2 backend process on 127.0.0.1:3000

app.novanetmm.com
  -> DigitalOcean Droplet
  -> Nginx
  -> /var/www/miniapp static build
```

Admin and reseller dashboards still deploy to Cloudflare Pages. Backend and Mini
App production deploys are manual Ansible playbooks. See `DEPLOYMENT.md`.

Retired production paths:

- DO App Platform backend
- Cloudflare Worker token portal
- Cloudflare Pages Mini App deployment

## Data Model

The live schema is documented in `SCHEMA.md`.

Core tables:

| Table | Role |
|---|---|
| `admins` | Platform owner accounts |
| `resellers` | Tenants |
| `reseller_miniapps` | Per-reseller Mini App/bot/brand/payment config |
| `vpn_servers` | Outline servers and capacity |
| `vpn_plans` | Shared plan catalogue |
| `vpn_customers` | Customers scoped to resellers |
| `telegram_links` | Telegram user to customer links |
| `vpn_orders` | Subscription periods and payment review state |
| `order_payments` | Payment ledger and source of truth for gross paid, commission, and platform due |
| `vpn_keys` | Active/historical Outline keys |
| `commission_ledger` | Reseller commission records |
| `monthly_settlements` | Month-end reseller transfer snapshots and platform-owner confirmation |
| `access_tokens` | Retired token portal data; not exposed by public routes |
| `token_server_assignments` | Retired token portal data; not exposed by public routes |

Customer access is centered on `vpn_customers.ssconf_token` and
`/k/:ssconf_token.json`. The old token portal route surface is retired; token
tables remain only until the provisioning internals can be migrated safely.

## Locked Product Decisions

### Immediate Key Delivery

Mini App purchases create access immediately. Resellers review payment
screenshots afterward and can confirm or reject.

Money is ledger-driven: each payment/recharge is stored in `order_payments`.
For confirmed and applied payments, reseller commission is calculated from the
actual paid amount, not only from the plan price.

Package lifecycle:

- Initial purchase creates a `vpn_orders` subscription container and an
  `order_payments` row with `payment_type = initial`.
- Extend is a top-up on an active subscription. It creates an
  `order_payments` row with `payment_type = extend`, then adds the bought plan's
  duration and data limit to the existing active key. Dashboard/admin trusted
  actions apply immediately; Mini App customer top-ups stay pending until the
  reseller confirms the screenshot.
- Renew is a new package event for stopped or expired subscriptions. It creates
  an `order_payments` row with `payment_type = renew`, then provisions or
  reactivates customer access.

`vpn_orders` keeps the current subscription snapshot for fast dashboards.
`order_payments` is the source of truth for accounting, monthly settlement, and
commission history.

### Trial vs Premium Server Capacity

`vpn_servers.server_tier` separates trial and paid capacity:

- `trial` servers are used only for free trial orders.
- `premium` servers are used for paid purchases, renewals, and paid-order
  migration during decommissioning.

This prevents trial users from consuming premium server slots. Existing servers
default to `premium` until an admin explicitly marks one as `trial`.

### Runtime Mini App Slug

Production must resolve the workspace slug from Telegram WebApp
`initDataUnsafe.start_param`. `VITE_MINIAPP_SLUG` is local fallback only.

### Multi-Tenant Bot Runtime

The backend runs one bot manager inside the PM2 backend process. It loads all
configured reseller bot tokens from `reseller_miniapps`, registers Telegram
webhooks, and carries `reseller_id` through handlers.

Bot webhook updates are accepted only when Telegram sends the registered
`X-Telegram-Bot-Api-Secret-Token`.

### Backend-Hosted Outline Bridge

The backend serves `/k/:ssconf_token.json` and `/open-key` from the Droplet.
The old Cloudflare Worker and legacy token portal routes are retired.

## Current Built State

Built:

- Multi-tenant database model
- Runtime Mini App slug resolution
- Mini App auth, workspace config, plans, servers, buy/payment flow
- Immediate paid/trial key delivery
- Customer ssconf endpoint at `/k/:ssconf_token.json`
- Server switch flow
- Reseller workspace settings
- Multi-tenant backend bot manager
- Admin dashboard control layer for resellers, plans, servers, orders
- Droplet Ansible provisioning, backend deploy, Nginx, SSL
- Droplet Mini App deploy playbook

Remaining important work:

- Keep Supabase migrations aligned with live schema
- Add/verify DB constraint for duplicate active purchase prevention
- Remove legacy token-table dependence from provisioning internals
- Ansible Vault scaffold is in place (`ansible/env.yml`,
  `ansible/group_vars/novanet/vault.yml.example`); still needs someone to run
  `ansible-vault encrypt` on a real `group_vars/novanet/vault.yml` and adopt
  `env.yml` as the way secrets reach the Droplet
- Decide whether dashboards should also move off Cloudflare if reseller/admin
  access from customer networks becomes a problem

## Environment Strategy

Local env files are developer-only and ignored by Git.

Production backend env lives on the Droplet:

```text
/var/www/novanet/backend/.env.production
```

The backend remains compatible with the existing Droplet `.env` during
migration. Mini App production build env lives at:

```text
/var/www/novanet/miniapp-source/.env.production
```

Committed env files are examples only and must not contain live secrets.

## Engineering Principles

- Small reversible changes.
- Do not run production deploy commands unless explicitly asked.
- Keep deployment docs aligned with reality.
- Scope reseller data by `reseller_id`.
- Keep service-role keys backend-only.
- Preserve current customer access when retiring legacy paths.
