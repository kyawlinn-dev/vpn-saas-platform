# Founder Smoke Test Results Template

Use this file as a copyable template for each founder launch smoke-test session. Do not record real secrets, tokens, keys, private payment details, or customer personal data here.

## Test Session Information

| Field | Value |
|---|---|
| Test date |  |
| Tester |  |
| Backend environment | local / staging / production-like / other: |
| Admin dashboard URL |  |
| Reseller dashboard URL |  |
| Mini App URL |  |
| Webhook base URL |  |
| Test reseller |  |
| Test Telegram bot username |  |
| Test Telegram customer account |  |
| Outline server used |  |
| Paid plan used |  |
| Trial enabled yes/no |  |

## Pass/Fail Summary

| Area | Total checks | Passed | Failed | Blocked | Notes |
|---|---:|---:|---:|---:|---|
| Environment setup |  |  |  |  |  |
| Admin setup |  |  |  |  |  |
| Reseller workspace |  |  |  |  |  |
| Telegram bot |  |  |  |  |  |
| Trial flow |  |  |  |  |  |
| Mini App auth |  |  |  |  |  |
| Paid purchase |  |  |  |  |  |
| Screenshot upload |  |  |  |  |  |
| Reseller review |  |  |  |  |  |
| Access removal |  |  |  |  |  |
| Server switch |  |  |  |  |  |
| Auto-stop/expiry |  |  |  |  |  |
| Security/no secret leak |  |  |  |  |  |

Status values for detailed steps: `pass`, `fail`, `blocked`, `not tested`.

## Detailed Smoke Test Checklist

| Step | Test step | Expected result | Actual result | Status | Evidence link or screenshot note | Bug ID if failed |
|---:|---|---|---|---|---|---|
| 1 | Confirm backend is running. | `/api/health` responds and backend logs show no startup crash. |  |  |  |  |
| 2 | Confirm admin dashboard is reachable. | Admin login page/app loads at the expected URL. |  |  |  |  |
| 3 | Confirm reseller dashboard is reachable. | Reseller login page/app loads at the expected URL. |  |  |  |  |
| 4 | Confirm Mini App URL is reachable over HTTPS. | Mini App loads without mixed-content or connection errors. |  |  |  |  |
| 5 | Confirm private Supabase bucket `payment-screenshots`. | Bucket exists, is private, and backend can create signed URLs. |  |  |  |  |
| 6 | Admin creates/checks founder reseller. | Reseller exists, is active, and has the expected workspace/slug. |  |  |  |  |
| 7 | Admin checks active Outline server. | At least one server is active, configured, and has remaining capacity. |  |  |  |  |
| 8 | Admin checks active paid plan. | At least one active non-trial paid plan exists with required fields. |  |  |  |  |
| 9 | Admin checks trial plan if trial is enabled. | Active trial plan exists, or trial is intentionally disabled. |  |  |  |  |
| 10 | Reseller logs in. | Founder reseller can access dashboard without auth errors. |  |  |  |  |
| 11 | Reseller saves workspace settings. | Brand name, slug, payment instructions, and support contact save successfully. |  |  |  |  |
| 12 | Reseller saves Telegram bot token. | Token is stored securely and plaintext token is not returned. |  |  |  |  |
| 13 | Confirm bot connection status. | Bot identity appears, webhook is registered, runtime is connected. |  |  |  |  |
| 14 | Check reseller readiness endpoint. | `GET /api/reseller/launch-readiness` has zero `fail` items. |  |  |  |  |
| 15 | Check admin readiness endpoint. | `GET /api/admin/launch-readiness` has no platform-level blocking failures. |  |  |  |  |
| 16 | Test customer sends `/start`. | Bot replies with branded welcome and buttons. |  |  |  |  |
| 17 | Confirm customer/link creation. | One reseller-scoped customer and Telegram link exist for the test account. |  |  |  |  |
| 18 | Confirm trial created once. | If trial enabled, exactly one active trial order is created. |  |  |  |  |
| 19 | Repeat `/start`. | No duplicate trial order or duplicate active trial key is created. |  |  |  |  |
| 20 | Tap Outline Key button. | Bot returns the current active Outline key/import option. |  |  |  |  |
| 21 | Tap Mini App button or send `/app`. | Mini App opens with the reseller slug in the launch URL/start context. |  |  |  |  |
| 22 | Confirm Mini App brand. | Mini App displays the correct reseller brand and workspace config. |  |  |  |  |
| 23 | Confirm Mini App auth works. | Telegram `initData` is accepted inside Telegram; invalid direct auth fails safely. |  |  |  |  |
| 24 | Confirm subscription state after auth. | Trial/current package, server, and key status match expected state. |  |  |  |  |
| 25 | Open Packages page. | Active paid package list loads; trial plans are not shown as paid packages. |  |  |  |  |
| 26 | Select paid plan and open checkout. | Checkout shows selected plan and payment instructions. |  |  |  |  |
| 27 | Upload payment screenshot. | Screenshot upload succeeds and returns a private storage path, not a public secret URL. |  |  |  |  |
| 28 | Submit paid order. | Paid purchase order is created successfully. |  |  |  |  |
| 29 | Confirm paid order review state. | Order is active with `review_status=pending_review`. |  |  |  |  |
| 30 | Confirm trial stopped after paid order. | Prior active trial access is stopped/replaced by paid access. |  |  |  |  |
| 31 | Try duplicate paid purchase while active paid order exists. | Duplicate active paid purchase is blocked. |  |  |  |  |
| 32 | Reseller opens Telegram Orders. | Telegram Mini App order is visible and scoped to this reseller. |  |  |  |  |
| 33 | Reseller previews screenshot. | Short-lived signed URL opens the uploaded screenshot. |  |  |  |  |
| 34 | Reseller confirms payment. | Payment becomes paid/confirmed and order remains active. |  |  |  |  |
| 35 | Customer checks status again. | Mini App reflects confirmed paid active subscription. |  |  |  |  |
| 36 | Create separate test order for rejection. | A second safe test order exists for reject testing, without reusing the confirmed order. |  |  |  |  |
| 37 | Reseller rejects separate test order. | Order becomes rejected/stopped. |  |  |  |  |
| 38 | Confirm reject removes access. | Rejected order has no active key/token assignment/access token. |  |  |  |  |
| 39 | Reseller stops a test order. | Stop action succeeds and order status becomes stopped. |  |  |  |  |
| 40 | Confirm stop removes access. | Stopped order has no usable active access. |  |  |  |  |
| 41 | Server switch test, if multiple servers exist. | Customer can switch to another server. |  |  |  |  |
| 42 | Confirm server switch removes old key. | New key exists on selected server and old active key for the order is removed/marked deleted. |  |  |  |  |
| 43 | Renew stopped/expired valid order. | Renew works only for stopped/expired non-rejected orders and creates valid active access. |  |  |  |  |
| 44 | Extend active valid order. | Extend moves expiry forward without duplicate active access. |  |  |  |  |
| 45 | Auto-stop/expiry tested or explicitly skipped. | Short-expiry test order stops automatically, or this is marked `not tested` with reason. |  |  |  |  |
| 46 | Security check: API responses. | No bot token, Supabase secret, Outline server secret, payment credential, or service-role value is returned. |  |  |  |  |
| 47 | Security check: logs/screenshots/docs. | No real secret is pasted into logs shared with others, screenshots, docs, commits, or bug reports. |  |  |  |  |

## Bug Log

Severity rules:

- `P0`: blocks launch or exposes secret/access risk.
- `P1`: breaks payment/order/access lifecycle.
- `P2`: confusing dashboard/customer flow but workaround exists.
- `P3`: polish/minor UI/text issue.

| Bug ID | Title | Severity | Area | Steps to reproduce | Expected | Actual | Suspected cause | Owner | Status | Fixed in commit/PR |
|---|---|---|---|---|---|---|---|---|---|---|
| BUG-001 |  | P0/P1/P2/P3 |  |  |  |  |  |  | open / investigating / fixed / retest needed / closed |  |
| BUG-002 |  | P0/P1/P2/P3 |  |  |  |  |  |  | open / investigating / fixed / retest needed / closed |  |
| BUG-003 |  | P0/P1/P2/P3 |  |  |  |  |  |  | open / investigating / fixed / retest needed / closed |  |

## Launch Decision

Choose one:

- [ ] Green: private launch allowed.
- [ ] Yellow: internal users only.
- [ ] Red: do not launch.

Required green checks:

- [ ] No readiness `fail` items.
- [ ] Telegram `/start` works.
- [ ] Trial works once.
- [ ] Mini App auth works.
- [ ] Paid purchase works.
- [ ] Screenshot upload works.
- [ ] Reseller confirm/reject works.
- [ ] Stop/reject removes access.
- [ ] Duplicate active paid order blocked.
- [ ] No secrets exposed.

Decision notes:

```text

```

## Next Action

Top 3 bugs to fix before launch:

1. 
2. 
3. 

Fixes to send to Codex:

```text

```

Retest date:

```text

```

Final launch decision:

```text

```

