# LightNode Retirement Absence Fix

Use systematic debugging and test-driven implementation in the existing isolated
checkout. Preserve all unrelated release work. Owner starts local services.

Evidence: DEV replace `96105cee-71a3-46c7-88fa-51d78f17c72f` is blocked at
`provider_read`. Source Bangkok #1 `ecs-e70001rfmdnw` returns HTTP400,
`code:AvailableInstance.NotFound`, `httpStatus:400`, no instance. Its encrypted
active-operation deletion checkpoint records the exact source/task identity;
retirement records panelRemoved/delete_issued; provider task reports FINISHED/
SUCCESS. Current adapter recognizes only detail HTTP404 as absence.

- [x] Reproduce the observed business-not-found response in the real common
  retirement tests, including replay without repeating panel removal/release.
- [x] Admit only that exact HTTP400 shape after independently bound deletion
  receipt, successful saved task and complete paginated instance-list absence.
  Generic HTTP400, identity mismatch, incomplete list, pending tasks, or a still
  listed resource must stay closed. Preserve HTTP404 behavior and billing proof.
- [x] Run provider/retirement/composition regressions and independent review.
- [x] Transfer scoped source/tests/docs to normal DEV with backups, update only
  the isolated DEV runner, then prove read-only recovery prerequisites. Keep the
  blocked operation intact for owner Resume; no new release/create submission,
  customer reassignment, production deployment or direct DB repair.

No schema or public API change is required. Do not infer server deletion from
generic error messages, guessed IDs, or successful task status alone.

Verification: observed common-retirement RED reproduced
DELETE_RECONCILIATION_REQUIRED; missing-region/zone RED reproduced the real
MissingParameter behavior. After the fix 262/262 checks across seven scoped files
passed. Independent read-only review completed clean, including exact source-zone
binding. Real source-zone inventory returned202/success/rowCount0/instances[];
saved task FINISHED/SUCCESS and active DO replacement verified. No provider write
or Resume submitted by the agent. Isolated DEV runner release
`dev-20261101192641610` is healthy with all three providers ready and production
health unchanged. Normal DEV source/test/doc transfer is backed up and verified;
the deployment helper permits only this one blocked operation with an expired
lease, preserving its normal rejection of active nonterminal work.
