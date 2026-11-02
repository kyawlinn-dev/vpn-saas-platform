# LightNode Region Discovery and Provider Pricing

**Goal:** Honor the owner's instruction to remove Tokyo/plan/price restrictions and discover supported regional prerequisites automatically.

**Approved direction:** The owner explicitly said not to restrict locations or require pricing for provisioning. No further design approval is needed. No new billable VPS or production application deployment is authorized. Owner starts local services.

**Design:** LightNode reads all regions, packages and compatible Ubuntu images from its authenticated API. Choose one deterministic zone with compatible packages per region; ignore obsolete regional overrides and prefer root Ubuntu 22.04 then 24.04. Both protocol profiles share these prerequisites. No mandatory region map, price catalogue, allowed-region/plan list or monthly-budget gate for LightNode. Keep DO/Vultr behavior and ownership/lease/identity/bootstrap/retirement checks unchanged.

LightNode price is explicitly unavailable: `recurringAmount:null`, currency USD for existing account billing, and `trafficTerms.billing:{kind:'provider_pricing',source:'https://doc.lightnode.com/Instance/Billingdescription.html'}`. Unknown is never zero/free. Quote hashes still bind hardware, traffic specifications and zone; money/evidence expiry cannot block selection. Preserve existing confirmation field/API flow while displaying Provider pricing applies. API traffic specifications remain real values; optional absent traffic limits stay null. Unsupported hardware/storage must have explicit technical reasons, never hidden cost-policy rejection.

**Official billing evidence checked 2026-11-02:** https://doc.lightnode.com/FAQ/FAQ.html describes outbound-only traffic, hourly-prorated allowances, usage-based excess, monthly traffic-charge cap/throttling, and a 672-hour monthly server-fee cap. Exact regional overage rates are not supplied by the public API. Do not treat rounded hourly console figures multiplied by 730 as an authoritative bill. No provider billing settings are changed.

## Tasks

- [x] Write failing discovery tests: no region configuration/prices required; multiple regions/zones; deterministic root Ubuntu image; unsupported images/storage; fresh API specifications; known old allowlists do not restrict LightNode. Implement catalogue and readiness.
- [x] Write failing nullable-provider-pricing quote/create tests; update LightNode adapter and common quote whitelist/types without accepting unpriced DO/Vultr. Check real bandwidth-billed wire support or expose explicit technical incompatibility rather than admitting a broken workflow.
- [x] Write failing actual dashboard tests for unknown provider rates; update price rendering and types, preserve review/idempotency/confirmation and DO/Vultr pricing.
- [x] Run focused backend/UI checks, build, and fresh independent review. Update schema/API/design/deployment/runbook notes (no DDL required).
- [x] Remove private LightNode region/plan/budget/price prerequisites, transfer only this phase's checked delta to normal DEV, update isolated runner, verify real regional catalogues and unbillable quote. Preserve protected production resources; do not create a paid canary.

Workspace: existing isolated production-core-server-release checkout. Preserve all unrelated dirty release work. Use scoped compare-and-copy back to normal DEV, no broad Git staging/reset/commit or production deployment.
