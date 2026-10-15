# Shared Purchase Execution Record

> Historical local audit/execution record. Scope clarified 2026-10-15: preserve the dated observations/results below; they do not certify the current production revision or constitute a fresh test run. Current production/development authority is listed in docs/DOCUMENTATION.md at repository root.

## Implemented

- Shared `purchaseService.js` normalizes trusted caller policies and uses a
  service-only atomic order/payment/operation RPC. Existing panel provisioning
  and capacity reservation remain unchanged.
- Telegram, Mini App and reseller-dashboard creation delegate to that operation.
  Admin review/actions remain in the existing lifecycle service.
- Messenger adds signed durable inbox delivery, scoped identity, Redis sessions,
  safe receipt download/storage, checkpointed purchase retries, My VPN, Support,
  and best-effort review notifications. Local runner starts no Telegram/jobs.
- Dashboards label and filter Messenger customers/orders; Payment Reviews groups
  self-service channels while preserving the old route as a compatibility alias.
- Schema, architecture, API and rollout documentation are updated.

## Decisions

- Work remains uncommitted in the existing dirty development checkout; unrelated
  VPN provider/expiry edits and asset files were preserved.
- Database password authentication failed. The owner applied migrations 0027,
  0028 and 0029 manually in the development SQL Editor. No production migration
  or deployment was run.
- Migration 0028 preserves live source constraints and cancelled-order request
  tombstones. Migration 0029 fixes a reproduced same-sender retry ordering bug
  and null-safe review eligibility.
- Canary cleanup retains inactive development audit records, but removes and
  independently verifies removal of the panel user.

## Verification

- Backend: 40 files, 323 tests passed before the final review.
- After review fixes: 40 files, 325 tests passed. A second live canary
  `DEV-MSG-CANARY-637d053a` resumed a prepared operation from a new session and
  receipt path: one operation, one payment, one key, replay without provisioning.
  Customer `b56215a5-76a2-46c1-aacf-4bb5083c7ad1`, order
  `05c9441b-25a6-43a9-9913-dd9ba74f21c7`. Panel cleanup independently verified.
- Development RPC audit: 19 checks passed; concurrent idempotency, ledger/price
  policy, tenant isolation, execution leases, queue protocol, cancellation
  tombstones, unknown review status and same-sender retry ordering. Fixtures removed.
- Live VLESS canary: `DEV-MSG-CANARY-32f66f06`, customer
  `cab0a31f-4584-4695-adba-4dc51749e919`, order
  `3e5e8823-4577-4cbc-8bd1-334b155b89e8`. One active panel key; repeat request reused
  its order without provisioning. Panel deletion verified by a subsequent lookup.
- Mini App, admin dashboard and reseller dashboard builds passed. Mini App emits
  a non-fatal large-chunk warning.
- Meta token validation passed. Local and ngrok health report purchases enabled
  on loopback port 3010 with the shadow-vpn development workspace.

## Remaining Gates

Final review found two regressions: fresh-session retries could lose their request
identity, and staff preparation incorrectly rejected inactive customers. Shared
purchase recovery now reuses the stored command when caller/plan/protocol match
(two red-to-green regression tests). Migration 0030 restores the staff rule;
its new development audit assertion reproduced the pre-fix failure. The owner
applied 0030; all 20 development database assertions subsequently passed.

- Fresh whole-change review completed; retry regression fixed and re-reviewed.
  Staff regression fix is applied and verified in development through 0030.
- Actual Messenger role-authorized purchase/receipt/My VPN and dashboard-review
  walkthrough. Automated adapter/worker tests and the panel canary do not prove
  this external UI journey. Owner confirmed the Hi menu with Buy Package, My VPN
  and Support works; purchase/receipt/review walkthrough is still pending.
- Production release and Meta publishing require a separate explicit order.

## Combined Local Runtime

At the owner's request, stopped the isolated Messenger worker and started the
full development backend on 3000, admin on 3001, reseller on 3002 and Mini App
on 5173. Corrected a stray lowercase `port=5432` pooler field in ignored
`backend/.env.local`; Windows environment keys otherwise override `PORT=3000`.
The owner retargeted ngrok to 3000 using the existing HTTPS origin. Verified all
four services, the backend Mini App proxy and tunnel API health return HTTP 200.
Messenger challenge/signature smoke tests passed through ngrok; unsigned
Telegram webhook requests return 403. Only shadowvpn68bot was registered from
the development database. Normal development jobs run with the full backend.
