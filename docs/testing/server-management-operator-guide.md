# Server Management Operator Guide

Local implementation is not production acceptance. Owner starts services. Live
provider actions, migrations, adoption and deployment need separate approval.

## Fresh DigitalOcean Dual-Protocol Acceptance

After the reviewed recovery fixes pass verification, the owner can start/restart
the local backend and dashboard. No new schema migration is required for these
fixes; existing lifecycle setup and prior migration requirements still apply.

1. Confirm the dashboard is using the DEV backend/pool and there is no unresolved
   pending submission. Reconcile old operation history before starting a new VPS.
2. Select Add Server, DigitalOcean, the intended region and plan, and explicitly
   select Dual Protocol. Review Quote and approve the displayed recurring cost.
   Submit once. For an uncertain response, retry the saved request or inspect the
   existing operation; do not submit a fresh purchase to resolve uncertainty.
3. Provider readiness must prove public IPv4 TCP 443 and TCP/UDP 8388, while TCP
   22/62050 is restricted to the configured management sources. Do not broadly open
   management access to make readiness pass. A changed operator IP may require an
   owner-approved DEV management-source update.
4. Observe provisioning, configuring, registering, verifying, publishing and
   completion. Resume an existing blocked operation rather than buying again.
   An Add operation with zero access items is normal; that is not overall progress.
5. Confirm one new VPS/node, readable location names, one dedicated SS service,
   and the new VLESS inbound in the existing DEV global VLESS service. The temporary
   VLESS verification service must be gone; existing nodes/memberships stay intact.
6. With test customers, check Outline selection/switching to this SS node and Happ
   subscription refresh/connectivity to its VLESS endpoint. Check on an actual
   customer-like network, not only the worker's candidate-local tunnel. Preserve
   subscription links, usage, quota and expiry; do not reset used trial history.
7. Record provider/region/plan/profile, operation ID and phone/network outcome.
   Inspect costs in the provider account. Do not record credentials or private links.

Optional cancellation acceptance must use a disposable DEV purchase: request Cancel
while creation is pending, let the same operation reconcile, and independently
confirm VPS deletion and no residual charges. A pending/unresolved provider create
can remain blocked deliberately; it must never trigger a second POST or broad cleanup.

## Expiration-Safe Replacement And Cutoff

Apply owner-reviewed DEV migrations 0055 then 0056 before testing the new
04:00 Myanmar policy. The agent does not apply them to shared Supabase. A fresh
test user receives the new fixed deadline automatically; pre-existing panel
users keep their recorded deadline until separately reconciled. Do not mistake
a local policy update for a completed live backfill.

First acceptance: replace the VLESS-only DEV #6 through **Replace server** with
VLESS Only selected. Review the new VPS quote and temporary overlap, then approve
source deletion after verification. The worker provisions/configures and probes
only VLESS, publishes its inbound into the pool's existing global service,
drains #6, reanchors database references in place, verifies permanent access,
removes #6's inbound and deletes only #6's owned resources/VPS. No permanent SS
service is created for this profile. Do not press Retire Server when the intent
is to buy a new replacement; retire-only reuses remaining nodes.

Keep the same subscription URL and refresh Happ after completion. Confirm the
new endpoint connects, #6 is absent, and quota/usage/expiry/credentials did not
reset. Test active and already-expired records separately. An expired user must
remain expired; its credential-bound subscription metadata and real membership
are checked even when the client response is an inactive placeholder. Expired
Outline access must remain denied. SQL counters move through the existing trigger.

An expiry date D now ends at D+1 04:00 Myanmar (D 21:30 UTC). Check grace just
before that instant and denial at/after it. Quota exhaustion still stops access
earlier. The hourly cleanup/queue sweep may update DB status later than the panel
deadline; reminders must not announce expiration during grace or send overnight.

## Setup

Use `backend/config/server-infrastructure.example.json` as the configuration shape,
not usable credentials. Keep the actual configuration/private key outside Git.
Secrets remain `DIGITALOCEAN_TOKEN`, `VULTR_API_KEY`,
`SERVER_BOOTSTRAP_PRIVATE_KEY_PATH` and `SERVER_INFRASTRUCTURE_CONFIG_PATH`.

Authenticated account IDs must match both configuration and the intended pool's
`server_operation_runtime_bindings.provider_accounts`. A token alone cannot
authorize a new provider/account. Never copy DEV bindings into production.

Each profile (`vless_only` or `dual`) requires provider SSH key IDs matching the
bootstrap private key and a verified firewall group. Restrict TCP 22/62050 to
approved management IPs; allow TCP 443 publicly and TCP/UDP 8388 for dual.
DigitalOcean also requires its configured firewall tag. Images must be supported
Ubuntu x64; Vultr OS IDs are discovered if omitted. Optional
`regionalMachines[region][profile]` overrides the default machine configuration.

Regions/plans now come from provider catalogues, not the old `regions` array.
Per-provider `policy` optionally restricts `allowedRegions`, `allowedPlans` and
`maxMonthlyAmount`. Omit allowlists to discover all supported compute choices.
GPU, ARM and unsupported families cannot be purchased. Stock, image availability,
price and policy are checked again before admission/purchase; catalogue results
are not reservations. One unavailable provider does not disable another ready
provider. Global DB/panel/key/scope failures still disable execution. Owner must
restart the backend after setup changes to recompute startup readiness.

## Adoption

Migration `0051_existing_node_adoption.sql` adds private inspection/application
RPCs. Applying it registers no nodes and deletes no data. Review/apply in DEV first.
Apply `0052_worker_runnable_pagination.sql` after 0051 and before starting the
updated backend worker. It prevents unavailable-provider work from starving older
healthy work; applying it purchases nothing and changes no operation state.
The CLI `backend/scripts/adopt-public-server-access.mjs` defaults to offline
inspection. Explicit `--live` reads authenticated provider/panel/DB state;
`--apply --approved-hash HASH` authorizes atomic registration of the exact reviewed
manifest. Credentials come from the explicitly selected process environment;
the CLI intentionally does not load dotenv files.

Never relabel shared live nodes as DEV-owned lifecycle resources. Lifecycle import
requires independently pinned SSH identity and matching provider, panel and DB
evidence. Names/IPs/tags alone do not prove ownership. SG5 production adoption is
a separate approved reconciliation task, not a reason to purchase another VPS.

A live manifest identifies the target only; it cannot grant its own authority:

```json
{
  "serverId": "11111111-1111-4111-8111-111111111111",
  "provider": "digitalocean",
  "resourceId": "REPLACE_VERIFIED_RESOURCE_ID",
  "nodeId": 99,
  "mode": "access"
}
```

For a missing DB row, add `registration` with `name`, actual provider `region`,
`maxActiveKeys` and `serverTier` (`trial` or `premium`). Existing rows must omit it.
Lifecycle mode additionally needs an operator-config
`existingNodeAdoption.lifecycleScopes` entry matching `serverId`, `provider`,
`resourceId`, `nodeId`, `environment`, `databaseIdentity`, `panelIdentity`, `poolId`
and independently obtained `sshHostKeySha256`. Never learn that fingerprint from
the untrusted connection being approved. The preview must still verify all state;
an entry is permission to inspect, not a bypass of evidence checks.
Lifecycle readiness also requires existing same-pool customer-user receipts with
matching subscription-key hashes. Unverified legacy users return
`ADOPTION_CUSTOMER_OWNERSHIP_REQUIRED` before a replacement can be considered
ready. Node adoption does not automatically grant authority over those customers;
legacy customer reconciliation remains an explicit production acceptance gate.

With the correct DEV process environment already selected, explicit commands are:

```powershell
node backend/scripts/adopt-public-server-access.mjs --manifest MANIFEST_PATH --live
node backend/scripts/adopt-public-server-access.mjs --manifest MANIFEST_PATH --live --apply --approved-hash REVIEWED_HASH
```

Review the first result before approving its hash. Do not reuse this sample's IDs.

## Owner-Run Acceptance

### VLESS-Only Retirement

For a lifecycle-owned VLESS-only test node, open its actions and choose **Retire
server**, then **Review Retirement**. No destination picker or VPS price is needed.
Review the remaining-access node, approve deletion of the source VPS after
verification, and submit **Retire Server** once. No fallback means retirement is
blocked before admission; do not delete the VPS manually to bypass it.

The backend selects a compatible healthy remaining node for DB anchors only;
panel users keep the global VLESS service. Check completed status, refresh the
same subscription in Happ, confirm the retired endpoint disappears and remaining
nodes connect. Check original credentials/quota/expiry and provider deletion.
An uncertain submission must recover its original request; do not create another.
Dual-protocol nodes retain **Move and retire** with an explicit destination.
This source update requires no new migration. Owner runs/reloads local services;
the agent has not retired any node as part of implementation.

### Other Acceptance Checks

1. Start backend/dashboard in DEV. Check independent provider readiness and history
   visibility when a provider is unavailable.
2. Select provider/region/profile; inspect specs and quote. Selection changes must
   invalidate quotes. Stale/unavailable choices must not authorize purchases.
3. After explicit cost approval, Add a disposable VPS. Verify private candidate
   checks precede publication; test Happ/Hiddify on the affected ISP and Outline
   for dual nodes. API probe success does not prove ISP connectivity.
4. Retry uncertain submissions with the original idempotency key. Confirm only one
   VPS exists. Never start a second purchase because the first response was lost.
5. Replace the disposable source, checking stable links, quota, expiry, assignments
   and preserved unrelated global endpoints. Move-and-Retire must reuse an existing
   compatible destination without purchasing a VPS. Do not target live nodes in DEV.
6. Test pause/resume and unpublished cancellation. Cancellation after migration
   begins pauses for reconciliation; it is not automatic rollback.
7. Verify provider absence and residual volume/snapshot/backup/IP charges.
   `cleanup_pending` does not mean billing stopped. Record actual evidence in the
   release matrix for each enabled vendor/profile.

## Recovery And Release

Use the recorded operation ID and allowed controls. Resolve prerequisites before
resuming the same operation. Reconcile ambiguous provider POSTs using persisted
attempts, never blind retries. Do not delete candidates or ownership rows to force
retries. Inspect resources/service membership before deciding the recovery action.

Production needs a backup, reviewed migration/configuration delta, verified
accounts/firewalls/keys, disposable acceptance and separate deployment approval.
Do not drop lifecycle tables while work is in flight. Disable new admission and
reconcile outstanding operations before reverting application code.
# Moving To an Existing Shared DEV Server

Use **Move and Retire**, select the existing destination, then **Review
Migration**. No new VPS is purchased or priced. The expiring approval snapshot
and source-deletion confirmation remain mandatory. Protected shared DEV access
nodes can receive access but remain protected from infrastructure deletion.

No separate probe runner is required. The worker checks the destination node's
health and existing service/inbound/host bindings through the panel API, moves
SS memberships and database/token assignments, detaches the source VLESS
inbound, verifies the customer's permanent links, and deletes only the empty
source's owned panel resources and VPS. A #7-to-#4 move does not depend on #6,
its SSH firewall or a temporary VPN test user. Missing endpoint evidence still
blocks the operation. Protected destination infrastructure remains untouched.

After completion verify the moved test customer's permanent link, SS server
selection, VLESS refresh, source removal and billing absence. Production service
5 and the destination's host/node settings must remain unchanged. Historical
token/server collisions additionally require the DEV function fix in migration
0054. Production deployment and agent-started services remain out of scope.

Add Server and provision-new replacement still need SSH management access to
their owned candidates for installation and tunnel verification. If the
workstation's public IP changes, both the provider SSH allowlist and candidate
UFW rules must permit the new `/32`, consistent with local management-source
configuration. Update only the intended DEV firewall group; do not
change shared production service membership or allow SSH from `0.0.0.0/0`.
When SSH is already blocked, use the owner's provider console to add the
restricted UFW rule. These SSH requirements no longer apply to Move and Retire.
`retirement_check: destination_verification` reports a failed destination check;
inspect node health, service bindings and permanent links before retrying.

# Selection Maintenance Acceptance

After the owner starts local services, accept a DEV replacement or move/retire.
Before provisioning finishes, refresh the Mini App and both dashboards. The source
must show Under Maintenance where visible and be absent from purchase/trial/bot
assignment and switch choices. Mini App selection must not be clickable, including
for visitors without a current package. A stale reseller selection must be refused.
Destination nodes must not acquire the source's label merely because they are locked.
Blocked or paused work must retain maintenance until reconciled terminal release.
Existing VPN sessions should not be forcibly closed by this selection-only state.
Happ's cached list can still contain the node before endpoint cutover; do not treat
that as proof the customer-selection restriction failed. No new migration is needed
for this update; earlier cutoff migrations 0055/0056 remain separately pending.

# Recycled-ID Regression And Fresh DEV Restart

For the 2026-10-28 fix, apply migration 0057 to DEV only before retrying lifecycle
work. The owner-approved reset of blocked operation 09c5e9f0-ccbb-4a25-9e11-4b1b5ae1fbd4
removed only its unpublished DO candidate (613463949/node 8). Provider/panel
absence and zero residual billable attachments were verified; production services
were unchanged. The separate ignored `backend/.env.infrastructure-setup/reset-dev-test-infrastructure.sql`
closes that operation and archives obsolete receipts from three previously
retired test incarnations. It must not be replayed against another project or
used as a general cleanup tool. It preserves customer/server/history rows.

Restart the backend yourself after both DEV SQL files are applied. Refresh the
dashboard and submit one NEW Add request, not Resume on the cancelled attempt.
Test Add dual, customer tunnel access, retirement, then Add again to exercise
panel ID reuse. Verify only one global VLESS service, one SS service per dual
node, no private verification service after successful publication, and no old
VPS/extra billable attachments after retirement. Interrupted provider deletion
must retain old proof and block ID replacement until reconciled. This manual
acceptance is still pending; no production readiness claim is implied.
