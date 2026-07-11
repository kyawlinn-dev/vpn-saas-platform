# SKILL_BACKEND.md

## Skill Name

NovaNet MM — Express Backend Skill

## Use This Skill When

Creating or changing Express routes, backend services, auth middleware, background jobs, or Supabase queries inside the backend process.

## Required Context

Read before coding:

- `AGENTS.md`
- `SCHEMA.md`
- `SKILL_DATABASE.md`
- `SKILL_API_CONTRACTS.md`
- `SYSTEM_DESIGN.md`

## Tech Stack

- Node.js + Express (CommonJS, `.js` files)
- Supabase JS client (service-role key — bypasses RLS)
- `nodemon` for local dev (`npm run dev` from `backend/`)

## Folder Structure

```text
backend/src/
  server.js          — Express app setup, router mounts, job start
  routes/
    admin/           — requireAdmin-protected routes
    reseller/        — requireActiveReseller-protected routes
    public/          — unauthenticated or Telegram-HMAC-verified routes
  services/
    outlineService.js
    serverService.js
    serverProvisionService.js
    subscriptionProvisionService.js
    tokenService.js
    digitalOceanService.js
    sshService.js
    orderLifecycleService.js
  jobs/
    autoStopJob.js   — hourly setInterval; expires orders
    syncUsageJob.js  — syncs used_bytes from Outline
  bot/               — multi-tenant Telegraf bot (Option A)
  middleware/
    requireAdmin.js
    requireActiveReseller.js
  supabase/
    client.js        — singleton Supabase client
backend/supabase/
  migrations/        — version-controlled schema SQL
  seed.sql
```

## Auth Middleware

| Middleware | How it works |
|------------|-------------|
| `requireAdmin` | Reads `admin_access_token` cookie → looks up row in `admins` table → rejects if missing or `status != 'active'` |
| `requireActiveReseller` | Reads `reseller_access_token` cookie → validates with Supabase Auth → looks up row in `resellers` → rejects if `status != 'active'` |
| Miniapp routes | Stateless — every request re-verifies Telegram `initData` HMAC-SHA256. No cookies. |

## Implementation Rules

- Keep route handlers thin — call services, return JSON.
- Put all business logic in `services/`.
- Put all Supabase queries in service or repository modules — never inline in route files.
- Always scope queries by `reseller_id` on reseller routes (never leak cross-reseller data).
- Admin routes explicitly omit the `reseller_id` filter (cross-reseller oversight is intentional).
- Return consistent JSON: `{ data: … }` on success, `{ error: "message" }` on failure.
- Use correct HTTP status codes (400 bad input, 401 unauthenticated, 403 forbidden, 404 not found, 409 conflict, 500 server error).
- Do not log secrets, access tokens, or Outline API URLs.

## Server Capacity Concurrency

`subscriptionProvisionService.js` uses an optimistic-concurrency loop when incrementing `vpn_servers.current_active_keys`. Do not bypass this loop — it prevents over-provisioning.

## Background Jobs

Both jobs start automatically when the backend process starts (called from `server.js`):

| Job | File | Schedule | Action |
|-----|------|----------|--------|
| autoStop | `jobs/autoStopJob.js` | hourly setInterval | Finds `vpn_orders` with `status=active` and `expiry_date < today`, deletes Outline keys, sets status to `stopped` |
| syncUsage | `jobs/syncUsageJob.js` | periodic setInterval | Fetches `used_bytes` from each active Outline key and updates `vpn_keys.used_bytes` |

## Outline API TLS Pinning

`outlineService.js` verifies TLS against `certSha256` stored in `vpn_servers`. Set `OUTLINE_API_INSECURE=true` in `.env` to skip cert check during local dev only.

## Environment Variables (backend/.env)

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
TELEGRAM_BOT_TOKEN=           # legacy single-bot fallback; multi-tenant bot loads tokens from DB
DIGITALOCEAN_TOKEN=
SERVER_BOOTSTRAP_PRIVATE_KEY_PATH=
OUTLINE_API_INSECURE=         # true in dev only
BOT_ENCRYPTION_KEY=           # AES-256-GCM key for encrypting bot_token_encrypted column
```
