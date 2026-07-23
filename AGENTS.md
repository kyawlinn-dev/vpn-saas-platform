# AGENTS.md

## Project Purpose

Build and maintain **NovaNet MM**: a multi-tenant VPN reseller platform where
resellers sell Outline VPN access through white-label Telegram Mini Apps.

## Required Context Before Coding

Read these before implementation decisions:

- `SCHEMA.md`: authoritative table/column reference
- `SYSTEM_DESIGN.md`: product and architecture source of truth
- `DEPLOYMENT.md`: local, production, Droplet, PM2, Nginx, Ansible workflow
- Relevant skill file:
  - `SKILL_DATABASE.md`
  - `SKILL_BACKEND.md`
  - `SKILL_MINIAPP.md`
  - `SKILL_FRONTEND.md`
  - `SKILL_API_CONTRACTS.md`

## Workspace Structure

| Directory | Role | Port |
|---|---|---|
| `backend/` | Express API + multi-tenant bot service | 3000 |
| `admin-dashboard/` | Super-admin UI | 3001 |
| `reseller-dashboard/` | Reseller UI | 3002 |
| `miniapp/` | Telegram Mini App, served from Droplet Nginx in production | - |
| `ansible/` | Droplet provisioning, Nginx, SSL, backend and Mini App deploy | - |

Cloudflare Worker and DO App Platform deployment paths are retired.

## Tenancy Model

```text
ADMIN
  controls servers, plans, resellers, enable/disable, oversight
       |
       v
RESELLER
  owns miniapp_slug, brand, bot token, payment info
       |
       v
MINI APP
  runtime slug comes from Telegram start_param
       |
       v
CUSTOMER
  trial, buy, pay, receive key, connect through Outline
```

Isolation rule: a customer of reseller A must never see or touch reseller B's
data. Every reseller-scoped query must include `reseller_id`.

## Agent Workflow

1. Read the required context.
2. Explain the implementation plan in 3-5 bullets.
3. Make small reversible changes; the app should work after each phase.
4. Do not run production deployment commands unless explicitly asked.
5. Run relevant local tests/builds after implementation.
6. Report changed files, behavior changes, and any deployment follow-up.

## Non-Negotiable Constraints

- Never expose Supabase service-role keys to frontend code.
- Always scope reseller-route queries by `reseller_id`.
- Never bypass the optimistic-concurrency loop in `subscriptionProvisionService.js`.
- Keep `SCHEMA.md` up to date after schema changes.
- Update `SKILL_API_CONTRACTS.md` after API shape changes.
- Keep production `.env` files out of Git.

## Current Deployment Source Of Truth

Production customer traffic:

- `api.novanetmm.com`: Droplet Nginx -> backend PM2 process
- `app.novanetmm.com`: Droplet Nginx -> Mini App static build

Dashboard deploys:

- Admin dashboard: Cloudflare Pages
- Reseller dashboard: Cloudflare Pages

Backend and Mini App production deploys are manual Ansible playbooks from
`ansible/`. GitHub Actions deploys only the two dashboards.

## Boundaries

Do not add without explicit approval:

- Real-time chat
- Production-grade auth hardening beyond requested security fixes
- Online payment processing
- Rental contract signing
- Sensitive personal data collection
