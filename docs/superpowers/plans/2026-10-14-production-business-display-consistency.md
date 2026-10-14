# Production Business Display Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make production business displays agree and simplify dashboard purchases to automatically start or queue after payment, with safe setup recovery.

**Architecture:** Backend read-summary helpers own business selection and calculations, using existing quota and ledger services. Add compatible summaries and explicit current/queued/last fields for each app. Task 6A adds dashboard start-or-queue orchestration through existing lifecycle/payment services; preserve Telegram policy and provisioning guards.

**Tech Stack:** Express/ES modules, Supabase, Vitest, React/Vite, TypeScript dashboards, JavaScript Mini App, Node built-in test runner and the reseller dashboard's existing Playwright dependency.

**Spec:** `docs/superpowers/specs/2026-10-14-production-business-display-consistency-design.md` (written-spec approval received on 2026-10-14).

**Revision 2026-10-15:** Aligns with the refreshed documentation and the owner's
explicit queued-payment rule: confirmation records received money immediately;
only VPN package activation waits. The owner also approved removing routine manual
dashboard activation in favor of automatic start/queue and setup retry (Task 6A).
This is still an unexecuted implementation plan.

## Global Constraints

- Business time zone: `Asia/Bangkok`; expiry is inclusive through the stated date.
- GB means bytes divided by `1024^3`. Ordinary usage has two decimal places; positive usage below 0.01 GB is `<0.01 GB`; real zero is `0 GB`.
- Separate access and payment review labels. No active package means **No active package**, with a separate **Last package** when available.
- Preserve immediate initial access, payment review and separate queued packages.
- For dashboard purchases, paid means start now or queue behind current paid
  access; unpaid means await payment. Confirmation starts/queues the same purchase.
  Keep internal activation, guarded compatibility endpoints and setup retries.
  Provider failure must not undo received money or require another payment.
- Recognized revenue is confirmed and applied payments. Preserve the existing `order_payments.created_at` period basis; this project does not move recognition to `reviewed_at` or `applied_at`.
- Successful queued-purchase confirmation records the payment as applied and
  counts received money/commission/platform due once while order access is queued.
  `apply_status` is ledger/sale recording, not VPN activation. Do not filter
  recognized payments by the order being active or having a key.
- A confirmed paid queue starts automatically after existing access stops/expires
  (including data exhaustion). Activation must not create another payment or
  recognize the same money again; unconfirmed queues cannot activate.
- Keep existing `Asia/Yangon` notification scheduling and job cadence; quiet-hour gating stays disabled.
  `Asia/Bangkok` remains the business/expiry/accounting time zone.
- Keep settlement snapshots frozen, reseller reads scoped by `reseller_id`,
  service-role credentials backend-only, and provisioning reservation/ownership/
  retry guards and database-owned counters intact.
- Unknown, zero and unlimited are distinct. A zero ledger sum must never trigger cached-money fallback.
- Preserve compatibility aliases, branding, translation and existing layout patterns. Public payloads must not expose staff commission/platform-due summaries.
- Use synthetic fixtures. Do not run jobs, provider mutations or notification sends against production during implementation.
- No new schema migration is planned. If an existing schema cannot support a requirement, document the precise gap and review a migration separately; do not silently depend on Messenger migrations.
- Isolate from the dirty `develop` checkout and unfinished Messenger work. Production deployment requires a separate explicit request.

## Review Focus

1. A cancelled unstarted queued order must not replace the last package the customer actually used (Task 2).
2. Mixed legacy and ledger-backed orders in one month must both count exactly once, including ledger rows outside the selected month (Task 3).
3. A confirmed zero-commission payment must retain 0%, even if the reseller now has a nonzero commission rate (Tasks 3 and 6).
4. Browser UTC offsets and Bangkok midnight must not change expiry, monthly defaults or seven-day filters (Tasks 2, 5 and 9).
5. An old cached checkout response must not overwrite a freshly reviewed payment or a separate current package (Tasks 7 and 9).
6. Dashboard payment confirmation survives setup failure; repeated create/confirm/
   retry cannot duplicate money, access or a queued purchase (Tasks 6A and 9).

## Isolation and file map

Before execution inspect attached worktrees and Git isolation. Reuse a suitable
clean checkout or create a native managed worktree from verified production-ready
`main`; use branch `codex/production-business-display-consistency`. Record the
resolved SHA. Fetch refs if necessary, but do not assume local `main` is deployed.
Reconcile production drift through reviewed scoped patches before treating the
baseline as release-ready. Carry the reviewed October 15 documentation-alignment
changes, this spec and this plan into the isolated checkout using an explicit
documentation-only manifest/patch. Use `docs/DOCUMENTATION.md` and
`docs/audits/2026-10-15-documentation-alignment-update.md` to identify that set;
preserve development-only labels. Do not cherry-pick unrelated develop commits,
working application changes, secrets, or Messenger migration dependencies.

New backend modules:
- `backend/src/services/businessDisplayService.js`: pure package selection, order state and quota serialization; no database or provider side effects.
- `backend/src/services/paymentSummaryService.js`: pure ledger/legacy accounting rules and projections.
- `backend/src/services/usageFreshnessService.js`: batched reads of existing server usage-sync health, with unknown/stale handling.

New client modules in each app:
- `src/lib/businessDisplay.js`: pure formatting/summary adapters, tested with Node.
- Dashboard `src/lib/businessDisplay.d.ts`: declarations for the JavaScript module's exact exports.
- Dashboard `src/components/BusinessStatus.tsx` and `src/components/PackageUsage.tsx`: small renderers for independent status dimensions and quota.
- Mini App `src/components/business/PackageSummary.jsx`: shared Home/Settings package display.

New common test inputs: `tests/fixtures/business-displays.json`; browser verification runner: `reseller-dashboard/scripts/check-business-displays.mjs`. No framework or runtime dependency additions are needed.

## Contract decisions used by the tasks

Define the following in `businessDisplayService.js` and both dashboard API types:

```text
OrderBusinessSummary {
  access_status: active | pending | queued | stopped | expired | unknown,
  payment_review_status: no_payment_required | unpaid | awaiting_review | confirmed | rejected | mixed | unknown,
  application_status: pending | applied | failed | reversed | mixed | unknown,
  pending_review_count: number,
  has_active_key: boolean,
  is_expiring_soon: boolean,
  quota: existing OrderQuota | null,
  usage_freshness: { last_synced_at: string|null, state: fresh|stale|unknown },
  snapshot_basis: { quota: order_snapshot|derived|unavailable, duration: payment_snapshot|catalogue|unavailable }
}
MoneySummary {
  basis: ledger | legacy | unavailable,
  confirmed_mmk: number|null,
  recognized_gross_mmk: number|null,
  commission_mmk: number|null,
  platform_due_mmk: number|null,
  awaiting_review_mmk: number|null,
  rejected_mmk: number|null
}
PackageSelection { current_order: Order|null, queued_order: Order|null, last_order: Order|null }
```

Staff order endpoints add `business_summary` and `money_summary`. Staff customer endpoints add `current_order`, `queued_order`, `last_order`; retain `active_order` compatibility temporarily, but migrated views must use `current_order`. Existing `quota`, order-total usage and payment-summary fields remain available.

Mini App auth adds `business_summary` to the existing current `subscription`, adds `last_subscription`, and adds summary fields to `queued_subscription`. Public summaries omit `money_summary`, staff payment details, historical keys and access URLs for ended packages. Existing `subscription` stays null without actual current access. Checkout response `order` adds the public business summary. Customer-facing amount comes from the authorized payment event's `amount_mmk` (falling back to snapshotted order price only when no event is available), not a current catalogue price.

Existing raw field meanings remain unchanged. Task 6A adds explicit setup state
without using payment application as a provisioning flag. Public projection is
explicit, not object spreading from enriched staff records. Mark missing snapshots
honestly; no historical name/duration backfill is implied.

### Task 1: Capture the release baseline and executable fixture set

**Files:** Create `docs/audits/2026-10-14-production-business-display-inventory.md`, `tests/fixtures/business-displays.json`, `backend/src/__tests__/businessDisplayFixtures.test.js`.

**Interfaces:** Fixtures contain named scenarios with synthetic tenant/customer/order/payment/key records, `now_iso`, and expected business facts. Inventory maps every spec surface to its route, source file, displayed field, scope and evidence status.

- [ ] Inspect/reconcile deployed relevant backend files and public JS assets with the isolated baseline, documenting verified matches and drift. Do not copy secrets, tokens or customer records into the report.
- [ ] Record the carried documentation-only manifest and verify refreshed
  `AGENTS.md`, architecture, schema, contracts, deployment guidance and document
  index are present before implementing. Confirm the patch contains no application
  code, environment secrets or development migrations.
- [ ] Write fixture assertions: finite switch fixture uses `limit_bytes=107374182400`, `used_bytes=78739049472`, `remaining_bytes=28635132928`; pending-active, queue-confirmed, rejected-queue, legacy, mixed-money, no-current, trial, unlimited, unknown, month-boundary and missing-metric scenarios exist with synthetic IDs.
  Pin a named test `switched fixture preserves full package allowance` asserting `expect(quota.limit_bytes).toBe(107374182400)` and `expect(quota.used_bytes + quota.remaining_bytes).toBe(quota.limit_bytes)`.
- [ ] Run `npm test -- src/__tests__/businessDisplayFixtures.test.js` in backend; missing fixture assertions must fail before adding the fixture file.
- [ ] Add the validated fixtures; use zero/null distinctly and a known `now_iso` for deterministic dates. Run baseline backend tests and all three app builds, plus Mini App lint. Record existing failures before implementation; do not attribute them to this change.
- [ ] Commit only inventory and fixture/test files: `test: define cross-channel business display fixtures`.

### Task 2: Normalize package selection, state and quota read summaries

**Files:** Create `backend/src/services/businessDisplayService.js`, `backend/src/__tests__/businessDisplay.test.js`; modify `backend/src/utils/businessTime.js`, `backend/src/__tests__/businessTime.test.js`.

**Interfaces:** Export `selectCustomerPackages(orders, { now }) -> PackageSelection`, `summarizeOrderBusiness(order, { quota, freshness, now, paymentsLoaded }) -> OrderBusinessSummary`, `toQuotaPayload(quotaSnapshot) -> OrderQuota|null`, `toPublicBusinessSummary(summary) -> OrderBusinessSummary`. Export `expiryBusinessState(expiryDate, now) -> { days_left:number|null, expired:boolean|null, is_expiring_soon:boolean }` from businessTime.

- [ ] Write failing tests: stopped-only yields `current_order=null`; purchase wins over concurrent trial; confirmed scheduled is queued; most recently started ended order is last; cancelled/unstarted scheduled rows never become last; expired-by-date active row is not current; awaiting review does not change active access; a rejected queue does not change current review.
  Named test `does not promote ended orders to current`: `expect(selectCustomerPackages([stopped], { now }).current_order).toBeNull()` and `expect(selectCustomerPackages([stopped], { now }).last_order.id).toBe(stopped.id)`.
- [ ] Add assertions: canonical quota serialization preserves the exact fixture bytes; null finite limit is unknown, not unlimited; active order without active key has `has_active_key=false`; trial review is `no_payment_required`; multiple payment states become `mixed` with explicit pending count.
- [ ] Assert a confirmed/applied scheduled purchase has queued access and recorded
  payment application. Render **Payment confirmed** plus **Queued**, never
  **Awaiting payment** or **Waiting to apply payment** solely because access has
  not started. Application labels refer to ledger recording, not provisioning.
- [ ] Run `npm test -- src/__tests__/businessDisplay.test.js src/__tests__/businessTime.test.js`; confirm new behavior tests fail.
- [ ] Implement pure helpers using Bangkok calendar days and existing quota inputs. Treat missing payment data as unknown; explicit empty loaded data can use the order's legacy review fields. Last-order ordering is descending activation timestamp, else start date, then creation timestamp and stable ID. At `2026-10-20T16:59:59Z`, October 20 is today; at `17:00:00Z` it is expired. Seven-day window is calendar differences 0 through 7.
- [ ] Re-run those tests and `subscriptionQuota.test.js`; commit `feat: normalize package business read summaries`.

### Task 3: Centralize money rules and reconcile period aggregates

**Files:** Create `backend/src/services/paymentSummaryService.js`, `backend/src/__tests__/paymentSummary.test.js`; modify `backend/src/services/customerOrderEnrichmentService.js`, `backend/src/services/resellerAccountingService.js`, `backend/src/routes/reseller/resellerAccountingRouter.js`, `backend/src/routes/reseller/resellerStatsRouter.js`, `backend/src/routes/admin/adminDataRouter.js`; extend `customerOrderEnrichment.test.js`, `resellerAccounting.test.js`, `resellerStats.test.js`, `adminAccounting.test.js`.

**Interfaces:** Export `summarizeOrderMoney(order, { paymentsLoaded }) -> MoneySummary`, `isRecognizedPayment(payment) -> boolean`, `isEligibleLegacyOrder(order, { ledgerLoaded }) -> boolean`, `summarizeMoneyInPeriod({ orders, payments, ledgerOrderIds, startIso, endIso }) -> MoneySummary`. No DB reads occur inside these pure helpers. Route/services provide complete scoped input, not frontend pagination.

- [ ] Write failing assertions: recognized confirmed/applied 5000 with commission 1000 gives gross 5000/commission 1000/due 4000; confirmed/pending 5000 gives confirmed 5000 and recognized 0; failed/reversed never recognized; pending receipt does not count as confirmed; zero recognized sum stays zero despite cached 5000.
  Named test `keeps zero ledger recognition`: `expect(summarizeOrderMoney(orderWithPendingLedgerAndCached5000, { paymentsLoaded: true }).recognized_gross_mmk).toBe(0)`.
- [ ] Add the actual successful queue fixture: `status = scheduled`, no key,
  `review_status = confirmed`, `apply_status = applied`, amount 5000, commission
  1000, platform due 4000. Assert recognized gross is 5000 before activation.
  Mark the existing confirmed/pending fixture as an abnormal reconciliation case,
  not the expected state of a queued purchase. Test successful confirmation's
  existing RPC contract produces confirmed/applied sale state without provisioning.
- [ ] Test activation invariance: compare the same confirmed payment before and
  after its order becomes active; gross remains 5000, commission 1000, due 4000
  and payment count one. Preserve the existing transaction policy and creation-time
  period basis; never defer successful queued sales until VPN service starts.
- [ ] Test mixed month: legacy confirmed-paid 13000 plus recognized ledger 5000 equals 18000, with commission 3600/due 14400. A legacy candidate with any ledger outside the month must not receive fallback. Missing ledger is unavailable; actual loaded empty ledger can be legacy. A recorded 0% commission remains zero after the reseller changes to 20%.
- [ ] Run the five targeted money test files; confirm failures.
- [ ] Replace duplicate eligibility/calculation paths with these helpers. Keep `created_at` half-open period windows. Accounting must combine eligible legacy and ledger entries even when the month contains payments; determine ledger existence outside the period using tenant-scoped IDs. Paginate full-scope backend reads beyond PostgREST limits; preserve compatibility totals and settlement serializer/payload behavior. Query errors must not trigger legacy fallback.
- [ ] Run targeted tests including settlement snapshot unchanged after later payment changes; commit `fix: reconcile ledger summaries across business views`.

### Task 4: Expose compatible summaries and align filters

**Files:** Create `backend/src/services/usageFreshnessService.js`, `backend/src/__tests__/businessDisplayRoutes.test.js`; modify `customerOrderEnrichmentService.js`, `resellerCustomersRouter.js`, `resellerOrdersRouter.js`, `resellerStatsRouter.js`, `adminDataRouter.js`, `backend/src/routes/public/resellerMiniappRoutes.js`, `SKILL_API_CONTRACTS.md`.

**Interfaces:** Export `loadUsageFreshness(serverIds, { now }) -> Map<serverId,{last_synced_at,state}>`. Extend `enrichOrderAccess(order, req, { now, freshness, paymentsLoaded }={})` and `enrichCustomer(customer, { orders, telegramLink, req, now, freshness })`. Existing signatures/callers remain supported.

- [ ] Add failing route/enrichment tests: list/detail summaries match; no-current still retains compatibility alias but new fields are explicit; active/expiring counts and filters agree with summary; queue-only is not active; public projection contains no commission/due/private key data; two tenants cannot access each other's summaries or receipts.
  Named test `public business projection excludes staff finance`: `expect(publicOrder).not.toHaveProperty('money_summary')`; assert the serialized object contains neither `commission_mmk` nor `platform_due_mmk`.
- [ ] Test freshness: successful server sync within 2 hours is fresh; older is stale; absent/unreliable timestamp is unknown. Do not synthesize freshness from key `updated_at`. Multiple active keys use the oldest relevant successful sync; historical deleted-key snapshots need no new sync.
- [ ] Run `npm test -- src/__tests__/businessDisplayRoutes.test.js src/__tests__/customerOrderEnrichment.test.js`; confirm failures.
- [ ] Wire the contracts above into GET admin/reseller orders/customers, reseller stats, Mini App auth and existing checkout result serialization. Batch freshness reads with existing `server_health_status`; missing monitoring table yields unknown freshness rather than failure. Use existing lifecycle selectors/policies for mutation paths, not the display selector. Update contract docs with exact public/staff fields and examples.
- [ ] Run targeted tests and existing purchase/queue tests; commit `feat: expose consistent business display summaries`.

### Task 5: Add deterministic client formatting and small renderers

**Files:** Create `businessDisplay.js` under all three app `src/lib/` folders, dashboard companion `businessDisplay.d.ts` files, `tests/businessDisplay.test.mjs` under each app; create dashboard `BusinessStatus.tsx`, `PackageUsage.tsx`; modify both dashboard `src/types/api.ts` and Mini App `src/i18n/language.jsx`.

**Interfaces:** All three format modules export `formatUsageBytes(bytes, locale='en-US') -> string`, `formatBusinessDate(value, { locale='en-US', dateOnly=false }={}) -> string`, `businessMonth(now=new Date()) -> YYYY-MM`, `quotaDisplay(quota) -> { kind:finite|unlimited|unknown, used:string, total:string, remaining:string, percent:number|null }`, `statusLabels(summary) -> { access:string, review:string, application:string }`. Dashboard props: `BusinessStatus({ summary, showApplication=false })`; `PackageUsage({ quota, freshness })`.

- [ ] Write Node assertions in each app: exact-byte switch percent is approximately 73.331454%; total is `100.00 GB`, used `73.33 GB`, remaining `26.67 GB`; zero is `0 GB`, one byte `<0.01 GB`, unknown `Usage unavailable`, unlimited has null percentage; date-only October 20 shows no clock.
  Named test `uses package quota instead of key cap`: `assert.equal(quotaDisplay(quota).total, '100.00 GB')`; `assert.ok(Math.abs(quotaDisplay(quota).percent - 73.33145427703857) < 0.000001)`.
- [ ] Test date/month outputs in child processes with `TZ=UTC`, `America/Los_Angeles`, `Asia/Yangon`: Bangkok midnight/month results must agree. Test status labels **Active**, **Awaiting review**, **Confirmed**, **Queued**, **No payment required**.
- [ ] Run `node --test tests/businessDisplay.test.mjs` within each app; confirm failures before implementation.
- [ ] Implement formatting and renderers. New views require summaries; missing summaries show unavailable rather than deriving totals from key cap/current catalogue. Keep each app's existing legacy format helpers until callers migrate. Translate new customer copy in both EN/MM; no backend developer terminology in customer explanations.
- [ ] Run Node tests and both dashboard builds plus Mini App lint/build; commit `feat: add consistent business display presentation`.

### Task 6: Adopt summaries throughout the staff dashboards

**Files:** Create `reseller-dashboard/scripts/check-business-displays.mjs`; modify admin pages `OrdersPage.tsx`, `CustomersPage.tsx`, `OverviewPage.tsx`, `AnalyticsPage.tsx`, `SettlementsPage.tsx`, `KeysPage.tsx`, `ServersPage.tsx`, `PlansPage.tsx`, `ResellersPage.tsx`, `MonitoringPage.tsx`; reseller `components/OrdersTable.tsx`, `components/ui/usage-bar.tsx`, pages `CustomersPage.tsx`, `OverviewPage.tsx`, `TelegramOrdersPage.tsx`, `AccountingPage.tsx`, `PlansPage.tsx`, `SettingsPage.tsx`, `NotificationsPage.tsx`; both `src/lib/format.ts`.

**Interfaces:** Consume Tasks 4–5 summaries/renderers. Current/queued/last use explicit selection fields. Financial views consume money summaries with nullish handling. Preserve list/filter URLs and backend mutation routes.

- [ ] Create `reseller-dashboard/scripts/check-business-displays.mjs` with local-only Playwright route fixtures for both dashboards. First assert rendered switched-package total/percentage, separate pending-active labels, no-current plus Last package, valid-through date, and ledger-zero money; these assertions must fail on baseline views. Named browser case `switched package shows full total`: `assert.match(await detail.innerText(), /100\.00 GB/)` and `assert.match(await detail.innerText(), /73%/)`.
- [ ] Add rendered checks for recognized-versus-confirmed queued money, 0% commission, live-versus-frozen settlement labels, and catalogue-derived historical duration. Label key history **Key usage**, protocol preference **Next provision**, and unavailable connection metrics rather than 0. Preserve genuine server capacity/health facts.
- [ ] Assert staff views show **Queued · Payment confirmed** with recognized gross
  5000/commission 1000/due 4000 for the successful queue fixture. Starting it later
  must update access without changing totals or creating another payment row.
- [ ] Implement the view migrations, removing per-view ledger reductions and truthiness money fallbacks. Overview cards and accounting displays must identify their period/scope. Date defaults use Bangkok; lists and details use the same summary components. Catalogue pages remain catalogue displays. For action success refresh the selected detail and impacted overview/customer/order data; display backend errors without speculative state changes.
- [ ] Run the targeted browser checks and both builds. Verify responsive list/detail layouts and existing action availability; the check runner must intercept mutation routes and never call production.
  Run `node scripts/check-business-displays.mjs` from reseller-dashboard with loopback URLs configured; expected exit 0 and each named dashboard case passed. Launch each app using `npm run dev -- --host 127.0.0.1 --port <port> --strictPort`: admin 3001, reseller 3002, Mini App 3003. Set build/dev API URLs to loopback and intercept every API request; refuse unmatched API requests. Do not launch the real backend for these browser fixtures.
- [ ] Commit `fix: align staff business displays and accounting labels`.

### Task 6A: Start or queue dashboard purchases and recover setup safely

**Dependencies:** Tasks 2–6. This is the approved behavior change, distinct from
the display migrations. Keep current-system references accurate until implemented.

**Files:** Modify `backend/src/routes/reseller/resellerOrdersRouter.js`,
`backend/src/routes/reseller/orderActionRoutes.js`,
`backend/src/routes/admin/adminOrderActionsRouter.js`,
`backend/src/services/orderLifecycleService.js`,
`backend/src/services/paymentLedgerService.js` only where needed for ledger reuse,
and `backend/src/services/businessDisplayService.js` for setup projection;
extend `backend/src/__tests__/manualOrderPolicy.test.js`, `orderLifecycle.test.js`,
and `businessDisplayRoutes.test.js`; create
`backend/src/__tests__/dashboardPurchaseFlow.test.js`. Update reseller
`src/components/OrderForm.tsx`, `CreateOrderDialog.tsx`, `OrdersTable.tsx`,
`src/pages/OrdersPage.tsx`, `CustomersPage.tsx`, admin `src/pages/OrdersPage.tsx`,
`CustomersPage.tsx`, both `src/lib/api.ts` and `src/types/api.ts`, and the browser
runner. Update `SYSTEM_DESIGN.md`, `SKILL_API_CONTRACTS.md`,
`docs/API_ROUTE_INVENTORY.md` if routes change, and affected knowledge/skill docs.

**Interfaces:** Add lifecycle helper
`startOrQueueDashboardPurchase({ orderId, resellerId })` using scoped persisted
order/payment records and existing activation/queue guards. Existing create,
payment-status and confirmation routes call it for eligible dashboard purchases
after recording confirmed payment. Recheck current access at execution time;
reuse the same purchase when converting pending to scheduled. Preserve existing
response fields and add `purchase_outcome: awaiting_payment|active|queued|setup_failed`
and `order_id` to affected mutation responses. Add staff summary
`setup_status: not_started|ready|failed|unknown` and `can_retry_setup: boolean`;
derive from durable evidence, never infer failed solely from absence of a key.
Use existing scoped activate endpoints as guarded retries, retaining compatibility;
retry reuses ledger rows and cannot record another sale. Public projection omits
staff recovery controls. No new database status or migration is assumed.

- [ ] Trace current manual create, payment-status update, confirm, activate,
  commission and queue paths on the isolated production baseline. Record how
  existing durable records identify repeated submissions and setup failures.
  If they cannot support safe recovery/idempotency, document the exact gap for
  schema review before implementing; do not borrow Messenger-only persistence.
- [ ] Write failing service/route tests: paid with no active purchase starts;
  paid with active purchase queues; unpaid never provisions; later confirmation
  starts/queues the same order using current state. Assert one queue maximum,
  existing pending-review purchase restrictions, trial replacement and trial
  no-payment eligibility. Reject cross-tenant/channel actions as before.
- [ ] Write failure/retry tests: payment remains confirmed/applied and recognized
  when provider setup fails; retry provisions without inserting another payment,
  commission or order. Repeated confirmation, lost response, double submit,
  concurrent create/confirm, partial key creation and an already-active retry
  cannot duplicate keys, reset dates/quota or overbook a queue. An existing trial
  and a queue are not treated as two current paid purchases.
  Named test `paid setup retry keeps one sale` asserts recognized gross stays
  5000 and payment count stays one before failure and after successful retry.
- [ ] Run `npm test -- src/__tests__/dashboardPurchaseFlow.test.js
  src/__tests__/manualOrderPolicy.test.js src/__tests__/orderLifecycle.test.js
  src/__tests__/businessDisplayRoutes.test.js` from backend as one command;
  confirm the new behavior assertions fail before implementation.
- [ ] Implement orchestration through existing ledger RPCs and provisioning
  reservation/ownership/retry guards. Commit payment before provider calls;
  return the recorded order and explicit setup-failed outcome on provider failure
  so the client retries setup rather than resubmitting the purchase. Never mark
  access active or start dates until setup succeeds. Keep Telegram immediate
  initial access and confirmed queue promotion unchanged. Preserve legacy
  manual-activation recovery for existing pending orders without bulk activation.
- [ ] Add failing rendered cases for **Create & start package**, **Buy next
  package**, unpaid **Awaiting payment**, and **Payment confirmed · Setup failed**
  with **Retry setup**. Remove routine **Activate VPN** actions from both staff
  views, retain eligible recovery, disable duplicate submits and refresh order,
  customer and totals after outcomes. Confirm admin recovery uses the selected
  order's reseller context. Mock all mutations/provider calls.
- [ ] Implement forms/actions and compatible API types; run the targeted backend
  tests, existing payment/queue regressions, both dashboard builds and loopback
  browser cases. Verify automatic queued start changes access only and preserves
  one payment. Update behavior/API docs in this task's commit; current docs must
  not describe the future flow as already deployed before release.
- [ ] Commit `feat: start or queue dashboard purchases after payment`.

### Task 7: Adopt summaries throughout the Mini App

**Files:** Create `miniapp/src/components/business/PackageSummary.jsx`; modify pages `HomePage.jsx`, `SettingsPage.jsx`, `ServersPage.jsx`, `PackagesPage.jsx`, `CheckoutPage.jsx`, `PaymentStatusPage.jsx`, `miniapp/src/lib/paymentStatus.js`, `miniapp/src/hooks/useMiniAppAuth.js`, `miniapp/src/lib/format.js`; extend `miniapp/tests/paymentStatus.test.js` and browser runner.

**Interfaces:** `PackageSummary({ subscription, mode:'current'|'last'|'queued', language })` consumes public summary and Task 5 formatters. `resolvePaymentStatus(data, checkoutPlan, paymentResult)` keeps existing result keys and adds separate access/review/application facts and authorized payment amount.

- [ ] Add failing tests: active pending-review access remains active on Home and Settings; queue receipt refers to queued order, not current subscription; confirmed queued shows waiting to start; expired-only shows No active package and Last package; unlimited omits percentage; VLESS describes included nodes, not connected server.
  Named test `receipt keeps review separate from active access`: `assert.equal(result.accessStatus, 'active')` and `assert.equal(result.reviewStatus, 'awaiting_review')`. These added camelCase fields belong to `resolvePaymentStatus`'s result; the API remains snake_case.
- [ ] Render the successful queue as **Payment confirmed — your next package
  starts when the current package ends**; it is waiting for service activation,
  not payment recording. Mock an existing package stopping/expiring and verify the
  confirmed queued package becomes current after the existing lifecycle promotes
  it; unconfirmed queue fixtures remain unstarted.
- [ ] Pin freshness precedence: refreshed matching order/payment review supersedes stale checkout review; a refreshed unrelated current order must not replace the submitted queued order. Submitted amount uses recorded event amount over catalogue price. Clear/reset stale result when navigating to a new purchase.
- [ ] Run `node --test tests/paymentStatus.test.js tests/businessDisplay.test.mjs`; confirm new assertions fail.
- [ ] Implement common package presentation, preserve auth/link behavior and EN/MM copy, show unavailable/synced usage honestly. Checkout/Packages remain offer displays until an order snapshot exists; Last package exposes no usable expired access link.
- [ ] Run Node tests, local browser scenarios, `npm run lint` and `npm run build`; commit `fix: align customer package and payment displays`.

### Task 8: Align Telegram and scheduled notification copy

**Files:** Modify `backend/src/bot/handlers.js`, `backend/src/bot/strings.js`, `backend/src/bot/notificationTemplates.js`, `backend/src/jobs/customerNotificationsJob.js`, `backend/src/jobs/syncUsageJob.js`, `backend/src/services/notificationService.js`; create `backend/src/__tests__/businessNotificationDisplays.test.js`.

**Interfaces:** Extend `balanceText({ usedGb, remainingGb, isUnlimited, expiryDate, formatBurmeseDate, queuedPlan, totalGb, businessSummary, lastPackage })` compatibly. Read quota/state through shared helpers; existing notification variable names remain valid and optional new quota variables are additive.

- [ ] Write mocked-send tests: switched fixture balance shows total/used/remaining consistently; unlimited/unknown differ; no-current shows Last package separately; queued rejection does not describe current access as rejected; dates match Bangkok; purchase receipt uses submitted amount and separate review/access wording.
  Named test `balance preserves switched package total`: `expect(renderedBalance).toContain('100.00 GB')`, `expect(renderedBalance).toContain('73.33 GB')` and `expect(renderedBalance).toContain('26.67 GB')`.
- [ ] Test usage warning matches the canonical quota percentage and remaining amount; custom existing templates still render. Verify all notification provider calls are mocked and a pure rendering check sends nothing.
- [ ] Run `npm test -- src/__tests__/businessNotificationDisplays.test.js`; confirm failing assertions.
- [ ] Adopt summaries and formatting without changing job intervals, warning thresholds, delivery deduplication, review/stop decisions or notification recipients. Do not import the unfinished channel-notification services or Messenger runtime.
- [ ] Assert Bangkok display date handling leaves Yangon reminder/quiet-hour
  selection unchanged at the half-hour offset boundary. Confirm queued-payment
  messages describe money as received on confirmation and service as starting
  later; mock all sends and retain the existing scheduler/provider behavior.
- [ ] Run notification tests plus existing bot/queue/template tests and full backend suite; commit `fix: align Telegram business summaries and notifications`.

### Task 9: Verify all surfaces and prepare the scoped release

**Files:** Complete `reseller-dashboard/scripts/check-business-displays.mjs`;
create `reseller-dashboard/tests/businessDisplayRunner.test.mjs`,
`docs/audits/2026-10-14-business-display-validation.md`,
`docs/runbooks/business-display-consistency-release.md`; update the inventory,
`DEPLOYMENT.md`, `SKILL_API_CONTRACTS.md`, `KNOWN_BUGS.md`,
`docs/DOCUMENTATION.md`, `docs/API_ROUTE_INVENTORY.md`, `MINIAPP_TEXT.md`,
`BURMESE_TEXT.md` and affected knowledge/skill references when implementation
changes their facts. Update `SCHEMA.md` only for a separately reviewed schema
change; this plan introduces none.

**Interfaces:** Browser runner exports `validateBaseUrls(urls) -> void`, accepts `ADMIN_BASE_URL`, `RESELLER_BASE_URL`, `MINIAPP_BASE_URL`, defaults to loopback ports 3001/3002/3003, and refuses non-loopback hosts. Direct CLI execution runs cases; importing it must not launch browsers. It mocks auth/data/mutations/provider requests and renders the common fixture cases. Validation report records command, commit, result, viewport/locale/time zone and gaps.

- [ ] Add a failing runner guard test: any production/non-loopback URL is rejected before browser navigation. Complete cross-app assertions for date/month boundaries, full-scope totals across pages, action refresh, stale receipt precedence, no-current filters, EN/MM customer copy and no leaked staff financial fields.
  Named test `rejects production browser targets`: `assert.throws(() => validateBaseUrls(['https://app.novanetmm.com']), /loopback/)`. Run `node --test tests/businessDisplayRunner.test.mjs` in reseller-dashboard; expected all guard tests pass after implementation.
- [ ] Run all backend tests, three apps' Node tests, both dashboard builds, Mini App lint/build and the browser runner against independently launched loopback app servers. Use test/development env only; do not start production jobs. Repeat a check only after relevant changes or failures.
  Commands: backend `npm test`; each dashboard `node --test tests/*.test.mjs` then `npm run build`; Mini App `node --test tests/*.test.js tests/*.test.mjs`, `npm run lint`, `npm run build`; reseller `node scripts/check-business-displays.mjs`. Expected: all tests/cases pass and all commands exit 0. Run required CI dependency audits as configured, without changing dependencies to silence an unrelated baseline finding.
- [ ] Review every inventory row: mark verified unchanged or changed with evidence. Ensure runtime changes include no Messenger migrations/services, production secrets or unrelated files. Confirm no historical data backfills or settlement snapshot edits; Task 6A may write only scoped operational order/payment/key changes through existing services. Include dashboard create/confirm/retry, duplicate requests and provider-failure recovery in final verification.
- [ ] Keep documentation current within each owning task's commit: API shapes in
  Task 4, exact source-copy references after Tasks 5–8, and behavior/known-bug
  status when verified. Task 9 must rerun dictionary/export/route/link checks and
  compare docs with the final release source. Mark the usage-bar bug resolved only
  after regression and rendered verification; retain historical evidence and
  development/production stage labels. Do not claim future deployment from a local
  passing test or change an existing settlement snapshot.
- [ ] Write release order: compatible backend first, dependent dashboards/Mini App after; preserve per-component rollback references and old API aliases. Document that old dashboard clients may still submit an activate request after automatic setup: it must safely return the existing active order without repeating payment/provisioning. Document behavior rollback for paid pending/setup-failed orders without undoing recorded money or bulk reactivation. Add the read-only post-release comparison checklist using current live values, not frozen Ye Yint readings. No deployments occur in this task.
- [ ] Run `git diff --check`, inspect exact release diff and perform the selected execution method's final code review; resolve findings, rerun affected checks, then commit `test: verify production business display consistency` and report files, tests and explicit deployment follow-up.

## Self-review and execution handoff

The tasks cover each spec inventory category, API compatibility/public projection, historical snapshot limits, full-scope money, tenant isolation, business dates, unavailable operational metrics, translations, stale action results, dashboard start/queue/setup recovery, and rollback. Fixtures validate exact-byte quota arithmetic rather than rounded display reconstructions. The six Review Focus cases are attached to their owning tasks. Existing names/paths are verified against production-ready source; the new paths and interfaces are explicitly defined above.

Recommended execution: **Native**, in an isolated production-based worktree, because these tasks depend closely on one another's summary contracts and a single implementer can carry those decisions consistently. Use executing-plans after the user reviews this plan and selects the execution method; arrange the required independent final review according to that skill. Subagent-driven execution is also available if explicitly selected. Neither choice authorizes production deployment.
