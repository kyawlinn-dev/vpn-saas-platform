# NovaNet MM - System Design

## LightNode Provider Integration (2026-11-01, DEV Source)

LightNode uses the same queue, leases, protected-resource registry, global VLESS
pool, per-dual-node SS services and customer migration workflow as DO/Vultr.
Its provider boundary handles asynchronous create/release receipts and discovers
all API regions with compatible packages and root Ubuntu images automatically.
The API does not return monetary prices: quotes retain a null amount, explicitly
label provider billing, and require confirmation without a regional price gate.
Traffic and bandwidth specifications come from the API, never console estimates.
A token fingerprint and exact protected instance anchor support an
operator-attested connection ID; this is not a provider-returned account UUID.

Its explicit first-contact TOFU policy observes and saves the host key before
authentication, then installs/verifies infrastructure key login and disables
password authentication. Every subsequent session pins that key. Existing
DO/Vultr cloud-init pre-pinning is unchanged. Cloud firewall creation/rule
inspection is undocumented; LightNode verifies host UFW instead. Durable
task/resource receipts prevent duplicate submission after uncertain responses.
Instance-package billing evidence does not audit detached external resources.
See `docs/runbooks/lightnode-automation.md` for supported boundaries and manual
acceptance. Existing protected live mirrors stay protected.

## Telegram Presentation Configuration (2026-10-29, DEV Source)

Approved wording lives in `backend/src/bot/contentDefaults.js` (44 reviewed
entries over the baseline catalogue). Messages, button labels, command descriptions
and callback identifiers are code-owned. Historical reseller text overrides stay
stored for history but are ignored by runtime snapshots.

Reseller Bot Links configures two optional HTTPS guide URLs (Outline and
Happ/Hiddify/V2Box). Filled guide URLs create direct Telegram URL buttons; blank
guide URLs use existing in-chat instructions. Downloads always use the built-in
device menus and app URLs, including Outline. Historical download-post overrides
are ignored and cannot be edited.
Both guides are always offered, without looking up the customer's protocol.
Old inline callbacks remain compatible with the current link configuration.

The existing private reseller_bot_content table and authenticated bot-content
API are reused, with a server-side two-key guide allowlist for reads and mutations.
Telegraf reads one URL snapshot per update and binds it with AsyncLocalStorage;
parallel tenants cannot share mutable settings. Saves/clears affect the next
interaction without rewriting messages or restarting bots. Notifications retain
their existing settings/editor. Trial, quota, expiry, payment, provisioning and
server-access policies are unchanged. Existing 0058 is sufficient; this refactor
requires no new migration or production deployment.

## Fixed-IP DEV Execution (2026-10-28)

Local development may use SERVER_OPERATIONS_EXECUTION_MODE=remote. Existing
admin-authenticated operation requests are sent over pinned SSH to a standalone,
loopback-only DEV runner on the existing fixed-IP host. The runner uses the same
scoped database operation queue, quotes, idempotency and fenced adapters; no
second lifecycle engine or public management API is introduced. Customer mutation
coordination remains enabled locally. Local provider construction/worker startup
is disabled and there is no connection-loss fallback. The separate account,
directory, environment and service do not run any customer/bot jobs or replace
the production backend. Stable runner/panel sources are used in DEV firewall
profiles and new-node UFW, removing laptop public-IP churn from the workflow.

## Recycled Panel IDs (2026-10-28)

Panel numeric IDs identify a current incarnation, not permanent ownership.
Deletion records an encrypted subtree manifest, verifies remote absence and
archives exact receipts under the current fence. Original receipts remain as
readable tombstones until the deleting operation completes or is safely
cancelled. Only then may an explicit new registration reuse an archived numeric
ID. Current server uniqueness excludes inactive decommissioned history, while
operation/provider receipts remain mandatory for candidate registration.
Private-service cleanup compares its saved candidate receipts before mutation;
an old candidate cannot delete a newer service that happens to reuse its ID.
Audit history is append-only. Historical stale receipts are reconciled through
an owner-reviewed, environment-bounded maintenance transaction, never blanket
deletion or an automatic data-changing migration.

## Selection-Only Server Maintenance (2026-10-28)

An accepted replacement or retirement locks its source before provisioning starts.
Customer selection derives `under_maintenance` from that scoped durable lock and
operation source, excluding it from purchase/trial assignment and bot/dashboard
switch choices. The Mini App and admin inventory show Under Maintenance. Paused
or blocked operations retain the restriction. Listener, service membership and
existing connections are left unchanged until the verified migration/cutover.
Guarded terminal reconciliation releases maintenance; no separate mutable flag
can be left behind. Existing customer mutation locks remain the authoritative
concurrency protection. Destination locks are not mislabelled as retirement.
Cached Happ configurations can still connect before cutover; this is selection
control rather than a firewall or forced disconnection.

## Customer Expiry Cutoff (2026-10-28)

An order labelled with expiry date D remains valid until D+1 at 04:00 Myanmar
time (Asia/Yangon), equivalent to D at 21:30 UTC and D+1 at 04:30 Bangkok.
Quota exhaustion may end access earlier. Calendar/accounting and plan start-date
calculations remain unchanged. A shared `orderExpiryAt` helper supplies panel
fixed deadlines; `accessDateOnly` supplies date-filter thresholds during the
overnight grace. Client deadline displays must distinguish this actual instant
from the stored date label. Scheduled expiry and queued promotion must not run
at Bangkok midnight during grace. Expiry reminders use daytime delivery; expired
notices wait until the morning after the actual deadline, not the labelled day.

Replacement/retirement relocate unchanged active records even if their deadline
has passed while the expiry sweep is waiting. This is not renewal: credentials,
quota, usage, expiry and enabled state remain unchanged. Inactive panel
subscriptions may use placeholders; verification authenticates their original
subscription through its info endpoint and checks actual service/inbound
membership, source absence and destination presence where applicable. Active
subscriptions retain exact endpoint checks. Expired Outline links may remain
HTTP 410; unrelated transport/authentication failures never count as success.
The normal expiry/queue saga resumes after infrastructure locks are released.


## VLESS-Only Retire Action (2026-10-27)

VLESS-only nodes expose Retire Server, without an operator-selected destination.
The backend fixes a same-pool healthy compatible fallback in the reviewed quote
for database key/token anchors. Users retain their global VLESS membership,
credentials, subscription URLs, quota and expiry. The existing fenced retirement
workflow detaches only the source inbound/host, verifies remaining access and
permanent links, then deletes source-owned panel/provider resources. It cannot
retire the last eligible node. Dual nodes still expose Move and Retire with an
explicit SS destination. No additional persisted operation kind is introduced.


## Server Presentation Update (2026-10-27)

`vpn_servers.name` is the public location/ordinal label (for example Singapore #4),
not a provider resource identifier. Geography stays in the existing display fields.
The shared backend formatter preserves ordinals across Telegram, Messenger,
Mini App and dashboard server selection. Infrastructure registration uses the
fenced 0053 RPC to serialize city numbering, including historical names, before
finalizing panel labels. Bound immutable IDs, not mutable names, identify resources
on recovery. VLESS/SS subscription hosts use a leading country flag plus the public
name; infrastructure IDs remain in admin technical details. Subscription branding
is an operator-managed panel setting, not hardcoded into reseller application logic.

## DEV Service Topology Update (2026-10-27)

The enabled public-access/lifecycle model uses one permanent global VLESS service
per environment/pool, containing VLESS inbounds from both VLESS-only and dual
nodes. SS remains one dedicated service per SS-capable node with single-server
customer selection. A VLESS-only addition creates no permanent service; a dual
addition creates only one permanent SS service.

Unpublished candidates use a temporary private VLESS service for isolated tunnel
verification. After verified global membership, publication removes that service
and its host filter before publishing database readiness. Zero users and scoped
ownership are mandatory; cleanup does not delete users or edit the global service.
Retries and existing-node checks use global membership when the private service
is absent. Replacement/retirement detach only the selected global inbounds.
Historical receipts remain immutable. Legacy production service topology is not
migrated by these source changes.

NovaNet MM is a multi-tenant VPN reseller platform. One platform owner manages
servers, plans, resellers, and oversight. Each reseller owns a branded Telegram
Mini App workspace and sells Marzneshin-backed VPN access to their customers.

This document describes production, with explicitly labelled development work
below. State reviewed 2026-10-15; see `docs/DOCUMENTATION.md` for document authority.
The Marzneshin provider
cutover completed on 2026-10-06: all active Shadowsocks and VLESS access is
managed through Marzneshin/Marznode. Outline Manager API integration and
Outline containers are retired. Historical Outline database rows remain only
where required to preserve foreign-key and order history.

## Tenancy Model

### Local Public-Access Lifecycle Work (Not Deployed)

The approved target is one public pool per environment/panel. Dual nodes support
Shadowsocks and VLESS; VLESS-only nodes never appear as Outline destinations.
Outline retains one selected server. VLESS uses the verified pool service. Trial
and paid access share public nodes without resetting trial claims, quota or dates.
VIP is outside this release. Legacy tier/service behavior remains the default:
`PUBLIC_SERVER_ACCESS_ENABLED` is false unless explicitly enabled.

Local implementation resolves explicit database, panel, environment and pool
identities. Existing rows remain unadopted/protected. Sharing a panel does not
authorize DEV to mutate production resources. Adoption requires a reviewed,
hashed manifest and independent registry evidence for nodes, providers, services
and users, with protected resources listed explicitly. Names/IPs are not proof.
Mock adoption supports compare-before-write metadata updates and checkpointed
in-place active-trial service migration. The CLI cannot apply live changes yet.
No public rollout or server-operation worker is enabled by these source changes.

Owner-authorized shared-node DEV access uses dedicated DEV services on verified
live inbounds. Provisioning startup accepts these VLESS members only when the
protected DEV access record and protected server registry entry agree on scope,
manifest, protocols, node ID and address, and the panel confirms the binding.
It does not register the node/inbound/cloud resource as DEV-owned or grant
lifecycle mutation authority. Newly provisioned DEV resources retain the normal
ownership checks. This setup is distinct from production rollout or adoption.

Move-and-retire may use an explicitly adopted shared DEV access row as its
destination without adopting its live provider/node/inbounds. This is a narrow
destination-only permission; source drain and deletion still require full
lifecycle ownership. Existing shared hosts must already be in the DEV global
service, and SS users move into the verified dedicated DEV SS service. No shared
host configuration or production service membership is rewritten. Move-and-retire
verifies existing destination node health, scoped service/inbound/host bindings
and migrated permanent links through the panel/API. It does not require a third
node, SSH or temporary tunnel-test users. Fresh tunnel verification remains
mandatory for Add Server and provision-new replacement operations. Legacy
inbound-inherited ports and Reality settings are resolved without changing panel
configuration. The UI uses
Review Migration (no provider pricing), retaining expiring approval and explicit
source-deletion confirmation.

Lifecycle source includes connected provider/catalogue transports, strict SSH
installation, panel adapters and protocol probes, encrypted checkpoints, in-place
migration, repeated destructive gates and dashboard recovery. Owner-enabled startup
composes a live runtime only after verifying database bindings, authenticated
provider/panel identities and service ownership. Defaults remain off. SQL 0040-0049
is not applied to Supabase by the agent; offline tests and PostgreSQL WASM checks
do not replace the owner-run VPS/phone canary. Use the existing development
Supabase; no empty database is required. See
`docs/testing/server-access-lifecycle-local.md` for setup and acceptance.

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

Production schema: `daenwuszqdfkbjiatsjs`. Development schema:
`huqmzvlzfcexycdrsxpn`. `SCHEMA.md` separates their verified objects.
Telegram, Mini App and dashboards share production order/payment/key state.
Shared purchase operations, Messenger, durable channel delivery and customer-wide
trial claims described next are implemented in the local development checkout,
not deployed production capabilities.

### Development-only channel additions (0027–0036)

Channel adapters share purchase admin alerts, customer review results, and trial
eligibility. Payment results dispatch from order lifecycle immediately; the
scheduled job is recovery/reminder selection, not the primary review-delivery
path. Private notification delivery claims prevent simultaneous sends and retain
ambiguous provider outcomes for reconciliation. Admin receipt alerts remain
Telegram-based irrespective of customer purchase channel.

Messenger trials require Start Free Trial; Page messages never auto-provision.
Customer-scoped claims preserve existing Telegram history and serialize trial
provisioning. Unlinked accounts are not assumed to belong to the same person.
Messenger reminders use the standard response window; no human-agent tag is
used to extend automation. Profile enrichment stores display names, not legal
identity, and cannot overwrite staff-entered names.

### Production core model

The current production schema and development additions are documented separately
in `SCHEMA.md`. Production payment review still includes scheduled Telegram
notification recovery; the new immediate shared lifecycle delivery is local work.

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
Successful confirmation of a queued purchase records received money, commission
and platform due while access remains scheduled. Payment `apply_status = applied`
means the purchase payment is recorded; it does not mean VPN access has started.
Once the current package stops or expires, the confirmed queued package starts
automatically without another charge or a second revenue entry.

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

### Shared Purchase Boundary

**Stage: implemented locally, not deployed to production (2026-10-15).**
Do not release these callers without the separately verified migrations and
production authorization in `DEPLOYMENT.md`.

Telegram, Mini App, Messenger and reseller-dashboard purchase creation normalize
input into `services/purchaseService.js`. Adapters supply trusted actor/channel
context, authenticate callers, validate receipt ownership and render responses.
The shared operation owns server-derived pricing, caller policies, atomic
order/payment creation, durable idempotency, queue eligibility and existing
panel provisioning. Customer checkout and staff creation deliberately retain
different activation/payment rules. Review, renewal, stop and adjustments remain
in the existing shared lifecycle service, not a second Messenger business layer.

Messenger accepts signed raw-byte webhooks into a durable inbox before returning
200. Its worker owns delivery leases and checkpointed checkout state; Redis
holds temporary conversational sessions and non-expiring fail-closed switch
guards. Page/reseller binding is explicit,
and Telegram accounts are not merged. `MESSENGER_PURCHASES_ENABLED` gates this
runtime; Meta public access remains a separate review/publishing step.

- Small reversible changes.
- Do not run production deploy commands unless explicitly asked.
- Keep deployment docs aligned with reality.
- Scope reseller data by `reseller_id`.
- Keep service-role keys backend-only.
- Preserve current customer access when retiring legacy paths.

## Dashboard purchase simplification — implementation branch, pending release

The approved display-consistency release also adds owner-approved migration 0037
for durable dashboard purchase replay and setup ownership. Paid manual purchases
start automatically without current paid access or become the next queue. Unpaid
purchases wait; confirmation starts/queues the same purchase. Payment is recorded
before provider calls, so failure retains received money and shows Retry setup.
An exclusive persisted per-customer setup owner prevents concurrent cleanup.
A crashed running attempt needs reconciliation; there is no timeout-only takeover.
Trials and Telegram policy remain as described above. Older dashboard clients
without the request key retain manual creation compatibility during rollout.
See SCHEMA.md and SKILL_API_CONTRACTS.md for staged contracts and prerequisites.

## Server Management Provider Boundary

DigitalOcean and Vultr expose normalized live region/plan snapshots through an
admin-only catalogue. Operator policies restrict purchases without embedding
Singapore-only choices in the UI. Provider readiness is independent; global
environment/DB/pool/panel authority still fails closed. Purchase readiness is
separate from recovery eligibility so a missing bootstrap prerequisite does not
prevent reconciliation of an already billable resource.

Owned node lifecycle remains fenced and resumable. Shared DEV global-service
members are verified read-only exposure dependencies, not owned nodes. Existing
infrastructure can be explicitly inspected and hash-approved for atomic DB
adoption; it is never inferred from names or silently relabelled from production.
See docs/testing/server-management-operator-guide.md and the release matrix for
manual acceptance and remaining deployment gates.
