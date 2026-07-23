# SKILL_MINIAPP.md

## Skill Name

NovaNet MM - Telegram Mini App Skill

## Use This Skill When

Working on `miniapp/`, Telegram WebApp integration, slug-based auth, ssconf
delivery, server switching, or buy/payment flow.

## Required Context

- `AGENTS.md`
- `DEPLOYMENT.md`
- `SKILL_API_CONTRACTS.md`
- `SKILL_DATABASE.md`
- `SYSTEM_DESIGN.md`

## Tech Stack

- Vite + React
- Tailwind CSS
- Zustand
- TanStack Query

Production Mini App hosting is **Droplet Nginx**, not Cloudflare Pages.

## Auth Flow

1. Customer opens reseller bot and taps the Web App button.
2. Bot passes `startParam=<miniapp_slug>` to Telegram.
3. Mini App reads `Telegram.WebApp.initDataUnsafe.start_param`.
4. Mini App posts Telegram init data to `POST /api/miniapp/:slug/auth`.
5. Backend decrypts that reseller bot token and verifies Telegram HMAC.
6. Backend upserts customer/link rows and returns workspace/subscription state.

`VITE_MINIAPP_SLUG` is local fallback only. Production slug source is runtime
Telegram `start_param`.

## Key Delivery

- Customer config is served by `GET /k/:ssconf_token.json`.
- `ssconf_token` lives on `vpn_customers`.
- The token is permanent per customer; server switching updates active key state.
- Display label format is `#BrandName-FullName`.
- The "Add to Outline" bridge is backend-hosted at `/open-key`.

## Build And Deploy

Local:

```bash
npm run dev
npm run build
```

Production:

```bash
cd ansible
ansible-playbook deploy-miniapp.yml
```

The production build reads `/var/www/novanet/miniapp-source/.env.production` on
the Droplet. Vite env values are baked into the static build.

## Environment Variables

```text
VITE_BACKEND_BASE_URL=
VITE_API_BASE_URL=
VITE_MINIAPP_SLUG=   # fallback only
```
