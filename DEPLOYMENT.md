# NovaNet MM Deployment

This repository is aligned around the current production shape:

- Backend API and multi-tenant Telegram bot: DigitalOcean Droplet, PM2, Nginx
- Telegram Mini App: static Vite build served by Nginx from the same Droplet
- Admin dashboard: Cloudflare Pages
- Reseller dashboard: Cloudflare Pages
- Database: Supabase
- VPN nodes: production backend still manages Outline keys; Marznode/Xray is
  installed alongside Outline and tested, but the backend/database cutover is pending

Do not use DO App Platform or Cloudflare Workers for customer-facing production
traffic. Those paths were retired because customer networks may block Cloudflare
IPs.

## Provider Coexistence Gate

The `feature/marzneshin` branch is **not** a drop-in backend deployment over the
current Outline production database. Existing active keys store Outline `ss://`
URLs and numeric Outline key IDs. The dual-provider backend identifies their
provider from the server row and keeps their configuration delivery, usage
sync, and stop operations on Outline. Applying schema migrations alone does
not convert keys, and this release must not bulk-convert them.

Before deploying the new backend, follow `PROVIDER_COEXISTENCE_RUNBOOK.md`:
verify the production schema, restore-test a database backup, rehearse the
migrations on production-shaped data, and verify existing Outline access and
new-provider canary behavior. Keep Outline running until its last active key
is retired. Do not copy encrypted panel-password
values from the development database: its `BOT_TOKEN_ENCRYPTION_KEY` differs
from production. Encrypt panel credentials with the production key and verify
all production server rows have their intended service IDs and tier.

Local `.env.local` and production `.env.production` use different Supabase
projects. The backend loads `.env` first, then `.env.production` when PM2 sets
`NODE_ENV=production`; `.env.local` is never loaded in production. Panel admin
credentials in `MARZNESHIN_PANEL_*` are for one-off operator scripts; normal
backend requests use per-server encrypted credentials stored in `vpn_servers`.

| Concern | Local development | Production cutover |
|---|---|---|
| Database | Development Supabase project | Production Supabase project; migrate and verify separately |
| Encryption | Local `BOT_TOKEN_ENCRYPTION_KEY` | Keep the existing production key; re-encrypt any imported panel credential with it |
| Backend URLs | Local/ngrok URLs | `api.novanetmm.com`, `app.novanetmm.com`, and production dashboard origins |
| Mini App build | `miniapp/.env.local` | Droplet `miniapp-source/.env.production`; Vite values are baked at build time |
| Bot/webhooks | Development bot and tunnel | Existing production bot tokens and `WEBHOOK_BASE_URL` |
| Panel | Development DB points at the shared live `panel.novanetmm.com` | Same panel by operator choice; keep test users distinct and verify trial-only service IDs before provisioning |

The development trial server currently uses Marzneshin trial VLESS service `8`
(only the Trial-SGP inbound). New panel users have a fixed expiry derived from
the order's Asia/Bangkok expiry day. Existing development-linked panel users
can be audited from `backend/` with `node scripts/backfill-dev-panel-expiry.mjs`.
Only `--apply` writes to the panel; the script refuses the production Supabase
project. Do not use it to backfill production after the Outline migration;
that needs a separate migration plan and ownership checks.

Production `.env.production` currently has no `MARZNESHIN_PANEL_*` variables;
this is expected for normal runtime. Supply them only to an operator script
that needs panel administration. Do not copy the entire local `.env.local` to
the Droplet or put service-role/panel secrets in any `VITE_*` variable.

## Environments

### Local

Local env files stay on the developer machine and are ignored by Git.

```text
backend/.env
miniapp/.env
admin-dashboard/.env
reseller-dashboard/.env
```

Use local Supabase or a separate development Supabase project whenever possible.
Do not use production customer data for day-to-day local development.

Telegram bot/webhook testing needs a public HTTPS tunnel:

```text
PUBLIC_SUBSCRIPTION_BASE_URL=https://your-ngrok-domain.ngrok-free.app
WEBHOOK_BASE_URL=https://your-ngrok-domain.ngrok-free.app
TELEGRAM_MINIAPP_URL=https://your-ngrok-domain.ngrok-free.app
```

`PUBLIC_SUBSCRIPTION_BASE_URL` controls customer-facing `/k/:token.json` and
`ssconf://...` links. Do not include `/api` in this value.

### Production

Production secrets live on the Droplet or in provider-managed build variables.
They are not committed to Git.

Backend env:

```text
/var/www/novanet/backend/.env.production
```

Required public URL values:

```text
PUBLIC_SUBSCRIPTION_BASE_URL=https://api.novanetmm.com
WEBHOOK_BASE_URL=https://api.novanetmm.com
TELEGRAM_MINIAPP_URL=https://app.novanetmm.com
MINIAPP_RELEASE_VERSION=20260725-abcdef0
```

Do not point `PUBLIC_SUBSCRIPTION_BASE_URL` at `*.workers.dev`. Cloudflare
Worker delivery is retired for customer keys; production `ssconf://` links must
use `api.novanetmm.com`.

`MINIAPP_RELEASE_VERSION` is appended to Telegram Mini App menu and inline
button URLs as `v=...`. Bump it after each Mini App release so Telegram accounts
with cached WebViews fetch the newest build while keeping the reseller
`slug=...` in the same URL.

The backend remains compatible with the existing:

```text
/var/www/novanet/backend/.env
```

This keeps the first customer deployment safe while moving toward a cleaner
`.env.production` layout.

Monitoring / observability env (all optional — everything degrades gracefully
if unset, but you lose the corresponding capability):

```text
# Sentry — error + performance reporting for backend
SENTRY_DSN=https://<key>@<org>.ingest.<region>.sentry.io/<project>
SENTRY_ENVIRONMENT=production

# Telegram operator alerts — Ops-side chat when jobs/servers repeatedly fail
ALERT_TELEGRAM_BOT_TOKEN=<bot-from-BotFather>
ALERT_TELEGRAM_CHAT_ID=<your-personal-chat-id>

# Axiom — structured log shipping (see backend/src/lib/logger.js)
AXIOM_TOKEN=xaat-...
AXIOM_DATASET=novanet-backend

# app_events retention (min 7 enforced server-side)
APP_EVENTS_RETENTION_DAYS=90
```

Frontends (`admin-dashboard`, `reseller-dashboard`, `miniapp`) each also
accept `VITE_SENTRY_DSN` to enable their browser-side Sentry ErrorBoundary.
Set at build time — a redeploy is required to change.

Backend Node process must be launched with the Sentry preload flag so ESM
auto-instrumentation of Express works. `package.json` already sets this in
`start`/`dev`; PM2 will pick it up when Ansible re-templates the ecosystem
file. If launching manually, the command is:

```bash
node --import ./src/lib/sentry.js src/server.js
```

Mini App build env:

```text
/var/www/novanet/miniapp-source/.env.production
```

Dashboard production variables live in GitHub repository/environment variables
because GitHub Actions builds the two dashboards before deploying to Cloudflare
Pages.

Pull requests and pushes to `main` run `.github/workflows/ci.yml`. Production
dashboard deployment is deliberately separate: run the `Deploy` workflow
manually after CI passes. Configure the GitHub `production` environment with a
required reviewer so a merge cannot silently become a customer-facing release.

## Domains

Recommended production mapping:

```text
api.novanetmm.com  -> Droplet Nginx -> 127.0.0.1:3000
app.novanetmm.com  -> Droplet Nginx -> /var/www/miniapp
admin domain       -> Cloudflare Pages -> admin-dashboard
reseller domain    -> Cloudflare Pages -> reseller-dashboard
```

DNS records for `api` and `app` should point directly to the Droplet IP. If the
DNS provider is Cloudflare, keep those records DNS-only.

## Playbooks

Run these manually from the control machine. None of them run automatically from
GitHub Actions.

```bash
cd ansible
ansible-playbook provision.yml
ansible-playbook nginx.yml
ansible-playbook ssl.yml
ansible-playbook env.yml --ask-vault-pass
ansible-playbook deploy.yml
ansible-playbook deploy-miniapp.yml
```

Purpose:

| Playbook | Purpose |
|---|---|
| `provision.yml` | One-time server packages, Nginx, PM2, UFW, directories |
| `nginx.yml` | Nginx virtual hosts for API and Mini App |
| `ssl.yml` | Let's Encrypt certificates for API and Mini App domains |
| `env.yml` | Push backend/Mini App `.env.production` from Ansible Vault |
| `deploy.yml` | Backend code sync, production dependency install, PM2 reload |
| `deploy-miniapp.yml` | Mini App source sync, production build, publish static files |

## Database Migrations

Supabase migrations are a production release gate. Apply and verify pending
migrations before deploying backend code that depends on them. Do not deploy the
backend first and "catch up" the database afterward.

Current migration files live in:

```text
backend/supabase/migrations/
```

For manual Supabase SQL Editor deployments, run pending files in filename order.
For this project, the current post-initial migration sequence is:

```text
0002_add_monthly_settlements.sql
0003_add_order_payments.sql
0004_package_payment_events.sql
0005_add_server_tier.sql
0006_business_integrity_constraints.sql
0007_add_app_events.sql
0008_monitoring_query_indexes.sql
0009_backend_health_monitoring.sql
0010_app_events_retention.sql
0011_customer_notifications.sql
0012_reseller_notification_templates.sql
0013_xray_protocol_support.sql
0014_scheduled_order_status.sql
0015_reseller_pending_status.sql
0016_platform_settings.sql
0017_trial_protocol.sql
0018_bot_admin_telegram.sql
0019_vless_trial_service_ids.sql
0020_acid_purchase_rpcs.sql
0021_server_counter_trigger.sql
0022_apply_confirmed_payment_rpc.sql
0023_canonical_read_views.sql
0024_one_scheduled_purchase_per_customer.sql
0025_provider_coexistence.sql
```

> **Final Data Model (migrations 0020–0023):** the ACID/consistency layer —
> transactional provisioning RPCs, the `current_active_keys` trigger, the
> `apply_confirmed_payment` RPC, and the canonical `order_view`/`customer_view`/
> `server_view` read layer. See `FINAL_DATA_MODEL.md` for the design. After
> applying any migration that adds functions or views, run
> `NOTIFY pgrst, 'reload schema';` so PostgREST picks them up. Each migration has
> a dev validator in `backend/scripts/validate-*.mjs`.

If production has ever been patched manually, first inventory the live schema
instead of assuming every migration was applied in order. A partially applied
migration must be completed statement-by-statement, skipping objects that
already exist. This is especially important for
`0006_business_integrity_constraints.sql`, which contains some guarded
statements and some unguarded `alter table ... add constraint` statements.

Before applying a migration that adds integrity constraints, run the preflight
queries documented in `DEPLOYMENT_RUNBOOK.md`. If preflight finds duplicate
active purchases or duplicate active server keys, stop and clean the data
explicitly before deployment.

Before `0024`, inspect scheduled purchases for duplicates:

```sql
select reseller_id, customer_id, count(*) as scheduled_count,
       array_agg(id order by created_at) as order_ids
from vpn_orders
where status = 'scheduled' and order_type = 'purchase'
group by reseller_id, customer_id
having count(*) > 1;
```

Resolve any returned rows against their payments and customer history before
running `0024`. The migration refuses duplicates and never deletes a sale.
Apply `0024` before deploying code that relies on its unique index.

Provider coexistence: the current `0013` keeps existing servers as Outline and
requires new panel rows to opt into Marzneshin. Development databases that
already ran the original `0013` need `0025` to correct old Outline rows.
Verify `panel_type` for every server after migration. Keep Outline rows and
their APIs online until their
last active key is retired. The new backend defaults new production provisioning
to Outline; `VPN_MARZNESHIN_CANARY_RESELLER_IDS` opts specific reseller UUIDs
into panel provisioning, and `VPN_NEW_ACCESS_PROVIDER=marzneshin` changes the
global default only after canary verification. Never set these flags before
Marzneshin server rows and service IDs are ready.

Migration `0021` transfers server-counter ownership to a database trigger.
Rehearse the old/new writer overlap on a production-data copy before applying
it to production. See `PROVIDER_COEXISTENCE_RUNBOOK.md` for release gates.

Minimum production order (each gate must pass before the next):

```text
1. Freeze and test the release revision; inventory production schema and data.
2. Take and restore-test Supabase backup; back up both VPN panels separately.
3. Rehearse each missing migration in order on a production-data copy, checking
   its objects and invariants. Resolve duplicates before 0024.
4. Gate 0021 separately: prove the old/new counter-writer transition in the
   rehearsal. Do not overlap incompatible writers on production.
5. Apply only verified missing migrations to production and validate the RPCs,
   views, provider identity, active keys, payments, and counters.
6. Set production env with new Marzneshin provisioning OFF; deploy backend via
   Ansible and verify health plus existing Outline key delivery and lifecycle.
7. Deploy Mini App if changed, then dashboards after API checks pass.
8. Create separate Marzneshin server rows and canary one named reseller. Expand
   only after provider and client checks pass; keep Outline online.
```

## Marznode VPN Nodes (Marzneshin fleet)

Each VPN server runs `dawsh/marznode` in Docker (`/opt/marznode`), with Xray
config at `/var/lib/marznode/xray_config.json`, gRPC to the panel on `:62050`,
Shadowsocks on `:1080`, and VLESS Reality on `:443`. The Marzneshin panel
(`panel.novanetmm.com`) pushes user configs to each node over gRPC.

The fleet pins Xray `25.5.16` from the official image digest in the setup
scripts. The bundled Marznode Xray `25.2.21` failed Reality connections with
Apple's post-quantum TLS target in Happ and V2Box. Existing nodes keep the
pinned binary at `/var/lib/marznode/xray-25.5.16` and select it through
`/opt/marznode/docker-compose.override.yml`; verify the effective path with
`cd /opt/marznode && docker compose config`. Do not omit the override by
running `docker compose -f docker-compose.yml up`. To roll back a node's core,
remove only that override from the effective Compose configuration and recreate
Marznode; the original Compose file still selects the bundled Xray binary.

**Provisioning a new premium node:** `backend/scripts/setup-marznode-premium.sh`
(needs a fresh per-node Reality keypair — never reuse). It disables IPv6, writes
the Xray config, and starts marznode. Then register + wire services with
`add-premium-nodes.mjs` → `setup-premium-services.mjs` → `update-dev-db-premium-nodes.mjs`.

**Fleet-consistency rules (all nodes must match):**

- **IPv4-only egress.** Dual-stack droplets otherwise egress IPv6 by default
  (Xray freedom outbound with no `domainStrategy`), which is inconsistent and
  breaks strict clients. Disable IPv6 at the OS
  (`sysctl net.ipv6.conf.all.disable_ipv6=1` + `/etc/sysctl.d/99-disable-ipv6.conf`).
  Normalize an existing node with `backend/scripts/fix-premium-ipv4-egress.sh`.
- **Unique VLESS host remarks.** Hiddify (sing-box) uses each config's remark as
  the outbound *tag*; duplicate remarks across nodes make the whole premium
  subscription fail to import ("duplicate outbound/endpoint tag"). Every node's
  host remark must include its server name. Fix with
  `backend/scripts/fix-vless-host-remarks.mjs`.
- **Consistent Reality params:** `sni=www.apple.com`, `fingerprint=chrome`,
  `flow=xtls-rprx-vision`, host record `address` = the node's public IPv4.

> **CRITICAL — never `docker compose restart` a marznode.** It can hit a marznode
> asyncio bug that leaves Xray running WITHOUT re-syncing users → the node
> rejects every client with `invalid request user id` and clients time out
> (`tail /var/lib/marznode/access.log` shows `rejected`). Always
> `docker compose down && docker compose up -d` — a clean recreate re-pushes all
> users (access.log then shows `accepted ... [VLESS TCP REALITY >> direct]`).

> **Diagnostics:** `openssl s_client -connect <ip>:443 -servername www.apple.com`
> should return the real Apple cert (proves camouflage, not user sync). Panel
> node `msg=timeout` with `status=healthy` is a cosmetic remote-node health-check
> artifact, not an outage. Clients (Hiddify/Streisand) cache subscriptions —
> refresh/re-import after any host-record change.

## Secret Management

Production secrets live in `ansible/group_vars/novanet/vault.yml`, an
[Ansible Vault](https://docs.ansible.com/ansible/latest/vault_guide/index.html)-encrypted
file safe to commit once encrypted (ciphertext is meaningless without the
vault password).

One-time setup:

```bash
cd ansible
cp group_vars/novanet/vault.yml.example group_vars/novanet/vault.yml
# edit group_vars/novanet/vault.yml and fill in real production values
ansible-vault encrypt group_vars/novanet/vault.yml
ansible-playbook env.yml --ask-vault-pass
```

To change a secret later: `ansible-vault edit group_vars/novanet/vault.yml`,
then re-run `env.yml`. Once `vault.yml` exists, every playbook run against the
`novanet` group needs the vault password (Ansible loads all `group_vars` for
a group on every run) — pass `--ask-vault-pass`, or uncomment
`vault_password_file` in `ansible.cfg` and point it at a local,
gitignored password file.

This replaces hand-placing `.env.production` on the Droplet. The
`deploy.yml`/`deploy-miniapp.yml` checks that `.env.production` exists still
apply as a safety net — run `env.yml` before the first `deploy.yml`/
`deploy-miniapp.yml` on a fresh droplet.

## Release Checklist

Before production deployment:

- Confirm the working tree is clean or intentionally staged.
- Confirm CI passes on the exact commit being released.
- Back up production Supabase.
- Apply and verify pending Supabase migrations before deploying code that depends on them.
- Confirm `.env.production` exists on the Droplet for backend and Mini App (via `env.yml` or hand-placed).
- Confirm `VITE_BACKEND_BASE_URL` points to the production API domain before building the Mini App.
- Run backend tests locally.
- Build admin, reseller, and Mini App locally.
- Trigger the dashboard `Deploy` workflow manually only after the backend release is healthy.

After production deployment:

- Check `https://api.novanetmm.com/api/health`.
- Open the admin launch-readiness view and resolve every failed check.
- Check `https://app.novanetmm.com`.
- Check PM2 status and logs.
- Check Nginx config and reload status.
- Re-save or restart one reseller bot only if webhook settings changed.
- Verify one reseller Mini App opens from Telegram.
- Verify one ssconf URL fetches from `/k/:token.json`.

## Retired Paths

These are intentionally removed or disabled in this repository:

- DO App Platform config
- Cloudflare Worker token portal
- Cloudflare Pages deployment for the Mini App

The backend keeps only the current customer key surfaces on the Droplet:
`/k/:ssconf_token.json` and `/open-key?url=ssconf://...`. Legacy token portal
routes (`/t`, `/sub`, `/open/:token/:region`, `/api/public/subscription`) are
not mounted.
