# NovaNet MM — System Design

> Multi-tenant VPN reseller platform. This document captures the target architecture
> and the build plan. It is the source of truth for design decisions — update it as
> decisions change.

---

## 1. Vision

A complete, self-serve VPN reseller platform where:

- **Admin (platform owner)** controls everything: servers, plans, resellers, branding, enable/disable.
- **Resellers (tenants)** each get a login, a reseller dashboard, and a configurable branded workspace (their own bot, brand name, payment details). They sell to their own customers and confirm/reject orders.
- **Customers** belong to a reseller. They open the reseller's bot → branded mini app → buy a plan → pay → get a VPN key → connect via Outline.

Model in one line: **one platform, many resellers, each fully branded, all controlled from the admin dashboard.**

---

## 2. Tenancy Model

```
ADMIN (platform owner)
  controls → servers · plans · resellers · branding · enable/disable · oversight
       │
       ▼
RESELLER (tenant)            each has: miniapp_slug · brand_name · bot token · payment info
  reseller dashboard → configure workspace · confirm/reject orders · view customers
       │
       ▼
MINI APP (white-label, resolved by slug)
  customer opens reseller's bot → mini app loads THAT reseller's brand + plans
       │
       ▼
CUSTOMER
  trial → buy → pay (KBZPay + screenshot) → key delivered immediately → connect
```

Every record is scoped by `reseller_id`. Workspaces resolve by `miniapp_slug`.
Isolation rule: **a customer of reseller A must never see or touch reseller B's data.**

---

## 3. Existing Data Model (Supabase)

These tables already exist and back the design:

| Table | Role |
|---|---|
| `admins` | Platform owner accounts (top-level control) |
| `resellers` | The tenants |
| `reseller_miniapps` | Per-reseller workspace config: `miniapp_slug`, `brand_name`, `is_enabled`, `reseller_id` |
| `vpn_servers` | Servers; Outline API URL + cert stored per-row (multi-provider/region ready) |
| `vpn_plans` | Packages (price, data limit, duration) |
| `vpn_orders` | Orders with `payment_status`, `payment_screenshot_url`, `payment_note` |
| `vpn_keys` | Outline keys; `ssconf_token`, `access_url`, `status` |
| `token_server_assignments` | Maps a token → server (the intended dynamic-key layer) |
| `vpn_customers` | Customers, scoped to a reseller |
| `telegram_links` | Links Telegram users to accounts |
| `access_tokens` | Token-based access |
| `commission_ledger` | Reseller earnings / commission tracking |

---

## 4. Key Design Decisions (Locked)

### 4.1 Key delivery — IMMEDIATE
Customer submits the buy form (with KBZPay screenshot) → **key is delivered immediately**.
Reseller reviews orders **daily** and can confirm or reject afterward (reject → revoke).
Trade-off accepted: favors customer experience; relies on reseller doing daily review.

### 4.2 Dynamic per-customer key — ADOPT PassThru MODEL
**Problem today:** each location switch mints a NEW key (new `ssconf_token` bound to one
server via a frozen `access_url`). Customer must re-add the key in Outline each time.

**Target:** ONE persistent `ssconf_token` per customer. Switching location does **not**
create a new key — it updates which server that token resolves to. The `/ssconf/:token`
route resolves the server **dynamically at request time** from the customer's current
selection (via `token_server_assignments` / a `current_server_id`), not from a frozen
`access_url`.

The machinery mostly exists — the `/ssconf/:token` route already serves dynamic config and
`token_server_assignments` already exists. The fix is to resolve server dynamically and stop
minting per-server keys.

Also add a **display label** to the ssconf URL: `#{brand}-{telegram_username}` (e.g.
`#NovaNetMM-KL`) so the customer sees a friendly name in Outline, matching PassThru.

### 4.3 Bot architecture — OPTION A (single multi-tenant bot service)
ONE bot service loads every reseller's bot token from the DB and runs them all together.
Add a reseller in admin → their token is picked up → their bot goes live. No per-reseller
process, no per-reseller deploy. Every bot update must carry `reseller_id` context through
all handlers to preserve isolation.

---

## 5. Current State — Built vs Missing

**Built and working**
- Multi-tenant data model (resellers, per-reseller miniapp config, commission ledger)
- Backend resolves workspace by slug and returns branding
- Backend buy/order flow: `POST /:slug/orders` (plan_id, screenshot, note; status `unpaid`)
- `GET /:slug/plans`, `/:slug/servers`, `/:slug/config`, `/:slug/auth`
- Reseller dashboard: Login, Overview, Orders, TelegramOrders, Plans pages
- Mini app UI: HomePage, ServersPage, PackagesPage (visually close to PassThru already)
- autoStop background job (expiry handling), per-server capacity tracking

**Missing / unfinished**

> **TOP PRIORITY — Miniapp dynamic-slug (white-label multi-tenancy blocker)**
> Currently `VITE_MINIAPP_SLUG` is baked into the miniapp at build time, so every reseller's
> bot opens the same NovaNet-branded app. True white-label multi-tenancy requires the miniapp
> to read its workspace slug dynamically — from the Telegram `startParam` (passed by the bot
> when it opens the WebApp) — and pass it through to all API calls instead of using the
> hardcoded env var. Until this is done, adding a second reseller gives them NovaNet branding
> and NovaNet plans instead of their own.

- Mini app `features/access/*` and `features/auth/{hooks,store}` — empty (0 bytes)
- Mini app **Buy button + payment form** (KBZPay info + screenshot upload → POST orders)
- Dynamic per-customer key (currently per-server keys — see 4.2)
- Reseller **workspace settings UI** (bot token, brand, payment details) — not started
- Multi-tenant **bot service** (Option A) — not started
- **Admin control layer** polish (manage servers/plans/resellers/oversight)
- Payment automation + 24/7 RAG support bot (from flexibot pattern)

---

## 6. Build Plan (phased; app stays working after each phase)

**Phase 1 — Dynamic per-customer key** ✅ DONE
Refactor to one persistent token per customer resolving to current server dynamically.
Add `#brand-username` label. Everything else builds on this key model.

**Phase 2 — Finish mini app auth/access modules** ✅ DONE
Fill the empty `features/auth` and `features/access` modules, workspace-aware, wired to the
existing `/:slug/auth` and `/:slug/config` endpoints.

**Phase 3 — Buy / payment flow** ✅ DONE
Buy button on each package → payment form (reseller's KBZPay info + screenshot upload) →
`POST /:slug/orders` → immediate key delivery → order appears in reseller dashboard.

**Phase 4 — Reseller workspace settings** ✅ DONE
Reseller dashboard section to set brand name, bot token, KBZPay/bank details, support link.
Reads/writes `reseller_miniapps` + `resellers`.

**Phase 5 — Multi-tenant bot service (Option A)** ✅ DONE
Single service loading all reseller tokens, routing each customer to the right branded
mini app, isolated by `reseller_id`.

**Phase 6 — Admin control layer**
Admin dashboard to manage servers, plans, resellers (enable/disable, oversee orders).
- **6A** ✅ DONE — Admin session auth (`/api/admin/auth/*`), `requireAdminAuth` + `requireAdmin` middleware
- **6B** ✅ DONE — Admin data endpoints: cross-reseller GET for customers, orders, plans, keys
- **6C** ✅ DONE — Reseller management: atomic create (auth user + resellers row + miniapp row with rollback), enable/disable
- **6D** ✅ DONE — Plan management UI: create/edit/toggle plans (`adminPlansRouter`, `PlansTab`)
- **6E** ✅ DONE — Server tab (capacity bar + edit-capacity dialog), admin order actions (activate/extend/stop with confirm dialog + admin-id logging; unscoped cross-reseller fetch)

**Phase 7 — Automation & RAG support bot**
Auto key-delivery refinements + 24/7 RAG customer-service bot (flexibot architecture:
Gemini + Vertex AI RAG + Supabase + Redis memory).

---

## 8. Technical Debt / Cleanup

### Before production — security blockers

| Item | Location | Risk | Status |
|------|----------|------|--------|
| Remove `GET /api/public/plans/debug/outline` | `backend/src/routes/public/planRoutes.js` | No-auth endpoint; skips TLS cert pinning (`rejectUnauthorized: false`) against live servers | ✅ Done |

### Delete dead code (safe any time)

| Item | Location | Why dead | Status |
|------|----------|----------|--------|
| `resellerAuthRouter.js` | `backend/src/routes/reseller/resellerAuthRouter.js` | Never imported or mounted in `server.js`. Returns a raw `access_token` in the response body (no httpOnly cookie) — wrong auth pattern. | ✅ Done |

### Eventual legacy removal (after miniapp is fully migrated)

These are live but unused by any current customer flow. Remove once confirmed no customer traffic reaches them.

| Item | Notes |
|------|-------|
| Cloudflare Worker (`worker/worker.js`) + `wrangler.toml` | Only serves the `tok_xxx` token portal (`/t/:token`, `/sub/:token/*`). No current flow creates token portal URLs. |
| `GET /api/public/subscription?token=<tok>` | Only called by the Worker above. |
| `POST /api/public/telegram-miniapp/auth` and `/purchase` | Old single-bot miniapp paradigm. Uses global `TELEGRAM_BOT_TOKEN` instead of per-reseller tokens. |
| `access_tokens` table | Backing store for the legacy token flow. Orphaned once the Worker is removed. |
| `token_server_assignments` table | Maps `tok_xxx` tokens to servers. Orphaned with `access_tokens`. |
| `vpn_keys.ssconf_token` column | Superseded by `vpn_customers.ssconf_token` (the per-customer permanent token used by `/api/miniapp/:slug/ssconf/:token`). |
| `telegram-bot/` directory | Pre-Phase-5 standalone bot. The multi-tenant bot now runs inside the backend process (`backend/src/bot/`). |

---

## 7. Engineering Principles

- **Incremental, reversible steps.** App works after every change. No big-bang rewrites.
- **Git baseline before refactors.** Commit a known-good state first; secrets gitignored.
- **Reseller isolation everywhere.** Always scope by `reseller_id` / `miniapp_slug`.
- **Config over code.** Adding a reseller/server/plan is data, not a code change.
- **Capture decisions here.** This doc is the source of truth; update it as things evolve.
