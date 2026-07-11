# AGENTS.md

## Project Purpose

Build and maintain **NovaNet MM** — a multi-tenant VPN reseller platform where resellers sell Outline VPN access to customers via a white-label Telegram Mini App, backed by DigitalOcean servers and a Supabase database.

## Required Context Before Coding

Read these before any implementation decision:

- `SCHEMA.md` — authoritative table/column reference
- `SYSTEM_DESIGN.md` — vision, tenancy model, build plan, current state vs missing
- Relevant skill file(s) for the area you're working in:
  - `SKILL_DATABASE.md` — schema, migrations, seed, isolation rules
  - `SKILL_BACKEND.md` — Express patterns, services, auth middleware, jobs
  - `SKILL_MINIAPP.md` — Telegram Mini App, slug flow, ssconf delivery, buy flow
  - `SKILL_FRONTEND.md` — admin/reseller dashboard conventions (shadcn/Tailwind)
  - `SKILL_API_CONTRACTS.md` — API shapes between frontends and backend

## Workspace Structure

| Directory | Role | Port |
|-----------|------|------|
| `backend/` | Express API + multi-tenant bot service | 3000 |
| `admin-dashboard/` | Super-admin UI | 3001 |
| `reseller-dashboard/` | Reseller UI | 3002 |
| `miniapp/` | Telegram Mini App (Cloudflare Pages) | — |
| `worker/` | Legacy tok_xxx portal (Cloudflare Worker — retire when unused) | — |

## Tenancy Model

```
ADMIN (platform owner)
  controls → servers · plans · resellers · enable/disable · oversight
       ↓
RESELLER (tenant)            miniapp_slug · brand · bot token · payment info
  reseller dashboard → confirm/reject orders · configure workspace
       ↓
MINI APP (white-label, resolved dynamically by slug from start_param)
  customer opens reseller's bot → branded workspace loads
       ↓
CUSTOMER
  trial → buy → pay → key delivered immediately → connect via Outline
```

**Isolation rule:** a customer of reseller A must never see or touch reseller B's data. Every reseller-scoped query must include `reseller_id`.

## Agent Workflow

1. Read current skill files and relevant sections of `SYSTEM_DESIGN.md`.
2. Explain the implementation plan in 3–5 bullet points.
3. Implement one small phase at a time — app must work after every change.
4. Run build/lint (no test runner configured) after implementation.
5. Report changed files and what behavior changed.
6. Ask for approval before moving to the next major phase.

## Subagent Roles

Use the dedicated subagent definition files when spawning agents:

- `SUBAGENT_BACKEND.md` — Express API and Supabase service work
- `SUBAGENT_FRONTEND.md` — dashboard and miniapp UI work
- `SUBAGENT_DATABASE.md` — schema migrations and seed data

## Non-Negotiable Constraints

- Never expose Supabase service-role keys to frontend code.
- Always scope reseller-route queries by `reseller_id`.
- Never bypass the optimistic-concurrency loop in `subscriptionProvisionService.js`.
- Keep `SCHEMA.md` up to date after any schema change.
- Update `SKILL_API_CONTRACTS.md` after any API shape change.
- Make small, reversible changes — commit a known-good state before large refactors.

## Top Priority (multi-tenancy blocker)

The miniapp currently reads its slug from `VITE_MINIAPP_SLUG` (baked in at build time). True white-label multi-tenancy requires reading the slug from `Telegram.WebApp.initDataUnsafe.start_param` at runtime. Until this is done, every reseller's bot opens the same hard-coded branded workspace.

## Boundaries

Do not add without explicit approval:

- Real-time chat
- Production-grade auth hardening
- Online payment processing
- Rental contract signing
- Sensitive personal data collection
