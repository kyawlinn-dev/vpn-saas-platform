# NovaNet MM - System Design

NovaNet MM is a multi-tenant VPN reseller platform. One platform owner manages
servers, plans, resellers, and oversight. Each reseller owns a branded Telegram
Mini App workspace and sells Marzneshin-backed VPN access to their customers.

This document describes the current production system. The Marzneshin provider
cutover completed on 2026-10-06: all active Shadowsocks and VLESS access is
managed through Marzneshin/Marznode. Outline Manager API integration and
Outline containers are retired. Historical Outline database rows remain only
where required to preserve foreign-key and order history.

## Tenancy Model

```text
ADMIN
  controls servers, plans, resellers, enable/disable, oversight
  also configures each reseller's Telegram bot, miniapp_slug, brand
  logo/color, and trial settings (reseller sees bot status read-only)
       |
       v
RESELLER
  owns brand name, support contact, payment info
       |
       v
MINI APP
  runtime slug comes from Telegram start_param
       |
       v
CUSTOMER
  trial, buy, pay, receive key, connect through a supported client
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
| `vpn_servers` | Marzneshin node/service assignments and capacity |
| `vpn_plans` | Shared plan catalogue |
| `vpn_customers` | Customers scoped to resellers |
| `telegram_links` | Telegram user to customer links |
| `vpn_orders` | Subscription periods and payment review state |
| `order_payments` | Payment ledger and source of truth for gross paid, commission, and platform due |
| `vpn_keys` | Active/historical VPN credentials and protocol |
| `commission_ledger` | Reseller commission records |
| `monthly_settlements` | Month-end reseller transfer snapshots and platform-owner confirmation |
| `access_tokens` | Retired token portal data; not exposed by public routes |
| `token_server_assignments` | Retired token portal data; not exposed by public routes |

Customer access is centered on `vpn_customers.ssconf_token` and
`/k/:ssconf_token.json`. The old token portal route surface is retired; token
tables remain only until the provisioning internals can be migrated safely.

## Locked Product Decisions

### Immediate Key Delivery

Initial Mini App purchases create access immediately. Resellers review payment
screenshots afterward and can confirm or reject. A purchase made during an
active paid package is queued without a new key until the current package ends.

Money is ledger-driven: each payment/recharge is stored in `order_payments`.
For confirmed and applied payments, reseller commission is calculated from the
actual paid amount, not only from the plan price.

Package lifecycle:

- Initial purchase creates a `vpn_orders` subscription container and an
  `order_payments` row with `payment_type = initial`.
- Extend creates a separate `vpn_orders` purchase in `scheduled` state with an
  `order_payments` row of `payment_type = extend`. The old key and remaining
  allowance are untouched. The scheduled plan starts with fresh dates, quota,
  and keys when the active plan ends by time or data. At most one scheduled
  purchase per customer/reseller is allowed. Customer-initiated payments remain
  pending review until the reseller confirms them.
- Renew is a new package event for stopped or expired subscriptions. It creates
  an `order_payments` row with `payment_type = renew`, then provisions or
  reactivates customer access.

`vpn_orders` keeps the current subscription snapshot for fast dashboards.
`order_payments` is the source of truth for accounting, monthly settlement, and
commission history.

Package quota is database-authoritative. `vpn_orders.quota_limit_bytes`
snapshots the current package allowance and `usage_baseline_bytes` records any
lifetime key usage that predates that package period. The canonical backend
quota service sums immutable active/deleted `vpn_keys.used_bytes`, subtracts
the baseline, and returns one `quota` object to the Mini App, bot, reseller
dashboard, admin dashboard, warning job, and auto-stop job. Clients must not
recalculate package usage from an individual key or the mutable plan catalogue.
Marzneshin enforces the resulting remaining allowance for the active user.

The customer chooses Shadowsocks or VLESS before Mini App checkout. The active
`vpn_keys.protocol` describes the current access; `protocol_preference` is only
the intent for future provisioning. Shadowsocks uses a per-server key and
supports switching locations. A VLESS subscription includes its configured
nodes; customers choose the node in their VPN client. All active access is
managed by Marzneshin. Historical Outline server rows remain for order and key
history, without API credentials or selectable capacity. The `outline_key_id`
column stores Marzneshin usernames on active keys; do not drop it. New
provisioning always selects Marzneshin.

Every new Marzneshin user has `expire_strategy = fixed_date` and an expiry at
the start of the day after `vpn_orders.expiry_date` in Asia/Bangkok. The panel
therefore enforces the same inclusive expiry day as the backend and publishes
an expiry timestamp in the subscription metadata. Extending an existing order
updates its panel user deadline along with the traffic limit. Trial VLESS
users receive the trial-only service IDs, never the global premium service.

### Trial vs Premium Server Capacity

`vpn_servers.server_tier` separates trial and paid capacity:

- `trial` servers are used only for free trial orders.
- `premium` servers are used for paid purchases, renewals, and paid-order
  migration during decommissioning.

This prevents trial users from consuming premium server slots. Existing servers
default to `premium` until an admin explicitly marks one as `trial`.

**Exception (2026-08-16):** the restriction is one-directional. A trial order
can never use a `premium` server, but a paid order MAY be manually moved onto
a `trial` server — both via the Mini App's server list (customer self-service)
and via the reseller-initiated switch feature below. Trial servers are
lightly loaded, so this gives paid customers emergency overflow capacity
without an admin having to relabel a server's tier. New paid provisioning
(purchase/renew/premium migration) still defaults to `premium` servers only —
this exception applies to manual switching, not default provisioning.

### Reseller-Initiated Server Switching (2026-08-23)

Resellers can view which server each active paid order is connected to and
manually move it to a different one from the dashboard — e.g. when a customer
reports their current server is unreachable. Scope:

- Paid orders only (`order_type != trial`); trial customers stay on trial
  servers via the normal Mini App flow, not this feature.
- Any active, healthy server with spare capacity is eligible — any tier
  (including trial, per the exception above), any region. No rate limit, no
  automatic customer notification; the reseller handles communication.
- The switch provisions a new key first, then retires the old one — the
  customer's `ssconf_token`/dynamic access URL never changes, so nothing
  needs to be resent to the customer.

See `SKILL_API_CONTRACTS.md` for the endpoint contract
(`GET/POST /api/reseller/orders/:orderId/eligible-servers` /
`/switch-server`).

### Runtime Mini App Slug

Production must resolve the workspace slug from Telegram WebApp
`initDataUnsafe.start_param`. `VITE_MINIAPP_SLUG` is local fallback only.

### Multi-Tenant Bot Runtime

The backend runs one bot manager inside the PM2 backend process. It loads all
configured reseller bot tokens from `reseller_miniapps`, registers Telegram
webhooks, and carries `reseller_id` through handlers.

Each bot advertises `/start`, `/app`, `/key`, `/balance`, `/buy`, and `/help`;
`/trial` is advertised only when that reseller enables trials. Commands reuse
the inline bot flows. The chat menu button opens the command list; `/app` and
inline WebApp buttons open the reseller-specific Mini App. Existing per-chat
WebApp menu buttons are changed to commands when the customer next uses
`/start` or another command. Customer actions other than `/app` and `/help`
require the customer to have linked their account with `/start` first.

Bot webhook updates are accepted only when Telegram sends the registered
`X-Telegram-Bot-Api-Secret-Token`.

### Backend-Hosted Shadowsocks Bridge

The backend serves `/k/:ssconf_token.json` and `/open-key` for Shadowsocks
subscriptions from the Droplet. VLESS uses its panel subscription URL.
The old Cloudflare Worker and legacy token portal routes are retired.

## Current Built State

Built:

- Multi-tenant database model
- Runtime Mini App slug resolution
- Mini App auth, workspace config, plans, servers, buy/payment flow
- Immediate paid/trial key delivery
- Customer ssconf endpoint at `/k/:ssconf_token.json`
- Server switch flow — customer self-service (Mini App server list/link) AND
  reseller-initiated (dashboard, paid orders only, any tier/region — see
  "Reseller-Initiated Server Switching" above)
- Reseller workspace settings
- Multi-tenant backend bot manager
- Admin dashboard control layer for resellers, plans, servers, orders
- Droplet Ansible provisioning, backend deploy, Nginx, SSL
- Droplet Mini App deploy playbook

Remaining important work:

- Keep Supabase migrations aligned with live schema
- Verify production migrations against the live schema before each release
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
