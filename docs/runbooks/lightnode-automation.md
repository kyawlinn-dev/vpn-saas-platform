# LightNode lifecycle automation

Scope: DEV source/setup. No production application deployment or additional billable server creation is authorized by this implementation.

Setup completed 2026-11-01 in the normal DEV checkout. Migration 0062 and scoped
account binding are installed. The separate fixed-IP runner is healthy with all
three providers ready; LightNode catalogue and both profile quotes were verified
through its authenticated API. Two unbillable DEV quotes were recorded, zero
creation operations submitted. Protected live mirrors and server records stayed
unchanged, and production health remained green. No owner SQL action is needed.

Verification: 723 backend checks, 68 admin feature checks, eight PostgreSQL-engine
checks, the admin build, and both real Linux isolated UFW profiles passed. A fresh
independent review and its cleanup/firewall fixes were completed. The new paid
LightNode Add/Replace/Retire walkthrough remains owner-run; offline and read-only
evidence is not a substitute for that acceptance.

Region-discovery update (2026-11-02): the former Tokyo/verified-price gate is
removed. Focused verification passed 217 backend checks, 60 dashboard checks,
two PostgreSQL-engine quote scenarios and the admin build. Independent scoped
review found no remaining issues before the additional tested geographic-alias
correction. The actual authenticated API returned 37 regions; Tokyo, Bangkok and
Frankfurt catalogues and four non-Tokyo unbillable DEV quotes passed. No paid
operation was submitted. The isolated release checkout's broad suite still has
unrelated excluded-module/fixture failures; this is not whole-release approval.

## Provider contract

API: https://openapi.lightnode.com with `x-open-token`, loaded only from backend `LIGHTNODE_API_KEY`. Official reference: https://apidoc.lightnode.com/en . Creation uses `/instance/create`; deletion uses **POST `/instance/release`**, not DELETE `/instance/{id}`. Both return asynchronous receipts. The adapter persists immutable task/resource UUIDs before polling `/asynctask/getResult`; a successful task alone never proves deletion. Absence requires exact detail HTTP404, or the observed HTTP400 `AvailableInstance.NotFound` shape plus the exact saved deletion receipt/task success and complete paginated absence from the independently registered source region/zone. `/instance/list` requires both nonempty `regionCode` and `zoneCode`; missing parameters or an empty/default request are not absence evidence.

DEV Bangkok-to-DO replacement on 2026-11-02 reproduced the HTTP400 variant after
the delete task finished. The narrow recovery fix preserves billing-package
evidence, ownership and idempotency; no generic HTTP400/error text becomes success.
Resume the same blocked operation after the isolated DEV runner update, rather
than creating another replacement or manually deleting resources.

A missing create response after submission requires reconciliation. Do not click a new Add operation to replace an uncertain one. LightNode provides no documented provider idempotency key and names are not ownership proof. The existing durable intent prevents duplicate purchases.

## Backend-only operator configuration

Extend the existing `SERVER_INFRASTRUCTURE_CONFIG_PATH` JSON with `providers.lightnode`:

```json
{
  "accountId": "OPERATOR_CONNECTION_UUID",
  "connection": {
    "id": "OPERATOR_CONNECTION_UUID",
    "credentialSha256": "SHA256_OF_API_TOKEN",
    "attestedAt": "ISO_TIMESTAMP",
    "firstContactPolicy": "tofu",
    "anchor": {
      "resourceId": "EXISTING_PROTECTED_INSTANCE_UUID",
      "region": "REGION_CODE",
      "zone": "ZONE_CODE",
      "createdAt": "EXACT_PROVIDER_CREATE_TIME_STRING",
      "address": "EXACT_PUBLIC_IP"
    }
  }
}
```

These values are examples; setup verifies API inventory before writing actual private configuration. Add the connection UUID to the DEV pool's existing private `server_operation_runtime_bindings.provider_accounts.lightnode`, preserving DO/Vultr accounts. Account identity is **operator-attested**, supported by token fingerprint plus exact read-only anchor; it is not a vendor account-ID claim. Keep the anchor protected. Key rotation or anchor replacement needs explicit re-attestation in backend config and its scoped binding.

All API regions are offered without an operator region map, price catalogue or
budget/plan allowlist. Obsolete `regionalMachines`, `prices` and `policy` settings
are ignored and should be removed for LightNode only. Discovery chooses one
deterministic zone with compatible x86 packages and a root Ubuntu 22.04 image,
falling back to 24.04. Both profiles use the same prerequisites. Extra data disks
remain technically unsupported. Fresh quotes bind image, zone, hardware and
the actual billing mode/traffic specifications before submission.

LightNode exposes no monetary API quote. Catalogue and quote amounts are null
with explicit `provider_pricing` evidence; the UI says Provider pricing applies
and requires Approve provider billing. This is not a free-price promise. Traffic
allowance comes from the package API (`freeFlow` in GB); bandwidth-billed packages
retain their actual Mbps and no invented GB allowance. The Tokyo console figures
$0.012/hour and approximately $7.71/month were owner-supplied, not live API prices.

The [official FAQ](https://doc.lightnode.com/FAQ/FAQ.html) states hourly server
billing with a 672-hour monthly server-fee cap and outbound-only traffic billing.
The [billing description](https://doc.lightnode.com/Instance/Billingdescription.html)
describes an hourly-prorated traffic package, actual usage charges above that
allowance, and a monthly traffic-charge cap followed by 10 kbps throttling. Exact
regional excess-traffic unit rates are not published there or in this API response;
the console/account terms determine them. Do not calculate an authoritative bill
by multiplying a rounded hourly display by 730, assume the full monthly allowance
is immediately available for short-lived servers, or invent unlimited traffic.

## Bootstrap and protection

DO/Vultr retain pre-injected SSH host keys. LightNode's documented API cannot inject host keys or custom data: an explicit TOFU first-contact policy observes an ed25519 key **without authentication**, saves the pin in encrypted fenced state, then registers the owned receipt. Configuration installs the existing public key, verifies independent key login, disables password/kbd-interactive authentication, locks the temporary root password and verifies effective sshd policy. Subsequent sessions require the saved pin. An interrupted setup reuses the same password/pin/instance rather than resetting it.

The cloud API cannot create or inspect firewall rules. This bootstrap uses host UFW: SSH and Marznode management from fixed controller sources only; public 443 for VLESS, plus TCP/UDP8388 only for dual nodes. This is host firewall protection, not verified cloud firewall coverage. API/image flags named cloud-init do not imply custom-data injection support.

Only a fresh operation-owned LightNode candidate with completed pinned key-auth
bootstrap receives a deterministic UFW rebuild. Effective IPv4 and IPv6 INPUT
rules must match the exact allowlist, including default policy and traversal;
application profiles, ranges or foreign management sources cannot silently pass.
Loopback, established replies, ICMP and DHCP control traffic are retained.
DO/Vultr and shared/adopted nodes do not receive this rebuild.

Both generated profiles were exercised with the actual Linux UFW/iptables tools
inside separate mount/network namespaces on 2026-11-01. The normalized controller
firewall and original UFW configuration hashes stayed unchanged. This verifies
command serialization and policy inspection; it does not replace the owner's
paid end-to-end LightNode canary.

If SSH never becomes reachable, cancellation uses independently verified API
ownership to release the fresh VPS without SSH enrollment. Such receipts are
marked cancellation-only and cannot pass node configuration/publication.

Billing inspection covers **the instance package** created by this workflow (d0, no extra disks/snapshots/secondary IPs). The public API cannot enumerate detached external billing resources. Do not manually add such resources and assume retirement will audit the whole account. Ownership, exact disk/IP identities and pre-delete evidence are checked; unverifiable package changes block retirement.

## Owner manual acceptance after setup

The owner starts the local backend/admin dashboard. Infrastructure execution uses the existing isolated fixed-IP DEV runner; no laptop-IP updates are required.

1. Open Servers → Add Server → LightNode. Choose any API region with compatible packages; verify profile, hardware and actual traffic/bandwidth specifications. Review Provider pricing applies and the provider console rates before authorizing the paid test.
2. Create one disposable DEV node, first VLESS-only or dual as desired. Observe asynchronous progress, recover using the same operation if interrupted, and confirm one provider instance only.
3. Refresh a fresh DEV customer's Happ subscription and connect. For dual, also test Outline creation/switching and a fresh account added after configuration. Global VLESS service stays 14; only dual gets an SS service.
4. Test cross-provider Replace using disposable DEV nodes and preserve key URLs/quota. Active SS access cannot target a VLESS-only destination.
5. Test Move-and-Retire for dual and Retire for VLESS-only. Verify removed inbound membership, unused SS-service cleanup, provider task completion and confirmed instance absence.
6. Confirm protected shared mirrors stay unselectable for destructive lifecycle actions and old production customers remain unchanged. Existing live Tokyo #3 is a protected DEV access mirror, not a disposable lifecycle candidate.

Do not use a new Add operation to bypass a blocked create; report its precise code and existing operation ID. No production migration, deploy or VPS destruction is implied by passing DEV acceptance.
