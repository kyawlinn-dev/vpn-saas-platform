# SKILL_MINIAPP.md

## Skill Name

NovaNet MM — Telegram Mini App Skill

## Use This Skill When

Working on the `miniapp/` Vite + React app, Telegram WebApp integration, slug-based auth, ssconf delivery, or the buy/payment flow.

## Required Context

Read before coding:

- `AGENTS.md`
- `SKILL_API_CONTRACTS.md`
- `SKILL_DATABASE.md` (reseller_miniapps table)
- `SYSTEM_DESIGN.md` §4 and §5 (key delivery, dynamic slug)

## Tech Stack

- Vite + React + TypeScript
- Tailwind CSS (no MUI, no other component library)
- Zustand (state store)
- TanStack Query (server state / cache)
- `miniapp/` — deployed to Cloudflare Pages

## Auth Flow (current slug-based paradigm)

1. Customer opens reseller's Telegram bot → clicks "Open App" (WebApp button)
2. The bot passes `startParam=<miniapp_slug>` to the WebApp URL
3. Miniapp reads `Telegram.WebApp.initDataUnsafe.start_param` to get the slug
4. Miniapp posts `{ initData }` to `POST /api/miniapp/:slug/auth`
5. Backend verifies HMAC-SHA256 signature (using bot token for that reseller's slug)
6. Backend upserts `vpn_customers` + `telegram_links`; creates trial order on first visit
7. Backend returns `{ customer, order, config }` — miniapp stores this in Zustand

## Dynamic Slug Rule (top priority — multi-tenancy blocker)

`VITE_MINIAPP_SLUG` must NOT be used as the source of truth in production. The slug must come from `Telegram.WebApp.initDataUnsafe.start_param` at runtime so each reseller's bot opens that reseller's branded workspace. The env var is only a fallback for local dev.

## ssconf Delivery

- Customer's VPN config is served by `GET /k/:ssconf_token.json` (short path, no slug — looks like a static asset)
- The `ssconf_token` is stored on `vpn_customers.ssconf_token` (per-customer permanent token)
- The route resolves the customer's current server dynamically at request time
- Display label format: `#BrandName-FullName` (e.g. `#DemoVPN-Kyaw Linn`) — uses Telegram display name, not @username

## Buy / Payment Flow

1. Customer picks a plan on PackagesPage
2. Taps "Buy" → opens payment form modal
3. Form shows the reseller's payment info (from `reseller_miniapps.payment_info`)
4. Customer uploads KBZPay screenshot + optional note
5. Miniapp posts `POST /api/miniapp/:slug/orders` (multipart: plan_id, screenshot file, note)
6. Backend creates `vpn_orders` (status=pending, payment_status=unpaid), provisions key immediately, returns updated order
7. Reseller reviews the screenshot daily in the reseller dashboard (confirm / reject)

## Key State: Zustand Store

The miniapp Zustand store should hold:

- `slug` — the resolved miniapp slug (from start_param or env fallback)
- `customer` — the authenticated customer row
- `activeOrder` — the current active order (for displaying VPN access)
- `config` — the reseller branding config (brand_name, primary_color, payment_info)

## API Client Rule

Pages must not call the backend directly. All backend calls must go through typed API client functions in `src/services/api/`. This keeps the URL construction and error handling in one place.

## Build & Deploy

```bash
# miniapp/ directory
npm run dev      # local Vite dev server
npm run build    # bakes VITE_ env vars in
npx wrangler pages deploy dist   # deploy to Cloudflare Pages
```

VITE_ env vars are baked in at build time. After changing miniapp env vars, rebuild and redeploy.

## Environment Variables (miniapp/.env and miniapp/.env.production)

```
VITE_BACKEND_BASE_URL=    # ngrok domain (dev) or backend public URL (prod)
VITE_API_BASE_URL=        # same as BACKEND_BASE_URL + /api
VITE_MINIAPP_SLUG=        # fallback only; runtime slug comes from start_param
```

## Unfinished Work

- `miniapp/src/features/access/` — VPN access display (add to Outline button, server switch)
- `miniapp/src/features/auth/` — auth hooks and store wiring
