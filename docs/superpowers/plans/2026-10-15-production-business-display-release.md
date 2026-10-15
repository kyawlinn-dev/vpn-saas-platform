# Production Business Display Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to execute this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This document is a plan, not authorization to deploy.

**Goal:** Release the tested business-display and dashboard-purchase changes, including the integer-quota fix and original circular Mini App design, without development Messenger features.

**Architecture:** Prepare an isolated release checkout from the exact committed snapshot below. Verify its production-compatible database dependencies, then release database functions before backend consumers and frontend clients. Keep the dirty development checkout and its local environment files intact.

**Tech Stack:** Supabase/PostgreSQL, Express/PM2, Telegram bots, React/Vite, Cloudflare Pages/GitHub Actions, Droplet Nginx/Ansible.

**Spec:** `docs/superpowers/specs/2026-10-14-production-business-display-consistency-design.md`, including the owner's 2026-10-15 instruction to preserve the Mini App design. Additional release constraint: exclude development Messenger work.

## Global Constraints

- Planning only until the owner asks to execute. No push, PR, merge, database application, bot restart or deployment is authorized by this document alone.
- Production baseline `main`: `786dd5f9d7cddd5fdc3341f7315a867ed87b365b`, verified against remote main on 2026-10-15. Recheck immediately before preparing the release; investigate any drift.
- Candidate source: `aa0954faf28d95bb540f43a6c2d1899629ccc6d9`. Its committed tree contains the clean business-display implementation through `5c858fa`, quota correction `e5a4a75`, and original-design restoration `aa0954f`. The local merge `1e2251d` introduced no tree changes relative to `5c858fa`.
- Use that exact committed tree, never a copy of the current dirty `develop` working directory. The owner tested with unfinished development files also present; those results do not replace testing the isolated candidate.
- Exclude `backend/src/messenger/`, shared `purchaseService.js`, development notification/outbox/trial-claim services and migrations 0027–0036. No development bot tokens, `.env.local`, panel credentials, Messenger assets or untracked local files enter the release.
- Apply only new migrations 0037, 0038 and 0039 after verifying existing production core effects through 0026. They do not require 0027–0036.
- Keep the original Mini App DataRing, gradient, Home header/copy button and compact Settings cards. Consistency concerns data and status, not a redesign.
- Confirmed queued money is recognized before activation, exactly once. Preserve historical settlement snapshots and real zero commission. Never undo received money as a provisioning rollback.
- Preserve reseller scoping, backend-only service-role credentials, provisioning reservation/ownership guards and database-owned capacity counters.
- Production backend/Mini App: manual Ansible from the isolated candidate. Dashboards: manual `Deploy` GitHub Actions workflow. A main merge runs CI but does not deploy.

## Review Focus

1. Ansible syncs the on-disk directory, including untracked files: prove the actual control-machine source is the isolated candidate, not the dirty normal checkout (Tasks 1, 4).
2. Live SQL types/constraints/grants may differ from synthetic tests: verify integer GB to bigint bytes, core prerequisites, service-role permissions and the absence of a migration-number collision (Tasks 2, 3, 4).
3. Manual testing included development purchase adapters: re-test Telegram/Mini App purchases and staff confirmation/retry on the Messenger-free candidate (Task 2).
4. A reload or rollback can interrupt durable setup: do not steal running ownership or erase money; inspect and reconcile operations before replacing backend processes (Tasks 3, 4, 6).
5. Cached Telegram clients or mismatched releases can show stale UI: deploy compatible components in order, verify the circular ring in EN/MM and bump the Mini App release version after static publication (Tasks 2, 5).

## File and artifact map

- Existing code source: exact snapshot `aa0954f`, plus the two review corrections recorded in the release audit (receipt CHECK compatibility and truthful reseller renewal outcomes). No feature expansion.
- Database files: `backend/supabase/migrations/0037_dashboard_purchase_operations.sql` , `0038_dashboard_purchase_quota_overflow.sql` and `0039_dashboard_purchase_payment_split.sql` only.
- Local SQL validation: `backend/scripts/check-dashboard-purchase-sql.mjs`.
- Browser validation: `reseller-dashboard/scripts/check-business-displays.mjs`.
- Deployment: `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, `ansible/deploy.yml`, `ansible/deploy-miniapp.yml`, `ansible/files/ecosystem.config.cjs`.
- Procedure: `docs/runbooks/business-display-consistency-release.md` and `DEPLOYMENT.md`.
- Create during execution: `docs/audits/2026-10-15-production-business-display-release.md`, recording the actual candidate/main SHAs, checks, approvals, pre-release backup identifiers, component revisions, migration results and final disposition. Do not record secrets or customer screenshots.

### Task 1: Prepare and prove the clean candidate

**Interfaces:** Consumes pinned source `aa0954f`; produces a clean named release checkout `codex/production-business-display-release`, its absolute path and verified diff against current remote main.

- [x] Recheck remote main and the dirty checkout status. Leave development changes and the retained pre-merge stash untouched.
- [x] Use native managed-worktree creation with ref `aa0954faf28d95bb540f43a6c2d1899629ccc6d9`; name/attach the checkout and create the named release branch there. Do not use a working-tree snapshot or copy development environment files.
- [x] Verify `git status --porcelain -uall` is empty in the candidate. Record `git rev-parse HEAD` and `git diff --name-status 786dd5f...HEAD` in the release audit.
- [x] Carry this plan and its updated release runbook/index/DEPLOYMENT references as explicit documentation-only files; commit them separately. Record the runtime source SHA `aa0954f` separately from subsequent documentation/release-audit commit SHAs. Do not copy any application source or environment file from the dirty checkout. Verify `git diff aa0954f -- backend miniapp admin-dashboard reseller-dashboard .github ansible` stays empty before testing. Required release-review corrections are the explicitly recorded exception; they must each have regression evidence.
- [x] Run `git ls-tree -r --name-only HEAD -- backend/src/messenger backend/src/services/purchaseService.js backend/src/services/notificationDeliveryService.js backend/src/services/customerNotificationService.js backend/src/services/adminPurchaseNotificationService.js`. Expected: no output. Verify no SQL files numbered 0027–0036 exist in the candidate.
- [x] Run `git grep -n -E 'from.*(messenger|purchaseService|notificationDelivery|customerNotificationService|adminPurchaseNotificationService)' HEAD -- backend/src`. Expected: no runtime imports. Documentation may describe excluded development work; that is not permission to deploy it.
- [x] Compare all package manifests/lockfiles with baseline. No Messenger dependencies or scripts should be introduced. Retain the restored circular UI and both corrective commits in the candidate diff.

### Task 2: Verify the candidate independently of develop

**Interfaces:** Consumes only candidate source and disposable test configuration; produces passing automated checks and a recorded owner/canary test matrix for this exact source.

- [ ] Run `npm ci` in backend, admin-dashboard, reseller-dashboard and miniapp. Use Node 22 and loopback-only placeholder database values for unit tests; do not start real jobs from a test process.
- [ ] Run backend `npm test`; all three apps' Node contract tests; both dashboard builds; Mini App lint/build; and each app's `npm audit --omit=dev --audit-level=high`. Record actual counts; do not expect the 444-test combined-development total in the clean checkout.
- [ ] Install PGlite only in disposable ignored scratch, set `PGLITE_MODULE` to its dist/index.js, and run `node backend/scripts/check-dashboard-purchase-sql.mjs`. Expected: replay/hash, ownership/retry, queue, payment, tenant/permission, snapshot and integer quota cases pass. Integer GB values 0/1/2/50/100 and unlimited must work with 0037+0038+0039 and the core receipt money CHECK.
- [ ] Launch loopback frontend servers with mocked API traffic and run `node reseller-dashboard/scripts/check-business-displays.mjs` with their explicit loopback URLs. Expected: all staff and EN/MM Mini App cases pass, including the two-circle 136px SVG. No production API/provider/notification requests are allowed from this test.
- [ ] Verify source-copy references with `node scripts/sync-display-copy.mjs`, native changed-backend syntax and `git diff --check`.
- [ ] Re-test the production-compatible candidate against an isolated test database/provider configuration: paid create, unpaid confirmation from both dashboards, next queue, renewal failure/retry, concurrent confirmation/replay, Telegram/Mini App initial review and queue promotion, rejected queue receipt, no-current/last and quota display. Keep the original ring visible. Do not use the shared live panel for failure injection.
- [ ] Record which checks were automatic and which were observed manually. Any candidate change requires its relevant regression and build/check before advancing. Unexpected failures stop preparation; do not weaken checks to match develop.

### Task 3: Complete production preflight and the reviewable release package

**Interfaces:** Consumes passing candidate and existing deployment access; produces a release audit, rollback artifacts and an explicit approval gate. This task is read-only against production business data until a separate operational authorization.

- [ ] Compare live backend source/build revisions and current DB metadata with the baseline; reconcile drift. Verify `vpn_plans.data_limit_gb` and `vpn_orders.quota_limit_bytes` types, composite tenant FKs, active/queue uniqueness, 0022 payment RPC and provisioning reservation/counter RPCs. Inspect real constraints/triggers/grants through authorized read-only SQL where available; OpenAPI alone is insufficient.
- [ ] Check whether 0037/0038/0039 objects already exist in production. Do not blindly rerun 0037, which creates its table/functions. Review an existing differing definition before any replacement. Verify the production project is `daenwuszqdfkbjiatsjs`, not development `huqmzvlzfcexycdrsxpn`.
- [ ] Prepare recovery artifacts through the existing deployment/backup workflow: recoverable database backup identifier, previous backend source/package lock, Mini App source/dist and previous two Pages deployment identifiers. Keep secret-bearing backup material on its approved host/access controls, not in Git or chat.
- [ ] Confirm server-side production env files exist and will remain excluded from sync. Backend must use production DB/bots and `NODE_ENV=production`; Mini App API must be `https://api.novanetmm.com`. Preserve current encryption keys, URLs and panel ownership.
- [ ] Rehearse rollback using the saved revisions. Account for the new setup table and current running owners. Choose a controlled release window and an owner-approved genuine transaction if a post-release mutation canary is required; do not fabricate received payments to test accounting.
- [ ] Review the complete candidate diff read-only before promotion, explicitly checking the six Review Focus conditions in the existing business-display implementation plan and the five release risks above. Account for the previously fixed review findings and the later quota/design corrections. Resolve substantive findings with regressions before requesting release approval; no feature expansion belongs in this release.
- [ ] Present the exact candidate SHA/diff, passing checks, exclusions, migration files, component order and rollback points to the owner. Obtain authorization before pushing/creating a PR and separately before applying production migrations or running deployment commands. Planning is not either approval.

### Task 4: Promote source and release database/backend after approval

**Interfaces:** Consumes approved immutable candidate, migration/backup prerequisites and clean control-machine checkout; produces verified production DB RPCs and backend revision. No step may source files from the dirty development directory.

- [ ] Push the approved release branch and create its PR to main, respecting branch protections and all four CI checks. Attach the PR to this chat. Use the production-only candidate as the scoped exception to wholesale develop/staging promotion; do not merge the unfinished development branch. Merge only with owner authorization using a linear-history-compatible method (for example squash), verify the resulting main deployment tree matches the approved candidate, and record the resulting main SHA.
- [ ] Resolve the deployed source path on the Ansible control machine. It must contain the approved main/candidate tree and none of the excluded runtime/migration files, ignored local envs or untracked development assets. Re-run the exclusion checks there; Ansible synchronize is not limited to Git-tracked files.
- [ ] At the authorized migration step, apply 0037, then 0038, then 0039 using the established production SQL workflow; 0038 includes `NOTIFY pgrst, 'reload schema'`. Stop before backend deployment if any migration fails. Verify the setup table relationship, all four RPCs and service-role-only access; confirm frontend roles cannot operate them. No backfill or bulk activation is part of this release.
- [ ] Check in-progress work before a process replacement. Do not reset or time out durable owners. If setup is running, wait/reconcile under the runbook before reloading.
- [ ] From the verified clean checkout's `ansible/`, run `ansible-playbook -i inventory.ini deploy.yml` only after deployment authorization. It syncs backend source, preserves env files, installs locked production dependencies and reloads PM2.
- [ ] Verify `/api/health`, PM2 status, bot registration and logs. Exercise authenticated read-only orders/customers/analytics/accounting queries: no PGRST relationship errors, missing RPCs or integer overflow. A healthy HTTP endpoint alone is not acceptance. Stop before frontend promotion if backend verification fails.

### Task 5: Release clients and verify actual customer presentation

**Interfaces:** Consumes verified new backend and approved main SHA; produces dashboard, Mini App and bot entry points on recorded compatible revisions.

- [ ] Dispatch `.github/workflows/deploy.yml` explicitly at the approved ref and verify both jobs finish. This workflow deploys Pages production even when dispatched from a release branch, so never dispatch an unapproved ref. Verify dashboard API builds target `https://api.novanetmm.com/api`.
- [ ] From that same clean Ansible source, run `ansible-playbook -i inventory.ini deploy-miniapp.yml` after authorization. Verify server `.env.production` targets the production API, no local/tunnel URL appears in served assets, and Nginx serves the new static build.
- [ ] After static publication, update only the production Mini App cache-version setting through the established env workflow, using `MINIAPP_RELEASE_VERSION=20261015-<deployed-sha7>`. Refresh bot menu URLs through the existing backend reload procedure after checking running work again; do not replace the full production env with local settings.
- [ ] Open production Mini App from Telegram in EN and MM. Confirm original circular usage design, original Settings cards, current/queued/last semantics, separate review labels, correct date and active import/copy links. Verify both freshly opened and previously cached clients.
- [ ] Compare one owner-selected existing order across admin, reseller, Telegram balance and Mini App using current live values, not the frozen Ye Yint fixture. Confirm dashboard aggregates match scoped ledger rows, including queued recognized money, and frozen settlements remain unchanged.
- [ ] Observe an owner-approved genuine sale/confirmation if authorized, or record that post-release mutation testing remains unperformed. Confirm it creates one receipt, starts/queues correctly and does not change recognized money at queue activation. Do not deliberately break a production panel to exercise setup failure.

### Task 6: Accept the release or roll back without losing money

**Interfaces:** Consumes recorded component revisions and smoke results; produces the final release disposition and updated production documentation.

- [ ] Accept only when all deployed revisions are known, read queries and approved transaction checks pass, the original Mini App design is visible, no Messenger runtime is shipped and no unexplained setup/payment errors remain. Record any checks still pending rather than calling them passed.
- [ ] If frontend-only verification fails, restore the prior Pages deployments and/or saved Mini App dist. If backend fails, stop client promotion, inspect running operations, then restore its recorded source/lockfile through the established backend deployment process. Roll dependent clients back before removing their new backend contract.
- [ ] Keep the additive setup table/RPCs and quota correction in place while release-created orders reference them. Never drop them, erase receipts, mark received money unpaid or bulk-reactivate orders as rollback. Interrupted running operations require operator reconciliation under the existing runbook.
- [ ] Update SCHEMA.md, KNOWN_BUGS.md, the validation report and release audit to the actual deployed/rolled-back status, with Asia/Bangkok timestamps and production component revisions. Development Messenger remains labelled excluded. Do not mark a deployment complete based solely on source merges or local tests.

## Self-review and handoff

This plan covers the three new migrations, integer arithmetic regression, exact release-source isolation, candidate retesting, production-schema limits, real payment/queue semantics, ownership-safe rollback and the preserved Mini App design. Each Review Focus item has a gate in its owning task. No new product feature, dependency, migration 0027–0036 or Messenger integration is authorized.

Next action after the owner accepts the plan: prepare and verify the isolated candidate. Production migration/deployment remains a later approval step against concrete source and recovery artifacts.
