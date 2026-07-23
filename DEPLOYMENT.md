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
```

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
ansible-playbook deploy.yml
ansible-playbook deploy-miniapp.yml
```

Purpose:

| Playbook | Purpose |
|---|---|
| `provision.yml` | One-time server packages, Nginx, PM2, UFW, directories |
| `nginx.yml` | Nginx virtual hosts for API and Mini App |
| `ssl.yml` | Let's Encrypt certificates for API and Mini App domains |
| `deploy.yml` | Backend code sync, production dependency install, PM2 reload |
| `deploy-miniapp.yml` | Mini App source sync, production build, publish static files |

## Release Checklist

Before production deployment:

- Confirm the working tree is clean or intentionally staged.
- Confirm CI passes on the exact commit being released.
- Review and apply pending Supabase migrations before deploying code that depends on them.
- Confirm `.env.production` exists on the Droplet for backend and Mini App.
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
