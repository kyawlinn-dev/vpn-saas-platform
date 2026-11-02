# Server Management Recovery

Use the existing operation, never a new purchase to resolve an uncertain response.
The operator guide at ../testing/server-management-operator-guide.md is the source
of truth for setup and recovery boundaries.

| State | Operator Action |
| --- | --- |
| Provider unavailable | Restore authenticated account access; retain operation ID and request key. Other ready providers remain independent. |
| SSH/firewall/image prerequisite | Correct the selected provider/profile setup; owner restarts backend. Existing-resource reconciliation must remain available. |
| Quote changed/expired | Before a recorded purchase, review a fresh quote. For an uncertain recorded attempt, reconcile the same operation first. |
| Create/delete reconciliation required | Inspect provider resource and persisted attempt/ownership evidence. Never blindly repeat the external action. |
| Candidate/probe failure | Do not publish or delete source. Inspect private candidate and temporary probe cleanup. |
| Management TLS verification | Inspect the existing candidate, pinned image/config and certificate policy. Async TLS EOF rejection is checked structurally, not by matching OpenSSL alert wording. Resume retains the configuring stage and existing VPS. |
| Node firewall policy | Vultr images may ship with a broad SSH rule. The installer adds approved management sources before removing that exact inherited rule. Unknown unsafe rules still block; never bypass the policy check or reset a live node's firewall to force progress. |
| Migration/access mismatch | Pause and inspect the affected item plus DB/panel state. Preserve keys, quota, expiry and ownership evidence. |
| Post-publication cancellation | Paused reconciliation, not automatic customer rollback or candidate destruction. |
| Cleanup pending | Inspect residual billable attachments and provider absence independently. Do not claim charges stopped. |

Do not expose raw provider responses, tokens, SSH private keys or customer links in
screenshots/logs used for support. Safe error codes identify the failing boundary.
