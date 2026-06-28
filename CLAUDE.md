# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**NovaNet MM** — a multi-tenant VPN reseller platform. Resellers buy and distribute Outline VPN access keys to customers. Customers connect via the Telegram Mini App or a token-based browser portal. Servers are provisioned automatically on DigitalOcean and managed via the Outline VPN API.

## Workspace Structure

Five independent Node.js projects — each must be `cd`'d into and run separately:

| Directory | Role | Port |
|-----------|------|------|
| `backend/` | Express API server | 3000 |
| `admin-dashboard/` | Super-admin UI (Vite + React + MUI) | 3001 |
| `reseller-dashboard/` | Reseller UI (Vite + React + MUI + React Router) | 3002 |
| `miniapp/` | Telegram Mini App (Vite + React + Tailwind + Zustand + TanStack Query) | — |
| `telegram-bot/` | Telegraf bot | — |
| `worker/` | Cloudflare Worker (no npm — deploy via `wrangler deploy`) | — |

## Commands

All commands must be run from within the relevant subdirectory.

**Backend:**
```bash
npm run dev    # nodemon (hot reload)
npm start      # node src/server.js
```

**Frontend apps (admin-dashboard, reseller-dashboard, miniapp):**
```bash
npm run dev      # Vite dev server
npm run build    # tsc -b && vite build  (admin/reseller) or vite build (miniapp)
npm run preview  # Preview production build
```

**Miniapp only:**
```bash
npm run lint   # ESLint
```

**Telegram bot:**
```bash
npm run dev    # node index.js
```

**Cloudflare Worker:**
```bash
wrangler deploy   # Deploy worker/worker.js using worker/wrangler.toml
```

No test runner is configured anywhere in the project.

## Architecture

### Data Flow

**Miniapp (primary) flow:**
1. Customer opens Telegram Bot → clicks "Open App" (WebApp button)
2. Miniapp posts Telegram `initData` to `POST /api/miniapp/:slug/auth`
3. Backend verifies HMAC-SHA256 signature, upserts customer + `telegram_links` record, creates trial order on first visit
4. Customer uses Outline app with `ssconf://` URL served by `GET /api/miniapp/:slug/ssconf/:token`

**Token portal (legacy) flow:**
1. Reseller creates/activates an order in the reseller dashboard
2. Backend provisions an Outline key and generates a `tok_xxx` access token
3. Token URL sent to customer → opens the **Cloudflare Worker** (`/t/<token>`)
4. Worker renders HTML portal; "Add To Outline" button opens `ssconf://` deep link
5. Outline app fetches Shadowsocks config from Worker → Worker proxies to Backend `/api/public/subscription`

### Auth Model

- **Resellers/Admins:** Supabase email+password auth; backend issues httpOnly cookies (`reseller_access_token`, `reseller_refresh_token`). `requireActiveReseller` middleware validates cookie against the `resellers` table; `requireAdmin` checks the `admins` table.
- **Miniapp customers:** Stateless — every request re-verifies Telegram `initData` HMAC signature. No passwords or sessions.

### Backend Service Layer (`backend/src/services/`)

| Service | Responsibility |
|---------|---------------|
| `outlineService.js` | Outline VPN API calls (create/delete/list keys, set data limits) with TLS cert pinning |
| `serverService.js` | CRUD on `vpn_servers`, key capacity checks |
| `serverProvisionService.js` | DigitalOcean droplet creation → SSH → Outline install script → parse `apiUrl`+`certSha256` |
| `subscriptionProvisionService.js` | Provision/stop Outline keys for orders; manages `vpn_keys`, updates server key counts |
| `tokenService.js` | Generate/validate `tok_xxx` access tokens; manage `access_tokens` + `token_server_assignments` |
| `digitalOceanService.js` | DigitalOcean API wrapper (create/poll droplet) |
| `sshService.js` | SSH into servers via `ssh2` to run the Outline installer |

### Background Job

`backend/src/jobs/autoStopJob.js` — runs hourly inside the backend process (plain `setInterval`). Finds `vpn_orders` with `status=active` and `expiry_date < today`, deletes their Outline keys via the Outline API, and sets status to `stopped`.

### Database (Supabase — no migration files in repo)

Schema is managed directly in the hosted Supabase project. Key tables: `vpn_servers`, `vpn_customers`, `vpn_plans`, `vpn_orders`, `vpn_keys`, `access_tokens`, `token_server_assignments`, `resellers`, `admins`, `telegram_links`, `commission_ledger`, `reseller_miniapps`.

The backend accesses Supabase exclusively with the service-role key (bypasses RLS). Frontend apps use the anon key where applicable.

## Key Architectural Notes

**Two miniapp paradigms exist side-by-side:**
- *Legacy:* token-based (`access_tokens` + `token_server_assignments`) — used by the Cloudflare Worker portal
- *Current:* slug-based (`reseller_miniapps` + `ssconf_token` on `vpn_keys`) — used by the Telegram Mini App

**Admin Dashboard has a vestigial Next.js scaffold** (`src/app/` with `layout.tsx`, `page.tsx`) that is dead code — no `next` dependency in `package.json`. The real app is `src/App.tsx` (Vite). Ignore the `next.config.ts` and `.next/` artifacts.

**Outline API TLS pinning:** All calls to the Outline management API in `outlineService.js` use `OUTLINE_API_INSECURE=true` to skip cert verification OR verify against `certSha256` stored in `vpn_servers`. The certSha256 is parsed from the Outline install script output during provisioning.

**Server capacity concurrency:** `subscriptionProvisionService.js` uses an optimistic-concurrency loop when incrementing `vpn_servers.current_active_keys` to avoid over-provisioning.

## Environment Setup

Each service needs its own `.env` file (copy from `.env.example` in each directory). Critical variables:

- `backend/.env`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, `DIGITALOCEAN_TOKEN`, `SERVER_BOOTSTRAP_PRIVATE_KEY_PATH`
- `reseller-dashboard/.env`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_BASE_URL`
- `admin-dashboard/.env`: `VITE_API_BASE_URL`
- `miniapp/.env`: `VITE_BACKEND_BASE_URL`, `VITE_API_BASE_URL`, `VITE_MINIAPP_SLUG`
- `worker/wrangler.toml`: `BACKEND_BASE_URL`

## Developer Context & Roadmap

### ngrok Setup

The backend is exposed to the internet via a **static reserved ngrok domain** (URL does not change between restarts).

The ngrok domain is referenced in exactly 3 files:
- `miniapp/.env` — `VITE_BACKEND_BASE_URL`, `VITE_API_BASE_URL`
- `miniapp/.env.production` — `VITE_BACKEND_BASE_URL`, `VITE_API_BASE_URL`
- `worker/wrangler.toml` — `BACKEND_BASE_URL`

If the ngrok domain ever changes, all 3 must be updated, then:
1. Rebuild miniapp: `npm run build` (VITE_ vars are baked in at build time)
2. Redeploy miniapp: `npx wrangler pages deploy dist`
3. Redeploy worker: `npx wrangler deploy`

### Deployment

- **miniapp** → Cloudflare Pages: `npm run build` then `npx wrangler pages deploy dist`
- **worker** → Cloudflare Workers: `npx wrangler deploy`
- **backend** and **telegram-bot** run locally on Windows during development

### Unfinished Work

- `miniapp/src/features/access/` and `miniapp/src/features/auth/` are currently empty (0 bytes) and need to be built out.

### Roadmap

- **RAG customer service bot:** Integrate a 24/7 RAG-based customer service bot into `telegram-bot/`, reusing the architecture pattern from the developer's separate "flexibot" project (Gemini + Vertex AI RAG + Supabase + Redis memory layers).
- **Automated key delivery:** Trigger VPN key provisioning automatically on payment confirmation — `subscriptionProvisionService.js` already exists for this.
- **Myanmar payment integration:** KBZPay and Wave Money.
