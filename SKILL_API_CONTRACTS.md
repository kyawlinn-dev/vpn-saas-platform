# SKILL_API_CONTRACTS.md

## Base URL

All JSON API routes are under `/api`. Local backend runs on port 3000.

## Mini App Routes

Mounted at `/api/miniapp/:slug`.

### `GET /api/miniapp/:slug/config`

Public workspace config for a reseller slug.

### `POST /api/miniapp/:slug/auth`

Authenticates a Telegram Mini App user.

Body:

```json
{ "init_data": "telegram initData string" }
```

Production requires valid Telegram init data. Local development may use the
dev fallback only when `NODE_ENV=development` and no init data is sent.

### `GET /api/miniapp/:slug/plans`

Returns active purchasable plans.

### `GET /api/miniapp/:slug/servers`

Returns all active servers. Use `telegram_user_id` and Telegram init data when
requesting customer-specific access state. Servers are not hidden by package
tier; each row includes access flags so the client can display every available
location while disabling invalid connections.

Important response fields:

```json
{
  "id": "uuid",
  "name": "Outline Singapore 1",
  "region": "sg",
  "country": "Singapore",
  "city": "Singapore",
  "server_tier": "trial",
  "is_current": false,
  "can_access": false,
  "access_reason": "PREMIUM_CANNOT_USE_TRIAL",
  "required_server_tier": "premium"
}
```

Access reasons can be `NO_ACTIVE_PACKAGE`, `TRIAL_CANNOT_USE_PREMIUM`,
`PREMIUM_CANNOT_USE_TRIAL`, or `REGION_NOT_ALLOWED`. A missing
`access_reason` means the authenticated customer can connect.

### `POST /api/miniapp/:slug/servers/:serverId/link`

Switches/links the authenticated Telegram customer to a server.

Body:

```json
{
  "telegram_user_id": 123456789,
  "init_data": "telegram initData string"
}
```

### `POST /api/miniapp/:slug/upload-screenshot`

Uploads a payment screenshot to private Supabase Storage.

Multipart field:

```text
file
telegram_user_id
init_data
```

Response contains a private storage path, not a public URL.

### `POST /api/miniapp/:slug/orders`

Creates a purchase order or submits a top-up payment from the Mini App.

Body:

```json
{
  "telegram_user_id": 123456789,
  "plan_id": "uuid",
  "payment_screenshot_url": "private/storage/path.jpg",
  "payment_note": "optional",
  "init_data": "telegram initData string"
}
```

Behavior:

- If the customer has no active paid purchase, the route creates a new
  `vpn_orders` row, creates an `order_payments` row with
  `payment_type = initial`, and provisions pending-review premium access
  immediately.
- If the customer already has an active paid purchase and no other payment is
  waiting for review, the route creates an `order_payments` row with
  `payment_type = extend` and `apply_status = pending`. It does not add duration
  or GB yet; reseller payment confirmation applies the top-up.
- If the customer already has a pending payment review, the route returns `409`
  to prevent stacked screenshots.

## ssconf And Portal Routes

### `GET /k/:ssconf_token.json`

Customer permanent ssconf endpoint used by Outline. No Telegram auth; token is
the secret.

### `GET /open-key?url=ssconf://...`

Backend-hosted "Add to Outline" bridge page for Mini App links.

Order action and Mini App purchase responses must expose customer access using
`ssconf_token`, `ssconf_url`, `dynamic_access_url`, and
`preferred_access_url`. Do not generate new `/t` or `/sub` links.

Removed public routes:

- `/api/public/plans`
- `/api/public/telegram-miniapp/auth`
- `/api/public/telegram-miniapp/purchase`
- `/t/:token`
- `/sub/:token.json`
- `/sub/:token/:region.json`
- `/sub/:token.ss`
- `/sub/:token/:region.ss`
- `/open/:token/:region`
- `/api/public/subscription?token=tok_xxx`

## Reseller Routes

Mounted under `/api/reseller`, protected by reseller httpOnly auth cookies.
Every query must be scoped by `req.reseller.id`.

Common routes:

- `GET /api/reseller/me`
- `GET /api/reseller/workspace`
- `PATCH /api/reseller/workspace`

`GET/PATCH /api/reseller/workspace` only cover `brand_name`,
`support_username`, and `payment_info` now, plus a read-only
`bot_connected`/`bot_status` indicator. Telegram bot token, `miniapp_slug`,
`brand_logo_url`, `primary_color`, and trial settings moved to admin — see
`PATCH /api/admin/resellers/:id/workspace` below. Resellers can't set up or
change their own bot.
- `GET /api/reseller/launch-readiness`
- `GET /api/reseller/orders`
- `POST /api/reseller/orders`
- `GET /api/reseller/plans`
- `GET /api/reseller/keys`
- `GET /api/reseller/accounting/monthly?month=YYYY-MM`
- `POST /api/reseller/accounting/monthly/settlement`
- `POST /api/reseller/accounting/monthly/settlement-proof`
- `GET /api/reseller/accounting/monthly/settlement-proof-url?month=YYYY-MM`
- `POST /api/reseller/order-actions/:orderId/:action`

Manual order creation accepts customer details, `plan_id`, and a
`payment_status` of `paid` or `unpaid` (unknown values become `unpaid`). The backend always derives `source = dashboard`, derives
`order_type` from `vpn_plans.is_trial`, and derives `review_status` from the
payment state. Clients must not control those accounting fields. When
`customer_id` is provided, it must belong to the authenticated reseller.

Payment review actions:

- `POST /api/reseller/order-actions/:orderId/confirm-payment`
- `POST /api/reseller/order-actions/:orderId/reject-payment`

These update `order_payments` first, then sync the cached money fields on
`vpn_orders`. When a pending Mini App `extend` payment exists, confirmation
applies the package duration and data quota before marking the payment applied.

Package actions:

- `POST /api/reseller/order-actions/:orderId/extend`
- `POST /api/reseller/order-actions/:orderId/renew`

Body:

```json
{
  "plan_id": "uuid",
  "idempotency_key": "browser-generated retry key"
}
```

`extend` requires an active paid order with an active key. It records
`order_payments.payment_type = extend`, applies the package duration to
`expiry_date`, and adds the package data limit to the current key quota.

`renew` requires a stopped or expired paid order. It records
`order_payments.payment_type = renew`, provisions/reactivates access, and starts
the bought package period.

Dashboard clients should send a stable `idempotency_key` for each confirmation
attempt. The backend also accepts the `Idempotency-Key` header.

### `GET /api/reseller/accounting/monthly?month=YYYY-MM`

Returns a reseller-scoped monthly accounting snapshot. When payment ledger rows
exist, the month filter uses `order_payments.created_at` as the period basis.
Legacy orders without ledger rows fall back to `vpn_orders.created_at`.

Response summary:

```json
{
  "period": {
    "month": "2026-07",
    "startIso": "2026-06-30T17:00:00.000Z",
    "endIso": "2026-07-31T17:00:00.000Z"
  },
  "summary": {
    "gross_paid_mmk": 50000,
    "reseller_commission_mmk": 10000,
    "platform_due_mmk": 40000,
    "pending_review_mmk": 0,
    "unpaid_mmk": 0,
    "rejected_mmk": 0,
    "confirmed_order_count": 10,
    "pending_review_count": 0,
    "unpaid_order_count": 0,
    "rejected_order_count": 0,
    "total_order_count": 10
  },
  "settlement_orders": []
}
```

Monthly accounting uses `Asia/Bangkok` boundaries while timestamps remain UTC.

`platform_due_mmk` is computed from confirmed and applied payment ledger rows.
Legacy orders without `order_payments` rows fall back to paid purchase orders
whose `review_status` is `confirmed`.

Money rule:

```text
gross_paid_mmk = order_payments.amount_mmk
reseller_commission_mmk = floor(amount_mmk * commission_percent / 100)
platform_due_mmk = amount_mmk - reseller_commission_mmk
```

### `POST /api/reseller/accounting/monthly/settlement`

Submits or updates a reseller's month-end transfer for admin confirmation.
Confirmed settlements cannot be overwritten by resellers.

Body:

```json
{
  "month": "2026-07",
  "transfer_reference": "transaction id or account reference",
  "transfer_note": "optional note",
  "transfer_proof_url": "optional proof URL"
}
```

Response:

```json
{ "settlement": { "id": "uuid", "status": "submitted" } }
```

### Settlement Proof Upload

`POST /api/reseller/accounting/monthly/settlement-proof` accepts a multipart
image upload for transfer proof. It stores the image in private Supabase Storage
and returns a storage path, not a public URL.

Multipart fields:

```text
month=YYYY-MM
file=<jpeg|png|webp image, max 5 MB>
```

`GET /api/reseller/accounting/monthly/settlement-proof-url?month=YYYY-MM`
returns a short-lived signed URL for the reseller's own settlement proof.

## Admin Routes

Mounted under `/api/admin`, protected by admin httpOnly auth cookies.
Admin routes intentionally have platform-wide visibility.

Common routes:

- `GET /api/admin/me`
- `GET /api/admin/launch-readiness`
- `GET /api/admin/servers`
- `PATCH /api/admin/servers/:serverId/tier`
- `GET /api/admin/resellers`
- `POST /api/admin/resellers`
- `PATCH /api/admin/resellers/:id`
- `GET /api/admin/resellers/:id/workspace`
- `PATCH /api/admin/resellers/:id/workspace`

`GET/PATCH /api/admin/resellers/:id/workspace` own Telegram bot token,
`miniapp_slug` (with a uniqueness check against other resellers), `brand_logo_url`,
`primary_color`, and trial settings (`trial_enabled`, `trial_data_limit_gb`,
`trial_duration_days`). Shares bot-restart/status logic with the reseller
workspace route via `backend/src/services/workspaceSettingsService.js` —
keep both routers using it rather than re-implementing the restart flow.
- `GET /api/admin/plans`
- `POST /api/admin/plans`
- `PATCH /api/admin/plans/:id`
- `GET /api/admin/orders`
- `GET /api/admin/customers`
- `GET /api/admin/customers/:customerId`
- `POST /api/admin/customers/cleanup-preview`
- `POST /api/admin/customers/cleanup-delete`
- `GET /api/admin/keys`
- `GET /api/admin/analytics?month=YYYY-MM`
- `GET /api/admin/settlements?month=YYYY-MM&status=submitted&reseller_id=uuid`
- `GET /api/admin/settlements/:settlementId/proof-url`
- `POST /api/admin/settlements/:settlementId/confirm`
- `POST /api/admin/settlements/:settlementId/reopen`
- `POST /api/admin/order-actions/:orderId/:action`

### Admin Settlement Actions

### Admin Servers

`GET /api/admin/servers` returns `server_tier` for each server. Valid values
are `trial` and `premium`; missing historical values should be treated as
`premium` by clients.

`PATCH /api/admin/servers/:serverId/tier` accepts:

```json
{
  "server_tier": "trial"
}
```

Changing tier is blocked with `409 SERVER_TIER_LOCKED_ACTIVE_KEYS` when the
server still has active VPN keys. Decommission or migrate customers first, then
change tier on an empty server.

Trial orders provision only on `trial` servers. Paid purchase, renew, and
premium migration flows provision only on `premium` servers.

Mini App server link routes apply the same rule: an active trial package can
only link `trial` servers; an active paid package can only link `premium`
servers. The Mini App server list intentionally returns all active servers with
`can_access` and `access_reason` so customers can see every location without
being allowed to connect to the wrong tier.

`GET /api/admin/settlements` returns paginated month-end settlement rows with
reseller metadata. Admins can confirm a submitted settlement or reopen a
confirmed settlement if transfer details need correction.

### `GET /api/admin/orders`

Returns paginated platform-wide orders. Each row includes customer, reseller,
plan, payment ledger rows, VPN key rows, and backend-generated access URLs when
the customer has an `ssconf_token`.

The access fields are:

```json
{
  "ssconf_url": "https://api.example.com/k/token.json",
  "dynamic_access_url": "ssconf://api.example.com/k/token.json#Brand",
  "preferred_access_url": "ssconf://api.example.com/k/token.json#Brand"
}
```

Admin Orders should use `order_payments` rows for payment timeline, gross paid,
commission, platform due, pending review, and payment type display.

### `GET /api/admin/customers`

Returns paginated platform-wide customers. Each row includes reseller metadata,
Telegram link/trial state, customer-level access URLs, enriched order history,
payment ledger summaries, and VPN key history.

Important response fields:

```json
{
  "customer_type": "telegram",
  "telegram_link": {
    "telegram_user_id": 123456789,
    "trial_used_at": "2026-07-22T00:00:00.000Z",
    "trial_order_id": "uuid"
  },
  "active_order": {},
  "orders": [],
  "keys": [],
  "payment_summary": {
    "gross_mmk": 18000,
    "commission_mmk": 3600,
    "platform_due_mmk": 14400,
    "pending_mmk": 0,
    "confirmed_count": 3,
    "pending_count": 0
  },
  "dynamic_access_url": "ssconf://api.example.com/k/token.json#Brand"
}
```

Admin Customers should use `active_order` for the current package display and
`payment_summary` for lifetime paid/customer value.

### `GET /api/admin/customers/:customerId`

Returns one enriched customer for the admin detail drawer/dialog. The response
uses the same shape as a `GET /api/admin/customers` row, but fetches the full
current customer lifecycle on demand. Nested `order_payments` rows include
`payment_type`, `review_status`, `apply_status`, `amount_mmk`,
`commission_amount_mmk`, `platform_due_mmk`, `package_duration_days`, and
`package_data_limit_gb` so admin can audit initial, extend, and renew events.

### Admin Customer Cleanup

These routes are for controlled test-data cleanup only. The client must select
one reseller and exact customer IDs; cleanup never accepts `all` reseller scope.

`POST /api/admin/customers/cleanup-preview`

```json
{
  "reseller_id": "uuid",
  "customer_ids": ["uuid"]
}
```

Returns the selected customers, dependent row counts, confirmed paid amount,
and warnings. If the preview contains confirmed paid ledger data, the delete
route also requires explicit paid-data acknowledgement. If active VPN keys are
not attached to selected orders, cleanup is blocked so live Outline access is
not orphaned.

`POST /api/admin/customers/cleanup-delete`

```json
{
  "reseller_id": "uuid",
  "customer_ids": ["uuid"],
  "confirmation": "DELETE TEST CUSTOMERS",
  "allow_paid_customers": false
}
```

Before deleting database rows, the backend stops selected order access through
the normal order lifecycle so active Outline keys and token assignments are
removed first.

### Admin Order Actions

`POST /api/admin/order-actions/:orderId/confirm-payment` confirms pending
payment ledger rows and records `reviewed_by_admin_id`.

`POST /api/admin/order-actions/:orderId/reject-payment` rejects pending payment
ledger rows and records `reviewed_by_admin_id`. Rejecting an initial purchase
can stop access; rejecting a top-up reverses only the pending package event.

### `GET /api/admin/analytics?month=YYYY-MM`

Returns platform-wide payment analytics for the selected business month. The
route uses the `order_payments` ledger as the source of truth and counts only
`review_status = confirmed` plus `apply_status = applied` rows for gross paid,
commission, and platform due. Legacy confirmed paid purchase orders that have
no `order_payments` rows are included from `vpn_orders.created_at` so migrated
production data stays visible without double-counting ledger-backed orders.
Pending-review amounts are reported separately.
The current business time zone is `Asia/Bangkok`, so local-day revenue aligns
with dashboard testing even though database timestamps are stored as UTC.

Response summary:

```json
{
  "period": {
    "month": "2026-07",
    "time_zone": "Asia/Bangkok",
    "start_iso": "2026-06-30T17:00:00.000Z",
    "end_iso": "2026-07-31T17:00:00.000Z",
    "today": {
      "date": "2026-07-22",
      "start_iso": "2026-07-21T17:00:00.000Z",
      "end_iso": "2026-07-22T17:00:00.000Z"
    }
  },
  "summary": {
    "today_gross_mmk": 18000,
    "month_gross_mmk": 23000,
    "reseller_commission_mmk": 4600,
    "platform_due_mmk": 18400,
    "pending_review_mmk": 0,
    "payment_count": 4,
    "pending_review_count": 0,
    "active_orders": 2,
    "pending_orders": 0,
    "active_keys": 2,
    "active_resellers": 1,
    "submitted_settlements": 0
  },
  "daily_revenue": [],
  "reseller_breakdown": [],
  "payment_type_breakdown": [],
  "recent_payments": [],
  "pending_reviews": []
}
```

## Bot Webhook

### `POST /api/bot-webhook/:resellerId`

Telegram webhook route. Requires `X-Telegram-Bot-Api-Secret-Token`, which must
match the per-bot secret registered by the backend at startup.

Responses:

- `200`: update accepted
- `403`: invalid webhook secret
- `404`: reseller bot not running
