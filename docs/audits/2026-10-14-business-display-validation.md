# Business display consistency validation

Execution date: 2026-10-15, Asia/Bangkok. Branch: codex/production-business-display-consistency.
Baseline: main 786dd5f. Production remains unchanged. Independent final review pending.

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

- Backend: 39 files / 231 tests passed using loopback-only placeholder DB settings;
  no server/job process or real DB/provider/notification mutation was started.
- Client Node contracts: 4 admin, 6 reseller (including browser safety guards), 11
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

Final review is dispatched read-only against a949af1. The documentation index
now distinguishes local implementation from production and names the actual
GitHub Actions dashboard deployment path. No runtime edits are being made while
the independent review runs.
