# Business display consistency release

Status: owner-authorized backend, dashboards and Mini App deployed 2026-10-16.
See the release audit for exact revisions, successful checks and pending live acceptance.
The steps below remain the procedure for future releases/recovery; their original
preparation-stage statements are historical.

The scoped production execution plan is
[2026-10-15-production-business-display-release.md](../superpowers/plans/2026-10-15-production-business-display-release.md).
Its runtime baseline is aa0954f, plus the two release-review corrections recorded
in docs/audits/2026-10-15-production-business-display-release.md, including the
restored circular Mini App design. The normal checkout has uncommitted Messenger
work; never run source-sync playbooks from that checkout for this release.

## Preflight

- Review the isolated release candidate at runtime snapshot aa0954f against
  main 786dd5f and the actual deployed component revisions. Exclude unrelated develop
  and all Messenger runtime/migration files. The carried documentation manifest is
  docs/audits/business-display-documentation-manifest.json.
- Verify existing production effects through 0026: tenant composite FKs, single
  active/scheduled purchase indexes, reserve_pending_key/activate_vpn_key/fail_pending_key,
  apply_confirmed_payment and database-owned capacity counters. OpenAPI alone cannot
  verify SQL CHECKs, triggers or grants. Confirm no migration number 0037 conflict
  in the target environment. Do not apply development 0027–0036 as dependencies.
- Review 0037_dashboard_purchase_operations.sql and its RLS/service-role-only RPCs,
  followed by 0038_dashboard_purchase_quota_overflow.sql and
  0039_dashboard_purchase_payment_split.sql. Migration 0038 corrects
  integer GB multiplication before conversion to bigint. Match the real integer
  catalogue column and core money CHECK in SQL fixtures; test 0/1/2/50/100 GB and unlimited quotas.
  Rehearse with a production-compatible isolated database. The executable SQL check
  uses synthetic core tables and the unchanged 0022 payment RPC; it does not certify
  the whole live schema. Install PGlite in disposable scratch and set PGLITE_MODULE
  to its dist/index.js, then run node backend/scripts/check-dashboard-purchase-sql.mjs.
- Capture rollback revisions and backups using the existing deployment procedure.
  Ensure no unfinished customer setup attempt is running before switching versions.

Run backend/scripts/preflight-business-display-release.sql in the production SQL
editor and review the result before migration. It is catalogue-only and read-only.
Confirm a recoverable production database backup before any DDL. Migration 0039
records a valid receipt split before confirmation; do not edit already-applied
0037/0038. No migration or deployment has been performed during preparation.

## Release order (requires separate explicit production authorization)

1. Apply reviewed migrations 0037, then 0038, then 0039 through the established migration workflow and
   reload the PostgREST schema cache. Verify table/RPC metadata and service-role
   access; anon/authenticated must have no access. No data backfill is needed.
2. Deploy the compatible backend/bot through the manual Ansible playbook from
   ansible/. Verify GET summaries and request replay on controlled release fixtures.
   Old unkeyed clients keep manual creation compatibility; activation endpoints remain
   guarded, and already active requests return existing access without a new sale.
3. Deploy dashboards through GitHub Actions to Cloudflare Pages, then the Mini App
   static build through the manual Ansible playbook. Backend summaries must precede
   consumers. Production env files remain on their existing hosts and out of Git.
4. Compare the same tenant/order read-only across views using current live quota,
   recorded payments, expiry and period scopes. The old Ye Yint readings are a local
   regression fixture, not an expected current production balance. Check queued
   confirmed money is counted before service start and unchanged after promotion.

## Safe setup recovery

A failed dashboard setup retains the confirmed/applied payment. Retry setup uses
that order and its snapshotted plan, with one persisted owner per customer. Never
resubmit a new purchase or mark payment unpaid to recover provisioning.
This also applies to paid Renew/Buy next actions from both staff dashboards; admin
source is retained. Verify an unpaid order with no payment events can be confirmed
from either dashboard. Concurrent confirmations must leave one initial receipt.
Confirm a rejected next-package receipt updates while existing current access stays
active, and a queued Telegram purchase retains purchased duration/quota after a
catalogue edit. Accounting must retain unpaid amounts/counts outside recognized
revenue. Bot current/last selection must agree at Bangkok midnight before cleanup.

A running owner is never stolen merely because a timestamp is old. After a crash,
an operator must stop the relevant workers, establish that the original operation
cannot continue, inspect that order's panel users and key/assignment rows, and
reconcile or remove partial setup through existing provisioning services. Only
then may the recorded owner be finished as failed for a controlled retry, or ready
when complete access is verified. Preserve ledger and quota history. Do not run a
bulk reset of running operations. This runbook does not authorize those production
writes; follow the explicit operational request and existing deployment safeguards.

## Rollback

Roll back dependent clients before removing backend summaries. Stop/reconcile any
in-progress setup before reverting the backend; keep received payments and existing
orders intact. Leave the additive 0037 table/RPCs in place while any release data
uses them. Do not drop the table or undo confirmed payments as a code rollback.
Legacy pending orders are recovered only by explicit action; no bulk activation.
Yangon notification selection, disabled quiet-hour gating and job cadence remain
unchanged; Bangkok governs display dates, expiry and accounting periods.
