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

## Purchase Flow

Packages → **App choice dialog** → Checkout (navigation in `AppShell.jsx`).

1. `PackagesPage` "Buy" → `onNavigateToProtocol(plan)` sets the plan and opens
   `ProtocolDialog` over the packages page for a new purchase. Renewals keep
   the active protocol and go straight to checkout.
2. `ProtocolDialog` (`src/components/checkout/ProtocolDialog.jsx`) offers
   Outline or Happ/Hiddify (VLESS Reality) with compatible app logos in
   `public/apps/`. Nothing is selected by default; Continue requires a tap.
   `onConfirmProtocol(protocol)` carries the choice to checkout.
3. `CheckoutPage` receives `checkoutProtocol` as a prop (no in-page protocol
   selector), collects payment method + screenshot, and submits with
   `protocol_preference`. Its Back button returns to Packages; buying again
   reopens the app choice with no selection.

An initial paid purchase provisions immediately, pending screenshot review.
With an active paid purchase, checkout creates one scheduled future package;
the active key stays unchanged. Auth returns `queued_subscription` for the UI.
A second queued purchase returns `409 QUEUED_PACKAGE_EXISTS`.

## Key Delivery

- Customer config is served by `GET /k/:ssconf_token.json`.
- `ssconf_token` lives on `vpn_customers`.
- The token is permanent per customer; server switching updates active key state.
- Display label format is `#BrandName-FullName`.
- The Shadowsocks import bridge is backend-hosted at `/open-key`; VLESS uses
  the panel subscription URL. The live key's `protocol` controls link display.
- For VLESS, `current_server` identifies the provisioning node, not the node
  selected by the customer's client. Home does not present it as a connected
  server; the Servers page shows subscription nodes as included instead.

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
