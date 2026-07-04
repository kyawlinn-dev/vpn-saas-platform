# Founder Launch Smoke Test

## Purpose

This smoke test verifies that the founder-operated reseller launch is ready before real customers are invited. It exercises the full path from platform setup through Telegram bot onboarding, Mini App purchase, payment screenshot review, access confirmation, and access removal.

The goal is not load testing or UI redesign. The goal is to prove that one admin account, one reseller account, one workspace, one bot, one Mini App slug, one Outline server, one paid plan, and one test Telegram customer can complete the real launch flow safely.

## Required Test Accounts and Tools

- Admin login for the admin dashboard.
- Reseller login for the reseller dashboard.
- Telegram bot created in BotFather.
- Test Telegram customer account, preferably not the same Telegram account used to create the bot.
- Outline server access or an already provisioned Outline server row.
- Supabase project access for database/storage verification.
- A harmless payment screenshot sample image.
- Backend URL, usually local plus public HTTPS tunnel for Telegram webhooks.
- Mini App URL, deployed or served through HTTPS for Telegram.
- Reseller dashboard URL.
- Admin dashboard URL.

Do not paste real bot tokens, Supabase keys, Outline credentials, or payment details into docs, screenshots, commits, or issue comments.

## Current Setup Path Audit

| Setup item | Where it is managed | Notes |
|---|---|---|
| Admin account | Supabase/auth plus `admins` table | Required before admin dashboard login works. |
| Reseller account | Admin dashboard, `POST /api/admin/resellers` | Creates auth user, `resellers` row, and `reseller_miniapps` workspace row. |
| Reseller status | Admin dashboard reseller toggle | Must be active for reseller backend auth. |
| Mini App slug | Admin reseller creation or reseller workspace settings | Must match bot Mini App links and public `/api/miniapp/:slug/*` routes. |
| Brand name | Reseller dashboard Settings | Returned by workspace and Mini App config. |
| Support username/link | Reseller dashboard Settings | Warning-only for readiness, but needed for customer help. |
| Payment instructions | Reseller dashboard Settings | Required for customer checkout instructions. |
| Bot token | Reseller dashboard Settings | Stored encrypted; plaintext must never be returned. Saving restarts/registers that reseller bot. |
| Bot webhook/username status | Backend bot manager and `reseller_miniapps` status fields | Readiness uses stored bot identity plus current runtime state. |
| Active Outline servers | Admin dashboard Servers | Server must be active, have Outline API URL/cert SHA-256, capacity, and working Outline connectivity. |
| Active paid plans | Admin dashboard Plans | Mini App package list uses active non-trial plans. |
| Trial plan/settings | Admin dashboard Plans plus reseller workspace trial settings | If trial is enabled, an active trial plan and ready server must exist. |
| Payment screenshot bucket | Supabase Storage | Bucket must be named `payment-screenshots` and private. |
| Public backend URL | Backend `.env` | `WEBHOOK_BASE_URL` must be public HTTPS for Telegram. |
| Mini App URL | Backend and Mini App env | `TELEGRAM_MINIAPP_URL`/frontend API base URLs must point at the deployed Mini App/backend. |
| Reseller order review | Reseller dashboard Telegram Orders | Uses reseller-scoped order list, screenshot signed URL, confirm, reject, and stop actions. |
| Expiry cleanup | Backend process | Auto-stop job starts when backend starts. |

## Pre-Test Readiness Checklist

- Backend is running.
- Admin dashboard is running.
- Reseller dashboard is running.
- Mini App is running/deployed at an HTTPS URL.
- Supabase URL and service-role credentials are configured in backend env.
- Payment screenshot bucket `payment-screenshots` exists and is private.
- At least one Outline server is active and has remaining capacity.
- Telegram webhook URL is HTTPS and reachable from the internet.
- Mini App URL is HTTPS and opens in Telegram.
- `GET /api/reseller/launch-readiness` returns no `fail` items for the founder reseller.
- `GET /api/admin/launch-readiness` returns no platform-level blocking failures.

## Step-By-Step Smoke Test

1. Log in to the admin dashboard.
2. Create or check the founder reseller account. Confirm it is active and has the expected Mini App slug.
3. Create or check one active Outline server. Confirm it has API URL, cert SHA-256, capacity, and no recent provisioning error.
4. Create or check one active paid plan. Use a real-looking but low-risk internal test price if needed.
5. If trial is enabled, create or check one active trial plan and confirm reseller trial duration/data limit settings.
6. Log in to the reseller dashboard as the founder reseller.
7. Open Settings and set brand name, Mini App slug, payment instructions, and support username/link.
8. Save the Telegram bot token from BotFather.
9. Confirm bot status shows token saved, identity detected, webhook registered, running, and connected.
10. Check `GET /api/reseller/launch-readiness` or the readiness output. Continue only when there are no `fail` items.
11. From the test Telegram customer account, send `/start` to the reseller bot.
12. Confirm the bot replies with the branded welcome/buttons and does not crash.
13. Confirm exactly one trial is created for that Telegram user when trial is enabled.
14. Send `/start` again. Confirm no second trial order or duplicate active key is created.
15. Tap the Outline Key button. Confirm the customer receives the current key/import option.
16. Tap the Mini App button or `/app`. Confirm the Mini App opens with the correct slug.
17. Confirm the Mini App shows the correct brand and current subscription state.
18. Open Packages in the Mini App.
19. Select a paid plan and go to checkout.
20. Upload the harmless payment screenshot sample.
21. Submit the order.
22. Confirm the paid order is created as active with `review_status=pending_review`.
23. Confirm the prior trial order is stopped or no longer the winning active access.
24. Open reseller dashboard Telegram Orders.
25. Confirm the new Telegram order is visible and scoped to the reseller.
26. Preview the payment screenshot.
27. Confirm payment.
28. Reopen/check the Mini App as the customer. Confirm the subscription remains active and review/payment status is confirmed/paid.
29. If multiple servers exist, switch server in the Mini App and confirm the old key is removed and the new key works.
30. Stop the test order from the reseller dashboard.
31. Confirm token assignment/access token/key are deactivated or removed and the customer no longer has active access.
32. Optional: create a separate test paid order and reject payment. Confirm rejected/stopped state and removed access.
33. Optional: create or adjust a short-expiry test order, run/wait for auto-stop, and confirm expired active access is stopped.

## Expected Database and Business State

### After `/start`

- `vpn_customers` has one customer row for the reseller and Telegram user.
- `telegram_links` has one reseller-scoped link for that Telegram user.
- Customer `ssconf_token` exists or is created.
- If trial is enabled and unused, one active trial order is created.
- Repeating `/start` reuses the same customer/link and does not create a second trial.

### After Mini App Auth

- Telegram `initData` is verified with the reseller workspace bot token.
- The Mini App resolves the reseller by slug and returns the correct brand/config.
- Existing customer/link is reused or created if the customer entered through Mini App first.
- Trial creation failure caused by missing launch setup is logged but does not crash auth.

### After Trial Creation

- Trial order has `order_type=trial`, `status=active`, `payment_status=paid`, and confirmed review state.
- Trial order uses the active trial plan.
- One active key exists for the trial order if server provisioning succeeds.
- No duplicate active trial keys exist for the same order.

### After Paid Purchase

- A purchase order exists with `source=miniapp`.
- Payment screenshot path is stored as a private Supabase Storage path, not a public secret-bearing URL.
- Paid order becomes active with `review_status=pending_review`.
- Active trial access for that customer/reseller is stopped before paid access starts.
- Duplicate active paid purchase is blocked for the same customer/reseller.

### After Confirm Payment

- Purchase order has `payment_status=paid`.
- Purchase order has confirmed review status.
- Customer access remains active.
- Reseller dashboard no longer treats it as pending review.

### After Reject Payment

- Purchase order is rejected/stopped.
- VPN access is removed.
- Active token assignments, access tokens, and active Outline keys are deactivated/deleted.
- Customer should see rejected/stopped status rather than usable paid access.

### After Stop

- Order status is stopped.
- Active keys are deleted or marked deleted.
- Active token assignments and access tokens for that order are disabled.
- Customer cannot continue using the stopped order's access.

### After Renew

- Only stopped or expired non-rejected orders can be renewed.
- Renewed order gets fresh active access and a new valid expiry.
- Rejected/fake-payment orders remain blocked from renewal.

### After Extend

- Only active valid orders can be extended.
- Expiry moves forward according to the selected plan.
- Existing active access is preserved; no duplicate active paid subscription should appear for the same customer.

### After Server Switch

- New key is created on the selected server.
- Old active key for the same order is removed/marked deleted after the new key is stored.
- If new key creation fails, partial local state is rolled back.

## Failure Table

| Symptom | Likely cause | Where to check | Fix direction |
|---|---|---|---|
| `/start` does nothing | Bot webhook not registered, backend unreachable, wrong public URL | Reseller readiness, backend logs, BotFather webhook info | Set HTTPS `WEBHOOK_BASE_URL`, re-save token, restart backend. |
| Bot says error | Missing plan/server, trial setup issue, database error | Backend logs around `[bot:<resellerId>]` | Fix readiness failures; confirm active server/trial plan. |
| Bot token saved but not connected | Invalid token, Telegram API unreachable, webhook registration failed | Reseller Settings bot status and backend logs | Re-copy token from BotFather, confirm HTTPS webhook URL, save again. |
| Mini App opens wrong brand | Wrong slug in bot URL or stale Mini App build/env | Bot button URL, Mini App query string, `reseller_miniapps.miniapp_slug` | Rebuild/redeploy Mini App if env changed; fix slug in workspace. |
| Mini App missing slug | Opened directly without `?slug=` or start parameter | Browser URL, Mini App error message | Open from bot button or set `VITE_MINIAPP_SLUG` for controlled test only. |
| Auth fails inside Telegram | Invalid/expired `initData`, wrong bot token for slug | Backend auth logs, Mini App network request | Open inside Telegram from correct bot; re-save token if mismatched. |
| Trial not created | Trial disabled, no active trial plan, trial already used | Reseller readiness, `telegram_links.trial_used_at`, plans | Enable trial and create valid trial plan, or accept no-trial launch. |
| Outline key not created | No active server, server full, Outline API/cert failure | Admin Servers, backend server `last_error`, readiness | Fix server config/capacity or provision another server. |
| No active server | Server missing, inactive, full, or missing API config | Admin Servers and readiness | Add/activate server, set capacity, verify Outline install output. |
| No paid plans shown | No active non-trial plan | Admin Plans, `/api/miniapp/:slug/plans` | Create/activate a paid plan with required fields. |
| Screenshot upload fails | Missing private bucket, file too large/type invalid, auth mismatch | Supabase Storage, Mini App network response, backend logs | Create private bucket, use valid image under limit, reopen Mini App in Telegram. |
| Order not visible in reseller dashboard | Wrong reseller scope, source/filter mismatch, order creation failed | Telegram Orders page, `/api/reseller/orders`, backend logs | Confirm order `reseller_id`, `source=miniapp`, and dashboard auth. |
| Confirm/reject button fails | Invalid order state, reseller mismatch, lifecycle conflict | Network response, backend order action logs | Use correct reseller account; check order status/review status. |
| Rejected customer still has access | Old key/token assignment not deleted, action failed midway | `vpn_keys`, `access_tokens`, `token_server_assignments`, backend logs | Re-run stop/reject, inspect Outline server, fix lifecycle error. |
| Server switch creates duplicate keys | Old-key cleanup failed after new key creation | `vpn_keys` for same order, backend link route logs | Stop duplicate key manually, inspect server switch rollback/cleanup logs. |
| Readiness endpoint shows fail | Missing launch setup item | `GET /api/reseller/launch-readiness` check message | Fix the named setup item, then re-run readiness. |

## Launch Decision Rule

### Green: Safe For Private Launch

- All blocking readiness checks pass.
- `/start` works.
- Trial works exactly once when enabled.
- Mini App auth works inside Telegram.
- Paid purchase works.
- Screenshot upload works.
- Reseller review works.
- Confirm payment keeps access active.
- Stop/reject removes access.
- Duplicate active paid order is blocked.
- No bot token, Supabase secret, Outline credential, payment credential, or access secret is leaked in API responses or docs.

### Yellow: Internal Users Only

- No readiness `fail` items, but one or more warnings remain.
- Core flow works, but a non-critical path still needs manual monitoring.
- Examples: missing support link, no default server marker while another ready server exists, legacy Worker URL not set when the token portal is not part of the test.

### Red: Do Not Launch

- Any readiness `fail` item remains.
- `/start`, Mini App auth, paid purchase, screenshot upload, reseller review, or stop/reject fails.
- A rejected/stopped customer can still use VPN access.
- Duplicate active paid subscriptions appear for one customer/reseller.
- Any real secret is exposed in logs, API responses, docs, or frontend bundles.

