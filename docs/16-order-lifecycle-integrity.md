# Order Lifecycle Integrity

## Activation paths audited

- Telegram bot `/start` uses `trialService.createTrialOrder()` and `trialService.provisionTrialKey()` to create one active trial key for an eligible Telegram-linked customer.
- Current Mini App auth `POST /api/miniapp/:slug/auth` uses the same trial service and does not create a second trial when `trial_used_at` is already set.
- Current Mini App purchase `POST /api/miniapp/:slug/orders` now inserts a pending purchase order, then calls `orderLifecycleService.activatePendingReviewPurchase()` to stop active trials, block another active paid order, provision VPN access, and mark the purchase active with `review_status = pending_review`.
- Legacy Telegram Mini App purchase `POST /api/public/telegram-miniapp/purchase` now uses the same `activatePendingReviewPurchase()` helper after creating the pending purchase order.
- Reseller dashboard order activation, renewal, extension, stop, confirm, and reject calls are routed through `orderLifecycleService`.
- Admin order activate, extend/renew, and stop actions now delegate to the same lifecycle service instead of duplicating token/key teardown or extension behavior.

## Teardown paths audited

- Manual reseller stop calls `stopOrder()`.
- Payment rejection calls `rejectPayment()`, which calls shared access teardown and marks the order stopped/rejected/unpaid.
- Auto-expiry job now calls `stopOrder()` instead of doing its own status update.
- Trial-to-paid cleanup calls `stopActiveTrialsForCustomer()`, which uses shared access teardown before marking trial orders stopped.
- Admin stop now calls `stopOrder()`.

## Rules enforced

- A paid purchase activation checks for another active paid order for the same `customer_id` and `reseller_id`.
- Paid purchase activation stops active trials before creating paid access.
- Rejected orders cannot be activated, extended, renewed, or confirmed.
- Renew only accepts stopped/expired non-rejected orders.
- Extend only accepts active non-rejected orders with existing active VPN access, and updates limits/expiry without creating another key.
- Stop is idempotent and removes token assignments, deactivates the access token, deletes active Outline keys, and marks the order stopped.
- Confirm payment marks `payment_status = paid` and `review_status = confirmed`; repeated confirm returns harmless success and does not create duplicate commission ledger entries.
- Screenshot upload/order submission remains `pending_review`; it does not confirm payment.

## Fixes made

- Added `activatePendingReviewPurchase()` to centralize pending-review paid access creation for both Mini App purchase routes.
- Added retry cleanup in `provisionOrderAccess()` so stale partial access is removed before activate/renew provisioning.
- Added a second active-paid-order check after provisioning and before marking an order active, with cleanup if another active paid order won the race.
- Moved legacy Mini App paid purchase provisioning onto the lifecycle service.
- Moved admin activate, extend/renew, and stop behavior onto lifecycle service helpers.
- Moved auto-stop expiry behavior onto `stopOrder()`.
- Kept commission ledger creation guarded by an existing-order lookup before insert.

## DB constraint status

No migration files exist in this repo; Supabase schema is managed directly in the hosted project. Because of that, this pass does not add a database migration.

Recommended Supabase SQL follow-up:

```sql
create unique index concurrently if not exists vpn_orders_one_active_purchase_per_reseller_customer
on vpn_orders (customer_id, reseller_id)
where status = 'active' and order_type = 'purchase';
```

This would close the remaining concurrent-request race that application-level checks can reduce but cannot fully eliminate.

## Remaining risks

- Without the partial unique index above, two perfectly simultaneous paid purchases can still race through application checks.
- Commission ledger duplicate prevention is application-level. A unique index on `commission_ledger(order_id)` would make it fully race-proof.
- Some older legacy trial code in `telegramMiniAppRoutes.js` still uses low-level token provisioning; the primary bot/current Mini App trial path uses `trialService`.
- Admin extend still logs an expiry preview before delegating to lifecycle renew/extend; the lifecycle result is authoritative.

## Manual test checklist

1. New Telegram user sends `/start` and receives only one trial.
2. Same user sends `/start` again and does not receive a duplicate trial/key.
3. User with active trial buys a paid package; trial order becomes stopped and paid order becomes active pending review.
4. User with active paid package tries to buy another package; backend returns a conflict.
5. Reseller rejects pending paid order; VPN access is removed and order is stopped/rejected.
6. Reseller confirms paid order twice; no duplicate commission ledger row is created.
7. Reseller stops active order twice; second call is harmless and access remains removed.
8. Expired order auto-stop removes access the same way as manual stop.
9. Reseller renews stopped non-rejected order; fresh access is created.
10. Reseller renews rejected order; backend rejects the transition.
11. Reseller extends active order; expiry updates and no duplicate active key is created.
12. Another reseller cannot act on this reseller's order through reseller routes.
