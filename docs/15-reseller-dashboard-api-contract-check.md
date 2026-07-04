# Reseller Dashboard API Contract Check

## Frontend areas audited

- `reseller-dashboard/src/lib/api.ts`
- `reseller-dashboard/src/providers/ResellerAuthProvider.tsx`
- `reseller-dashboard/src/hooks/useDashboardData.ts`
- `reseller-dashboard/src/hooks/useWorkspaceSettings.ts`
- `reseller-dashboard/src/hooks/useResellerProfile.ts`
- `reseller-dashboard/src/pages/OverviewPage.tsx`
- `reseller-dashboard/src/pages/OrdersPage.tsx`
- `reseller-dashboard/src/pages/TelegramOrdersPage.tsx`
- `reseller-dashboard/src/pages/SettingsPage.tsx`
- `reseller-dashboard/src/pages/PlansPage.tsx`
- `reseller-dashboard/src/components/OrdersTable.tsx`
- `reseller-dashboard/src/components/OrderForm.tsx`

## Backend routes checked

- `GET /api/auth/reseller/me`
- `POST /api/auth/reseller/login`
- `POST /api/auth/reseller/logout`
- `POST /api/auth/reseller/refresh`
- `GET /api/reseller/me`
- `GET /api/reseller/orders`
- `POST /api/reseller/orders`
- `GET /api/reseller/orders/:orderId/screenshot-url`
- `GET /api/reseller/keys`
- `GET /api/public/plans`
- `POST /api/reseller/order-actions/:orderId/activate`
- `POST /api/reseller/order-actions/:orderId/extend`
- `POST /api/reseller/order-actions/:orderId/renew`
- `POST /api/reseller/order-actions/:orderId/stop`
- `POST /api/reseller/order-actions/:orderId/confirm-payment`
- `POST /api/reseller/order-actions/:orderId/reject-payment`
- `POST /api/reseller/order-actions/:orderId/payment-status`
- `GET /api/reseller/workspace`
- `PATCH /api/reseller/workspace`

## Mismatches found

- Dashboard `Renew` was visible for stopped/expired rejected orders, but the backend correctly rejects rejected-order renewal.
- Dashboard `Activate` was visible for any pending order, even when payment was not `paid` or the order was rejected.
- Telegram payment screenshot preview failed silently when the backend returned `404` or signing failed.
- Telegram review buttons only checked `review_status`; they could remain enabled for non-actionable access states.
- Settings still treated `bot_connected` as the only bot state and did not consume the new safe `bot_status` object.
- Workspace PATCH saved bot tokens but did not return the full safe status object for immediate frontend refresh.

## Fixes made

- `OrdersTable` now only shows Activate for pending, paid, non-rejected orders.
- `OrdersTable` now hides Renew for rejected stopped/expired orders.
- `TelegramOrdersPage` now displays screenshot URL errors and only enables review actions for `pending_review` orders in `active` or `pending` state.
- `WorkspaceSettings` frontend types now include `bot_status`.
- `SettingsPage` now shows clear bot states: no token saved, token invalid, webhook not registered, bot offline, and connected with username/id when available.
- `PATCH /api/reseller/workspace` now returns `bot_status` after bot token save success or registration failure.

## Response shape notes

- List endpoints still return arrays directly; `useDashboardData` already normalizes direct arrays and wrapped arrays.
- Order action endpoints return `{ success, message, ... }` on success and `{ success: false, error, code }` on lifecycle errors.
- Screenshot endpoint returns `{ signed_url, expires_in }`.
- Workspace GET returns settings directly with `bot_connected` for compatibility and `bot_status` for accurate state.
- Workspace PATCH returns `{ success: true }` for ordinary settings and `{ success, bot_registered, bot_status, bot_error? }` for bot-token saves.

## Remaining risks

- There is no frontend control currently wired to `POST /api/reseller/order-actions/:orderId/payment-status`; the route exists but no dashboard button calls it.
- A direct active order with no active VPN key can still show Stop, which is valid, but Extend is expected to fail server-side if access is missing.
- End-to-end Telegram webhook and screenshot signed URL checks still need live Supabase/Telegram credentials.

## Manual test checklist

1. Log in and confirm `/auth/reseller/me`, `/reseller/me`, `/reseller/orders`, `/reseller/keys`, and `/public/plans` load without 401/403.
2. Create a paid dashboard order; verify Activate appears and refreshes the table after success.
3. Create or inspect an unpaid pending order; verify Activate is not shown.
4. Stop an active order; verify Stop refreshes the list and Renew appears only if the order is not rejected.
5. Reject a Telegram payment; verify Confirm/Reject buttons disable after refresh and Renew is not shown for the rejected stopped order.
6. Confirm a pending-review Telegram payment; verify the list refreshes and review state becomes confirmed.
7. Click payment screenshot Preview/Open on an order with a screenshot; verify signed URL opens.
8. Click screenshot Preview on an order whose screenshot is missing/unavailable; verify a dashboard error appears.
9. Save a valid bot token; verify Settings shows connected status and bot username/id if returned.
10. Save an invalid bot token; verify Settings shows token saved but invalid/not connected and never displays the plaintext token.
