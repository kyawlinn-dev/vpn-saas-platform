# Phase 3 Business Data Repair Runbook

Date: 2026-08-04

## Scope

Phase 3 repairs production data left inconsistent by old package/order logic.
It does not deploy new code and it does not delete customer records.

The current source of truth for accounting is `order_payments`. `vpn_orders`
keeps cached summary fields for dashboard/detail compatibility, and
`monthly_settlements` stores snapshots that may need refreshing when old ledger
rows are corrected.

## Files

- `audit/sql/phase3_business_data_audit.sql`
- `audit/sql/phase3_business_data_repair_draft.sql`

## Phase 3A: Audit

1. Open the production Supabase SQL Editor.
2. Run `audit/sql/phase3_business_data_audit.sql`.
3. Confirm the environment marker is the intended production database.
4. Save or screenshot the non-empty result sets.

If Supabase only shows the last result set clearly, highlight and run one
numbered SQL section at a time.

Important sections:

- Section 03: paid non-trial payment rows with zero commission.
- Section 04: paid rows still classified as `order_type = 'trial'`.
- Section 05: `vpn_orders` cached totals that differ from payment ledger totals.
- Section 07: active keys on the wrong server tier.
- Section 11: saved settlement snapshots that differ from recomputed ledger totals.

## Phase 3B: Repair Draft

1. Copy exact IDs from the audit output.
2. Paste only confirmed target IDs into the matching `target_*` CTEs in
   `audit/sql/phase3_business_data_repair_draft.sql`.
3. Keep the final statement as `rollback`.
4. Run the draft and review the returned rows.
5. If the returned rows are exactly the intended changes, run it again in a
   fresh SQL Editor tab with the final `rollback` changed to `commit`.

Do not repair rows just because they appear unusual. Confirm each row matches
the known business rule:

- Trial packages have zero price and zero commission.
- Paid packages use the reseller commission at the time of the package event.
- Trial-to-paid conversion must become `order_type = 'purchase'`.
- Paid purchase access must be on premium servers.
- Trial access must be on trial servers.

## After Repair

1. Re-run the audit SQL. The repaired sections should return no rows or only
   known accepted legacy rows.
2. Check reseller dashboard Accounting for July and August.
3. Check admin Analytics and Settlements totals.
4. Check one affected customer detail page, including payment history and
   current access.

## Not Covered

- Moving live Outline keys between servers.
- Deleting old customer test data.
- Backfilling legacy paid orders that intentionally predate `order_payments`.
- Changing confirmed settlement history without owner approval.
