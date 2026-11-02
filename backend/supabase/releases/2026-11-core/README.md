# Telegram/core production SQL review package

Prepared 2026-11-02. **Not applied or approved for production.**
Target project: `daenwuszqdfkbjiatsjs`. Configuration, backups, final runtime
validation and owner deployment approval are separate release gates.

## Baseline and exact order

The read-only production catalogue contained 21 public tables, 16 functions,
63 indexes and three views. There is no migration-history table. Existing
0037–0039 effects were checked directly, including receipt money invariants,
active/queued uniqueness and database-owned counters. No customer rows were
copied into fixtures; the rehearsal uses synthetic records and schema metadata.

`manifest.json` pins every input and the generated bundle by SHA-256. Its explicit
21-file dependency order is: **0060; 0040–0049; 0051–0055; 0057; 0058; 0061;
0062; 0063**. Do not sort filenames or run `supabase db push` against the DEV chain.
Mixed 0027–0036 and reserved Announcements 0059 are excluded. Historical 0050 and
0056 remain intact but are superseded here by Telegram-only 0061 and the latest
trial functions in 0060. No Messenger tables or runtime are required.

0060 adds shared purchase ownership, Telegram notification delivery/outbox and
trial claims, including consumed legacy trial history. That backfill populates
only the new claims table; it does not reset trials or modify existing orders.
Zero staff commission stays zero. Caller, tenant and lease-owner guards remain.
0061 defines explicitly confirmed, selected test-customer cleanup; applying the
definition deletes no customers. Ordinary operations preserve trial history.

`apply-reviewed-package.sql` contains one transaction. It rejects installed or
partially installed state and drift in five critical production function bodies.
These guards do not identify a Supabase project: verify the actual connection
and project separately. A database named `postgres` is insufficient evidence.
Do not bypass a guard by dropping tables or deleting operation history.

## Reproduce finite checks

From `backend/`, regenerate locally with:

```powershell
node scripts/build-core-release-package.mjs
```

Install the locked embedded runtime under
`src/__tests__/database/pglite-runtime/` using `npm ci`, or set
`PGLITE_MODULE_PATH` to an existing installed PGlite module URL. Then run:

```powershell
node scripts/check-release-sql.mjs
npx --no-install vitest run --config vitest.offline.config.js
```

The SQL runner opens no external database and starts no service. Evidence:
13 embedded SQL programs passed, including 16 production-package scenarios;
1,427 backend tests passed. The package rehearsal invokes real SQL functions for
receipts, queue invariance, counters, trial recovery/cutoff, notification leases,
cleanup and tenant denial. Existing synthetic active access, usage, deadlines,
payments and counters survive application. Failure injection rolls back DDL;
reapplication and baseline-function drift are rejected. Independent review found
no actionable issues and separately passed the package and cleanup scenarios.

Embedded single-engine checks do **not** establish multi-session concurrency or
Supabase auth/control-plane/event-trigger equivalence. Local Node24 results do
not satisfy the final Node22 locked-install gate.

## Later approved rollout and recovery

Before application, capture recoverable DB/config/source/static/dashboard
backups, refresh read-only catalogue and aggregate integrity checks, and review
production pool/service/provider bindings, adoption manifests and staged flags.
Verify the official Supabase CA and TLS peer; keep connection strings private.
Keep infrastructure admissions/execution disabled until ownership is proven.
Do not copy DEV service IDs or ownership receipts. Coordinate 04:00 Myanmar
deadlines with actual panel expiry separately; SQL does not extend old accounts.

Only after explicit deployment approval, apply the exact reviewed bundle to the
verified production project, verify new signatures/grants, and reload the
PostgREST schema cache through the established deployment procedure. If the
transaction fails, roll it back and investigate; do not resume individual files
or force past guards. There is no apply executor in this package.

After a successful commit, preserve additive schema and purchase/trial/delivery
history during application rollback. Stop new infrastructure admissions and
reconcile in-flight external operations before returning to older code. Do not
drop claim/payment/operation rows, shorten access, recreate customers or purchase
another VPS to resolve uncertain state. Retain protected legacy access until
separately reviewed production adoption and configuration are complete.
