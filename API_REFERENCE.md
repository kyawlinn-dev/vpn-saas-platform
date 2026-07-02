# API Reference — NovaNet MM Backend

Single source of truth for all backend endpoints, service functions, and middleware. Reflects actual code as of Checkpoint 2 (Phase 6B+6C).

- Backend runs on `:3000` locally, exposed via ngrok tunnel
- All JSON requests: `Content-Type: application/json`
- Auth cookies: `HttpOnly`, `SameSite=None`, `Secure`

---

## Section 1 — MINIAPP ENDPOINTS

**Base:** `/api/miniapp/:slug/*`  
**Auth:** None (public). `slug` identifies the reseller's miniapp via `reseller_miniapps.miniapp_slug`.  
**Rate limit:** `/upload-screenshot` has its own limit: 10 req/15min per IP.

All routes check `reseller_miniapps.is_enabled` and return `403` if the miniapp is disabled.

---

### `GET /api/miniapp/:slug/config`

Returns public brand/trial config for the miniapp. No auth.

**Response:**
```json
{
  "success": true,
  "data": {
    "miniapp": { "slug": "...", "enabled": true },
    "brand": { "name": "...", "logo_url": "...", "support_username": "...", "primary_color": "#2f7bff" },
    "trial": { "enabled": true, "data_limit_gb": 5, "duration_days": 7 },
    "payment": [{ "method": "KBZPay", "account_name": "...", "account_number": "..." }]
  }
}
```

---

### `POST /api/miniapp/:slug/auth`

Authenticates a Telegram user (from `initData`). On first visit: creates `vpn_customers` + `telegram_links` rows, optionally creates a trial order if `trial_enabled=true` and trial not yet used. Always ensures the customer has a `ssconf_token`.

**Body:**
```json
{ "telegram_user": { "id": 123456, "username": "...", "first_name": "...", "last_name": "..." } }
```

**Response:**
```json
{
  "success": true,
  "message": "Mini App auth successful",
  "data": {
    "brand": { "name": "...", "logo_url": "...", "support_username": "...", "primary_color": "..." },
    "user": { "customer_id": "...", "full_name": "...", "telegram_user_id": 123456, "telegram_username": "..." },
    "subscription": {
      "order_id": "...", "type": "trial|purchase", "status": "active",
      "payment_status": "paid|unpaid", "review_status": "confirmed|pending_review",
      "plan_name": "...", "data_limit_gb": 10, "start_date": "...", "expiry_date": "..."
    },
    "current_server": { "id": "...", "name": "...", "region": "...", "is_current": true },
    "outline_key": {
      "ssconf_token": "<customer's permanent token>",
      "ssconf_url": "https://ngrok.../api/miniapp/:slug/ssconf/:token",
      "dynamic_access_url": "ssconf://ngrok.host/api/miniapp/:slug/ssconf/:token#BrandName-username",
      "data_limit_bytes": null,
      "used_bytes": 0
    },
    "trial": { "created_now": false, "used": true }
  }
}
```

`subscription` and `outline_key` are `null` if no active order.

**Trial creation logic:** Only if `miniapp.trial_enabled=true`, `telegram_links.trial_used_at=null`, and no existing active order. Looks up a plan with `is_trial=true, is_active=true`. Creates `vpn_orders` row with `status=active, payment_status=paid, review_status=confirmed, order_type=trial`. Does NOT provision an Outline key here — key is provisioned lazily on the server-link step.

---

### `GET /api/miniapp/:slug/plans`

Returns purchasable plans (`is_trial=false, is_active=true, price_mmk > 0`).

**Response:** `{ "success": true, "data": { "plans": [...] } }`  
Each plan: `id, name, price_mmk, data_limit_gb, duration_days, max_devices, features, sort_order`

---

### `GET /api/miniapp/:slug/servers?telegram_user_id=<id>`

Returns all active servers. If `telegram_user_id` is provided, enriches with `is_current` (their active key's server) and `can_access` (whether the server's region is in their plan's `allowed_regions`).

**Response:** `{ "success": true, "data": { "servers": [...] } }`  
Each server: `id, name, region, region_code, country, city, flag, server_number, is_default, is_current, can_access`

`can_access` is always `false` when `telegram_user_id` is not provided.

---

### `POST /api/miniapp/:slug/servers/:serverId/link`

Links (or switches) the customer's VPN key to a specific server. Provisions a new Outline key on the target server, deletes old keys, updates `vpn_keys`. Atomic with rollback if any step fails.

**Body:** `{ "telegram_user_id": 123456 }`

**Guards:**
- Customer must be registered (telegram_links row must exist)
- Customer must have an active order
- Server's region must be in the plan's `allowed_regions`
- If already on this server, returns the existing key (idempotent)

**Response:**
```json
{
  "success": true,
  "message": "Server linked successfully",
  "data": {
    "current_server": { "id": "...", "name": "...", "region": "...", "is_current": true },
    "outline_key": { "ssconf_token": "...", "ssconf_url": "...", "dynamic_access_url": "...", "data_limit_bytes": ..., "used_bytes": 0 }
  }
}
```

---

### `POST /api/miniapp/:slug/orders`

Submits a purchase order. Provisions VPN access immediately on the default server. Order starts as `status=active, payment_status=unpaid, review_status=pending_review`. Access is granted while the reseller reviews payment.

**Body:** `{ "telegram_user_id": 123456, "plan_id": "...", "payment_screenshot_url": "...", "payment_note": "..." }`

**Guards:**
- Plan must exist, `is_active=true`, not a trial, `price_mmk > 0`
- If a `pending_review` purchase order already exists with an active key: returns `409` with the existing order
- If a `pending_review` purchase order exists but has no key yet: creates a key and returns `200`
- Default server (`is_default=true`) must be active and configured

**Response 201:** New order created + key provisioned.  
**Response 200:** Existing keyless pending order re-provisioned.  
**Response 409:** Already has pending order with active key.

---

### `POST /api/miniapp/:slug/upload-screenshot`

Accepts a multipart/form-data image, validates magic bytes, uploads to private `payment-screenshots` Supabase Storage bucket using the service-role key. The anon key is never used.

**Form fields:** `file` (image/jpeg, image/png, or image/webp, max 5 MB), `telegram_user_id`

**Guards:** Customer must be registered AND have at least one order in this reseller's system.

**Response:** `{ "path": "slug/reseller_id/uuid.jpg" }`

The returned `path` is a storage path, not a URL. To generate a signed URL, call `GET /api/reseller/orders/:orderId/screenshot-url`.

---

### `GET /api/miniapp/:slug/ssconf/:token`

Serves the Shadowsocks config for the Outline app. Called by the Outline app when syncing the `ssconf://` subscription URL. `token` is `vpn_customers.ssconf_token` (permanent per-customer, per-reseller token).

Resolves: customer → best active order (purchase wins over trial) → most recent active `vpn_keys` row → parses `access_url`.

**Response (Outline-compatible):**
```json
{ "server": "...", "server_port": 12345, "password": "...", "method": "chacha20-ietf-poly1305" }
```

**Errors:** `404` (miniapp/customer not found), `410` (no active subscription or expired), `403` (miniapp disabled)

---

## Section 2 — RESELLER ENDPOINTS

### 2A — Auth (no session required)

**Rate limit:** 20 req/15min. `requireTrustedOrigin` applies.

#### `POST /api/auth/reseller/login`
Body: `{ "email": "...", "password": "..." }`  
Calls Supabase `signInWithPassword`. Sets `reseller_access_token` (1hr) and `reseller_refresh_token` (7d) as HttpOnly cookies.  
**Response:** `{ "user": { "id": "...", "email": "..." } }`

#### `POST /api/auth/reseller/refresh`
Reads `reseller_refresh_token` cookie. Calls Supabase `refreshSession`. Rotates both cookies.  
**Response:** `{ "user": { "id": "...", "email": "..." } }`

#### `POST /api/auth/reseller/logout`
Reads `reseller_access_token` cookie. Calls `supabase.auth.admin.signOut`. Clears both cookies.  
**Response:** `{ "success": true }`

#### `GET /api/auth/reseller/me`
Reads `reseller_access_token` cookie. Returns Supabase user object.  
**Response:** `{ "id": "...", "email": "..." }`

---

### 2B — Protected Reseller Routes

**Middleware chain:** `requireTrustedOrigin` → `requireAuth` → `requireActiveReseller`  
`req.reseller` is set after middleware: `{ id, name, email, status, commission_percent, ... }`

#### `GET /api/reseller/me`
**Response:** `{ id, name, email, status, commission_percent, created_at, user: { id, email } }`

---

#### `GET /api/reseller/workspace`
Returns miniapp settings. `bot_connected` is a boolean derived from `bot_token_encrypted` — the encrypted value and decrypted token are never returned.

**Response:**
```json
{
  "miniapp_slug": "...", "brand_name": "...", "brand_logo_url": "...",
  "support_username": "...", "primary_color": "#2f7bff",
  "trial_enabled": false, "trial_data_limit_gb": 5, "trial_duration_days": 7,
  "payment_info": [],
  "bot_connected": true
}
```

#### `PATCH /api/reseller/workspace`
Updates workspace settings. Accepts any subset of: `brand_name`, `brand_logo_url`, `support_username`, `primary_color` (strings), `trial_enabled` (boolean), `trial_data_limit_gb`, `trial_duration_days` (number or null), `payment_info` (array with `{method, account_name, account_number}`), `bot_token` (string, non-empty).

When `bot_token` is provided: encrypts with AES-256-GCM, stores as `bot_token_encrypted`, then calls `botManager.restartBot(resellerId)` to re-register the Telegram webhook.

**Response:** `{ "success": true }` or `{ "success": true, "bot_registered": true|false, "bot_error": "..." }`

---

#### `GET /api/reseller/orders`

Returns the reseller's orders, scoped to `req.reseller.id`. Supports query filters: `status`, `review_status`, `source`, `order_type`, `customer_id`. Joins `vpn_customers`, `vpn_plans`, `access_tokens`.

**Response:** Array of order objects with nested customer, plan, and access_tokens.

#### `POST /api/reseller/orders`

Creates a new order. Upserts customer by phone → telegram_username → full_name (creates if not found).

**Body:** `{ "customer": { "full_name": "...", "phone": "...", "telegram_username": "..." }, "plan_id": "...", "payment_status": "paid|unpaid", "expiry_date": "YYYY-MM-DD", "notes": "..." }`

Order defaults: `status=pending`, `source=dashboard`, `review_status=confirmed`.

**Response:** Created order object.

#### `GET /api/reseller/orders/:orderId/screenshot-url`

Generates a 60-minute signed URL for the order's `payment_screenshot_url`. Legacy `http://` paths are returned directly without signing.

**Response:** `{ "url": "..." }`

---

#### `GET /api/reseller/keys`

Returns all VPN keys for this reseller (joined with order and customer). Batch-fetches Prometheus metrics via SSH for each distinct active server and enriches keys with `used_bytes_30d`, `used_gb_30d`, `data_limit_gb`, `remaining_gb_30d`, `recent_connections_24h`.

**Response:** Array of enriched key objects.

---

#### Order Actions — `POST /api/reseller/order-actions/:orderId/<action>`

**Rate limit:** 60 req/5min.

| Action | Guards | Effect |
|--------|--------|--------|
| `activate` | `status=pending`, `payment_status=paid` | Provisions Outline keys via `activateOrRenewOrder`, creates `access_token`. Returns `{ token, subscription_url }` |
| `extend` | `status` in `[active, expired, stopped]` | Extends `expiry_date`. Updates key data limits. |
| `confirm-payment` | — | Sets `review_status=confirmed, payment_status=paid, total_paid_mmk`. Creates `commission_ledger` entry. |
| `reject-payment` | — | Sets `status=stopped, review_status=rejected`. Deactivates `token_server_assignments`. Deletes Outline keys. |
| `payment-status` | — | Sets `payment_status` to `paid`, `unpaid`, or `overdue`. |

---

## Section 3 — ADMIN ENDPOINTS

### 3A — Auth (no session required)

**Rate limit:** 20 req/15min. `requireTrustedOrigin` applies.

#### `POST /api/admin/auth/login`
Body: `{ "email": "...", "password": "..." }`  
Calls Supabase `signInWithPassword`, then queries `admins` table to verify `status=active`. Sets `admin_access_token` (1hr) and `admin_refresh_token` (7d) as HttpOnly cookies.  
Returns `403` if email not in `admins` table or `status != 'active'`.

#### `POST /api/admin/auth/refresh`
Rotates `admin_access_token` / `admin_refresh_token` cookies.

#### `POST /api/admin/auth/logout`
Clears `admin_access_token` / `admin_refresh_token` cookies, calls `supabase.auth.admin.signOut`.

#### `GET /api/admin/auth/me`
Returns Supabase user: `{ id, email }`.

---

### 3B — Protected Admin Routes

**Middleware chain:** `requireTrustedOrigin` → `requireAdminAuth` → `requireAdmin`  
`req.admin` is set: `{ id, full_name, email, status }`

#### `GET /api/admin/me`
Returns admin profile from `admins` table.

---

#### `GET /api/admin/servers`
All servers ordered by `is_default desc, current_active_keys asc`.  
**Response:** `{ "success": true, "servers": [...] }`

#### `GET /api/admin/servers/inventory`
Returns capacity summary from `getServerInventorySummary()`.  
**Response:** `{ "total", "available", "provisioning", "active_configured", "active_not_ready", "full", "failed" }`

#### `GET /api/admin/servers/:serverId`
Single server by UUID.

#### `POST /api/admin/servers/provision`
Requires `DO_AUTO_PROVISION_ENABLED=true` env flag. Starts async DigitalOcean provisioning (droplet create → SSH → Outline install → parse apiUrl + certSha256). Returns `202 Accepted` immediately.

#### `PATCH /api/admin/servers/:serverId/capacity`
Body: `{ "max_active_keys": 100 }`  
Updates `vpn_servers.max_active_keys`.

---

#### `GET /api/admin/resellers`
All resellers with `miniapp_slug` and `miniapp_enabled` joined from `reseller_miniapps`.  
**Response:** Array of `{ id, name, email, status, commission_percent, created_at, miniapp_slug, miniapp_enabled }`

#### `POST /api/admin/resellers`
Atomically creates: Supabase auth user → `resellers` row → `reseller_miniapps` row.  
Rolls back all previous steps if any step fails.

**Body:** `{ "name": "...", "email": "...", "commission_percent": 20, "miniapp_slug": "optional" }`

- `miniapp_slug` is sanitized (a-z, 0-9, hyphens) or auto-derived from `name` if omitted
- Slug uniqueness is checked before any writes
- Returns a one-time `temp_password` — never stored in plaintext

**Response 201:** `{ "success": true, "reseller": { id, name, email, status, commission_percent, miniapp_slug }, "temp_password": "..." }`

#### `PATCH /api/admin/resellers/:id`
Body: `{ "enabled": true|false }`  
Updates `resellers.status` to `active` or `disabled`. Syncs `reseller_miniapps.is_enabled`. Miniapp sync failure is non-fatal (logged as warning).

---

#### `GET /api/admin/customers`
All customers across all resellers. Joins `resellers` table.

#### `GET /api/admin/orders`
All orders across all resellers. Joins `vpn_customers`, `vpn_plans`, `resellers`.

#### `GET /api/admin/plans`
All plans including inactive, ordered by `price_mmk asc`.

#### `GET /api/admin/keys`
All VPN keys across all resellers. Joins `vpn_orders`.

---

## Section 4 — BOT WEBHOOK

### `POST /api/bot-webhook/:resellerId`

Public route. Authentication via `X-Telegram-Bot-Api-Secret-Token` header (compared with `timingSafeEqual` to prevent timing attacks).

Telegram calls this for each update sent to the reseller's bot. The backend delegates to `botManager.processUpdate(resellerId, incomingSecret, update)`.

**Returns:**
- `200 OK` — update processed
- `403 Forbidden` — secret token mismatch
- `404 Not Found` — no bot configured for this resellerId

---

## Section 5 — LEGACY / DEAD ENDPOINTS

### `GET /api/public/subscription?token=<tok>` — **LEGACY**

Called only by the Cloudflare Worker (`worker/worker.js`). Queries `access_tokens` + `token_server_assignments` to return a list of server configs with parsed Shadowsocks credentials.

Nothing in the current miniapp or dashboard flow creates `access_tokens` or `token_server_assignments` records. The worker is deployed but effectively dead — no customer reaches it via the current miniapp UI. Marked for eventual removal.

---

### `GET /api/public/plans` — semi-legacy

Returns all active plans ordered by price. Used by the legacy Telegram miniapp flow (`telegramMiniAppRoutes`). The current miniapp uses `GET /api/miniapp/:slug/plans` instead.

---

### `POST /api/public/telegram-miniapp/auth` — **OLD MINIAPP PARADIGM**
### `POST /api/public/telegram-miniapp/purchase` — **OLD MINIAPP PARADIGM**

These routes use Telegram `initData` (HMAC-SHA256 verification with `TELEGRAM_BOT_TOKEN`) and the **single global bot token** rather than the multi-tenant per-reseller architecture. They use `access_tokens` + `token_server_assignments` instead of the slug-based `vpn_customers.ssconf_token` system.

Retain for backward compatibility but do not build new features on top of these.

---

### ~~`POST /api/auth/reseller-legacy/login`~~ — **DELETED**

`backend/src/routes/reseller/resellerAuthRouter.js` has been deleted. This endpoint no longer exists.

---

## Section 6 — KEY SERVICE FUNCTIONS

### `outlineService.js` (`backend/src/services/`)

All calls use a TLS cert-pinned HTTPS agent (`certSha256` fingerprint match in `checkServerIdentity`). All calls retry on 5xx/network errors (408, 425, 429, 500-504, timeouts, ECONNRESET, etc.).

| Function | Outline API | Notes |
|----------|-------------|-------|
| `testOutlineServer({ apiUrl, certSha256 })` | `GET /server` | Returns server info. Used to validate connectivity. |
| `listOutlineKeys({ apiUrl, certSha256 })` | `GET /access-keys` | Returns `accessKeys[]` array. |
| `getOutlineKey({ apiUrl, certSha256, outlineKeyId })` | `GET /access-keys/:id` | Returns `null` on 404 instead of throwing. |
| `createOutlineKey({ apiUrl, certSha256, name, dataLimitBytes })` | `POST /access-keys` + `PUT /access-keys/:id/data-limit` | If data-limit PUT fails, deletes the just-created key before throwing. Returns `{ outline_key_id, key_name, access_url }`. |
| `renameOutlineKey({ apiUrl, certSha256, outlineKeyId, name })` | `PUT /access-keys/:id/name` | |
| `updateOutlineKeyDataLimit({ apiUrl, certSha256, outlineKeyId, dataLimitBytes })` | `PUT` or `DELETE /access-keys/:id/data-limit` | Passes `null`/`0` to remove limit (DELETE). |
| `deleteOutlineKey({ apiUrl, certSha256, outlineKeyId })` | `DELETE /access-keys/:id` | 404 → `{ success: true, already_missing: true }` (silent). |

---

### `subscriptionProvisionService.js` (`backend/src/services/`)

Manages the `vpn_keys` + `token_server_assignments` lifecycle.

**`provisionServersForToken({ token, order, customer, reseller, plan, servers })`**

For each server in `servers`:
1. Checks for an existing `vpn_keys` row for this order+server — reuses it if found (idempotent retry path)
2. Otherwise calls `createOutlineKey`, inserts `vpn_keys`, upserts `token_server_assignments`, calls `incrementServerUsage`
3. On any failure: decrements server usage, deactivates assignment, marks key deleted, cleans up Outline key

Returns: `[{ tag, region, server, port, method, password }, ...]`

**`deactivateTokenAssignments(tokenId)`**  
Sets `token_server_assignments.is_active=false` for all assignments of a token.

**`deleteProvisionedKeysForOrder(orderId)`**  
For each active `vpn_keys` row: calls `deleteOutlineKey`, decrements server usage, marks key `status=deleted`.

**`updateProvisionedKeyLimitsForOrder({ orderId, plan })`**  
For each active key: calls `updateOutlineKeyDataLimit`, resets `used_bytes=0`.

---

### `tokenService.js` (`backend/src/services/`)

Manages `access_tokens` table (the legacy token-based flow).

| Function | Description |
|----------|-------------|
| `generateAccessToken()` | Returns `tok_<48 hex chars>` |
| `getTokenByOrderId(orderId)` | Returns active token, or most recent if none active |
| `createAccessToken({ customerId, resellerId, orderId, expiresAt })` | Inserts new token row |
| `ensureOrderToken({ customerId, resellerId, orderId, expiresAt })` | Idempotent: updates existing token or creates new. Race-safe via INSERT→catch→re-read pattern. |
| `deactivateToken(tokenId)` | Sets `status=inactive` |
| `activateToken(tokenId, expiresAt)` | Sets `status=active`, updates `expires_at` |

---

### `tokenEncryption.js` (`backend/src/lib/`)

AES-256-GCM encryption for Telegram bot tokens. Key loaded once from `BOT_TOKEN_ENCRYPTION_KEY` env (must be 64 hex chars / 32 bytes). Validated at server startup via `validateEncryptionKey()`.

| Function | Description |
|----------|-------------|
| `validateEncryptionKey()` | Throws at boot if key is missing or wrong length |
| `encrypt(plaintext)` | Returns `iv_hex:authTag_hex:ciphertext_hex` |
| `decrypt(stored)` | Decrypts `iv:authTag:ciphertext` format. **Only called by `bot/manager.js`** when starting a bot — never called in any HTTP response path. |

---

### `serverService.js` (`backend/src/services/`)

| Function | Description |
|----------|-------------|
| `getServerById(serverId)` | Returns single `vpn_servers` row or throws |
| `listServers()` | All servers, ordered by `is_default desc`, `current_active_keys asc`, `created_at desc` |
| `getAvailableServer()` | First server that is `status=active`, has `outline_api_url`+`outline_cert_sha256`, and `current_active_keys < max_active_keys`. Throws `ServerAvailabilityError` if none. |
| `getActiveServers({ regions, limit })` | Like `getAvailableServer` but returns multiple, optionally filtered by region array |
| `incrementServerUsage(serverId)` | Optimistic-concurrency loop (5 attempts): read → conditional update where `current_active_keys` still equals last-read value. Throws `ServerAvailabilityError` if server is full or if all 5 attempts hit races. |
| `decrementServerUsage(serverId)` | Same optimistic-concurrency pattern, floors at 0 |
| `setServerError(serverId, message)` | Updates `last_error` column (truncated to 1000 chars) |
| `clearServerError(serverId)` | Sets `last_error=null` |
| `getServerInventorySummary()` | Returns `{ total, available, provisioning, active_configured, active_not_ready, full, failed }` |

`ServerAvailabilityError` has `.code`: `NO_ACTIVE_SERVER`, `SERVER_FULL`, `SERVER_USAGE_RACE`, `MISSING_REGION_CAPACITY`.

---

### `outlineMetricsService.js` (`backend/src/services/`)

**`getOutlineMetricsForServer(host)`**  
SSHs into the server (via `ssh2`), curls the local Prometheus endpoint, parses per-key bandwidth (30d bytes) and TCP connection (24h) metrics. Returns a `Map<outlineKeyId, { used_bytes_30d, connections_24h }>`.

**`buildKeyUsageView(key, metricsMap)`**  
Enriches a `vpn_keys` row with:
- `used_bytes_30d`, `used_gb_30d`
- `data_limit_gb` (from `data_limit_bytes`)
- `remaining_gb_30d`
- `recent_connections_24h`

Used exclusively in `GET /api/reseller/keys` to display usage stats in the reseller dashboard.

---

### `bot/manager.js` (`backend/src/bot/`)

Manages per-reseller Telegraf bot instances. Runs inside the backend process, started after `app.listen()`.

| Function | Description |
|----------|-------------|
| `start()` | Loads all `reseller_miniapps` rows with `bot_token_encrypted` set, decrypts each, registers Telegraf webhooks |
| `startBotForReseller(row)` | Decrypts `bot_token_encrypted`, creates Telegraf instance, calls `bot.telegram.setWebhook(...)` pointing to `/api/bot-webhook/:resellerId`, stores in internal map |
| `stopBotForReseller(resellerId)` | Removes from map |
| `restartBot(resellerId)` | Re-reads DB row, re-decrypts, re-registers webhook. Called by `PATCH /api/reseller/workspace` after saving a new bot token. |
| `processUpdate(resellerId, incomingSecret, update)` | Validates secret with `crypto.timingSafeEqual`, dispatches `update` to the Telegraf instance for that resellerId |

---

## Section 7 — MIDDLEWARE

All middleware is in `backend/src/middleware/`.

---

### `requireTrustedOrigin`

**Applies to:** All mutating methods (POST/PUT/PATCH/DELETE) on reseller, admin, and miniapp-mutation routes. GET/HEAD/OPTIONS pass through unchecked.

Checks the `Origin` request header against:
- Explicit allowlist from env: `RESELLER_DASHBOARD_URL`, `ADMIN_DASHBOARD_URL`, `MINIAPP_URL`, `TELEGRAM_MINIAPP_URL`, `PUBLIC_WORKER_BASE_URL`, `CORS_ALLOWED_ORIGINS` (comma-separated), plus hardcoded `localhost:3001/3002/5173/5174`
- In non-production only: `*.pages.dev`, `*.ngrok-free.app`, `*.ngrok-free.dev` hostnames

Returns `403` if origin is missing or not in the allowlist.

---

### `requireAuth`

Reads `reseller_access_token` cookie. Calls `supabase.auth.getUser(token)`. Sets `req.user = { id, email }`. Returns `401` if cookie is missing or token is invalid.

---

### `requireAdminAuth`

Same as `requireAuth` but reads `admin_access_token` cookie. Sets `req.user`. Returns `401` on failure.

---

### `requireActiveReseller`

Runs after `requireAuth`. Queries `resellers` table where `supabase_user_id = req.user.id`. Checks `status = 'active'`. Sets `req.reseller`. Returns `401` if not found, `403` if status is not active.

---

### `requireAdmin`

Runs after `requireAdminAuth`. Queries `admins` table where `supabase_user_id = req.user.id` (column is `full_name`, not `name`). Checks `status = 'active'`. Sets `req.admin`. Returns `401` if not found, `403` if status is not active.

---

### Rate Limiters (configured in `server.js`)

| Limiter | Window | Max | Applied to |
|---------|--------|-----|------------|
| `authLimiter` | 15 min | 20 | `/api/auth/reseller/*`, `/api/admin/auth/*` |
| `actionLimiter` | 5 min | 60 | `/api/reseller/order-actions/*` |
| `uploadLimiter` | 15 min | 10 | `POST /api/miniapp/:slug/upload-screenshot` |

---

## Utility Notes

### CORS

Backend sets CORS headers for all origins (reflects the request Origin). Not allowlist-filtered at CORS level — `requireTrustedOrigin` handles mutation gating. All responses include `Access-Control-Allow-Credentials: true`.

### Health Check

`GET /api/health` — no auth, returns `{ "ok": true, "message": "VPN reseller backend is running" }`.

### Auto-Stop Job

`backend/src/jobs/autoStopJob.js` — `setInterval` running hourly inside the backend process. Finds `vpn_orders` with `status=active` and `expiry_date < today`, fetches **all** active non-deleted `vpn_keys` for each order (not just the first), deletes each from Outline, decrements server usage per key, hard-deletes each row, then sets the order `status=stopped`. No external trigger — runs entirely within the backend process.
