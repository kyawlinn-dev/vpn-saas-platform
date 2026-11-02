# Core/server release — final preparation

Prepared 2026-11-02. **No deployment or production metadata/configuration changes
are authorized or performed.** Normal DEV keeps its deferred Messenger and
Announcements work. This isolated candidate excludes both and keeps the existing
Mini App design. Use a refreshed usage window for the later coordinated rollout.

## Prepared source and SQL

The candidate contains Telegram/shared purchase/trial/payment notifications,
04:00 Myanmar cutoff, Bot Links, public access, server naming/maintenance and
DO/Vultr/LightNode lifecycle automation. Historical 0039 and previously captured
migration inputs remain unchanged. The SQL manifest now contains **21 files**:
0060 → 0040–0049 → 0051–0055 → 0057 → 0058 → 0061 → 0062 → 0063.
Its generated atomic bundle and hashes are in
`backend/supabase/releases/2026-11-core/manifest.json`. Do not numerically sort
the DEV migration directory, bypass package guards or rerun applied history.

0063 adds protected LightNode access registration. Existing nodes never gain
deletion authority through it. Shared production/DEV SS services are resolved
using the existing production DB mapping without editing DEV memberships.
LightNode lifecycle adoption of an existing node is denied; newly provisioned
LightNode nodes retain the separately tested lifecycle workflow.

## Verified preparation evidence

The Node22.23.1 Windows runtime was downloaded from the official Node distribution
and checked against its published SHA-256. Locked installs use lifecycle scripts
disabled; known build steps are invoked explicitly. Tests/builds are local finite
commands, not backend/dashboard/ngrok services.

- Backend: **1,443 tests**, zero failures after review fixes.
- Admin: **82 tests**, zero failures.
- Reseller: **14 tests**; Mini App: **16 tests**; zero failures.
- All three frontend production builds and Mini App lint passed.
- All **13** embedded SQL programs passed, including 16 production-package
  scenarios and protected LightNode adoption. The separate proposed production
  pool bootstrap passed identity-drift rollback, exact global5/scope, unchanged
  server data/counters and repeated-application refusal checks.
- TDD reproduced LightNode rejection and shared-SS ambiguity before the source
  changes, and unsupported protected LightNode SQL before 0063.

Single-engine PostgreSQL tests do not establish multi-connection concurrency,
Supabase control-plane behavior or real ISP connectivity. Node22 Windows builds
do not establish Linux-native optional-dependency equivalence. The production
controller independently reports Node22.23.1. Existing owner DEV manual acceptance
is recorded separately; no new paid canary or real message was sent here.

## Dependency review

Compatible dependency updates address the reported production paths: Multer,
body-parser, follow-redirects, ip-address, qs and Zod; frontend Vite versions are
updated within their existing major ranges. Backend `npm audit --omit=dev`
reports **zero vulnerabilities**. Lockfile analysis classifies every remaining
advisory node as development-only. This is not a claim that full audits are clean.

| Application | Remaining full-audit findings | Scope |
|---|---|---|
| Backend | 2 critical, 1 high, 5 moderate | Vitest/Tinypool/Vite test tree and nodemon tooling |
| Admin | 2 critical, 1 high, 3 moderate | Vitest/Tinypool/Vite test tree |
| Reseller | 0 | None reported |
| Mini App | 6 moderate | ESLint/minimatch tooling |

Do not run Vitest UI/dev servers with untrusted access or untrusted test/plugin
code. Production backend uses `npm ci --omit=dev`; dashboards/Mini App publish
static `dist`, not test/build dependencies. Major Vitest migration and the
unavailable compatible ESLint fix are deferred explicitly rather than forced
through an audit-fix downgrade/major upgrade. These build/test risks must remain
visible in the deployment approval, even though production runtime audit is clear.

## Private configuration package

The ignored release workspace pins the proposed production pool UUID and a new
production LightNode connection UUID in `task4-production-proposal.json`; these
have not been registered. Four `task4-adopt-N.json` requests target panel nodes
3, 6, 7 and 9 in **access-only** mode. Existing server UUIDs remain unchanged;
SG5 gets a proposed new DB row for the existing DO node, not a new VPS.

`task4-pool-bootstrap-review.sql` creates a new pool/runtime binding and the
explicitly reviewed production global5 service registry receipt after
the schema package and refuses identity drift/already configured production.
The embedded rehearsal used synthetic server records. Its file checksum is not
an adoption approval hash. After approved schema/pool setup, the live CLI must
inspect exact current provider/panel/DB state and produce a fresh review hash
before each application. Do not add `--apply` while inspecting.

Global5's receipt is required before worker readiness; its proposed authority
covers guarded global-service operations, not ownership of existing protected
nodes/inbounds/users. Require fresh exact global5 inspection and owner approval
before installing it. Startup accepts protected nodes only with matching
production-scoped adoption receipts; a DEV receipt remains invalid in production.
Inspection now resolves inherited host ports from inbound config without changing
hosts. The reviewed collision exception applies only to protected access over
inactive, decommissioned, unscoped/unowned Outline history with no active/pending
or unknown-status keys; active/scoped/registry conflicts still fail. All historical
rows remain intact. Authenticated live-read/local-DB rehearsal passed all four
nodes, preserving legacy SS1080 and new-node SS8388 respectively. This hybrid
check does not produce valid live DB adoption approvals or invoke production RPCs.

The controller and panel containers share host networking. Observed public
egress is **178.128.127.163**. Proposed DO/Vultr firewall request bodies allow
management22/62050 from that /32, public TCP443, and TCP/UDP8388 for dual nodes.
They attach to no existing nodes. Separate production groups must be created
only during the approved setup, then exact returned IDs must replace the explicit
unresolved config markers. Never reuse/change the DEV groups. Reverify controller
egress and Vultr API allowlisting from the controller before activation.

Keep controller and existing shared nodes protected. Preserve global VLESS5,
SS4/12/18 and DEV memberships. Keep Singapore Trial's name. Initial flags are
public access=false, coordination=false, worker=false, execution=local. Public
access can be enabled only when all four access bindings, health and customer
memberships are valid. Coordination/worker activation requires its additional
ownership/readiness proofs; ordinary legacy access must continue meanwhile.
Protected existing nodes remain unavailable for destructive lifecycle actions.

Keep `BOT_TOKEN_ENCRYPTION_KEY`, production Supabase/bot credentials and subscription
base unchanged. Install only reviewed missing provider/panel variables and the
operator config on the controller; never copy the whole DEV environment. Derive
LightNode token fingerprint/attestation during that install. Use the existing
Linux bootstrap key whose public fingerprint matched both providers.

## Recovery captured and remaining deployment-time gates

A private read-only recovery archive was captured and its listing/hash verified.
It contains deployed backend code/lock/env, Mini App source/dist, saved PM2 config
and Nginx site configuration. It excludes node_modules, uploads and operator
scripts. Its identity is in ignored `task4-recovery-archive-proof.json`. It contains
secrets: never stage, publish, attach or expose it. This is **not a database backup**.

Before deployment, these checks remain mandatory:

1. Fresh recoverable Supabase database backup/PITR identifier with a verified
   restore path. Neither laptop nor controller currently has `pg_dump`; do not
   substitute an ad-hoc JSON export or the schema fixture. Use verified project
   backup tooling or prepare a compatible dump client before starting rollout.
2. Current Cloudflare Pages deployment IDs for both dashboards, verified with
   authenticated provider access; public website inspection is not that proof.
3. Refresh production catalogue/integrity, active operations, source/config and
   recovery snapshots; reject drift against the reviewed candidate. Revalidate
   current nodes/resource creation identity. No frozen historical numeric IDs
   alone authorize a mutation.
4. Review exact existing trial VLESS service memberships and panel deadlines;
   preserve credentials/usage/quota and enabled state. Prepare any needed bounded
   migration separately with expected-old-value guards. New cutoff code does not
   extend old panel accounts. Never enable a UI deadline the panel still denies.
   The final read-only audit matched all79 active DB-bound keys to panel users:
   zero missing, zero disabled, one VLESS trial uses only service8, and all79
   panel deadlines precede the new cutoff by4.5hours. At rollout, requery DATE
   columns as text (avoid host-timezone DATE conversion), recheck each exact
   key/user/subscription identity and expected-old deadline, then extend only
   matching active accounts. Move that one trial from8 to5 only if fresh service
   and ownership checks agree. Preserve other memberships and credentials; never
   shorten an account, enable a disabled user, change usage/quota or retry a drifted
   record blindly. Keep a per-record recovery journal and verify panel after each
   approved update. These are prepared changes, not applied/backfilled SQL.
5. Replace remaining production firewall/attestation markers from verified setup
   outputs, obtain fresh access preview approvals and confirm runtime readiness.
6. Owner approves the exact source/SQL/configuration/recovery package, including
   deferred development-tool advisories, with enough quota for observation and
   rollback. If not, stop before rollout rather than enabling half the system.

## One coordinated later rollout

Fresh backups/identity checks → exact atomic SQL package → production pool/runtime
binding → install compatible backend with activation off → reviewed access-only
registrations and any separately approved membership/deadline alignment → verify
existing customer links and public pool → enable public policy/coordination only
when their gates pass → verify worker prerequisites and enable eligible automation
→ publish both dashboards and Mini App from the same frozen candidate → read-only
smokes and owner-selected canary only if separately authorized.

Backend/Mini App use manual Ansible. Dashboards use the existing manual GitHub
workflow dispatch, which publishes Pages production even from a release branch.
Publishing is not authorized by preparing or committing a candidate. Review the
new Mini App version/cache behavior before publication; no webhook refresh now.

On failure: stop new lifecycle admissions, preserve durable operations/claims/
payments/deliveries and reconcile external state before restoring previous code,
lockfiles, config and static assets. Leave compatible additive schema/history in
place. Roll clients back before contracts they require. Do not shorten access,
reset used trials, repurchase an uncertain VPS or attempt a broad DB restore over
new sales merely to undo an additive schema change.
