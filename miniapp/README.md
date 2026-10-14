# NovaNet MM Telegram Mini App

React + Vite, Tailwind, TanStack Query and Telegram WebApp integration. Production static files are served by Droplet Nginx at app.novanetmm.com; deployment is the manual Ansible deploy-miniapp.yml playbook.

## Local development

From this directory:

    npm ci
    npm run dev

Vite normally uses port 5173. Use ignored .env.local with the intended development API base. Runtime workspace slug comes from Telegram start_param; VITE_MINIAPP_SLUG is a local fallback. Real authenticated flows require valid Telegram init data; do not replace production verification with a browser bypass.

The development backend can proxy the Mini App through the configured tunnel. See ../docs/MESSENGER_LOCAL_SETUP.md for that optional local arrangement; it does not change production hosting.

## Validation

    node --test tests/paymentStatus.test.js
    npm run lint
    npm run build

Configure VITE_BACKEND_BASE_URL or VITE_API_BASE_URL as supported by src/features/auth/api.js. Production build env lives at /var/www/novanet/miniapp-source/.env.production. Never include service-role credentials.

## Business behavior

Explicit trial claims, immediate initial purchase access pending review, and one queued next package use the backend lifecycle. Home reads canonical subscription quota. App choice controls Shadowsocks versus VLESS imports; live protocol comes from the key.

See ../SKILL_MINIAPP.md, ../SKILL_API_CONTRACTS.md, ../SCHEMA.md and ../DEPLOYMENT.md. src/i18n/language.jsx is the copy source; ../MINIAPP_TEXT.md is its generated reference.
