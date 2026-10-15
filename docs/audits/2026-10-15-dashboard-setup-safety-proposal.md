# Dashboard purchase setup: prerequisite safety proposal

Status: owner approved 2026-10-15. Implemented as migration 0037 and validated
in isolated synthetic PostgreSQL-compatible execution; no SQL applied to production.

Task 6A's new automatic start/queue and retry behavior needs durable coordination.
Existing production records provide payment idempotency and per-key capacity
reservations, but no per-customer dashboard setup claim. Activation currently
cleans up partial keys before provisioning; two simultaneous retries can interfere.
Missing keys alone do not prove setup failed. An in-memory lock would not survive
PM2 restarts or coordinate processes. Payment application must continue to mean
money recording and cannot become a setup lock.

Proposed narrowly scoped migration:

- Add a backend-only dashboard_purchase_operations table with UUID operation ID,
  reseller/customer/order references, unique reseller/request key, request hash,
  snapshotted plan/payment intent, state, setup owner/claim timestamps, sanitized
  setup failure code, and creation/update timestamps.
- Enforce a single running operation per reseller/customer. Claim/release and
  order association are atomic tenant-checked database RPCs; dashboard clients
  cannot write the table. Replays return the same associated order/payment.
- Keep payment recording in the existing ledger RPCs and provider work outside
  database transactions. Record queued/awaiting-payment/ready/failed outcomes
  independently from confirmed/applied payment facts.
- Reuse existing key reservation/ownership guards. A stale operation after a
  crash needs provider/key reconciliation before another worker can claim it;
  never assume a time limit alone proves an outstanding provider call ended.
- No customer or ledger backfill, no automatic activation of existing pending
  orders, no deployment, and no production database changes during local work.
- Update SCHEMA.md, API contracts, rollout preflight and rollback guidance with
  the reviewed migration. Keep unfinished Messenger migration dependencies out.

Alternative: deliver display consistency with the current dashboard activation
flow retained; leave Task 6A unimplemented until durable coordination is approved.

Recommendation: approve the narrowly scoped migration prerequisite, then test
request replay, concurrent retries, restart recovery and payment invariance before
enabling the new dashboard flow. Exact SQL/RPC implementation remains subject to
review before deployment.
