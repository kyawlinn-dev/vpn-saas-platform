# LightNode automation — approved scope

The owner approved adding LightNode to the existing DigitalOcean/Vultr infrastructure workflow and delegated prerequisite setup. Implement in the existing isolated checkout, preserving the paused release changes. Owner starts local services and performs paid acceptance; this work does not authorize another billable VPS or production deployment.

## Product behavior

- Add LightNode to provider selection with real regions/packages, explicit readiness, itemized hourly pricing and a clearly labelled monthly estimate. Unknown prices are unavailable, never zero or invented.
- Use the existing operation queue, leases, ownership receipts, encrypted checkpoints, publication, migration, replacement and retirement steps. Both dual and VLESS-only profiles use the environment's existing global VLESS service. Only dual nodes create an SS service.
- Cross-provider replacement preserves access/credentials/quota and existing SS destination compatibility rules. No provider-specific customer workflow.
- Existing shared production nodes, services, receipts and protected DEV mirrors remain protected. Tokyo #1 remains available for owner rollback; Singapore Trial is not renamed.

## Documented provider limitations

Official contract: https://apidoc.lightnode.com/en . Authentication is x-open-token at https://openapi.lightnode.com. Create/delete are asynchronous. Persist task and immutable resource UUIDs before polling. Never issue a second create after an ambiguous submission. Names and IPs alone cannot establish ownership. Confirm deletion by authoritative detail absence, not task success alone.

The public API does not expose stable account identity, monetary prices, SSH-key creation, firewall CRUD/rules, custom data, host-key injection or provider idempotency. Do not invent these capabilities. A backend operator-attested connection UUID, token fingerprint and a read-only immutable instance anchor bind this account; label that assurance accurately. Rotation requires re-attestation. Token fingerprints identify credentials, not vendor accounts.

Prices are backend-only operator-verified records keyed by region/zone/package, with USD hourly amount, verified timestamp, source, included traffic and monthly reference hours. The owner supplied Tokyo CPU Shared intel-c1m2-bgp-t1000-s50-d0 at $0.012/hour; $7.71/month is the console's estimate, not a cap. No other plan is implicitly priced. Requote compares the complete pricing evidence. Reject stale/unverified prices.

## Bootstrap

For fresh operation-owned instances only, use an encrypted, unique temporary provider-compliant password; install the existing infrastructure SSH public key, verify key login, disable password/kbd-interactive access, then apply the existing pinned-image Marznode setup and verified host UFW rules. Management sources are the fixed runner/controller addresses. Do not assume cloud firewall coverage.

First contact uses an explicit operator-enabled trust-on-first-use policy after API UUID/IP validation; record and persist its fingerprint before authentication/mutation. All later SSH connections pin that fingerprint. This is not equivalent to the pre-injected DO/Vultr host key. An interruption can resume from the saved fingerprint/password and key-login state without another VPS or password reset. Never log bootstrap secrets or return them through the admin API.

Cleanup exception: a current fenced pre-publication cancellation may register exact API ownership with `sshEnrollment:cancelled_before_enrollment` and no host pin, so an unreachable new VPS can be released. It cannot configure/publish a node or authorize normal enrollment. The provider task/UUID, scope, account, immutable specifications and independent receipt remain mandatory; cancellation is verified from the current database operation rather than a caller flag.

Successful LightNode retirement/cancellation retains package-only billing assurance through private checkpoints and the public completion DTO/UI. Do not silently relabel package inspection as account-wide billing verification.

## Verification and delivery

Offline tests cover provider wire shapes, pagination/status failures, durable async recovery, duplicate prevention, identity/price changes, protected deletion, bootstrap interrupted before/after key installation, existing DO/Vultr behavior and dashboard contracts. SQL provider expansion uses an additive migration and real PostgreSQL-engine tests before DEV application. Configure the existing isolated DEV runner only after verification; no production restart. Report manual acceptance steps and remaining limits honestly.
