# Server Management Release Matrix

## Add Server Recovery Verification (2026-10-28)

Local review fixes are implemented and offline verified before the owner's fresh
DigitalOcean dual-profile canary. Public VPN IPv4 ingress is now mandatory in
provider firewall evidence; management ports remain restricted. Cancellation
reconciles only the existing provider create intent, never purchases another VPS,
and retains ownership, uncertain-outcome and residual-billing gates.

Dashboard uncertain requests retain their idempotency key across generic 400/403/404
responses. Definitive quote rejection restores catalogue selection. Status updates
guard against stale polling/control/parent snapshots and notify inventory refresh
once on completion. All five reviewed defects have targeted regression coverage.

Evidence: 1,038 offline backend tests / 111 files; 49 dashboard tests / 5 files;
admin production build; synthetic SQL quoted admission/replay, lifecycle DDL/RPC
scope/fence/permission/state/counter checks and display allocation all passed.
Independent scoped backend and final dashboard reviews reported no remaining
findings. SQL tests are single-connection evidence, not concurrency stress tests.

No new schema migration is required for these fixes. No local app services, shared
DB mutations, VPS actions, production changes or deployment were performed. Live
DO dual-profile phone/network acceptance is still owner-run. The owner separately
reported VLESS-only retirement completed; its operation identity was not supplied
in this update, so this is not a new agent-verified live result.

Approved 2026-10-27. Status is evidence, not a production-readiness assertion.

| Requirement | Baseline | Release Gate |
| --- | --- | --- |
| DigitalOcean transport/quotes | Implemented, offline tested | Live disposable VPS acceptance pending |
| Vultr transport/quotes | Implemented, offline tested | Live disposable VPS acceptance pending |
| Dynamic compatible regions/plans | Missing; static local options | Both vendors discovered; fresh admission validated |
| Independent provider readiness | Missing; startup coupled | One vendor outage does not hide another or operation history |
| Actionable disabled controls | Partial | Safe setup/provider/global readiness reasons visible |
| Shared-node startup/publication | Implemented in recent local fixes | Mixed-pool full lifecycle regression tests |
| Shared-node replacement inventory | Partial; assumes all global nodes owned | Owned source retirement preserves authorized shared nodes |
| Existing-node import/adoption | Inspect-only CLI | Verified preview, approval and atomic registration |
| Idempotent Add/recovery | Implemented components | Full worker/vendor failure-injection tests and real acceptance |
| Replace/Move-and-Retire | Implemented components | Stable links/quota/expiry and no duplicate purchase |
| Billing cleanup | Conservative inventory implemented | Actual deletion and residual charges independently checked |
| Backend tests | 743 passed before this release work | Fresh offline complete suite required |
| SQL function tests | Existing synthetic suites pass | Updated RPC/permission/rollback tests required |
| Concurrent database sessions | Unverified | Record explicit evidence before production-sensitive concurrency claims |
| Dashboard dependencies/type-check | Missing test dependencies in local installation | Reproducible install, tests, type-check and build |
| Production reconciliation, including SG5 | Pending | Owner-approved existing-node reconciliation, no duplicate VPS |
| Production deployment | Not authorized | Reviewed backup/migrations/configuration and separate owner approval |

## Local Implementation Evidence

- Dynamic catalogues/readiness/API and dashboard selectors implemented for DO/Vultr.
- Dashboard: 29 Vitest tests and full type-check/Vite build passed. Browser layout
  worker verified 1280/390/320px without starting application services.
- Six mixed-pool integration cases compose real worker, live operation adapters,
  provider adapters and migration/retirement modules with simulated external
  boundaries. Both providers pass Add/Replace/Move-and-Retire, lost create/delete
  responses, restart reconciliation, stable customer state and preserved endpoints.
- Actual 0051/0052 DDL passed synthetic single-connection PostgreSQL: permissions,
  replay/rollback/collisions, customer state preservation, >100 runnable rows,
  timestamp ties/microseconds, scope isolation, leases and backoff filtering.
- Review fixes separate recovery from purchase readiness, preserve cross-provider
  cancellation, allow regional setup overrides and prevent runnable-list starvation.
- Lifecycle adoption now rejects unverified legacy customer users. Automatic
  legacy customer-ownership adoption is not implemented; reconcile explicitly
  before production replacement. Shared DEV nodes stay protected.
- Initial final isolated offline backend run: 842 tests passed across 100 files. No live migrations,
  provider/panel mutations, service starts or production deployments performed.

## Vultr Setup Follow-Up

Owner authorized DEV provider setup after discovering Vultr was unconfigured.
Authenticated account and matching bootstrap key verified; two unattached Vultr
firewall groups created. Unattached/tag-empty DO DEV firewall groups received the
current operator management source. No instances purchased, attached or deleted.
Live read-only setup checks passed both profiles on both providers; Vultr returned
33 regions and 52 available compatible Singapore plans at verification time.

Actual Vultr CIDR `source` echo exposed a firewall validator compatibility defect.
Fixed with regressions retaining rejection of indirect/outbound/load-balancer rules.
Updated complete offline suite: 846 tests / 100 files passed. Scoped DEV binding SQL
prepared and synthetically tested; owner application and backend restart pending.

## Owner-Run DO Canary: Configuration Recovery

DEV binding now contains both providers. Owner submitted Add operation
`17e075f4-603b-40ed-a341-eb5f3c4b262f`; exactly one DO resource was independently
verified against the operation tag, scoped ownership receipt and pinned SSH key.
It reached running Marznode but blocked in configuration: the original verifier
matched specific OpenSSL alert text while the pinned asyncio TLS server rejected
an unauthenticated client with EOF instead.

Replaced message matching with a bounded structured check inside the pinned node:
required client certificates, server trust/hostname, HTTP/2 and unauthenticated
rejection. Read-only verification passed on the same VPS; child-process negative
cases rejected insecure policy and wrong server trust without changing live
configuration. Regression tests and complete offline suite passed: 850 / 101 files.
Operation remains blocked/configuring pending owner Resume; no second purchase,
source deletion, manual resume or claim of completed Add acceptance was made.

## Owner-Run Vultr Dual Canary: Inherited Firewall Rule

Operation `29a645da-85fb-4874-93e3-517244024f88` (Vultr Frankfurt, dual protocol)
blocked in configuration for a different reason. Scoped receipt/pinned-SSH inspection
verified one existing VPS; Xray syntax and compose validation passed, but Marznode
had not started. Vultr's image retained `ufw allow 22/tcp`, including IPv6, and the
installer correctly rejected that broad management rule.

Installer now adds restricted management sources before conditionally deleting
only the exact inherited SSH rule. It does not reset UFW; unknown unsafe rules
still block. Failure maps to `NODE_FIREWALL_POLICY_UNVERIFIED` rather than generic
uncertainty. Remote deletion dry-run succeeded without changing live rules. Tests
cover both protocol profiles, ordering and safe diagnostics: 852 tests / 101 files
passed. Owner Resume remains required; no new purchase or manual resume performed.

## Manual Acceptance Evidence

### Replacement Bootstrap Readiness (2026-10-27)

Owner-run replacement c1cf5ebe-c987-4436-b639-f446b65b70c4 blocked in configuration
at 12:32:45 UTC. Read-only scoped receipt/pinned-SSH inspection verified its existing
DO VPS 613141276; cloud-init did not finish until 12:33:23 UTC (143.6 seconds after
boot). Docker, Marznode images and files were absent. Package simulation passed;
no package installation was executed by the agent. The exact failing old SSH
command was not retained in the generic checkpoint, so startup timing is evidence
of a readiness-handling defect, not proof of a specific APT failure.

Installer now polls JSON cloud-init readiness instead of one 70-second wait;
unavailable SSH and running/not-started initialization become bounded waiting.
The worker does not spend its three mutation retries while waiting and blocks
after 20 minutes with a specific diagnostic. Failing initialization still blocks.
Regression tests cover pending SSH, running/not-run/error bootstrap, completed
bootstrap with recoverable warnings, timeout, no early package writes and no
source drain. Source Frankfurt #1 remains active. No Resume, VPS recreation,
infrastructure mutation or service restart was performed by the agent.
Final offline verification: 885 tests / 104 files passed; git diff --check passed.
Real configuration recovery remains an owner-triggered Resume acceptance test.

### Global VLESS Service Topology (2026-10-27)

Owner-run DO VLESS-only and Vultr dual add operations were read back as completed.
DEV global service 14 contains inbounds 8,12,14,15,16,17. Owner authorized cleanup
of redundant private VLESS services 18/19; both had zero users and no server-row
references. Scoped receipt checks and an inventory-hash preflight preceded removal.
Only their host filters were reduced to [14] and services 18/19 deleted. Existing
service payloads, customer service memberships, limits and expiry compare unchanged.
Retained service IDs: 4,5,8,10,11,12,14,15,16,17,20. No DB or VPS changes.

Future publication removes the temporary isolated VLESS verification service before
DB readiness. Existing-node probes and adoption no longer require private VLESS;
SS service 20 and per-node SS behavior remain unchanged. Recovery tests cover stale
candidate receipts, lost delete responses, zero-user enforcement and global-only
endpoint removal. First full offline run: 871 tests / 103 files passed; final run
is recorded in the plan. Independent reviewer dispatch was unavailable (thread
limit); a separate author review was performed. Real new-node/phone acceptance
remains owner-run; no service starts, deployments or real VPS tests by the agent.

No real VPS lifecycle test has been performed by this implementation session.
Owner starts services and approves each billable purchase/destructive operation.
Record provider, region, plan, profile, operation ID, results and recovery evidence;
never store API keys, panel user credentials or customer subscription URLs here.
# Replacement Link Verification Follow-Up (2026-10-27)

DEV replacement `c1cf5ebe-c987-4436-b639-f446b65b70c4` reached `links` after
publication and migration. Read-only inspection confirmed the migrated SS
customer's permanent JSON endpoint returned Singapore #7, port 8388 and the
expected cipher. An unrelated active DEV database VLESS key still belonged to
panel service 5, while the DEV global key belonged to service 14. The verifier
incorrectly required both subscriptions to contain the new DEV endpoint.

Permanent-link verification now reads each pool VLESS user's current panel
service membership. The destination is required for the operation's global
service; every checked VLESS subscription must remain nonempty and exclude the
source. Missing/unreadable membership fails closed. No service memberships,
subscription URLs or customer credentials are rewritten by this correction.
Owner must resume the existing operation; this investigation does not authorize
an agent to resume it or delete either VPS.

# Shared Destination Migration Review (2026-10-27)

Move-and-retire now presents Review Migration without provider catalogue/price
requirements. An access-adopted protected DEV destination is accepted without
changing its lifecycle protection. Regression tests cover protected-source
ownership refusal, manifest/address/provider/purpose mismatch, legacy inherited
ports/Reality fields, shared SS service isolation, owned-customer-only updates,
source-only endpoint detachment and refusal to publish a missing shared host.
Both protocol tunnel checks use a separate owned DEV probe runner; the tests
assert no SSH to the shared destination and no service/host/node writes by probes.

Read-only live inspection verified Singapore #4's protection and healthy panel
binding, services 17/14, inherited SS port 1080 and VLESS port 443. It did not
create a probe/user, move access or alter any panel service. Full offline suite:
904 backend tests in 105 files; admin: 31 tests in 4 files; admin build passed.
Independent subagent review was unavailable due to the agent-thread limit;
a separate local review traced the migration, endpoint and retirement gates.
The owner-run real move/retire canary remains pending. No SQL migration required.

# Historical Assignment Collision (2026-10-27)

Move `ef30c5ad-4b50-4574-976a-21adf4ee4299` blocked in `migrating` with the item
checkpoint `anchored`: its SS service and key anchor were already on Singapore
#4, while the active token assignment remained on #7. Owner-provided index
inspection confirmed unique `(token_id,server_id)` indexes. A deleted-key
historical assignment already occupied #4 for the same token. The old SQL's
blind update reproduced the exact unique-constraint error in PostgreSQL WASM.

Migration 0054 reuses a safe historical destination assignment and deactivates
the old source assignment atomically. SQL tests exercise collision recovery,
retry idempotency, normal move, empty destination, active/pending-key rejection,
cross-tenant rejection, rollback after a later token conflict, scope/fence and
EXECUTE permissions. Quota/link fields are unchanged. This is single-connection
WASM evidence, not a multi-session concurrency stress test. Applying the SQL
definition alone moves no users; owner must Resume the existing operation after
verification. Production deployment and production SQL remain out of scope.

Owner reported applying 0054 in DEV. Read-only checks confirmed that the actual
token and historical deleted key match the migrated customer's reseller/customer
binding. Final offline run passed 905 tests in 105 files with file parallelism
disabled; the earlier parallel run had one SSH-key-generation fixture failure
before its intended scope assertion. SQL regression passed separately. Neither
run resumed the operation or contacted production infrastructure.

# Existing-Service Move-and-Retire (2026-10-27)

Owner confirmed that a move into an existing server should migrate active SS
memberships/anchors/assignments, remove the source inbound from global VLESS,
and delete only empty source resources. The prior separate SSH probe-runner
requirement has been removed from this operation kind. Preflight and the repeated
retirement gate now use existing destination health/service-binding evidence;
permanent customer links and zero-source-dependency checks remain mandatory.
The retirement proof retains its operation kind, so this evidence cannot replace
tunnel evidence for provision-new replacements. Add Server probes are unchanged.

Regression coverage checks zero tunnel calls for complete DO/Vultr move workflows,
normal tunnel calls for additions/replacements, missing-link deletion refusal,
source-only deletion, protected shared hosts and scoped service membership.
Any unfinished probe checkpoint from the old implementation still requires
explicit cleanup; a completed checkpoint creates no dependency on its old runner.
No new SQL migration, cloud change or production panel mutation is part of this
update. Owner will Resume the already-blocked operation after verification.

Verification: 912 backend tests in 105 files passed offline, including complete
DO/Vultr lifecycle flows; git diff --check passed. No worker/service was started
and no operation was resumed by the agent.

# 2026-10-28 Panel Incarnation Fix

- Backend offline: 1,050 tests in 111 files passed after final edits.
- Synthetic SQL: 29 panel retirement/reuse cases, including actual 0046 candidate
  creation after reused ID, passed; existing lifecycle/display suites passed.
- Bounded owner-run DEV reset SQL passed synthetic scope/state/access/missing-field
  rejection, current/protected-ID preservation and idempotency tests.
- Independent review findings fixed and re-reviewed. Multi-session SQL concurrency
  and fresh live Add/Retire/Add acceptance remain unverified.
- Only the abandoned DEV candidate VPS/node was removed. Provider and panel 404,
  no billable attachments, unchanged other nodes and full service inventory were
  verified. No production deploy, customer mutation or new VPS purchase.
- DEV application of migration 0057 and the ignored owner reset transaction was
  confirmed by the owner, then checked read-only: cancelled operation, 18 archived
  historical receipts, no operation locks/nonterminal work, and archive RPC present.
  The owner may restart their backend and begin one fresh manual Add attempt.
