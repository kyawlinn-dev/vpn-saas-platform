# Server Management Release Gate

This is preparation, not permission to deploy. No real acceptance or production
application is implied by local tests. Use the normal manual Ansible release path.

1. Pin and review a source revision. The development checkout contains unrelated
   pre-existing edits and operator scripts; do not deploy its whole dirty tree.
2. Review the exact target DB delta and back up DB/configuration. The Telegram-only
   core release uses `backend/supabase/releases/2026-11-core/manifest.json` and its
   generated atomic bundle in explicit dependency order, not filename order.
   Mixed DEV 0050/0056 are superseded there by 0061/0060; never apply the full DEV
   directory or assume migration-history rows prove production effects.
3. Validate production pool/panel/service identity, provider account bindings,
   bootstrap keys, firewall profiles and cost policy independently of DEV.
   Never copy DEV service IDs, encryption keys or lifecycle receipts into production.
4. Complete the release matrix for every enabled provider/profile using disposable
   resources and owner-run phone/ISP checks. Synthetic SQL is not proof of
   multi-session concurrency; record that evidence separately.
5. Inventory existing production nodes including SG5. Inspect before adoption and
   obtain explicit hash approval for each existing-node registration. No duplicate
   VPS purchase is needed merely to add an absent DB row.
6. Obtain separate approval for production SQL, operator configuration, backend
   deployment and dependent dashboard rollout. Monitor readiness, operation
   checkpoints, stable customer links and remaining provider charges.
7. On failure, stop new admissions and preserve operation state. Reconcile active
   work and billable resources before code rollback. A DB/code rollback does not
   undo a provider purchase or restore a destroyed address.

See ../testing/server-management-operator-guide.md for setup, manual acceptance and
recovery. The release matrix is ../testing/server-management-release-matrix.md.

Current preparation evidence and unresolved production adoption/configuration
gates: `../audits/2026-11-02-production-configuration-preparation.md`. This report
does not authorize production changes or establish complete lifecycle ownership.
