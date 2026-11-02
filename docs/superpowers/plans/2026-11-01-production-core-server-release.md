# Production Core and Server Management Release Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to prepare and verify the candidate task by task. Deployment requires the owner's later approval of the concrete candidate and recovery artifacts.

**Goal:** Release the completed Telegram/core/server-management work without Messenger, Announcements or website/redesign work, preserving current customer access and money history.

**Architecture:** Assemble a clean release candidate from the verified production application baseline plus reviewed development changes. Separate shared purchase/trial/notification dependencies from Messenger, verify a production-compatible migration chain, then roll out additive SQL and compatible application code before enabling infrastructure automation for explicitly adopted production resources.

**Tech Stack:** Node 22, Express/Telegraf, Supabase PostgreSQL, React/Vite, Cloudflare Pages dashboards, Droplet Nginx/PM2, manual Ansible and provider/panel APIs.

**Spec:** Owner's release scope confirmed in this chat; SYSTEM_DESIGN.md, SKILL_API_CONTRACTS.md, DEPLOYMENT.md and docs/runbooks/server-management-production-release.md. Tokyo operation is separately recorded in docs/runbooks/2026-11-01-tokyo-replacement.md.

**Status (2026-11-02):** Task1 source preparation is complete in the isolated
checkout. Messenger/Announcements runtime/UI dependencies are removed; all five
release-isolation assertions and the complete offline suite pass. Source is pinned
by a reviewed file manifest, not yet a final release Git SHA. Production-shaped
SQL preparation/rehearsal is complete. Production configuration/recovery and final verification remain pending. No production
application, SQL or infrastructure activation is authorized by this preparation.
See docs/audits/2026-11-02-core-server-release-readiness.md for evidence/limits.

**Fleet warning:** Earlier Tokyo #2/#1 steps below have been superseded. Both
servers were removed in separately authorized operations; Tokyo #3 is now the
LightNode live node. Numeric panel/service IDs have been reused. Never replay
old deletion/adoption manifests or treat historical IDs as current authority.
Fresh read-only production inventory is required before configuration/adoption.

## Final preparation checkpoint (2026-11-02)

Local release preparation is complete after reviewed gap fixes, Node22 locked
installs,1,443backend/82admin/30reseller+MiniApp tests,13SQL programs,3builds and
MiniApp lint. Exact21-file SQL, protected access requests, staged configuration,
expected-old deadline/trial membership proposals and private code/config recovery
archive are prepared. Final source freeze is recorded in the ignored ledger.

Unchecked operational items below remain explicit later-window gates: fresh
recoverable DB backup and Pages rollback IDs, target drift/operation checks,
installation-time production firewall/attestation IDs, live approval hashes and
owner deployment approval. No production configuration/schema/customer change,
source push or deployment is implied. Single-engine/Windows evidence is not
Linux-native or multi-connection concurrency proof.

## Global Constraints

- Exclude Messenger runtime/configuration/UI and Messenger-specific schema; no dormant webhook/worker activation as a shortcut. Retain needed core improvements with Telegram-compatible dependencies.
- Exclude Announcements code, route/navigation wiring, unfinished tests and migration 0059. Preserve paused development files for later.
- Exclude website, Figma/redesign prototypes, developer LAN settings and operator secrets/scripts from deploy source.
- Preserve production keys, encryption key, bot tokens/webhooks, customer subscription URLs, receipts, quota, usage and ordinary trial history.
- No new VPS, replacement, retirement, broadcast or customer reset as a side effect of SQL application, application startup or metadata adoption.
- Owner runs local services. Finite offline tests/builds may run; no agent-started local app servers.
- Backend and Mini App use manual Ansible; dashboard production publication uses the explicitly dispatched deployment workflow. Source push/PR is distinct from deployment authorization.
- The shared panel contains DEV and production memberships. Match exact production database/customer/service bindings; never replay DEV IDs, encrypted values or ownership receipts into production.

## Review Focus

1. Production 0037–0039 already exist; development lacks the historical 0039 file. Preserve that history and verify the commissioned-payment split survives the new shared purchase flow.
2. Shared services and migration 0050 reference Messenger today. A clean source build and SQL execution must work without Messenger tables/imports, not merely with a disabled bot flag.
3. Existing nodes and customer panel accounts are not automatically lifecycle-owned. Legacy access must remain available during staged adoption; infrastructure controls stay off for unverified resources.
4. 04:00 Myanmar display/DB/expiry jobs must agree with actual panel deadlines. No expired account is reactivated incidentally; no active customer's deadline is shortened.
5. An uncertain cloud operation is durable external state, not a code rollback. Avoid duplicate purchases, preserve checkpoints and reconcile resources before enabling work on an older binary.

## Release Contents

Include public trial/paid access policy; SS selected-server switching; one global
VLESS service; provider catalogue and DO/Vultr/LightNode node provisioning; replacement,
move-and-retire and VLESS-only retirement; resumable operation safety/recovery;
maintenance selection; server names/flags; shared Telegram/Mini App/applicable
staff purchase and trial operations; immediate payment/admin notifications with
durable recovery; 04:00 Myanmar cutoff and consistent displays/reminders; approved
Telegram copy; two guide URLs in Bot Links; compatible test-customer cleanup.

Keep the general reseller Notifications editor. No new broadcast UI or special
campaign trial is part of this candidate. Preserve the existing Mini App design.

## Task 1: Freeze Scope and Assemble Clean Source

**Files/inputs:** development checkout; verified production reference 049864d (documentation commit with the deployed a091081 application tree); all four application directories, ansible/, .github/workflows/, baseline migration 0039.
**Produces:** attached isolated candidate checkout, reviewed file manifest, source checksum manifest, dependency/exclusion report (final release Git SHA frozen after Task4 validation). No source publication yet.

- [x] Preserve the dirty development checkout and paused Announcements files. Do not stage/commit everything, stash destructively or sync this checkout to the Droplet.
- [x] Use an isolated release checkout based on the verified production application tree. Carry only reviewed feature files/hunks, including untracked files required by the completed features. Reuse a suitable attached release checkout only after preserving its existing state; otherwise create an approved new managed worktree. Use a codex/ branch.
- [x] Restore historical backend/supabase/migrations/0039_dashboard_purchase_payment_split.sql byte-for-byte from the production release reference. Do not rewrite migrations already applied in either environment.
- [x] Remove direct Messenger imports/branches from candidate server.js, shared customer notification delivery and new shared trial/purchase entry points. Remove Messenger source filters/labels from candidate dashboards. Preserve Telegram payment-review and admin alert behavior.
- [x] Omit backend/src/messenger, Messenger routes/config/scripts, Announcements service/UI/tests and 0059. Remove Announcements App.tsx/AppShell.tsx lazy import, route and sidebar wiring from the candidate only.
- [x] Trace application dependency closure for included routes/jobs/services; prove no excluded runtime imports remain and record required RPCs/migration coupling for Task2. SQL closure/rehearsal stays in Task2; successful builds do not prove database compatibility.
- [x] Ensure package manifests/locks contain only candidate dependencies. Exclude local .env files, uploads, audit backups, developer runner configuration and manual Tokyo operation state. Production Ansible rsync copies untracked files too, so inspect the actual candidate filesystem.
- [x] Record the exact Task1 candidate diff and source checksum manifest. Freeze a Git SHA after Task4 verification; any later fix invalidates that release snapshot.

## Task 2: Audit and Prepare the Production Database Delta

**Files/inputs:** baseline 0001–0026 and applied production 0037–0039; development 0027–0036 and 0040–0058; SCHEMA.md and release-only reviewed SQL.
**Produces:** exact ordered SQL manifest, read-only production metadata report, production-shaped SQL regression evidence, rollback/compatibility notes. No production application in this task.

- [x] Verify actual production catalogue definitions for existing tables, constraints, indexes, grants/triggers and RPCs, plus migration history if available. OpenAPI is only supporting evidence. If no direct DB connection is configured, prepare a read-only SQL Editor query for the owner; keep credentials out of chat.
- [x] Confirm effects of production 0037,0038,0039; do not rerun their create-table chain blindly. Verify receipt amount=commission+platform_due, tenant FKs, one-active/one-queued uniqueness and database-owned reservation/counter RPCs.
- [x] Extract required shared objects from mixed 0027–0036: purchase_operations/submission ownership, notification_deliveries/outbox/recovery, customer_trial_claims/eligibility/provisioning, plus accepted follow-up fixes. Omit Messenger links/events/sessions/profile schema. Assign new immutable release migration filenames after a collision audit; keep 0059 reserved for the paused feature. Exact filenames/order must be pinned before approval.
- [x] Audit dependencies/order of lifecycle 0040–0049, cleanup 0050, adoption 0051, worker pagination 0052, naming 0053, assignment repair 0054, expiration-safe moves 0055, cutoff 0056, resource-incarnation retirement 0057 and bot links 0058. Shared trial schema must precede functions that reference it. Merely sorting the current mixed filenames is not an approved migration strategy.
- [x] Adapt cleanup to the actual Telegram-only candidate schema. Preserve guarded tenant cleanup and consumed trial history; cleanup executes only on explicit invocation; legacy trial history backfills into the new claims table only.
- [x] Rehearse the exact resulting chain over a production-shaped database baseline including 0039 and WITHOUT Messenger/Announcements tables. Verify functions by invoking real synthetic transactions, not just creating PL/pgSQL definitions.
- [x] Test zero/positive commission, integer quota conversion, staff/customer purchase policies, repeated submissions, queue/payment invariance, trial-history preservation, delivery recovery, grants/tenant denial and all lifecycle repair SQL. Record single-connection versus actual multi-connection evidence separately.
- [x] Record exact SQL files, checksums and expected postconditions. Keep additive history on rollback while release-created data references it.

## Task 3: Configure Production Scope and Existing-Resource Adoption

**Files/inputs:** release backend/config/server-infrastructure.example.json, adoption CLI, existing production DB/panel/provider inventory, node SSH identities and source ownership evidence.
**Produces:** reviewed production pool/service/account/firewall configuration and per-resource adoption manifests/hashes. No automatic replacement or purchase.

- [x] Re-inventory every current production server, including SG5 and LightNode Tokyo #3. Existing old production schema may lack capability/pool metadata. Confirm active SS services, global VLESS service 5, actual provider IDs, supported protocols and exact active customer bindings. Historical DEV/production snapshots are not fresh inventory.
- [x] Re-read Tokyo #3's provider UUID, creation identity, node/inbound/service membership and current customer bindings. Tokyo #1 and #2 were removed; do not adopt/recreate them or replay old manifests. Numeric IDs alone are not ownership. Do not buy a duplicate VPS merely to register an existing node.
- [x] Pin production Supabase identity daenwuszqdfkbjiatsjs, panel identity, production-only access pool and authenticated provider accounts. Preserve global service 5; do not substitute DEV global service 14 or copy DEV ownership records.
- [ ] Establish production access ownership separately from lifecycle destruction authority. Protected/controller/shared resources remain protected. Adopt legacy customer panel bindings with preserved credentials and matching subscription-key hashes before allowing migration/retirement.
- [ ] Verify independent SSH host fingerprints, provider SSH key matches, public profile ports, management-source restrictions, quotas/price policies and images. The production host has a stable management IP; the separate DEV runner transport/configuration is not copied to production.
- [ ] Prepare reviewed existing-resource manifests and preview hashes. Adoption application is a later approved metadata operation, not granted by this plan. Show unadopted nodes as unsupported for lifecycle actions, not as permission to delete/recreate them.
- [x] Keep server operations execution/admissions and public-policy activation off until required bindings/adoption are complete. Use staged flags so ordinary production provisioning remains on its compatible legacy path until the new public pool is ready. Final flag values and transition checks must be listed in the approved configuration diff.

## Task 4: Verify the Exact Candidate and Capture Recovery

**Files:** all included application manifests/test suites; docs/testing/server-management-release-matrix.md; deployment recovery paths.
**Produces:** candidate-specific test report, backup identifiers and previous component revisions. No release approval inferred from historical test counts.

- [x] Perform clean locked installs with Node 22. Run the complete offline backend suite, synthetic SQL suites, dashboard tests/builds, Mini App lint/build/contracts and dependency checks for the clean candidate.
- [x] Add regressions proving the candidate runs without Messenger/Announcements modules/tables and migration 0039 behavior remains correct. Verify photo/campaign files are absent, not bundled behind a hidden route.
- [ ] Verify Telegram initial trial, initial purchase/payment review, queued purchase, confirmation/rejection notification, staff create/renew/recovery, Outline switch, public VLESS trial access, Bot Links save/clear and old callbacks using the candidate. Preserve live customer data; no production failure injection.
- [x] Re-run included lifecycle flows for provider/profile combinations using finite fixtures and review the owner's completed DEV manual tests. Review destructive code and uncertainty checkpoints independently; do not call historical DEV tests proof of production adoption.
- [ ] Check original Mini App circular design, phone/desktop displays, server maintenance status/naming, access cutoff and payment-review labels. No redesign prototype is included.
- [ ] Capture a recoverable production DB backup identifier, previous backend source/package lock, Mini App source/dist, current production env/config backup and dashboard Pages deployment IDs. Keep secret-bearing material on approved hosts, outside Git/chat.
- [ ] Reconfirm current production hashes and health immediately before deployment; record any drift from the earlier 141-file match. Obtain exact current dashboard deployment IDs through authenticated workflow/Pages metadata if public host inspection is blocked.
- [ ] Independent review of candidate source, ordered SQL, config transitions and rollback. Resolve findings before presenting the concrete approval package.

## Task 5: Approved Production Rollout

**Consumes:** owner-approved candidate SHA, exact SQL/config diffs, verified backups and operational window. These actions require later explicit authorization.

- [ ] Check for running purchase/provisioning/lifecycle operations before any reload. Wait or reconcile them; never reset durable owners to force a deploy.
- [ ] Apply only the approved missing additive schema/RPC changes in their reviewed dependency order. Verify expected signatures, service_role-only privileges and PostgREST schema cache before deploying code that requires them.
- [ ] Apply separately approved production metadata/adoption configuration in the recorded sequence. Keep lifecycle worker/admissions disabled while reconciling legacy resources and verifying normal customer access.
- [ ] Handle the 04:00 Myanmar policy as a coordinated application/panel change. Inventory active production panel accounts via exact DB bindings and prepare a bounded deadline-only reconciliation with expected-old-value checks. Preserve enabled state, credentials, quota and usage; leave expired/stopped accounts expired/stopped. No automatic backfill is implied by 0055/0056. New UI must not promise a later deadline that the panel still denies.
- [ ] From clean approved source, deploy backend/bot through ansible/deploy.yml. Verify PM2/health, all expected bots, authenticated reads, trial/purchase RPCs and notification workers. No Messenger or announcement worker should start.
- [ ] Deploy admin/reseller dashboards from the exact approved ref using the existing manually dispatched .github/workflows/deploy.yml. Dispatch publishes Pages PRODUCTION even from a release ref; it is a deployment action, not an innocuous branch build.
- [ ] Deploy the Mini App via ansible/deploy-miniapp.yml with existing production environment. Verify served assets/API origin. Update only the reviewed Mini App release/cache version and refresh bot menu URLs through the established backend procedure after rechecking active operations.
- [ ] Enable new public access policy only after all intended production nodes/global/SS bindings are proven ready. Verify customer selection and current links. Enable infrastructure execution only for adopted eligible resources after readiness checks; no lifecycle operation is auto-submitted.
- [ ] Run owner-selected read-only cross-interface smoke checks, plus a genuine owner-approved trial/sale/canary only if separately authorized. Observe payment/notification, expiry/queue, access and provider-cost logs without exposing secrets.

## Task 6: Accept, Monitor or Roll Back

- [ ] Record deployed component SHAs/assets/Pages IDs, SQL checksums, config values and actual smoke outcomes. Keep incomplete manual observations explicitly pending.
- [ ] Monitor existing Happ/Outline access, trial creation, payment reviews, notification recovery, queue transitions and lifecycle readiness. Do not delete old Japan resources to make the release appear complete.
- [ ] If failed, stop new lifecycle admissions first, reconcile in-flight customer/cloud work and preserve operation checkpoints. Roll dependent clients back before removing a required backend contract. Restore recorded source/lockfile/static assets through existing workflows; retain compatible additive schema/history.
- [ ] Configuration rollback must also restore a valid access policy/pool path; toggling a flag cannot undo migrated memberships. Do not reverse expiry extensions by shortening customer access as an incidental rollback.
- [ ] Preserve payments and used trial history. Never drop operation/claim/delivery rows as a recovery shortcut, recreate customer accounts, or repurchase an uncertain VPS.

## Historical Tokyo Cutover

The earlier Tokyo #1/#2 cutover gate is superseded by their separately completed
retirements and the Tokyo #3 LightNode addition. Preserve those operational records;
do not replay them as part of application release. The owner also confirmed the
DEV Bangkok LightNode-to-DO replacement/retirement fix worked on 2026-11-02.
That DEV acceptance does not adopt production resources or authorize deployment.

## What Can Proceed Now

Clean-candidate extraction, dependency audit, production-shaped SQL rehearsal,
offline verification, read-only production preflight and backup/recovery planning.
Present the concrete source/SQL/config/recovery package for approval before any
production migration, application deployment or lifecycle activation.
