# Dashboard purchase extraction audit

> Historical local audit/execution record. Scope clarified 2026-10-15: preserve the dated observations/results below; they do not certify the current production revision or constitute a fresh test run. Current production/development authority is listed in docs/DOCUMENTATION.md at repository root.

Date: 2026-10-13. Scope: reseller dashboard POST /api/reseller/orders only;
admin order routes inspected for comparison. Evidence is local source, not live
database or panel state. No secret reads, network mutations, migrations,
deployments, or commits are part of this audit.

## Recommendation

Move manual order eligibility, order insertion, initial ledger creation, and
summary synchronization into the one shared purchaseService.submitPurchase.
Retain route authentication, input normalization, active-plan lookup, and
tenant-scoped customer lookup/create/update. Do not create another dashboard
business service. Manual creation is preparation, with no automatic activation
or queue. Keep activation, extension, renewal, confirmation, rejection, and
server switching in their existing lifecycle services.

The owner supplied the shared interface after the initial audit and authorized
route conversion. Parent work owns the service and dev-only migration; this
work owns the reseller adapter and its unique characterization test file.

## Evidence map

| Source | Relevant behavior |
| --- | --- |
| backend/src/server.js:372 | Trusted-origin, reseller cookie auth, active-reseller gate |
| backend/src/middleware/requireActiveReseller.js | Tenant resolved by authenticated Supabase user; status must be active |
| backend/src/routes/reseller/resellerOrdersRouter.js:69 | Explicit customer ID, phone, then Telegram username lookup |
| backend/src/routes/reseller/resellerOrdersRouter.js:381 | Manual order creation, customer preparation, legacy persistence |
| backend/src/services/manualOrderPolicy.js:1 | Dashboard source; trial/purchase and payment/review derivation |
| backend/src/services/paymentLedgerService.js:19 | Money rounding/clamping and commission flooring |
| backend/src/services/paymentLedgerService.js:33 | Initial ledger defaults and reviewer attribution |
| backend/src/services/paymentLedgerService.js:207 | Cached order summary synchronized from ledger |
| backend/src/routes/reseller/orderActionRoutes.js:24 | Telegram-customer restrictions on staff activation/extend/renew/stop |
| backend/src/routes/admin/adminOrderActionsRouter.js:27 | Platform-wide order lookup; lifecycle operations, not creation |
| backend/src/services/orderLifecycleService.js:741 | Separate activation, payment precondition, provisioning, commission ledger |
| reseller-dashboard/src/components/OrderForm.tsx | UI submits paid manual orders and refreshes after success |

Line references describe the pre-extraction source; use function names after
the route segment is replaced.

## Caller permissions

Reseller POST / is mounted behind requireTrustedOrigin, requireAuth, and
requireActiveReseller. POST requires an allowed Origin; the reseller cookie
must identify a valid Supabase user linked to an active reseller. Pending and
disabled resellers cannot create orders. Body reseller_id, source, order_type,
review_status, commission, amount, status, and server selection do not confer
permissions and are ignored. Commission comes from the authenticated reseller.
The plan catalogue is global, so its lookup deliberately has no reseller_id.

Customer ID lookup includes reseller_id and does not fall back to contact
matching when the ID is missing or foreign. Without an ID, lookup tries exact
phone first, then exact Telegram username, selecting the newest matching row.
Matching is trimmed but neither case-folded nor stripped of @ by the backend.
With no match, a normal active customer is inserted under the authenticated
reseller. Existing customer type/status is retained, including inactive or
Telegram customers. Creation does not check telegram_links or requireMiniapp.

Updates precede purchase eligibility: name may be replaced, missing phone and
username may be filled, nonempty notes overwrite notes, and protocol preference
may change. Existing contact values are not overwritten and empty input cannot
clear notes. Updates include both customer ID and reseller ID.

## Exact preparation policy

| Case | Order status | Payment status | Review | Initial ledger | Access/queue |
| --- | --- | --- | --- | --- | --- |
| Purchase, requested paid | pending | paid | confirmed | Positive plan price: initial, confirmed, applied | None |
| Purchase, unpaid/missing/unknown | pending | unpaid | pending_review | None | None |
| Active trial plan, any payment input | pending | paid | confirmed | None | None |

full_name and plan_id remain required even with customer_id. String inputs are
String(value).trim(); empty optional strings become null. Only trimmed lowercase
paid selects paid for a purchase (PAID becomes unpaid). Protocol accepts exact
shadowsocks, vless, or hysteria2; missing/invalid input defaults to shadowsocks,
including when that overwrites an existing customer's preference.

The active plan query uses id plus is_active=true; absent/inactive/error returns
400 Invalid or inactive plan. Truthy plan.is_trial selects trial in manual
policy. No workspace trial-enabled or one-trial-per-customer check runs here.
No screenshot is required; a supplied path/URL is stored without receipt
ownership validation in this route. No payment method or custom amount is used.

Only purchases check for an existing active purchase, scoped by customer and
reseller. Existing pending, scheduled, stopped, or expired orders do not block
this check. A trial is not subject to it. An active purchase yields 409:

```json
{
  "error": "This customer already has an active package. Renewing or adding a top-up isn't supported yet.",
  "code": "ACTIVE_PACKAGE_EXISTS"
}
```

## Commission and initial money

Legacy creation uses Number(plan.price_mmk || 0) and
Number(reseller.commission_percent || 20). Numeric zero therefore becomes 20;
string "0" remains zero. Preserve this observed difference during extraction.
Lifecycle getPackageCommissionPercent instead preserves zero and gives trial
packages zero commission. These policies must not be silently unified.

calculatePaymentAmounts rounds money to a nonnegative integer, clamps rates to
0..100, and floors amount * rate / 100. Paid purchases cache the calculated
amount and commission before ledger creation. The order's commission_percent
is initially the raw Number result; ledger rates are clamped. Unpaid purchases
and trials cache total_paid_mmk=0 and commission_amount_mmk=0, while retaining
plan price and the legacy reseller rate.

For positive-price paid purchases, createOrderPayment uses initial/confirmed/
applied, source dashboard, order plan ID, and reviewed_by_reseller_id. Reviewed,
submitted, and applied timestamps are set. No explicit plan object is passed,
so package_duration_days and package_data_limit_gb are null in the legacy path;
payment method, admin reviewer, and idempotency key are not supplied. No
commission_ledger write happens until later lifecycle operations.

Then syncOrderPaymentSummary rereads payment rows and merges its order into the
creation result, retaining customer/plan joins. Confirmed/applied payments count
toward gross paid and commission even while the manual order remains pending.
For a zero-price paid nontrial plan, createOrderPayment returns null, but summary
sync still runs and changes payment_status to unpaid with zero totals; with no
payment-derived review value, the original confirmed review is retained.

## Response and errors

Success is HTTP 201 and the bare order object, not a success/order envelope.
It has all returned order columns and nested customer (id, full_name,
telegram_username, phone, customer_type, ssconf_token) and plan (id, name,
price_mmk, duration_days, data_limit_gb, max_devices, allowed_regions, is_trial).
There is no keys/payment array, activation object, generated access URL, or
notification in the creation response. An existing ssconf_token may be present
in the customer join, but creation does not allocate one.

Legacy explicit errors are 400 required fields, 400 invalid/inactive plan,
404 Customer not found for this reseller, 409 ACTIVE_PACKAGE_EXISTS, and 500
Failed to check customer / create customer / update customer / check active
package / create order. Thrown ledger/summary failures return 500 Internal
server error. Auth failures remain middleware-owned.

## Admin comparison

There is no POST /api/admin/orders creation handler in the inspected routes.
GET /api/admin/orders is platform-wide oversight. Admin order-actions require
admin cookies and active admin membership and intentionally load orders across
tenants, then pass the selected order's reseller ID into lifecycle services.

activate requires pending at the route and paid/non-rejected in activateOrder;
it provisions through existing services and later ensures commission entries.
Admin activation is not subject to the reseller Telegram-customer gate.
extend accepts active/expired/stopped: active delegates to extendOrder (queued
next purchase); expired/stopped delegates to renewOrder (new paid period).
These use source admin and body/header idempotency keys. They are distinct
staff operations, not equivalent to manual creation. Admin confirm/reject
delegates to shared lifecycle review and supplies reviewerAdminId. Keep all
admin callers unchanged in this extraction.

No chosen-server parameter is implemented by reseller creation or these admin
activation routes. Server selection remains in provisioning and the separate
switch routes. Preserve subscriptionProvisionService reservation/activation/
failure RPC coordination and concurrency safeguards; preparation calls none
of them.

## Risks and unresolved behavior

1. Legacy order/payment/summary calls are separate writes. Ledger or summary
   failure leaves persisted state after a 500, and retries may duplicate a
   pending order. No initial request idempotency is used. The shared operation
   owns atomic persistence/recovery and requestKey handling; no duplicate
   persistence implementation belongs in this route.
2. Customer updates can persist even when purchase eligibility rejects. The
   approved boundary retains this ordering; document it rather than silently
   moving customer mutation into a different transaction.
3. Telegram-linked customers can get manual pending orders but cannot use
   reseller activation. Preserve creation permissions; changing this requires
   a separate product decision.
4. Numeric 0% commissions become 20% in creation. This is a confirmed code
   discrepancy with lifecycle commission policy, explicitly preserved by the
   supplied shared-service policy.
5. Trials bypass workspace/trial history restrictions, and paid zero-price
   purchases become unpaid after sync. These are compatibility cases, not
   reasons to broaden this extraction into trial or accounting redesign.
6. Existing docs mix retired Outline guidance with current Marzneshin design.
   Current SYSTEM_DESIGN.md and backend rules identify Marzneshin as active;
   no deployment or provider changes follow from this audit.

## Supplied shared interface and extraction map

```js
import { submitPurchase, PurchaseError } from '../../services/purchaseService.js';

const result = await submitPurchase({
  actor: { role: 'reseller', resellerId: reseller.id },
  channel: 'dashboard',
  customerId: customer.id,
  planId: plan.id,
  protocol: protocol_preference,
  paymentStatus: requestedPaymentStatus,
  screenshotPath: payment_screenshot_url,
  paymentNote: payment_note,
  requestKey: req.get('Idempotency-Key') || undefined,
});
// { order, payment, plan, reseller, customer, isQueued, activation, replayed }
return res.status(201).json(result.order);
```

The trusted actor/channel selects staff policy; arbitrary request body fields
cannot request confirmation, automatic activation, queueing, price overrides,
or another tenant. Service revalidation must enforce customer ownership and
active plan eligibility even though the route already looks them up. Service
returns order with the legacy customer/plan joins and paid summary merge.
PurchaseError ACTIVE_PACKAGE_EXISTS maps to the exact existing 409 text/code;
other PurchaseErrors use their status/message/code. Unexpected exceptions keep
the generic 500. Replays retain the existing HTTP 201 response shape.

Remove the local active-purchase query, order insert, payment creation, and
summary synchronization. Keep customer preparation and plan validation. Remove
unused manual policy/payment imports if all their decisions are service-owned.
No schema or public response shape change is required by the adapter itself.
Parent owns any new atomic RPC/migration and its schema documentation. Do not
apply it here or migrate admin, bot, or Mini App callers.

## Characterization scope

Unique dashboard tests exercise the adapter with mocked Supabase and purchase
service boundaries: normalized command and trusted actor, bare response,
paid/unpaid/trial forwarding, tenant-scoped lookup/update, explicit foreign
customer rejection, protocol fallback, customer mutation before conflict,
legacy conflict response, and unexpected-error fallback. These are offline
tests and do not import the live server or environment loader. Shared-service
tests owned by the parent must prove commission, ledger, no activation/queue,
zero-price behavior, joined response, and durable request replay behavior.

## Adapter implementation and verification

The reseller POST now calls the supplied submitPurchase interface and returns
result.order at HTTP 201. Its authentication mount, normalization, plan lookup,
and customer preparation remain in place. The unused deriveManualOrderPolicy,
calculatePaymentAmounts, createOrderPayment, and syncOrderPaymentSummary imports
were removed. Other imports are still required by customer preparation or GET
handlers. No shared service, migration, admin, bot, or Mini App code was edited
by this dashboard extraction.

PurchaseError uses the parent's (message, code, status) constructor. The adapter
preserves status/message/code for typed errors, with the explicitly requested
legacy ACTIVE_PACKAGE_EXISTS HTTP 409 message/code. Unexpected exceptions still
return the generic 500. Tests inject a trusted reseller directly into the
Express POST handler and capture HTTP status/JSON without a socket or real DB.
They do not assert that the outer auth middleware ran.

Verification: 16 dashboard adapter tests and 4 existing manual-policy tests
passed using the local Vitest runner. node --check and git diff --check passed
for the changed route. No frontend build was needed for the adapter-only change.
No shared migration was executed, so database integration is not verified here.

## Parent integration review observations

While the parent was implementing the dependency, the initial local draft of
purchaseService.js and 0027 showed the following differences from legacy manual
preparation. These observations describe that draft and should be rechecked
against the parent's final implementation; they were not changed here.

- submit_purchase rejects an inactive customer for staff too, whereas the
  legacy creation handler accepts an existing inactive customer.
- repository.load selects customer/plan with * and adds vpn_plans, expanding
  the legacy POST response's fixed nested projections and top-level fields.
- The order insert passes null for an absent payment note; legacy POST stores
  an empty string on the order and null on the payment row.
- Initial staff ledger rows now populate duration/data package snapshots;
  legacy POST leaves those two snapshot columns null.
- SQL commission fallback treats a numeric database zero as 20. The legacy
  JavaScript fallback also distinguishes numeric 0 from string "0"; the parent
  should establish the Supabase numeric representation if exact 0% behavior
  is part of compatibility verification.

The supplied contract delegates staff accounting and joined response assembly
to the shared service. Adapter mocks prove delegation and HTTP behavior, not
equivalence of that SQL implementation. Parent review/service tests and the
dev-only migration validation remain necessary before claiming integrated
purchase compatibility. No production deployment is authorized by this work.
