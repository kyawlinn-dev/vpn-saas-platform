# Security Audit — NovaNet MM
**Date:** 2026-07-11  
**Scope:** Full project — backend routes, middleware, auth, encryption, frontend, dependencies  
**Status:** Historical report. Some findings have since been addressed in the repo; use `SYSTEM_DESIGN.md`, `DEPLOYMENT.md`, and current code as source of truth.

---

## CRITICAL

### C-1: Live production secrets in `backend/.env` (plaintext on disk)
`backend/.env` contains the live DO API token, Supabase service role key, Telegram bot token, and the AES-256-GCM master encryption key that decrypts every reseller bot token stored in the database. File is correctly excluded from git — no remote exposure — but anyone with local disk access gets full infrastructure access.

---

## HIGH

### H-1: No rate limiting on public miniapp endpoints
`POST /api/miniapp/:slug/auth`, `POST /api/miniapp/:slug/orders`, and `POST /api/miniapp/:slug/servers/:serverId/link` have zero rate limiting. Auth creates customers + trial orders on first call. Server-link creates real Outline VPN keys. These are the most expensive backend operations and are wide open to abuse. (The upload screenshot endpoint does have a limiter; these three do not.)

### H-2: Webhook `secret_token` validation removed — REGRESSION
Historical finding. Later repo cleanup restored `secret_token` registration and `X-Telegram-Bot-Api-Secret-Token` validation before bot update handling.

### H-3: Critical axios CVE in `backend/`
The `axios` version in `backend/package.json` has a live CVE — Proxy-Authorization header leaks to redirect targets (severity: CRITICAL), plus prototype pollution and MITM gadgets (severity: HIGH). The backend uses axios for DigitalOcean API calls with the DO bearer token. Fix: `npm audit fix` inside `backend/`.

### H-4: Timing attack in legacy HMAC verification
Historical finding. The legacy single-bot Mini App route and helper were later removed; current slug-scoped Mini App auth uses timing-safe HMAC comparison.

---

## MEDIUM

### M-1: Race condition — duplicate purchase orders
Two simultaneous purchase requests from the same customer can both pass the "active purchase exists" check before either commits. No DB-level unique constraint exists. The code has a comment acknowledging the gap. Fix: add a partial unique index in the database.

### M-2: Unauthenticated server list leak
`GET /api/miniapp/:slug/servers` without a `telegram_user_id` query param silently falls back to returning the full server list (IDs, regions, names, capacity flags) to any caller who knows a reseller slug.

### M-3: Legacy single-bot routes bypass multi-tenancy
Historical finding. The legacy single-bot routes were later removed from the active backend route surface.

---

## LOW

### L-1: `.env.example` committed to git contains real production values
`backend/.env.example` (tracked by git) contains real `SUPABASE_URL`, `MINIAPP_URL`, Cloudflare worker URL, and `DEFAULT_TRIAL_RESELLER_ID`. Not secrets individually, but together they map the full infrastructure.

### L-2: SSH provisioning uses `StrictHostKeyChecking=no`
`serverProvisionService.js` SSHs into new droplets without host key verification. Low risk given DO's controlled IP allocation but technically allows MITM during the provisioning window.

### L-3: Dev-mode bypass controlled only by `NODE_ENV`
A missing or incorrect `NODE_ENV` on a server would activate the dev bypass (no initData required, hardcoded test user). The default is correctly `IS_DEV = false` when unset so the fail-safe is right, but it is fragile.

---

## INFO (intentional design — no action needed)

- `GET /api/miniapp/:slug/config` returns bank account numbers publicly — intentional; customers need it before auth
- `/k/:token.json` (ssconf endpoint) is intentionally public — Outline clients cannot do Telegram auth
- AES-256-GCM encryption for bot tokens is sound; no key rotation mechanism exists if master key is ever compromised
- Debug `console.log` lines remain in `backend/src/bot/manager.js` `registerWebhook` function (left from July 2026 debugging session — cosmetic, non-functional)

---

## Recommended Fix Order

| Priority | Item | Action |
|----------|------|--------|
| 1 | H-3 | `npm audit fix` in `backend/` |
| 2 | H-1 | Add rate limiting to auth/orders/link miniapp endpoints |
| 3 | H-4 | Resolved later: removed legacy single-bot HMAC helper/routes |
| 4 | H-2 | Resolved later: restored webhook secret registration and validation |
| 5 | M-1 | Add partial unique index for active purchase per customer |
| 6 | L-1 | Scrub real URLs out of `backend/.env.example` |
