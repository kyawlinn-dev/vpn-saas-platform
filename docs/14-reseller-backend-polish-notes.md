# Reseller Backend Polish Notes

## Routes audited

- `GET/POST /api/reseller/orders`
- `GET /api/reseller/orders/:orderId/screenshot-url`
- `POST /api/reseller/order-actions/:orderId/activate`
- `POST /api/reseller/order-actions/:orderId/extend`
- `POST /api/reseller/order-actions/:orderId/renew`
- `POST /api/reseller/order-actions/:orderId/stop`
- `POST /api/reseller/order-actions/:orderId/confirm-payment`
- `POST /api/reseller/order-actions/:orderId/reject-payment`
- `POST /api/reseller/order-actions/:orderId/payment-status`
- `GET/PATCH /api/reseller/workspace`
- `POST /api/miniapp/:slug/auth`
- `POST /api/miniapp/:slug/orders`
- Legacy `POST /api/public/telegram-miniapp/purchase`
- Telegram bot `/start`, `/app`, and reply-keyboard handlers
- `autoStopJob`

## Mismatches and gaps found

- Dashboard order buttons called `activate`, `extend`, `renew`, and `stop`; `renew` did not have a matching reseller backend route.
- Other dashboard action paths existed, but lifecycle logic was embedded directly in `orderActionRoutes.js`.
- Renewal and extension rules were too loose around rejected orders and missing access.
- Stop/reject/auto-expiry did not all share the same teardown behavior for tokens, token assignments, and Outline keys.
- The current slug miniapp order endpoint stopped active trials manually. The legacy purchase endpoint did not stop trials and did not block existing confirmed active purchases.
- Workspace `bot_connected` was derived from token presence, which confused "token saved" with "webhook registered and running".
- The bot registered `/app` in commands but did not handle `/app`.

## Fixes made

- Added `backend/src/services/orderLifecycleService.js` to centralize reseller order lifecycle operations.
- Replaced reseller order action handlers with thin service-backed routes and consistent `{ success, message, error, code }` responses.
- Confirm payment now marks `payment_status=paid` and `review_status=confirmed`.
- Reject payment now refuses already confirmed payments, marks fake/pending purchases rejected and stopped, resets paid amount, and removes access.
- Stop order now uses the shared teardown path for access tokens, token assignments, and active Outline keys.
- Renew now only allows stopped/expired non-rejected orders and checks for conflicting active paid subscriptions.
- Extend now only allows active non-rejected orders with active VPN keys and does not create duplicate access.
- Paid purchase creation stops any active trial before creating paid access in both current and legacy miniapp purchase paths.
- Expiry job now uses the shared access teardown path before marking orders stopped.
- Bot status now separates token saved, token valid, webhook registered, running, connected, bot username, and bot id.
- Bot manager persists Telegram bot identity and webhook status after successful registration.
- Added `/app` bot command handler.

## Remaining risks

- There is still no DB-level partial unique index preventing concurrent active paid purchases for one customer/reseller. The service checks reduce normal duplicates, but a database constraint would close the race.
- Some miniapp provisioning code still creates a direct default-server key instead of using the reseller action token-assignment provisioning path. It now shares trial cleanup but is not fully unified.
- No automated test runner is configured in this repository.
- Real Telegram webhook, Supabase Storage signed URLs, and Outline provisioning still require live secrets for end-to-end verification.

## Manual verification checklist

1. Log in as reseller and load Orders, Telegram Orders, and Settings.
2. Create a dashboard order with `payment_status=paid`; activate it; verify order becomes active and one active key exists.
3. Stop the active order; verify access token is inactive, token assignments are inactive, active keys are marked deleted, and order is stopped.
4. Renew the stopped order; verify rejected orders cannot renew and valid stopped/expired orders become active with fresh access.
5. Extend an active order; verify expiry date increases and no duplicate active key is created.
6. Submit a miniapp paid order while a trial is active; verify the trial is stopped and only the paid purchase remains active.
7. Confirm a Telegram order; verify `payment_status=paid`, `review_status=confirmed`, and commission ledger is present once.
8. Reject a pending-review Telegram order; verify access is removed and the order is stopped/rejected.
9. Try to access another reseller's order action endpoint; expect 404.
10. Save a valid bot token; verify `GET /api/reseller/workspace` returns `bot_status.connected=true`, username/id, and no plaintext token.
11. Save an invalid bot token; verify token is saved but `bot_status.connected=false` after refresh and no plaintext token is returned.
12. Run `/start` and `/app` in the reseller bot; verify customer/link creation, trial idempotency, and Mini App button/link behavior.
