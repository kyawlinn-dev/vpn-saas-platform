# Production business display consistency

Date: 2026-10-14 (Asia/Bangkok)

Owner correction, 2026-10-15: preserve the Mini App's existing visual identity.
Consistency means accurate shared business facts, not identical layouts. Keep the
original circular DataRing, gradient, card/header/button styling and compact Settings
cards. Do not replace the circular usage display with a horizontal bar. Any further
Mini App redesign requires an explicit request; data/status fixes remain in scope.

Status: Written specification approved by the user on 2026-10-14; implementation planning authorized. Implementation and production deployment are separate stages.

Clarification accepted 2026-10-15: a queued plan is a paid purchase awaiting
service activation, not deferred receipt of money. Successful review confirmation
records the received payment and its commission/platform due immediately. The
confirmed paid package starts automatically after existing access stops/expires;
activation does not create another payment or count revenue a second time.

Scope addition approved 2026-10-15: remove the routine dashboard **Activate VPN**
step. Paid purchases start automatically without a current paid package, or
become the next queued package when there is one. Unpaid dashboard purchases
wait for payment confirmation. Internal provisioning and safe setup retries
remain required. This is planned behavior, not current deployed behavior.
The owner approved a scoped durable setup/replay migration on 2026-10-15 after
reviewing the missing per-customer setup claim; migration 0037 is that prerequisite.

## Intent and agreed decisions

Make all existing production business displays agree for the same record, tenant, accounting period and data snapshot. Cover admin and reseller dashboards, Telegram Mini App, Telegram bot balance/purchase/review messages, and customer-facing scheduled notifications. Preserve the information appropriate to each role, existing layouts, language support and white-label branding.

The user chose:

- All business displays, including quota, money, dates, statuses and queued purchases.
- Separate access and payment review labels.
- When no active package exists, show **No active package** plus a separate **Last package** summary.
- Backend-owned business calculations and record selection; views format and translate those facts.

Success is consistent meaning and values, not identical screens. This work preserves immediate initial purchase access, reseller payment review, separate queued packages and the existing payment recognition policy.

## Production baseline and investigation evidence

Production backend and Mini App are deployed manually to the Droplet. The dashboards deploy separately to Cloudflare Pages. The local checkout is `develop`, with substantial unfinished Messenger changes. Do not release this checkout wholesale.

At investigation time, local `main` was `786dd5f9d7cddd5fdc3341f7315a867ed87b365b`. This is a source reference, not proof that every deployed component matches that revision. Implementation must record each component's actual deployment/source baseline and compare relevant source with the live assets. If drift exists, reconcile it before preparing a release.

Observed deployed assets on 2026-10-14:

- Reseller: entry `index-CC53S3Hg.js`, shared orders component `OrdersTable-DgL4hqTh.js`.
- Admin: entry `index-CCHKoK3l.js`, orders `OrdersPage-Dy2TjRFU.js`, customers `CustomersPage-DxV68DMr.js`.
- Mini App: `index-Bmhl_LCC.js` at `app.novanetmm.com`.

Read-only checks confirmed the deployed reseller component uses order-total usage but the active key's cap as the percentage denominator. The deployed Mini App uses `subscription.quota`; admin orders/customers prefer backend order-total usage. The production quota service and usage-warning job also use canonical package quota.

Ye Yint's active order demonstrated the error: 100 GB allowance, 73.33 GB synced usage, 26.67 GB remaining after moving servers. The fresh server key correctly had a 26.67 GB cap. The reseller component compared 73.33 against 26.67 and clamped the bar to 100%. The correct percentage was approximately 73.33%. These are investigation-time readings, not frozen expectations for a later live check.

History shows the denominator fix was introduced in `81c8583` and removed in the Marzneshin snapshot `6ca933c`. The later canonical quota payload in `9c7ec0c` was not adopted by that component.

Additional source-level inconsistencies requiring verification include cached money fallbacks on zero ledger totals, browser-dependent date calculations, latest-history fallback in active-package selection, and different payment/access interpretations in Mini App Home and Settings. These findings do not assert that every production customer is currently affected.

## Scope and display inventory

| Surface | Displays to review and align |
| --- | --- |
| Admin overview and analytics | Revenue, pending review, commission, platform due, counts, period labels and drill-down agreement |
| Admin orders and customers | Current/queued/last packages, quota, expiry, status, payment history, lifetime totals and action feedback |
| Admin settlements | Selected month, frozen submission totals, review status and live-versus-snapshot labels |
| Admin keys and servers | Individual key usage, assigned/included nodes, live protocol, capacity and health labels |
| Admin plans and reseller settings | Catalogue versus purchased values, units, zero/unlimited semantics and configuration status |
| Reseller overview, orders and Telegram orders | Same order/payment facts, filters, quota, review labels and action results |
| Reseller customers and accounting | Active selection, history, lifetime totals, accounting periods and settlement values |
| Reseller plans, settings and notifications | Catalogue/configuration labels and existing notification variables |
| Mini App Home, Settings and Servers | Package selection, quota, expiry, access/review state and protocol/server meaning |
| Mini App Packages, Checkout and Payment Status | Catalogue offer, purchased snapshot, submitted amount, queued state and review/application outcome |
| Telegram bot and customer notifications | Balance, purchase/queue/review results, expiry dates and usage-warning numbers |

Inventory existing business displays before changes. Classify each as current state, historical snapshot, catalogue/configuration, or operational metric. Health and capacity retain their own meanings; do not relabel server health as customer access or fabricate connection counts. Login/reset flows and unrelated visual redesign are outside this work.

## Business rules

### Package selection and history

- A current package must be an actual active order, following the existing backend purchase-over-trial precedence and inclusive expiry rules. Order status, effective expiry and provisioning facts must remain explicit; an active order with no usable key must not be labelled connected or provisioned.
- Return no current package when only stopped, expired, pending or scheduled orders exist. Do not promote the latest historical row into current state.
- Return the queued package separately using existing lifecycle rules. A queue-only customer has no active package and an independently visible upcoming package.
- Select the most recently activated/started ended package for **Last package**, using creation time and stable ID only as tie-breakers. An unstarted pending or cancelled queued purchase belongs in order history, not Last package. An ended trial is eligible when no later ended package exists.
- Lists, details, filters and counts must use compatible selection rules. Expiring is an indicator on an active package, not a different stored lifecycle state.
- Display recorded quota, amount and duration snapshots wherever available. Catalogue values describe offers. Historical fields that were never snapshotted must be marked as catalogue-derived/unavailable as appropriate; do not present reconstructed names or duration as exact historical facts.

### Quota and usage

- Use the existing canonical quota calculation in `subscriptionProvisionService.js`. It accounts for historical active/deleted key usage and the order's package baseline and allowance. Do not introduce another quota algorithm in a client.
- Use one `quota` snapshot for total, used, remaining and unlimited state. The total is the package allowance, not the active key's enforcement cap.
- Calculate finite percentage from bytes, before display rounding. Clamp the visual fill to 0–100%; retain the actual used amount when over quota.
- Keep the existing GB convention of bytes divided by 1024^3. Format ordinary usage with two decimal places; format positive values below 0.01 GB as `<0.01 GB`. Show actual zero as `0 GB`, separately from unavailable values.
- Unlimited packages explicitly say **Unlimited**, show used data, and omit a finite percentage/remaining amount. Unknown quota says **Usage unavailable**; null alone must not imply unlimited.
- Server and protocol switches preserve package totals. Individual key history displays that key's own usage, labelled **Key usage**.
- Display usage as synced, not real time. Only show a last-sync timestamp when supported by trustworthy sync evidence. Key `updated_at` is not automatically a valid sync timestamp. Where available, use the relevant server usage-sync health timestamp and expose stale/unavailable state honestly.

### Access, payment review and application

Access and review are independent dimensions:

| Situation | Access | Payment review |
| --- | --- | --- |
| Activated initial purchase awaiting review | Active | Awaiting review |
| Active package, accepted payment | Active | Confirmed |
| Ended package, accepted payment | Expired or Stopped | Confirmed |
| Upcoming package awaiting review | Queued | Awaiting review |
| Upcoming package accepted, not started | Queued | Confirmed |
| Rejected payment | Actual package access state | Rejected |

Trial packages say **Trial / No payment required** rather than Unpaid. Payment labels must refer to the specific order/payment they describe. A rejected queued purchase must not relabel a separate current package. Multiple payment events retain their individual reviews and an explicit summary of pending items.

Staff details additionally show ledger application state when relevant: payment
processing, recorded, failed or reversed. For queued purchases, `apply_status =
applied` means the sale/payment has been recorded; it does not mean VPN access
has started. Access state remains **Queued** until automatic activation. Customers
see **Payment confirmed — your next package starts when the current package ends**.
Key existence, panel enabled state, payment recording and actual client connectivity
are not interchangeable. A confirmed-but-unrecorded ledger row is a reconciliation
exception, not the normal state of a queued purchase.

UI actions and feedback must reflect backend eligibility/error results. Refresh affected records and aggregates after an action; prevent stale selection/dialog data from contradicting refreshed lists. The dashboard addition below changes when staff-created paid purchases start; Telegram purchase/review policy and internal provisioning safety remain unchanged.

### Dashboard purchase-flow simplification

- Without a current paid package, **Create & start package** records a paid
  dashboard purchase and starts access. Existing trials follow current paid-plan
  replacement rules. Package dates begin when setup succeeds.
- Unpaid dashboard purchases show **Awaiting payment**, with no access. Confirming
  receipt records payment once and starts or queues that same purchase according
  to the customer's current state at confirmation time.
- With a current paid package, **Buy next package** creates a separate queue.
  Paid queues are confirmed/recorded immediately; unpaid queues await payment.
  Preserve the one-queue limit and current protocol/allowance rules.
- If provisioning fails after payment, keep **Payment confirmed** and show
  **Setup failed**, with **Retry setup**. Retry reuses the order/payment, rechecks
  eligibility and cannot charge again, duplicate commission, refill quota or
  reset an already-started period.
- Keep internal activation and compatible guarded endpoints for old clients and
  recovery. Remove routine manual activation from staff views; retry is only for
  eligible confirmed purchases needing setup. Trials retain existing eligibility
  and no-payment handling. Preserve tenant/channel restrictions in staff actions.
- Telegram initial purchases keep immediate access pending review. Telegram queues
  keep review followed by automatic start after the current package ends.
- Record payments independently of provider success; do not hold transactions
  across provider calls. Repeated requests, partial setup and concurrent purchases
  must preserve reservation/ownership guards. Identify any gap in durable recovery
  before implementation; do not add an unreviewed migration.

### Money and accounting

- The payment ledger remains authoritative. Distinguish **Submitted amount**, **Confirmed payment**, and **Recognized revenue**.
- Recognized revenue follows existing policy: confirmed and applied ledger entries.
  Successful confirmation of a queued purchase records its sale/payment, so its
  received amount, commission and platform due count while access remains queued.
  Do not defer them until key provisioning or exclude an event because its order
  is scheduled. An initial customer purchase awaiting review does not count as
  confirmed revenue merely because provisional VPN access is already active.
- Automatic activation after the existing package stops/expires (including data
  exhaustion) changes service state only; it does not charge again, create a new
  payment event or count the same money twice. An unconfirmed queue cannot activate.
- Unexpected confirmed/pending, failed or reversed ledger states remain explicit
  operational exceptions. Do not present successful queued purchases as waiting
  for money or use the display work to silently change transaction policy. Preserve
  the existing `order_payments.created_at` reporting-period basis.
- Commission and platform due use the same eligible entries, with each payment's recorded amount and commission snapshot. Do not recalculate history using the current reseller commission rate or current catalogue price.
- A zero ledger sum is a valid zero. Never use a truthiness fallback to replace it with cached order money.
- Legacy fallback is explicit and applies only when there truly are no ledger entries and the purchase meets the existing confirmed-paid legacy criteria. Missing/unloaded ledger data is not proof that a record is legacy. Centralize this rule and avoid double-counting.
- Distinguish order totals, customer lifetime totals and period totals. Aggregates operate over the complete tenant/period scope, not only the current frontend page. Matching overview, analytics, accounting and drill-down scopes must reconcile.
- Currency is integer MMK, with consistent separators and explicit currency units. Unavailable values are distinct from zero.
- Submitted/confirmed settlement snapshots remain frozen. Label live month totals separately from a submitted settlement's totals. Preserve existing submit/reopen/confirm workflows.

### Dates and periods

- Use `Asia/Bangkok` for business-day/month boundaries and expiry semantics, independent of browser location.
- Date-only fields remain dates. Do not parse a date into local midnight and display an invented time.
- **Valid through October 20** means access expires at the start of October 21 in Bangkok, matching panel enforcement. On October 20, show **Expires today**. Future days-left is the calendar-date difference from Bangkok today, not a rounded duration from local midnight.
- Payment, creation, review and sync timestamps display in Bangkok with a clear time-zone indication where useful. Date-only history uses a consistent localized date format without a clock.
- Expiring-soon indicators/filters use the same inclusive seven-day business-date window across backend and clients. Monthly defaults and totals use the same Bangkok period definition.
- Preserve raw timestamps and date-only fields in API responses; formatting remains a presentation concern.
- Preserve existing `Asia/Yangon` notification selection boundaries; quiet-hour gating stays disabled.
  Display/business-date consistency does not change reminder timing or job cadence.

### Protocol, location and operational information

- Live key protocol is authoritative for current access. Protocol preference describes future provisioning intent.
- Shadowsocks shows the assigned server. VLESS shows its included nodes or provisioning assignment as appropriate, without claiming which node the client currently uses.
- Preserve reseller branding and protocol-specific access URLs through the existing access-URL service.
- Capacity uses database-owned counters and existing health semantics. Unknown connection/health metrics display unavailable rather than an invented zero. Existing real zero counts remain zero.

## Architecture and compatibility

Reuse existing backend quota, enrichment, accounting, analytics and business-time services. Introduce/extend pure shared read-summary helpers for package selection, status dimensions and ledger totals, with consistent inputs and tested outputs. Route handlers remain thin and all reseller reads remain scoped by `reseller_id`.

The agreed logical summary contains current/queued/last package references, canonical quota, separate access/review/application state, monetary summaries with explicit scope/basis, and trustworthy freshness metadata when available. The implementation plan will bind these facts to concrete existing response fields or additive summary fields after the endpoint inventory. No existing field may silently change meaning if callers rely on it; migrate consumers to explicit fields and retain compatibility aliases during rollout.

Frontend formatting helpers centralize units, dates, zero/unavailable/unlimited handling and status text within each app. Shared behavior is verified across apps without requiring a new monorepo framework or dependency.

Historical snapshot gaps must be documented during inventory. Prefer current schema and existing snapshots; any required schema addition needs a separately reviewed migration, schema documentation and verification against the actual production schema. This design does not authorize production data backfills.

Preserve provisioning reservation/ownership/retry guards, database-owned capacity
counters, service-role secrecy and tenant isolation. Update `SKILL_API_CONTRACTS.md`
for response changes and `SCHEMA.md` for any schema changes. Keep copy references,
the route/document index and `KNOWN_BUGS.md` current as implementation changes
their facts. Messenger development migrations and shared purchase runtime changes
are not dependencies of this release.

## Validation and acceptance

Use synthetic local fixtures and controlled local/staging runs; production investigation is read-only. Test behavior at the service and rendered-view boundaries, not just copies of helper implementations.

| Case | Required agreement |
| --- | --- |
| Ye Yint regression fixture | 100 GB total, 73.33 GB used, 26.67 GB remaining, about 73% |
| Server/protocol switch | Total and prior package usage preserved; key cap is not the total |
| Renewed package | Prior-period usage excluded according to baseline rules |
| Active access awaiting payment review | Active plus Awaiting review; no confirmed-revenue implication |
| Confirmed queued payment | Payment recorded/revenue counted once immediately; current access unchanged; next package remains queued |
| Automatic queued activation | After existing package stops/expires, confirmed queue starts; existing payment/recognized totals unchanged |
| Unconfirmed queue | No activation and no confirmed revenue; separate review label |
| Dashboard paid purchase | Starts automatically without a paid current package; otherwise queues |
| Dashboard unpaid purchase | No access until confirmation; then starts or queues the same purchase once |
| Setup failure after payment | Payment stays confirmed/counts once; retry reuses purchase without another charge |
| Duplicate/concurrent dashboard actions | No duplicate payment/commission/key, second queue or reset package dates |
| Rejected queued payment | Current access/review remain attached to their own records |
| No active order | No active package, separate last ended package; active filter/count agrees |
| Trial/unlimited/unknown quota | Distinct correct labels and no misleading finite percentages |
| Zero usage or zero ledger sum | Real zero retained; no cached-money fallback |
| Legacy paid order without ledger | Eligible explicit fallback counted once |
| Multiple payment events | Reviews and applied/failed/reversed events reconcile with totals |
| Bangkok midnight/month boundary | Expiry, days-left, expiring filters and period totals agree across browser zones |
| Catalogue/commission edits | Recorded purchase/accounting facts remain unchanged |
| Frozen settlement | Historical submission unchanged; live totals labelled separately |
| List/detail/overview refresh | Matching scopes reconcile after actions; pagination does not alter aggregates |
| Operational metrics unavailable | No false connected node or invented zero connection count |
| Two resellers | No cross-tenant records, totals, links or actions |

Run relevant backend tests, dashboard builds, Mini App lint/build, and targeted view/flow checks. Required repository CI remains the final code validation gate. Documentation-only review does not establish that implementation tests/builds pass.

## Delivery and release

1. Capture deployed/source baselines and complete the display/endpoint inventory.
2. Implement and verify shared read summaries while preserving compatibility.
3. Adopt summaries in all affected views, bot messages and notifications, with regression checks.
   Implement the dashboard start/queue/setup-retry addition with its own mutation
   and failure-recovery tests; preserve existing Telegram policy.
4. Compare common fixtures across channels and complete the affected builds/CI.
5. Prepare a scoped release excluding unfinished workspace changes. Keep promotion and deployment aligned with the repository workflow; choose the isolated implementation checkout in the written plan.
6. With separate explicit production authorization, apply reviewed migration 0037 before compatible backend changes and dependent clients; deploy bot/backend and Mini App through manual Ansible playbooks and dashboards through GitHub Actions/Cloudflare Pages. Verify matching real records read-only after release.

Preserve a rollback reference per deployed component. Roll back dependent clients before removing backend compatibility. This design does not authorize deployment, production customer-data edits, online payment processing, new authentication behavior, or unrelated product features. The approved dashboard change records manually received payments through existing ledger services.

## Review and implementation handoff

This specification records the approved conversational design and is the next review artifact. After written-spec approval, create a detailed implementation plan with exact files, API contracts, test fixtures, isolation strategy and phased execution. The user selects the execution method at that stage. Do not treat approval of this document as approval to deploy production.
