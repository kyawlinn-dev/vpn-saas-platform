# Business display consistency validation

Execution date: 2026-10-15, Asia/Bangkok. Branch: codex/production-business-display-consistency.
Baseline: main 786dd5f. Production remains unchanged. Independent whole-branch review completed; all eight Important findings fixed with regression evidence.

## Implemented behavior

- Canonical order quota drives all package views; carried key caps remain enforcement
  values. Regression fixture: 100 GB total / 73.33 GB used / 26.67 GB remaining / 73%.
- Current/queued/last package selection is explicit; no ended row becomes current.
  Access, review, ledger recording and durable setup state remain separate facts.
- Ledger recognition includes confirmed queued sales immediately, mixed legacy months
  count once, recorded zero commission remains zero, and real zero ledger recognition
  never falls back to a cached order amount. Full-scope aggregates paginate and do
  not publish false zero when the accounting query fails.
- Bangkok dates and periods are browser-independent. Yangon notification selection
  and existing disabled quiet-hour gating remain unchanged. Finite, unlimited,
  zero, unavailable and sync freshness have distinct presentations.
- Dashboard keyed purchases atomically record receipt and start/queue; unpaid waits.
  Durable migration 0037 coordinates setup/retry/replay. Paid provider failures retain
  money; one existing order is retried without a second payment. Confirmed paid
  purchases awaiting initial setup reserve queue position; concurrent retries cannot
  reset an already active order. Old unkeyed clients and trials retain compatibility.
- Mini App Home/Settings share EN/MM current/last/queue presentation. Refreshed matching
  receipt state supersedes stale checkout data; unrelated current access cannot
  replace the submitted queued purchase. Amount comes from the recorded payment.
- Telegram balance includes total/used/remaining and separate last package. A queued
  confirmation reports received money and future start without a fabricated expiry.

## Verification evidence

- Backend: 43 files / 238 tests passed using loopback-only placeholder DB settings;
  no server/job process or real DB/provider/notification mutation was started.
- Client Node contracts: 4 admin, 6 reseller (including browser safety guards), 12
  Mini App tests passed. Timezone checks spawn UTC, America/Los_Angeles and Asia/Yangon
  processes and agree at Bangkok midnight/month rollover.
- All three production builds and Mini App lint passed. Native Node syntax checked
  for changed backend JavaScript because transformed unit tests alone can miss a
  duplicate-import parse error.
- SQL executable check passed in isolated PGlite against a synthetic core schema:
  request replay/hash conflict, zero commission, owner exclusion/retry, payment
  invariance, queue reservation/promotion/snapshot retention, unpaid gate, tenant
  guard and frontend table/RPC denial. This is not live Supabase DDL certification.
- Chromium browser runner uses only loopback servers and mocks all API/provider
  traffic. Admin/reseller desktop 1440×1000: switched quota, confirmed queued money,
  no-current/last summary. Reseller: paid setup failure → same-order retry and unpaid
  creation. Mini App mobile 390×844: Home and Settings, active awaiting review and
  no-current/last, in both EN/MM. Browser timezone America/Los_Angeles.
- All four npm audit --omit=dev --audit-level=high checks reported zero vulnerabilities.
- Source/copy references: 186 bilingual dictionary keys and 94 exported bot/template
  declarations regenerated and verified by scripts/sync-display-copy.mjs.
- AST route extraction: all 100 literal mounted HTTP routes match the inventory;
  no new HTTP route was required. 0037 adds four backend-only database RPCs.

## Limits and deployment follow-up

No production schema/configuration/order/payment/key/notification or deployment
changes. No unrelated Messenger application changes copied. Original dirty develop
checkout remains available. Historical names/durations with missing snapshots are
not backfilled; current catalogue provenance is labelled. Ambiguous multi-event
legacy duration is not reconstructed. SQL live grants/triggers and a full staging
release still require preflight. Running setup after a crash requires operator
reconciliation; there is no timeout-only owner takeover.

Use docs/runbooks/business-display-consistency-release.md for migration-first
release and rollback. Local passing checks do not mean the production bar changed.

Documentation checks: 67 indexed Markdown files plus the index; active relative
links resolve. Native syntax and Git whitespace checks pass. Source quota/ledger
services, customer protocol and oldest-server freshness regressions are covered.

## Execution rulings and tradeoffs

- Pre-flight: Task 6A→2/4/5 adds setup_status/can_retry_setup. Ruling: define these additive staff fields with Task 2, wire after durable-evidence review in 6A; no premature failed inference — avoids contract mismatch — wrong evidence requires unknown.
- Ruling: use native PowerShell/Node bookkeeping when Cygwin helpers cannot run Windows npm; retain identical brief/base/command/result ledger format — Windows paths/tooling — no test gates omitted.
- Ruling: baseline Vitest excluded the deliberately red next-task test only; no existing tests excluded. Early npm wrappers lacked .bin during npm ci; rerun after successful install.
- Task 3: Ruling: legacy totals with missing payment_status may use explicit positive total_paid_mmk plus confirmed review, preserving existing historical compatibility; explicitly unpaid never qualifies — older stats fixtures/history lack status — otherwise historical money disappears.
- Task 3: Ruling: add tested readAllRows utility to paginate complete accounting/stat inputs; errors return no partial data, never legacy fallback — needed beyond PostgREST limits — embedded history existence remains scoped to selected orders.
- Task 8: Ruling: source confirms quiet-hour gating was removed August 24; preserve that disabled behavior and Yangon date selection, correcting earlier docs that implied active quiet-hour gating — source outranks stale header comments — do not reintroduce scheduling policy. Existing balance string expectations updated for approved two-decimal convention.
- Task 6A: Ruling: one production-independent migration numbered 0037, no development SQL copied; synthetic PGlite runtime installed only in ignored plan scratch, not app dependencies — executable PL/pgSQL verification without live DB writes — production preflight still required.
- Task 6A: Ruling: no timeout takeover of running setup; operator must reconcile provider/key/owner before recovery — prevents stale worker cleanup racing a new owner — stuck work requires operator attention.
- Task 6A: Ruling: keyed manual purchases use atomic RPC; legacy clients without a request key retain old create behavior during rollout; guarded activation/recovery adopts existing pending orders only when explicitly acted on — compatible staged deployment — old clients lack new create replay guarantee.
- Task 6A: Ruling: staff trial flow retains existing no-payment/manual eligibility; automatic start/queue applies to paid purchases — preserve trial policy — trial action remains Activate trial.
- Task 9: Ruling: preserve legacy paid-order price fallback when old cached total_paid_mmk is zero; this is separate from ledger-backed zero, which never falls back — existing pre-ledger compatibility — treating legacy zero as definite free money would drop historical paid orders. Added RED→GREEN regression.
- Task 9: Ruling: confirmed paid dashboard pending setup reserves current purchase position; a subsequent purchase queues behind it and third queue is rejected — prevents multiple paid pending purchases bypassing the queue limit during provider delay — retry must complete the first purchase before queued service starts. SQL RED→GREEN. Claim re-reads order under locks to prevent a stale request reverting active access to pending.

## Independent review and fix pass

Reviewer examined 786dd5f..a949af1 read-only. No Critical findings; eight Important
findings were accepted and fixed in one pass. No second reviewer pass was requested.
The reviewer initially hit a usage limit, then resumed the same review context.

1. Concurrent empty-ledger confirmation could create duplicate receipts. Forced
   concurrent reads reproduced two receipts; deterministic per-order initial keys
   now use the existing database uniqueness/reload path. Test RED→GREEN.
2. Rejected queued checkout could retain cached pending review. A public whitelist
   of scoped historical receipt facts lets a matching rejected order supersede cache
   without becoming current/last. Backend projection and client tests RED→GREEN.
3. Staff renewal and admin next-package purchases bypassed durable setup. They now
   use atomic prepare/start/queue with source and receipt type retained. Provider
   failure preserves recognized money and a retryable order. Lifecycle tests
   RED→GREEN; executable SQL verifies admin source/renew type/failed setup receipt
   preservation and owner retry. Restrictive payment FKs made the old attempted
   deletion fail silently, leaving an active keyless failed-payment row.
4. Admin disabled confirmation for unpaid purchases with no ledger rows. Rendered
   zero-event unpaid fixture failed before the eligibility fix and passes afterward.
5. Accounting dropped unpaid no-ledger amounts/counts. Regression RED→GREEN;
   operational unpaid/order totals remain separate from recognized money.
6. Bot active selection used UTC, with no last-package fallback before lifecycle
   cleanup. Bangkok midnight regression RED→GREEN, including raw-active expired rows.
7. Keyed creation ignored requested changes to an existing customer. SQL regression
   RED→GREEN for name/notes/phone/protocol and inert exact replay, under the lock.
8. Telegram queue promotion used edited catalogue values. Recorded matching payment
   duration/quota now drives provisioning; snapshot regression RED→GREEN, including
   unlimited quota. Missing/ambiguous history keeps the documented catalogue fallback.

Post-fix backend: 43 files/238 tests passed. Client contracts: 4 admin, 6 reseller,
12 Mini App; three production builds, Mini App lint, loopback browser matrix
(including newly unpaid admin action) and executable SQL passed. No dependencies
changed; prior four zero-vulnerability audits remain applicable.

Final: Ruling: existing paid queue cancellation/refund accounting is preserved —
no refund-policy change was approved — cost if wrong: requires a separate product
policy and accounting change before changing cancellation treatment.
Final: Ruling: crashed running ownership remains operator-reconciled — approved
no-timeout-takeover policy — cost if wrong: stuck setup needs operator attention.
Final: Ruling: old unkeyed clients retain their weaker create replay guarantee —
compatible staged rollout — cost if wrong: old-client retries can still duplicate intent.
Final: Ruling: live constraints/triggers/grants certification remains release
preflight — local implementation does not authorize production operations — cost
if wrong: production-specific DDL incompatibility must be caught before deployment.
Final: Ruling: unrelated Messenger/development changes remain outside this branch —
production baseline is the authorized scope — cost if wrong: separate integration is
needed for development-only features.

Deferred minors (reviewer findings; no extra polish pass):
- Equal activation/start selection uses ID before creation-time tie-breaker.
- Admin customer detail omits the freshness map, so known sync time can show unavailable.
- Later unpaid receipt/read duration may use labelled catalogue fallback despite an
  exact operation snapshot being stored; provisioning still uses the exact snapshot.

Production remains unchanged. Migration 0037 and release still require authorization.

## Local testing follow-up: integer quota overflow (2026-10-15)

Development 0037 is now exposed through PostgREST, verified read-only. A real create
attempt returned PostgreSQL 22003 from prepare_dashboard_purchase. The original SQL
fixture incorrectly modelled vpn_plans.data_limit_gb as numeric; the development API
schema exposes integer. Correcting that fixture reproduced integer overflow before
the final bigint cast. Migration 0038 widens the GB operand before multiplication.
The isolated SQL suite passes with 0037+0038, including 0/1/2/50/100 GB and unlimited,
alongside the existing replay, queue, snapshot, ownership and permission cases.
This follow-up is prepared locally and has not been applied by this agent to any
database. A separate production release must include 0038 after 0037.

## Owner correction: preserve Mini App design (2026-10-15)

The owner confirmed order creation works and rejected the unrequested Mini App
redesign. Restored the original Home DataRing (136px, original gradient/stroke,
status header, glass card and copy button) and original compact Settings cards.
The ring uses canonical exact-byte quota instead of key caps or catalogue fallback;
access remains Active while review is pending. Current/last/queue selection and
receipt refresh fixes remain. Last/queue summaries use compact text, not horizontal
usage bars. English caption says Data used rather than implying a monthly period.

Browser regression failed with zero circle elements, then passed with the restored
two-circle SVG and 73% / 100.00 GB / 26.67 GB remaining. English and Burmese Home/
Settings active-review and no-current/last cases passed. Screenshots were inspected.
Mini App Node contracts, lint and production build passed. This is a local UI
correction; it makes no database, provider, notification or production changes.
