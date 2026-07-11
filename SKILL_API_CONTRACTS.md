# SKILL_API_CONTRACTS.md

## Skill Name

NovaNet MM — API Contract Reference

## Use This Skill When

Adding or changing API routes, updating frontend API client functions, or debugging mismatches between frontend and backend data shapes.

## Base URL

All routes are prefixed with `/api`. In dev, backend runs on port 3000.

---

## Public / Miniapp Routes (`/api/miniapp/:slug/`)

### POST `/api/miniapp/:slug/auth`
Verify Telegram initData and upsert customer.

**Body:** `{ initData: string }` (raw Telegram initData string)

**Response:**
```json
{
  "customer": { "id", "full_name", "telegram_username", "ssconf_token", "status" },
  "order": { "id", "status", "plan_id", "expiry_date", "order_type" } | null,
  "config": { "brand_name", "primary_color", "support_username", "payment_info", "trial_enabled" }
}
```

### GET `/api/miniapp/:slug/config`
Brand config for a slug (no auth required).

**Response:** `{ brand_name, primary_color, support_username, trial_enabled, payment_info }`

### GET `/api/miniapp/:slug/plans`
Active plans for this reseller.

**Response:** `{ plans: Plan[] }`

### GET `/api/miniapp/:slug/servers`
Active servers available for selection.

**Response:** `{ servers: Server[] }`

### POST `/api/miniapp/:slug/orders`
Create an order and immediately provision a VPN key.

**Body (multipart/form-data):** `{ plan_id, payment_screenshot (file), payment_note? }`

**Response:** `{ order: Order, key: { access_url, ssconf_token } }`

### GET `/k/:ssconf_token.json`
Serve dynamic Shadowsocks config for the Outline app. No slug in path — token is globally unique on `vpn_customers.ssconf_token`.

**Response:** Shadowsocks JSON config (not a JSON API — this is the ssconf payload)

### POST `/api/miniapp/:slug/switch-server`
Switch customer's active server.

**Body:** `{ server_id: string }` (requires auth initData in header)

---

## Reseller Routes (`/api/reseller/`) — requires `reseller_access_token` cookie

### GET `/api/reseller/orders`
All orders belonging to this reseller.

**Response:** `{ orders: Order[] }`

### POST `/api/reseller/orders/:id/confirm`
Confirm a pending order (after verifying payment screenshot).

### POST `/api/reseller/orders/:id/reject`
Reject an order (revokes VPN key).

### GET `/api/reseller/customers`
All customers for this reseller.

### GET `/api/reseller/workspace`
Reseller's miniapp config.

### PATCH `/api/reseller/workspace`
Update brand name, bot token, payment info, support username.

---

## Admin Routes (`/api/admin/`) — requires `admin_access_token` cookie

### GET `/api/admin/data/summary`
Cross-reseller summary: total resellers, orders, revenue.

### GET `/api/admin/data/orders`
All orders (all resellers).

### GET `/api/admin/data/customers`
All customers (all resellers).

### GET/POST/PATCH `/api/admin/resellers`
Manage resellers (create with atomic rollback, enable/disable).

### GET/POST/PATCH/DELETE `/api/admin/plans`
Manage VPN plans.

### GET/POST/PATCH `/api/admin/servers`
Manage VPN servers (provision or register manually).

### POST `/api/admin/orders/:id/activate`
Force-activate an order.

### POST `/api/admin/orders/:id/extend`
Extend an order's expiry date.

### POST `/api/admin/orders/:id/stop`
Force-stop an order (revokes VPN key).

---

## Common Types

```typescript
interface Order {
  id: string;
  customer_id: string;
  reseller_id: string;
  plan_id: string;
  status: 'pending' | 'active' | 'expired' | 'stopped';
  payment_status: 'unpaid' | 'paid' | 'overdue';
  order_type: 'trial' | 'purchase';
  review_status: 'pending_review' | 'confirmed' | 'rejected';
  price_mmk: number;
  expiry_date: string | null;
  created_at: string;
}

interface Plan {
  id: string;
  name: string;
  price_mmk: number;
  data_limit_gb: number;
  duration_days: number;
  max_devices: number;
  is_active: boolean;
  is_trial: boolean;
  features: string[];
  sort_order: number;
}

interface Server {
  id: string;
  name: string;
  display_country: string;
  display_city: string;
  flag_emoji: string;
  status: 'active' | 'inactive';
  current_active_keys: number;
  max_active_keys: number;
}
```
