# Production business-display release preparation

Status: locally verified candidate; production unchanged. Owner authorized preparation and will run migrations at the release gate. Messenger is excluded.

## Source

- Production/remote main baseline: `786dd5f9d7cddd5fdc3341f7315a867ed87b365b`.
- Runtime baseline: `aa0954faf28d95bb540f43a6c2d1899629ccc6d9`.
- Documentation carry: `d1cbb6c` on `codex/production-business-display-release`.
- Isolated checkout: `C:/Users/hp/.codex/worktrees/production-business-display-release/novanet-mm-platform`.
- Subsequent scoped corrections: additive migration 0039 and truthful reseller renewal recovery messages. Normal dirty develop checkout, env files and retained stash were preserved.
- No Messenger/shared development services, runtime imports or migrations 0027–0036. Package manifests and lockfiles unchanged against production baseline. Original Mini App circular design retained.

## Fresh local verification

Node 22.23.3, separate locked installs in all four applications:

| Check | Result |
| --- | --- |
| Backend Vitest | 239 tests, 43 files passed; CI loopback placeholder configuration |
| Frontend contracts | 22 passed |
| SQL/PGlite | Replay, hash conflict, ownership/retry, payment invariance, single queue, unpaid gate, snapshots, tenant/role denial, integer GB boundaries and zero/positive commission passed |
| Browser, fully mocked loopback API | Admin/reseller facts, paid create retry, unpaid gate, renewal failed/running messages; EN/MM Mini App Home/Settings and original 136px two-circle SVG passed |
| Builds | Admin, reseller and Mini App passed |
| Mini App lint | Passed |
| Production dependency audits | All four applications: zero vulnerabilities |
| Ansible | Both manual deploy playbooks passed syntax checks from clean WSL-visible source; no deployment executed |

The first backend run lacked the CI placeholder environment; rerunning with it passed. Cold Vite loading initially timed out; the warmed browser run reached the intended renewal regression and failed before the fix, then passed afterward. These tests use disposable fixtures, not a real isolated Supabase/provider system. The owner's earlier manual testing included development adapters; genuine isolated-provider integration is not claimed here.

## Independent review and corrections

One fresh whole-branch review found two Important issues and no Critical issues. Both were accepted and fixed with regressions:

1. Core 0006 receipt CHECK requires amount = commission + platform due on insertion. The improved SQL fixture failed with 23514 against 0037/0038. New immutable follow-up 0039 computes a valid split before confirmation; all SQL cases then passed. Already-applied migrations are unchanged.
2. Reseller renewal ignored setup_failed/setup_in_progress and reported successful access. It now shows the backend recovery message. Rendered cases failed before and passed after the fix, checking one purchase request and no false Renewed message.

Deferred Minor findings: equal activation/start timestamps use ID before creation-time tie-breaking; admin customer detail omits freshness map; later unpaid receipt duration can use labelled catalogue provenance. No unrelated feature expansion.

Reviewer did not certify live production metadata, grants, actual provider behavior, backups, deployments or rollback. Parent verification below does not replace the remaining operational gates.

## Read-only production preflight

- Seven normalized backend source/package hashes match baseline 786dd5f (package.json, package-lock.json, lifecycle, reseller orders, Mini App routes, customer enrichment and bot handlers).
- Node 22.23.1; novanet-backend PM2 online. Existing production backend/Mini App env files and static/source directories present.
- Verified production Supabase project `daenwuszqdfkbjiatsjs`. OpenAPI exposes integer plan GB, bigint order bytes and all four core payment/reservation RPCs. New setup table/four setup RPCs are absent from that API snapshot.
- Mini App production API values point to api.novanetmm.com. No environment secrets were copied or changed.
- OpenAPI cannot certify CHECKs/FKs/triggers/grants or hidden schema collisions. No direct database connection is configured on the Droplet; SQL-editor inspection remains required.

## Remaining gates and exact migration order

1. Owner runs `backend/scripts/preflight-business-display-release.sql` in the production SQL editor and returns its catalogue-only result. This is read-only and applies no migrations. Review actual constraints, indexes, functions, permissions and capacity triggers; resolve any collision/drift.
2. Confirm a recoverable production database backup, record previous backend/Mini App recovery artifacts and both Pages deployment IDs. These have not been captured or rehearsed in this preparation.
3. Approve immutable source promotion and production release after unresolved gates are addressed. No push, PR, merge or production publication has occurred.
4. At that gate only, apply **0037 → 0038 → 0039**. Verify service-role-only setup RPC/table access and schema cache before backend deployment. Do not apply 0027–0036.
5. Check running setup owners; deploy backend/bot, verify it, then dashboards and Mini App from clean approved source. Refresh Mini App cache version after static publication. Record actual revisions and perform owner-approved live acceptance checks.

Preserve received money and durable setup ownership during any recovery. Never use a fresh purchase to recover failed setup, automatically steal a running owner or drop operation rows/receipts as rollback. Production migrations and deployments remain pending.
