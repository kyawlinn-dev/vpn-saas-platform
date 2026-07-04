# Environment and Secrets Checklist

## Purpose

Use this checklist before founder launch smoke testing and before inviting real customers. It lists which environment values are required, optional, or legacy, and which values must never be committed.

Keep real values only in local `.env` files, deployment secret stores, Supabase dashboard settings, Cloudflare settings, or other private secret managers.

## Backend

| Variable / setup | Required for launch | Secret | Notes |
|---|---:|---:|---|
| `PORT` | No | No | Defaults to `3000`; useful for local backend. |
| `SUPABASE_URL` | Yes | No | Backend database/storage project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Yes | Backend uses service role for DB and private screenshot signed URLs. Never expose to frontend. |
| `SUPABASE_ANON_KEY` | Yes | No-ish | Used by backend auth helpers; safe-ish public key but still avoid unnecessary commits outside examples. |
| `BOT_TOKEN_ENCRYPTION_KEY` | Yes | Yes | 64-character hex key for encrypted reseller bot tokens. Never rotate casually after tokens are saved. |
| `WEBHOOK_BASE_URL` | Yes | No | Public HTTPS backend base URL for Telegram webhooks, no trailing slash. |
| `TELEGRAM_MINIAPP_URL` | Yes | No | Public HTTPS Mini App URL used in bot buttons/menu. |
| `MINIAPP_URL` | Recommended | No | Also allowed by CORS; keep aligned with deployed Mini App. |
| `RESELLER_DASHBOARD_URL` | Recommended | No | Allowed origin for reseller dashboard. |
| `ADMIN_DASHBOARD_URL` | Recommended | No | Allowed origin for admin dashboard. |
| `CORS_ALLOWED_ORIGINS` | Recommended | No | Comma-separated extra origins, including deployed Mini App/dashboard URLs. |
| `PUBLIC_SUBSCRIPTION_BASE_URL` | Legacy/recommended | No | Used for token portal links from lifecycle service. |
| `PUBLIC_WORKER_BASE_URL` | Legacy/recommended | No | Used for Outline import bridge links. |
| `TELEGRAM_BOT_TOKEN` | Legacy only | Yes | Used by legacy public Telegram Mini App routes. Current reseller bot flow stores per-reseller encrypted tokens. |
| `DO_AUTO_PROVISION_ENABLED` | Optional | No | Enables admin server auto-provisioning. |
| `DIGITALOCEAN_TOKEN` | Optional unless auto-provisioning | Yes | Needed only for DigitalOcean server provisioning. |
| `DIGITALOCEAN_REGION` | Optional | No | Used by auto-provisioning. |
| `DIGITALOCEAN_SIZE` | Optional | No | Used by auto-provisioning. |
| `DIGITALOCEAN_IMAGE` | Optional | No | Used by auto-provisioning. |
| `DIGITALOCEAN_SSH_KEY_FINGERPRINT` | Optional unless auto-provisioning | Sensitive | Needed for droplet SSH access setup. |
| `SERVER_BOOTSTRAP_SSH_USER` | Optional unless auto-provisioning | No | Usually `root`. |
| `SERVER_BOOTSTRAP_PRIVATE_KEY_PATH` | Optional unless auto-provisioning | Sensitive path | Local path to SSH private key. Do not commit the key. |
| `SERVER_BOOTSTRAP_TIMEOUT_MS` | Optional | No | Provisioning timeout. |
| `OUTLINE_INSTALL_SCRIPT_URL` | Optional | No | Installer URL used during provisioning. |
| `OUTLINE_API_INSECURE` | Optional | No | Development escape hatch for Outline TLS. Prefer cert SHA-256 verification. |
| `DEFAULT_SERVER_MAX_ACTIVE_KEYS` | Optional | No | Default capacity for provisioned server rows. |
| `DEFAULT_TRIAL_RESELLER_ID` | Legacy/manual | No | Legacy trial assignment helper; current reseller Mini App flow uses reseller workspace slug. |

## Supabase Setup

| Setup item | Required for launch | Secret | Notes |
|---|---:|---:|---|
| Tables from project schema | Yes | No | `resellers`, `admins`, `reseller_miniapps`, `vpn_*`, `telegram_links`, and related tables must exist. |
| Admin auth user and `admins` row | Yes | Sensitive account | Needed for admin dashboard login. |
| Reseller auth user and `resellers` row | Yes | Sensitive account | Can be created from admin dashboard. |
| `reseller_miniapps` row | Yes | Contains encrypted token | Created during reseller creation; edited in reseller Settings. |
| Storage bucket `payment-screenshots` | Yes | No | Must exist and be private. |
| RLS policies | Manual verification | No | Backend uses service-role key, but frontend/public access expectations should still be understood. |
| Service role key | Yes | Yes | Backend only. Never use in browser apps. |

## Outline Server Setup

| Setup item | Required for launch | Secret | Notes |
|---|---:|---:|---|
| Active `vpn_servers` row | Yes | No | Created by admin dashboard auto-provisioning or manual DB/admin setup. |
| `outline_api_url` | Yes | Sensitive operational URL | Required for key creation/deletion. Do not expose publicly in readiness responses. |
| `outline_cert_sha256` | Yes unless insecure mode | Sensitive-ish | Required for Outline API TLS pinning. |
| `max_active_keys` | Yes | No | Must be greater than current active keys. |
| `current_active_keys` | Yes | No | Used for capacity checks. |
| `status=active` | Yes | No | Server must be active and configured. |

## Admin Dashboard

| Variable | Required for launch | Secret | Notes |
|---|---:|---:|---|
| `VITE_API_BASE_URL` | Yes | No | Must point to backend URL reachable from the admin dashboard browser. |

The admin dashboard is used to create/check resellers, plans, servers, orders, and keys. Dead Next.js scaffold files are not the real app; the active app is Vite React.

## Reseller Dashboard

| Variable | Required for launch | Secret | Notes |
|---|---:|---:|---|
| `VITE_API_BASE_URL` | Yes | No | Must point to backend URL reachable from the reseller dashboard browser. |
| `VITE_SUPABASE_URL` | If used by current build | No | Present in env examples. |
| `VITE_SUPABASE_ANON_KEY` | If used by current build | No-ish | Public anon key; do not use service role. |

The reseller dashboard is used for workspace settings, payment instructions, support contact, bot token save, launch readiness, Telegram order review, screenshot preview, confirm/reject, stop, renew, and extend.

## Telegram Mini App

| Variable | Required for launch | Secret | Notes |
|---|---:|---:|---|
| `VITE_BACKEND_BASE_URL` | Yes | No | Must point to public backend URL for Mini App API calls. |
| `VITE_API_BASE_URL` | Yes | No | Must point to public backend API base. Vite bakes this into the build. |
| `VITE_MINIAPP_SLUG` | Optional fallback | No | Useful for controlled local tests; production should normally receive slug from bot URL/start param. |

If the backend/ngrok domain changes, rebuild and redeploy the Mini App because Vite environment values are baked into the bundle.

## Cloudflare Worker / Import Bridge

| Variable / config | Required for launch | Secret | Notes |
|---|---:|---:|---|
| `worker/wrangler.toml` `BACKEND_BASE_URL` | Legacy/recommended | No | Used by the token portal/import bridge. Keep aligned with backend public URL. |
| Cloudflare account credentials | Deploy only | Yes | Do not commit tokens. |

## Payment Screenshot Storage

- Bucket name in code: `payment-screenshots`.
- Bucket must be private.
- Mini App upload stores paths like `{slug}/{reseller_id}/{uuid}.{ext}`.
- Reseller dashboard requests a short-lived signed URL from the backend.
- Do not make the bucket public to make previews easier.

## Never Commit

- Supabase service-role key.
- BotFather bot token.
- `BOT_TOKEN_ENCRYPTION_KEY`.
- DigitalOcean API token.
- SSH private keys.
- Outline API URLs/cert material copied from real servers.
- Real payment account numbers or screenshots containing personal financial details.
- Production `.env` files with real values.

## Pre-Smoke-Test Env Check

1. Backend `.env` exists locally and has Supabase, encryption key, webhook URL, Mini App URL, dashboard URLs, and public Worker/subscription URLs as needed.
2. Admin dashboard env points to the backend.
3. Reseller dashboard env points to the backend.
4. Mini App env points to the public backend URL and is rebuilt/redeployed after env changes.
5. Worker config points to the public backend URL if the Worker/import bridge is part of the smoke test.
6. Supabase Storage bucket `payment-screenshots` exists and is private.
7. No real secrets appear in tracked docs or source files.

