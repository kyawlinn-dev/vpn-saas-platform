# NovaNet MM Deployment

This repository is aligned around the current production shape:

- Backend API and multi-tenant Telegram bot: DigitalOcean Droplet, PM2, Nginx
- Telegram Mini App: static Vite build served by Nginx from the same Droplet
- Admin dashboard: Cloudflare Pages
- Reseller dashboard: Cloudflare Pages
- Database: Supabase
- Outline VPN servers: DigitalOcean droplets

Do not use DO App Platform or Cloudflare Workers for customer-facing production
traffic. Those paths were retired because customer networks may block Cloudflare
IPs.

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
```

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

Minimum production order:

```text
1. Back up Supabase.
2. Apply and verify all pending migrations.
3. Push/update production env values if needed.
4. Deploy backend with Ansible.
5. Deploy Mini App with Ansible if Mini App code changed.
6. Deploy dashboards manually after backend health checks pass.
```

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
