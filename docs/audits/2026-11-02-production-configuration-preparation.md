# Production configuration preparation — 2026-11-02

**Preparation only. No production writes, deployments, metadata adoption, firewall
changes, provider purchases/deletions, process reloads or messages were performed.**
The owner wants one coordinated rollout after preparation, while conserving the
remaining usage allowance. No new subagents or repeated broad test runs were used.

## Fresh read-only inventory

Authenticated production SQL, panel inventory, DO/Vultr account/resource/key/
firewall GETs, a LightNode exact-instance GET and pinned-host SSH reads agreed:

| Production node | Cloud resource | Panel node | Inbounds VLESS / SS | Production services | Active DB keys |
|---|---|---|---|---|---|
| Singapore Trial | DO 586694507 | 3 | 8 / 7 | VLESS 5; SS 4 | 18 |
| Singapore #4 | Vultr 3f431d56-dae2-4c07-8778-115109f45057 | 6 | 14 / 13 | VLESS 5; SS 12 | 30 |
| Singapore #5 | DO 610308496 | 7 | 15 / none | VLESS 5 | No production server row |
| Tokyo #3 | LightNode ecs-e70001rd85ey | 9 | 18 / 19 | VLESS 5; SS 18 | 31 |

Counts are a point-in-time observation, not deployment-time preconditions. The
three existing active server counters matched their active-key aggregate counts.
All four panel nodes reported healthy. Global VLESS service **5** contains exactly
8, 14, 15 and 18. DEV service **14** shares those inbounds and remains separate.
Existing SS services are 4, 12 and 18; DEV uses 15, 17 and 19. Legacy services 8
and 11 are also present; their existence does not authorize cleanup or membership
changes. Keep the current Singapore Trial name: the owner deferred its rename.

Tokyo #1/#2 were absent from the current node/provider inventory. Historical IDs
must never be replayed. The controller is DO **584095579**, **178.128.127.163**;
it is protected infrastructure, not a VPN-node retirement candidate.

Production DB identity is `daenwuszqdfkbjiatsjs.supabase.co`; panel identity is
`https://panel.novanetmm.com`. New pool/runtime/resource tables are absent, as
expected before the reviewed SQL package. No DEV scope may be copied into them.

## Controller and provider prerequisites

SSH host verification was required. Inspection merged deployed `.env` and
`.env.production` in the application's precedence; inspecting `.env` alone would
incorrectly report a Windows bootstrap path. Saved PM2 configuration identifies
the production backend path and `NODE_ENV=production`; this is not a process reload
or a full attestation of every current process variable.

The effective file configuration has `/root/.ssh/novanet_do_bootstrap_key`, which
exists. Its derived public-key fingerprint matches DO key **57703441** and Vultr
key **e41709b6-5f48-4cbb-a55e-d55df423970f**. No private key was exported. Existing
`BOT_TOKEN_ENCRYPTION_KEY` is configured and must be preserved, not regenerated.

New public-access/lifecycle/worker flags, pool identities and operator-config path
are not configured in those deployed files. DO token exists; Vultr and LightNode
tokens and new explicit panel username/password variables are absent there. This
does not mean current customer provisioning is broken: deployed legacy code uses
its existing configuration/DB-backed credentials. New runtime needs a separately
reviewed secret/config installation on the controller. Never print or commit it.

Only DEV-labelled DO and Vultr cloud firewall groups were returned. They are not
approved production profiles. Prepare separate production dual/VLESS-only groups
later, without reusing or modifying DEV groups. Required profile ports are public
TCP443, plus TCP/UDP8388 for dual; management TCP22/62050 allows only independently
verified controller/panel egress IPs. The stable controller IP is known; panel
egress and exact production group IDs remain unverified. Do not guess them from
Cloudflare DNS or the laptop IP. Provider account GET success from this laptop
does not prove Vultr allows the production controller's egress.

LightNode's exact Tokyo anchor, IP and creation identity were verified through
the configured API token. It still needs a new production-scoped operator-attested
connection/binding; the DEV connection UUID is not production authority. No claim
of complete regional LightNode inventory or live bandwidth measurements is made.

## Proposed transition, not an applied configuration

| Setting | Initial compatible application stage | After verified access registration | After lifecycle readiness |
|---|---|---|---|
| PUBLIC_SERVER_ACCESS_ENABLED | false | true | true |
| SERVER_LIFECYCLE_COORDINATION_ENABLED | false | false | true |
| SERVER_OPERATIONS_WORKER_ENABLED | false | false | true |
| SERVER_OPERATIONS_EXECUTION_MODE | local | local | local |
| SERVER_ACCESS_ENVIRONMENT | production | production | production |
| SERVER_ACCESS_DATABASE_IDENTITY | daenwuszqdfkbjiatsjs.supabase.co | same | same |
| SERVER_ACCESS_PANEL_IDENTITY | https://panel.novanetmm.com | same | same |
| SERVER_ACCESS_POOL_ID | New reviewed production pool UUID | same | same |

These are ordered gates within one coordinated release, not permission to deploy
pieces now. Keep existing legacy customer access while flags are false. Preserve
global service5, encryption key, subscription URL, quotas, usage and counters.
Changing a flag cannot repair unregistered resources or undo a membership move.
Do not set remote mode: the implemented separate runner protocol is DEV-scoped.

Prepare one production pool bound to global5. Register the missing SG5 row with
the exact existing DO resource/node/inbound and VLESS-only capability; do not buy
a replacement. Existing three dual rows retain their UUIDs and SS mappings.
All existing nodes are shared with DEV services, so initial registration is
**access-only/protected**; do not grant destruction authority merely to make the
dashboard buttons available. Old customer ownership/credential hashes and active
operations require separate exact-scope inspection before lifecycle activation.

## Unresolved release gates

Subsequent final preparation resolves the implementation gap in item1 with
candidate0063 and protected LightNode CLI support, verified by offline and SQL
regressions. Controller/panel host networking and observed egress now prove the
management source178.128.127.163. These are local/read-only results; no adoption
or firewall/config application has occurred. The historical findings below
remain for audit; current gates are in
`../runbooks/2026-11-core-final-preparation.md`.

1. The existing-node adoption CLI supports DO/Vultr only. It rejects a config
   containing LightNode; the older general access migration permits mock mutation
   adapters only. Therefore it cannot currently produce/apply a complete live
   four-node adoption preview. A reviewed protected LightNode registration path
   and synthetic regressions are required before enabling the full public pool.
   No implementation change was made in this preparation stage.
2. Shared-node service filters and exact hosts must pass access-only adoption
   checks after new schema exists. Lifecycle adoption explicitly forbids shared
   foreign service membership; do not bypass that guard. Existing nodes should
   remain protected while future separately owned nodes use automation.
3. Final node/provider/panel proofs and manifest approval hashes depend on the
   fresh target state and new pool. Local inventory checksums below are evidence
   hashes, **not** valid `--approved-hash` adoption approvals. No executable adoption
   SQL or force-registration shortcut is included.
4. Install reviewed production provider/panel secrets, operator config, separate
   cloud firewall profiles and production pool/runtime bindings only during the
   later approved rollout. Verify from controller egress before worker activation.
5. Capture recoverable DB/config/code/static/dashboard backups, resolve dependency
   audit findings, run final locked Node22 validation and verify real panel cutoff
   alignment. No account deadline extension is implied by the SQL migration.

The full deployment is not ready until these gates are resolved. If quota is
insufficient, stop before starting rollout; retain preparation artifacts and
resume later. Do not leave a partially enabled worker to finish after a usage reset.

## Saved evidence and recovery

Ignored release workspace files `task3-inventory.json`,
`task3-controller-config.json` and `task3-provider-prerequisites.json` retain
allowlisted inventory/config-presence evidence, without credentials or customer
records. `task3-preparation-manifest.json` pins these inputs and this report.
The inventory script only permits SQL reads, API GETs/panel login and SSH reads.
It is not deployed and must not become a production apply script.

Later rollout order: backup/freeze approved source → exact atomic SQL → compatible
backend with activation off → protected metadata/access registration → verify
existing links and public-pool readiness → enable reviewed access/coordination →
validate worker readiness → publish compatible interfaces and smoke checks. This
must be reconciled with the final owner-approved deployment plan, including
panel deadline alignment, before execution. On failure keep additive history,
stop new admissions and reconcile external state before rolling code back.
