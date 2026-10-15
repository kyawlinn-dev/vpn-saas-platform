# Purchase Entry-Point Audit

> Historical local audit/execution record. Scope clarified 2026-10-15: preserve the dated observations/results below; they do not certify the current production revision or constitute a fresh test run. Current production/development authority is listed in docs/DOCUMENTATION.md at repository root.

## Findings

| Caller | Creation policy | Queue | Activation | Commission | Receipt and identity |
|---|---|---|---|---|---|
| Telegram `createBotPurchaseOrder` | Paid plan; unpaid/pending review | One scheduled purchase after confirmed active purchase | Immediate initial access | Reseller rate; provisional order rounded, ledger floored | Telegram link and downloaded private receipt |
| Mini App `POST /:slug/orders` | Active, non-trial, positive-price plan; unpaid/pending review | Same customer queue policy | Immediate initial access | Reseller rate; floor | Verified Telegram init data, reseller link, tenant-prefixed receipt |
| Reseller dashboard `POST /orders` | Paid/unpaid manual purchase or trial | Reject active paid purchase; no queue here | Creates pending order only | Existing fallback to 20 when rate is falsy | Reseller session, tenant customer lookup; optional receipt |
| Admin order actions | Activate/extend/renew/review existing order | Existing lifecycle-specific policy | Shared lifecycle service | Existing lifecycle service | Admin middleware and explicit order lookup |

The customer creation paths duplicate eligibility reads, order/payment inserts, and activation coordination. They currently perform separate order and ledger writes; a failure between them can leave a partial purchase. Existing payment idempotency protects only a ledger row, not creation of its containing order. Both bot and Mini App have check-then-insert windows for an initial pending order. Scheduled-order uniqueness already exists.

Dashboard creation intentionally differs: staff can record payment status, create trial orders, and leave activation for a later action. It must not inherit customer auto-activation/queue behavior. Admin action routes already reuse lifecycle services and need no artificial migration to purchase creation.

## Extraction Contract

`submitPurchase({ actor, channel, customerId, planId, protocol, screenshotPath, paymentNote, paymentStatus, requestKey })` returns `{ order, payment, plan, reseller, customer, isQueued, activation, replayed }`.

Authenticated adapters construct `actor` and `channel` on the server. Customer roles are accepted only for `bot`, `miniapp`, and `messenger`; reseller role is accepted only for `dashboard`. No route spreads request body into the command. RPC writes remain service-role-only.

The shared service loads live tenant/plan state and invokes an atomic submission RPC. The RPC locks the customer, checks eligibility again, creates order/payment/operation rows atomically, and detects command-key mismatch. A durable operation lease controls initial external provisioning; retries reuse the same order. Ambiguous pending panel reservations require recovery instead of creating another panel user.

Messenger identity and incoming events are additive private tables. Platform receipt download and presentation remain in their adapters. The first migration moves bot through its compatibility wrapper, preserves Mini App response-building/notifications, and preserves staff customer resolution and pending-order policy. Admin lifecycle routes remain as-is because they already call shared services.

## Deliberate Decisions

- Preserve staff commission fallback and pending-order semantics during extraction; correcting those is a separate product change.
- Customer order provisional commission uses channel-compatible rounding where necessary; authoritative confirmed accounting always uses the existing floored ledger rule.
- Reject new customer checkout with a missing receipt, inactive tenant/customer, or trial/zero-price plan. This closes the bot's weaker validation to match documented paid-purchase behavior.
- Preserve source `bot` for existing Telegram contracts; introduce `messenger` explicitly.
- Use original screenshot path as customer request identity when callers have no request key. A distinct new receipt after prior failed access does not silently create another order while recovery is pending.
- Admin review/activation remains in `orderLifecycleService`; the purchase service coordinates it rather than implementing it again.
