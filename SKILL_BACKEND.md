# SKILL_BACKEND.md

## Skill Name

NovaNet MM - Express Backend Skill

## Use This Skill When

Working on Express routes, backend services, auth middleware, background jobs,
bot runtime, Supabase queries, or production backend deployment behavior.

## Required Context

- `AGENTS.md`
- `SCHEMA.md`
- `SKILL_DATABASE.md`
- `SKILL_API_CONTRACTS.md`
- `SYSTEM_DESIGN.md`
- `DEPLOYMENT.md`

## Tech Stack

- Node.js + Express, ES modules
- Supabase JS service-role client, backend only
- PM2 in production
- Nginx reverse proxy on the DigitalOcean Droplet
- Vitest for backend tests

## Folder Structure

```text
backend/src/
  server.js
  lib/
    loadEnv.js
    supabase.js
    tokenEncryption.js
  routes/
    admin/
    reseller/
    public/
  services/
  jobs/
  bot/
  middleware/
backend/supabase/
  migrations/
  seed.sql
```

## Auth Rules

- Admin/reseller dashboards use backend-issued httpOnly cookies.
- Mini App routes are stateless and verify Telegram init data per request.
- Bot webhooks require `X-Telegram-Bot-Api-Secret-Token`.

## Implementation Rules

- Keep route handlers thin.
- Put business logic in services.
- Never expose service-role keys outside backend code.
- Always scope reseller operations by `reseller_id`.
- Admin routes may intentionally omit reseller filters for platform oversight.
- Do not log secrets, access tokens, bot tokens, or Outline API URLs.

## Deployment

Backend production deploy is Ansible -> Droplet -> PM2:

```bash
cd ansible
ansible-playbook deploy.yml
```

Do not use DO App Platform for this project.

## Environment Loading

The backend loads env files in this order:

1. `.env`
2. `.env.${APP_ENV || NODE_ENV}` with override
3. `.env.local` with override when not production

This preserves the current Droplet `.env` while allowing `.env.production`.

Key backend variables:

```text
NODE_ENV=
PORT=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_DASHBOARD_URL=
RESELLER_DASHBOARD_URL=
MINIAPP_URL=
TELEGRAM_MINIAPP_URL=
CORS_ALLOWED_ORIGINS=
WEBHOOK_BASE_URL=
PUBLIC_SUBSCRIPTION_BASE_URL=
BOT_TOKEN_ENCRYPTION_KEY=
DIGITALOCEAN_TOKEN=
SERVER_BOOTSTRAP_PRIVATE_KEY_PATH=
DEFAULT_SERVER_MAX_ACTIVE_KEYS=
DEFAULT_TRIAL_RESELLER_ID=
```

## Server Capacity Concurrency

`subscriptionProvisionService.js` uses an optimistic-concurrency loop when
updating `vpn_servers.current_active_keys`. Do not bypass it.

Provisioning must also respect `vpn_servers.server_tier`:

- trial orders -> `serverTier: "trial"`
- paid purchases/renewals/migrations -> `serverTier: "premium"`

Use `getActiveServers({ serverTier, regions, limit })` for server selection.
