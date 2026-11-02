# Core/server release preparation — 2026-11-02

Status: **Final offline preparation complete; deployment-time gates remain**.
Source changes are limited to the isolated release checkout. Read-only production
catalogue and aggregate queries succeeded; no production migrations, application
service starts or deployments occurred. The normal development
checkout retains Messenger, Announcements and its phone-access helper.

## Final preparation update

See `../runbooks/2026-11-core-final-preparation.md` for the current gate list.
The package now has21 migrations, including0063 protected LightNode adoption.
Review regressions cover inherited ports, strictly retired Outline history and
protected production startup. Fresh four-node inspection passed with synthetic
local SQL and authenticated live GETs only. Node22 locked installs, frontend
tests/builds/lint and SQL rehearsal are recorded in the release ledger. Final
source snapshot is pinned there after review; no source publication is implied.
Earlier Task1/2 counts and manifests below remain historical evidence, not the
current candidate checksum. Deployment must still obtain fresh DB recovery and
Pages IDs, resolve installation-time firewall/attestation IDs, approve exact
metadata/79 deadline proposals and one trial membership update, and recheck drift.

## Task1 completed evidence

- Removed deferred runtime imports/workers/webhooks, channel queries/UI/types,
  package commands and Announcements navigation from this candidate. Shared
  Telegram purchase/trial/payment/expiry flows remain; excluded caller channels
  fail before storage. No customer data or ordinary trial history was changed.
- Complete offline backend: **1,427 passed / 129 files**, zero failures.
- Admin Vitest: **82 passed / seven files**. Reseller browser/contracts: **14
  passed**. Admin, reseller and Mini App builds passed; reseller rebuilt after
  restoring its non-LAN Vite configuration.
- Embedded PostgreSQL: eight LightNode infrastructure checks plus two quoted
  admission/replay scenarios passed. These are bounded single-engine scenarios,
  not the next task's production-shaped purchase/trial/delivery SQL rehearsal.
- Parsed **171 backend modules / 509 relative dependencies**, no missing imports.
  Recorded 19 literal direct RPC dependencies for the next phase; infrastructure
  RPCs routed through helpers also require the full SQL dependency audit.
- Historical deployed0039 remains byte-identical. Mixed0035/0036 are preserved
  only as historical comparison fixtures; test fixtures are excluded from backend
  deployment. Standalone PGlite programs run with Node separately from Vitest.
- Independent review of the Task1 delta found no actionable issues. Reviewer
  Franklin completed without a usage-limit interruption and was closed. Earlier
  interrupted LightNode agents had already resumed/completed/closed.
- Source manifest pins703 application/config/workflow/test files; SHA-256
  `a4a569096e19f44031471113939703e8709ce3bdeb0747e34773c5c31b20cfde`.
  The ignored preparation workspace contains the per-file manifest, pre-edit
  snapshot and test reports. This is not an approved release Git revision; freeze
  that after SQL/configuration/dependency validation.

## Task2 completed evidence

Production Session pooler connection verified with official CA and authorized TLS.
Read-only transactions inspected 21 tables, 16 functions, 63 indexes and three
views. Five aggregate integrity checks returned zero violations; no real customer
records were exported. There is no production migration-history table, so actual
effects were verified directly. Existing 0039 function behavior matches source.

The reviewed package at `backend/supabase/releases/2026-11-core/` pins 20 migration
inputs and one atomic bundle. New 0060/0061 separate required shared Telegram
operations/cleanup from mixed DEV histories; old migration files remain intact.
The package excludes Messenger/Announcements and preserves existing function
definitions/grants, receipts, trial history, quotas, deadlines and counters.
New-call NULL rejection and zero staff commission have explicit regressions.

All 13 embedded SQL programs passed, including 16 production-package scenarios
and failure/reapply/baseline-drift checks. Complete offline backend rerun:
1,427 passed, zero failures. Reviewer Pasteur independently passed package and
cleanup SQL and found no actionable issues; completed and closed, no unfinished
usage-limit worker remains. Single-engine testing does not prove multi-connection
concurrency or Supabase control-plane behavior.

Next: fresh production configuration/inventory and adoption plans, recovery
backups, dependency triage and final Node22 locked-install verification. Nothing
has been applied to production and no deployment equivalence is claimed yet.

## Scope

Include completed core Telegram/Mini App/dashboard flows, shared purchase/trial/
notification behavior, 04:00 Myanmar cutoff, public trial access, server switching,
DO/Vultr/LightNode infrastructure, names/flags, recovery and Bot Links. Keep the
existing Mini App visual design. LightNode includes automatic regional discovery,
explicit unknown provider prices, and the verified business-not-found retirement
fix. Owner confirmed the Bangkok-to-DO DEV flow worked after that fix.

Exclude Messenger, Announcements/campaign trials, website/redesign prototypes,
developer LAN settings, private credentials/configuration and operational scripts.
Shared improvements remain included only after their deferred-channel dependencies
are removed from the candidate. Preserve the complete development source for later.

## Initial evidence before Task1 cleanup (resolved in source)

Checkout: `codex/production-core-server-release`, HEAD `049864d` with substantial
uncommitted candidate work. HEAD alone does not identify the current candidate.

`npx vitest run src/__tests__/productionReleaseIsolation.test.js` in backend:
one passed, two failed. The migration-history/exclusion assertion passed. The
runtime exclusion assertion failed on static Messenger imports in `server.js`.
The checkout channel assertion failed during import because its offline setup
does not provide the Supabase fixture; it did not reach the business assertion.
This is a test-fixture gap, not evidence of incorrect production credentials.

Direct source inspection additionally found:

- `server.js` still imports/wires Messenger configuration, webhook and worker.
- `customerNotificationService.js` still imports Messenger client/presentation.
- `purchaseService.js` still accepts the deferred Messenger customer channel.
- Reseller `App.tsx`/`AppShell.tsx` still lazy-import/route/navigate Announcements,
  whose page is excluded from this checkout.
- Historical release-plan Tokyo #1/#2 instructions were stale and have now been
  marked superseded. Fresh fleet/provider ownership must precede adoption.

Earlier scoped infrastructure tests and manual acceptance remain useful feature
evidence. They do not establish that this exact Telegram-only release builds,
boots or executes its production-shaped SQL chain successfully.

## Ordered next checklist

1. **Finish isolated candidate extraction.** Remove excluded runtime/UI wiring;
   keep Telegram/shared services functional. Repair offline fixtures without
   introducing real credentials or restoring excluded modules. Prove dependency
   closure and preserve deployed 0039. Inspect the deployable filesystem, not only
   tracked changes, because Ansible may copy untracked files.
2. **Prepare exact production database delta.** Read actual production definitions;
   separate shared purchase/trial/notification SQL from mixed DEV Messenger SQL.
   Rehearse the ordered chain over a production-shaped baseline without deferred
   tables. Include required lifecycle/cutoff/Bot Links/LightNode constraints only
   after checking dependencies and existing effects. Never apply every DEV SQL
   file blindly or copy DEV pool/service IDs.
3. **Verify the frozen candidate.** Locked dependencies, complete offline backend
   and SQL suites, both dashboard tests/builds, Mini App checks/build, startup
   dependency checks and scoped independent review. Produce an exact source
   revision/file manifest and checksums. Fix findings before release approval.
4. **Prepare production configuration and recovery.** Fresh read-only fleet/account/
   global-service inventory, staged access/lifecycle flags and per-resource
   adoption plans. Record recoverable DB/config/source/static/dashboard backups
   and rollback order. Keep uncertain operations and existing customer state.
5. **Present the concrete rollout package.** Source revision, ordered SQL, config
   changes, existing-resource adoption scope, validation evidence, backup IDs and
   smoke/rollback steps. Obtain deployment authorization before any production
   SQL, configuration application, application publication or lifecycle activation.

Do not resume old Tokyo manifests, create another test VPS, change customer
deadlines, broadcast messages or start local services as part of this checklist.
