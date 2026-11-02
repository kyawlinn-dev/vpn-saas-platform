# LightNode Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Implement task-by-task, with test-first changes and a fresh final reviewer.

**Goal:** Integrate LightNode into NovaNet's existing complete server lifecycle and configure its DEV prerequisites.

**Architecture:** Provider-specific transport, catalogue, pricing and asynchronous receipt handling feed the existing worker. A separate first-contact bootstrap establishes pinned SSH; all subsequent node configuration, publication and customer migration reuse the common workflow.

**Tech Stack:** Node ESM, ssh2, Vitest, PostgreSQL/Supabase, React/TypeScript.

**Spec:** docs/superpowers/specs/2026-11-01-lightnode-automation.md

## Global Constraints

- Owner starts local services and performs paid acceptance; this work does not authorize another billable VPS or production deployment.
- Existing shared production nodes, services, receipts and protected DEV mirrors remain protected.
- Never issue a second create after an ambiguous submission.
- Both dual and VLESS-only profiles use the environment's existing global VLESS service. Only dual nodes create an SS service.
- Never log bootstrap secrets or return them through the admin API.
- Preserve unrelated dirty release work. No broad staging/reset or production deployment.

## Review Focus

1. Async response lost after provider commit: block duplicate submission even when inventory is temporarily empty.
2. Password/key bootstrap interruption: resume with the same pinned identity and key, never recreate/reset a node.
3. Changed price/token/anchor: reject stale approval before spending or deletion.
4. Shared production resource or recycled ID: registry scope/protection still wins over provider inventory/name.
5. DO/Vultr-only configuration: LightNode absence must not disable existing providers or change host-key verification.

### Task 1: Authenticated transport and dynamic catalogue

**Files:** new providers/lightnodeTransport.js, providers/lightnodeCatalog.js; providers/liveTransport.js verification integration if needed; tests/lightnodeCatalog.test.js, lightnodeTransport.test.js.
**Interfaces:** connectLightNodeTransport({token,expectedAccountId,connection,fetchImpl,timeoutMs}) -> {provider:'lightnode',accountId,request}; connection holds backend attestation/credential fingerprint and immutable anchor. isVerifiedLightNodeTransport(transport) is private WeakSet-backed evidence. createLightNodeCatalog({transport,config,clock}) -> {get,list,getQuote,listRegions,listPlans,assertSelection,resolveMachine,inspect}. Reuse normalized catalogue DTO and signed quote inputs. Machine resolves exact region/zone/image from verified config and API inventory.
- [x] Write tests: fixed origin/x-open-token/no redirects, account binding and changed anchor, 200/202 reads, pagination and malformed data, unknown/stale price unavailable, precise operator source and hourly estimate, unknown region/image unavailable.
- [x] Run failing tests; implement against official contract exports (no guessed fields).
- [x] Pass focused tests and preserve existing provider transport/catalogue tests.

### Task 2: Durable asynchronous lifecycle adapter

**Files:** new providers/lightnode.js; tests/lightnodeProvider.test.js.
**Interfaces:** createLightNodeProvider({context,transport,catalog,machine,store}) -> existing quote/create/reconcileCreate/find/inspect/delete/inspectBillableAttachments methods. store.readState/saveState are encrypted fenced CAS checkpoints. Persist create intent before POST and task UUID/resource UUID immediately afterward. Response loss without durable UUID is uncertain and cannot resubmit. Pending tasks expose PROVIDER_RESOURCE_PENDING. Delete requires independent scoped registry ownership, current identity, authorized exact delete scope, task checkpoint and read-back absence.
- [x] Write tests for create/task pending/success/failure, lost response, CAS failure, changed quote, protected ID/IP, wrong scope and async deletion with exact ID.
- [x] Run RED; implement adapter without changing DO/Vultr providerCore semantics.
- [x] Run focused tests, existing infrastructure provider/ownership tests.

### Task 3: Recoverable first-contact bootstrap

**Files:** new lightnodeBootstrap.js; liveSsh.js factored bounded SSH connection reuse; tests/lightnodeBootstrap.test.js.
**Interfaces:** makeLightNodeBootstrap() returns encrypted-state-only temporary password; establishLightNodeSsh({context,operation,resource,bootstrap,store,privateKey,publicKey,renewLease,sessionFactory}) -> fingerprint evidence. First contact explicitly TOFU, checkpoint fingerprint before password auth, key install then pinned key-auth verification, password disable and verified effective sshd settings. Only fresh LightNode operation-owned identity is accepted. No changes to DO/Vultr strict factory defaults.
- [x] Test interruption at fingerprint persistence, key install and hardening; host-key mismatch, protected source, unsafe password/commands and secret redaction.
- [x] RED then implement; pass SSH/node adapter regressions.

### Task 4: Runtime and common workflow wiring

**Files:** liveRuntime.js, liveRuntimeVerification.js, liveOperationAdapters.js, liveStore.js, operations.js, runnerProtocol.js, runnerSshTransport.js, runnerReadiness.js, serverDisplay.js as needed; new tests/lightnodeRuntime.test.js.
**Interfaces:** existing runtime providerReadiness/getCatalog/getQuote remains compatible. LightNode optional and isolated; use catalog.assertSelection/resolveMachine, bootstrap callback before configureCandidate, establish fingerprint before registry registration. Existing receipt pin comes from LightNode saved evidence rather than fabricated cloud-init fingerprint. Display metadata comes from real region catalogue.
- [x] Test LightNode add/replace profiles through shared adapter, absent LightNode preserving DO/Vultr, protected existing nodes, global VLESS reuse and no VLESS-only SS service.
- [x] RED then wire; run complete relevant infrastructure tests once.

### Task 5: SQL, admin UI and documented contracts

**Files:** migration 0062_lightnode_infrastructure.sql (0059 reserved Announcements, 0060/0061 reserved core release), SCHEMA.md, SYSTEM_DESIGN.md, DEPLOYMENT.md, SKILL_API_CONTRACTS.md; admin-dashboard/src/features/serverOperations/* and associated tests.
**Interfaces:** extend provider checks only where lifecycle owns resources; private runtime binding provider_accounts remains operator-scoped. No adoption of protected production Tokyo #3. Optional billing fields in quote/catalogue DTO are whitelisted end-to-end. UI labels show LightNode and operator-verified hourly estimate accurately; unavailable prices/reasons are readable.
- [x] Test actual migration constraints/RPCs in in-memory PostgreSQL, preserving old provider rows; test runner/API and UI DTOs and disabled states.
- [x] RED then implement additive SQL/UI changes; backend tests plus admin build.

### Task 6: DEV setup and independent final review

**Files:** private ignored operator config, docs/runbooks/lightnode-automation.md, .superpowers/sdd/2026-11-01-lightnode-automation/progress.md.
- [x] Bind existing LightNode token/immutable anchor read-only, store owner-attested connection identity and Tokyo price in private DEV config, protect existing resources.
- [x] Apply reviewed migration and scoped DEV binding directly using working DEV_DATABASE_URL; verify no production rows/config changes.
- [x] Install verified feature source/config into standalone DEV runner only, preserving its service/environment isolation. Do not start owner-local services or create any paid VPS.
- [x] Fresh reviewer checks complete delta, fix actionable findings, rerun meaningful checks.
- [x] Report source/config/test evidence and exact owner manual Add/Replace/Retire acceptance steps; distinguish offline evidence from real paid acceptance.

## Integration note

The current checkout contains pre-existing paused release changes. Track only this phase's file deltas; defer commits that would accidentally include unrelated work. The owner will test through the normal DEV checkout, so transfer the verified scoped changes there with conflict checks before runner setup. Website, Messenger and Announcements are outside this plan.

## Delivery evidence — 2026-11-01

All implementation/setup tasks complete. Normal DEV source and isolated runner updated; all three provider readiness checks pass. DEV migration 0062 applied directly with existing provider accounts and server rows preserved. Verified 723 backend tests, 68 dashboard tests, eight SQL-engine checks, admin build and two actual isolated Linux UFW profiles. Final independent review found no remaining actionable code issues after fixes. Real authenticated quotes for both LightNode profiles passed with no creation operation. New billable VPS acceptance and production deployment remain outside this setup delivery.
