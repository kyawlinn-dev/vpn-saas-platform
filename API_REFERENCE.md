# API Reference - NovaNet MM Backend

This file mirrors the active backend route surface. All dashboard and Mini App
data goes through the Express backend; frontend code must never use the
Supabase service-role key.

## Health

`GET /api/health`

Returns backend process health.

## Mini App

Mounted at `/api/miniapp/:slug`.

| Method | Route | Purpose |
|---|---|---|
| GET | `/:slug/config` | Public reseller workspace config |
| POST | `/:slug/auth` | Telegram Mini App auth and customer upsert |
| GET | `/:slug/plans` | Active purchasable plans |
| GET | `/:slug/servers` | Active servers and customer access state |
| POST | `/:slug/servers/:serverId/link` | Link/switch customer server |
| POST | `/:slug/upload-screenshot` | Private payment screenshot upload |
| POST | `/:slug/orders` | Create purchase and provision access |

Expensive public Mini App routes have per-IP rate limits.

## Customer Config And Portal

| Method | Route | Purpose |
|---|---|---|
| GET | `/k/:ssconf_token.json` | Permanent customer ssconf endpoint |
| GET | `/open-key?url=ssconf://...` | Mini App Add-to-Outline bridge |

Order activation, renewal, and Mini App purchase responses return the current
dynamic key shape:

```json
{
  "ssconf_token": "32-char-customer-token",
  "ssconf_url": "https://api.example.com/k/32-char-customer-token.json",
  "dynamic_access_url": "ssconf://api.example.com/k/32-char-customer-token.json#Brand-Customer",
  "preferred_access_url": "ssconf://api.example.com/k/32-char-customer-token.json#Brand-Customer"
}
```

## Removed Legacy Public Routes

These routes are intentionally no longer mounted:

- `GET /api/public/plans`
- `POST /api/public/telegram-miniapp/auth`
- `POST /api/public/telegram-miniapp/purchase`
- `GET /t/:token`
- `GET /sub/:token.:format`
- `GET /sub/:token/:region.:format`
- `GET /open/:token/:region`
- `GET /api/public/subscription?token=tok_xxx`

The old single-bot Mini App paradigm and token-portal subscription format are
retired. Production Mini App traffic is slug-scoped and verifies against each
reseller bot token. Customer VPN import uses `/k/:ssconf_token.json`.

## Reseller API

Protected by reseller auth cookies and `requireActiveReseller`.

| Route | Purpose |
|---|---|
| `GET /api/reseller/me` | Current reseller profile |
| `GET /api/reseller/workspace` | Mini App/bot/brand/payment settings |
| `PATCH /api/reseller/workspace` | Update workspace settings |
| `GET /api/reseller/launch-readiness` | Reseller launch checks |
| `GET /api/reseller/orders` | Reseller-scoped orders |
| `GET /api/reseller/plans` | Active plans available for reseller orders |
| `GET /api/reseller/keys` | Reseller-scoped key usage |
| `POST /api/reseller/order-actions/:orderId/:action` | Activate/extend/payment actions |

All reseller reads/writes must include reseller scope from `req.reseller.id`.

## Admin API

Protected by admin auth cookies and `requireAdmin`.

| Route | Purpose |
|---|---|
| `GET /api/admin/me` | Current admin profile |
| `GET /api/admin/launch-readiness` | Platform launch checks |
| `GET /api/admin/servers` | Server inventory |
| `POST /api/admin/servers/provision` | Start DO Outline provisioning |
| `PATCH /api/admin/servers/:serverId/tier` | Mark server as trial or premium capacity |
| `GET /api/admin/resellers` | List resellers |
| `POST /api/admin/resellers` | Create reseller + workspace |
| `PATCH /api/admin/resellers/:id` | Enable/disable reseller |
| `GET /api/admin/plans` | List plans |
| `POST /api/admin/plans` | Create plan |
| `PATCH /api/admin/plans/:id` | Update plan |
| `GET /api/admin/orders` | Cross-reseller orders |
| `GET /api/admin/customers` | Cross-reseller customers |
| `GET /api/admin/customers/:customerId` | One customer lifecycle and payment ledger |
| `POST /api/admin/customers/cleanup-preview` | Preview selected reseller test customer cleanup |
| `POST /api/admin/customers/cleanup-delete` | Delete selected reseller test customers after typed confirmation |
| `GET /api/admin/keys` | Cross-reseller keys |
| `POST /api/admin/order-actions/:orderId/:action` | Admin order actions |

Customer cleanup routes require one concrete `reseller_id` plus exact
`customer_ids`. Delete requires `confirmation: "DELETE TEST CUSTOMERS"` and
blocks confirmed paid rows unless `allow_paid_customers` is explicitly true.

Server tier changes are blocked while a server has active VPN keys, preventing
trial and premium customers from being mixed by relabeling live capacity.

## Bot Webhook

`POST /api/bot-webhook/:resellerId`

The backend registers one webhook per reseller bot. Telegram must send
`X-Telegram-Bot-Api-Secret-Token`; the bot manager compares it with
`crypto.timingSafeEqual` before dispatching updates.

## Middleware Notes

- Mutating dashboard routes require trusted `Origin`.
- Non-production may allow Pages/ngrok preview origins.
- Mini App auth is stateless and validates Telegram init data.
- ssconf and `/open-key` bridge routes are intentionally public because Outline
  cannot send Telegram auth.
