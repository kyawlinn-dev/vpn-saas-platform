# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

**NovaNet MM** — a multi-tenant VPN reseller platform. Resellers buy and distribute Outline VPN access keys to customers. Customers connect via the Telegram Mini App. Servers are provisioned automatically on DigitalOcean and managed via the Outline VPN API.

## Required Context Before Coding

Read these files before making implementation decisions:

- `AGENTS.md` — project overview and agent workflow
- `SCHEMA.md` — canonical column/table reference (authoritative)
- `SYSTEM_DESIGN.md` — tenancy model, build plan, current state vs missing
- Relevant skill file: `SKILL_BACKEND.md`, `SKILL_FRONTEND.md`, `SKILL_MINIAPP.md`, `SKILL_DATABASE.md`, `SKILL_API_CONTRACTS.md`

## Workspace Structure

Four independent Node.js projects plus one Cloudflare Worker — each must be run separately:

| Directory | Role | Port |
|-----------|------|------|
| `backend/` | Express API server + multi-tenant bot service | 3000 |
| `admin-dashboard/` | Super-admin UI (Vite + React + shadcn/Tailwind) | 3001 |
| `reseller-dashboard/` | Reseller UI (Vite + React + shadcn/Tailwind) | 3002 |
| `miniapp/` | Telegram Mini App (Vite + React + Tailwind + Zustand + TanStack Query) | — |
| `worker/` | Cloudflare Worker — legacy tok_xxx portal (retire when worker is removed) | — |

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

**Cloudflare Worker:**
```bash
wrangler deploy   # Deploy worker/worker.js using worker/wrangler.toml
```

No test runner is configured anywhere in the project.

## Architecture

### Data Flow (current — slug-based miniapp)

1. Customer opens reseller's Telegram bot → clicks "Open App" (WebApp button passes `start_param=<slug>`)
2. Miniapp reads slug from `Telegram.WebApp.initDataUnsafe.start_param` at runtime
3. Miniapp posts `{ initData }` to `POST /api/miniapp/:slug/auth`
4. Backend verifies HMAC-SHA256 signature (using that reseller's bot token), upserts customer + `telegram_links`, creates trial order on first visit
5. Customer gets a VPN key via `ssconf://` URL served by `GET /k/:ssconf_token.json`

### Auth Model

- **Resellers/Admins:** Supabase email+password auth; backend issues httpOnly cookies. `requireActiveReseller` validates cookie against `resellers`; `requireAdmin` checks `admins`.
- **Miniapp customers:** Stateless — every request re-verifies Telegram `initData` HMAC-SHA256. No cookies.

### Backend Service Layer

| Service | Responsibility |
|---------|---------------|
| `outlineService.js` | Outline VPN API calls with TLS cert pinning |
| `serverService.js` | CRUD on `vpn_servers`, capacity checks |
| `serverProvisionService.js` | DigitalOcean droplet → SSH → Outline install → parse API URL + cert |
| `subscriptionProvisionService.js` | Provision/stop Outline keys; manages `vpn_keys`, server key counts |
| `digitalOceanService.js` | DigitalOcean API wrapper |
| `sshService.js` | SSH into servers via `ssh2` |
| `orderLifecycleService.js` | Order state transitions (activate, stop, extend) |

### Background Jobs

- `autoStopJob.js` — hourly; expires orders past `expiry_date`
- `syncUsageJob.js` — periodic; syncs `used_bytes` from Outline API

### Database

Schema is version-controlled in `backend/supabase/migrations/`. Run migrations against a new Supabase project to bootstrap. See `SKILL_DATABASE.md` for setup steps.

The backend uses the Supabase service-role key (bypasses RLS). Frontend apps use the anon key where applicable.

## Key Architectural Notes

**Dead code warning — admin-dashboard:** `src/app/` (Next.js scaffold) is dead. The real app is `src/App.tsx` (Vite). Ignore `next.config.ts` and `.next/` artifacts.

**Outline API TLS pinning:** `outlineService.js` verifies against `certSha256` in `vpn_servers`. Set `OUTLINE_API_INSECURE=true` in local `.env` to skip.

**Server capacity concurrency:** `subscriptionProvisionService.js` uses an optimistic-concurrency loop when incrementing `vpn_servers.current_active_keys`. Do not bypass it.

**Column name traps:** `resellers.name` vs `admins.full_name` vs `vpn_customers.full_name` — see `SCHEMA.md`.

## Environment Setup

Each service needs its own `.env` file. Critical variables:

- `backend/.env`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DIGITALOCEAN_TOKEN`, `SERVER_BOOTSTRAP_PRIVATE_KEY_PATH`, `BOT_ENCRYPTION_KEY`
- `reseller-dashboard/.env`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_BASE_URL`
- `admin-dashboard/.env`: `VITE_API_BASE_URL`
- `miniapp/.env` / `miniapp/.env.production`: `VITE_BACKEND_BASE_URL`, `VITE_API_BASE_URL`, `VITE_MINIAPP_SLUG` (slug is fallback only; runtime reads start_param)
- `worker/wrangler.toml`: `BACKEND_BASE_URL`

## ngrok Setup

Backend is exposed via a **static reserved ngrok domain**. If it changes, update 3 files (`miniapp/.env`, `miniapp/.env.production`, `worker/wrangler.toml`), then rebuild miniapp and redeploy both Cloudflare apps.

## Deployment

- **miniapp** → Cloudflare Pages: `npm run build` then `npx wrangler pages deploy dist`
- **worker** → Cloudflare Workers: `npx wrangler deploy`
- **backend** runs locally on Windows during development

## Unfinished Work

- `miniapp/src/features/access/` and `miniapp/src/features/auth/` — empty, need to be built
- Dynamic slug: miniapp must read slug from `start_param` instead of env var (multi-tenancy blocker)

## Roadmap

- **RAG customer service bot:** 24/7 bot inside `backend/src/bot/`, using flexibot pattern (Gemini + Vertex AI RAG + Supabase + Redis)
- **Myanmar payment integration:** KBZPay and Wave Money
