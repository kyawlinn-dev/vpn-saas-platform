# Shared Purchases And Messenger Implementation Plan

> Development implementation plan retained as a planning record. Stage reviewed 2026-10-15: local implementation has advanced beyond the original plan; consult the October 13 execution ledgers and docs/MESSENGER_LOCAL_SETUP.md from the repository root. Unchecked historical steps are not proof that production is missing a released feature, and old checked steps are not fresh test evidence.

> **For agentic workers:** Use superpowers:executing-plans for inline execution or superpowers:subagent-driven-development when that execution method is selected. Follow each phase's tests and review gates.

**Status:** Draft for owner review. This turn updates planning documents only. Do not begin purchase implementation or migrations until the owner orders the next phase.

**Goal:** Consolidate duplicated purchase orchestration into one shared operation, integrate Messenger, and migrate existing callers gradually without changing their permissions or business behavior.

**Architecture:** Channel adapters and HTTP routes translate authenticated input into the same application purchase command. One purchase service coordinates existing order lifecycle, payment accounting, and provisioning. Bot conversation presentation remains outside that operation.

**Tech Stack:** Existing Express/Node, Supabase/Postgres RPCs, Redis conversation state, Vitest, Telegram API, Meta Graph API, local ngrok.

**Spec:** `docs/superpowers/specs/2026-10-13-messenger-purchases-design.md`.

## Boundaries

- Use `shadow-vpn` reseller `e51b3a9f-dca4-450a-aeb4-147064420a88` for local development. Messenger Page binding comes from trusted backend configuration.
- Local development and authorized Meta test accounts only. Website work remains paused.
- The owner permits clearly identifiable test VPN users on the live panel. Record and clean up those resources; no unrelated panel mutations.
- Production deployment, production migrations, Meta publication, global folder restructuring, free trials, and automatic Telegram/Messenger account linking are outside this plan.
- Preserve immediate initial access pending screenshot review; one queued next package; active protocol on queued purchase; canonical quota/accounting; existing caller-specific staff permissions.
- Existing provisioning concurrency must remain intact. Secrets remain ignored. Every customer/order query is reseller-scoped.

## Target Responsibilities

| Component | Owns | Does Not Own |
|---|---|---|
| Telegram/Messenger adapter | Request verification, platform identity, event normalization, attachments, response rendering | Prices, payment approval, provisioning decisions |
| Shared bot flow where extracted | Menu actions, conversation progression, platform-neutral responses | Database transactions or VPN API operations |
| Mini App/dashboard route | Authentication, authorization, input normalization, existing HTTP response shape | A separate purchase algorithm |
| `services/purchaseService.js` | Purchase validation, eligibility, mode, snapshots, idempotency, coordination | Messenger buttons or Telegram file downloads |
| Existing lifecycle/ledger/provisioning/quota services | Their current domain operations | Channel presentation |

The purchase service is the only new application business boundary. Its name/signature can be refined by audit, but no parallel Messenger purchase service is introduced. Avoid relocating existing modules solely for appearance.

## Phase 1: Audit And Pin Existing Behavior

**Read:**
- `backend/src/bot/botPurchaseService.js` and purchase handlers in `backend/src/bot/handlers.js`.
- `POST /:slug/orders` in `backend/src/routes/public/resellerMiniappRoutes.js`.
- Order creation in `backend/src/routes/reseller/resellerOrdersRouter.js`.
- `backend/src/routes/reseller/orderActionRoutes.js` and relevant admin order routes.
- `backend/src/services/orderLifecycleService.js`, `paymentLedgerService.js`, purchase queue policies, and purchase RPC migrations.
- Corresponding bot, Mini App, reseller, admin, accounting, and quota tests.

- [ ] Create `docs/superpowers/audits/2026-10-13-purchase-entry-points.md` with one row per operation/caller: identity/tenant checks, plan eligibility, allowed mode, protocol, price/commission, receipt validation, review/payment status, transaction boundary, duplicate protection, activation, response, notification, compensation.
- [ ] Distinguish initial purchases, queued purchases, and renewals from staff-only activation, extension, and adjustment operations. Do not force these into one generic action just because they share tables.
- [ ] Identify code duplication and behavioral differences, giving file/function references and whether each difference is intentional, unknown, or a confirmed bug.
- [ ] Add focused characterization tests where current contracts are not already covered. Existing behavior changes require an explicit design decision; do not silently fix unrelated bugs during extraction.
- [ ] Report an exact extraction map, shared command/result contract, policy matrix, and schema/RPC requirements for review.

**Exit:** Each caller's behavior is evidenced; intentional differences and unresolved business decisions are visible. No production changes.

## Phase 2: Extract One Shared Purchase Operation

**Candidate files:** Create `backend/src/services/purchaseService.js` and focused tests under `backend/src/__tests__/`. Reuse existing lifecycle/ledger/provisioning/policy modules. Add a versioned migration only if the audited transaction/idempotency contract requires one.

- [ ] Write failing tests for tenant ownership, inactive/missing plans, untrusted client prices/statuses, initial/queued/renewal modes, locked active protocol, pending review, existing queue, and caller policy boundaries.
- [ ] Implement the normalized purchase command using server-derived actor/channel context. Return structured order/payment/access/queue state without presentation strings.
- [ ] Make order/payment creation and idempotency durable using existing transaction/RPC patterns. Test concurrent initial requests, concurrent queued requests, and retries after partial failure. A completed purchase remains completed when message delivery fails.
- [ ] Coordinate external panel provisioning through existing services and preserve their retry/reservation behavior. Record recovery state instead of inserting another order on retry.
- [ ] Update `SCHEMA.md` and `SKILL_API_CONTRACTS.md` for changes actually made. Run relevant service tests before routing any real caller to the new operation.

**Exit:** A directly tested shared operation exists; caller migration can be reviewed independently. Existing entry points remain operational.

## Phase 3: Connect Messenger

**Files:** Extend `backend/src/messenger/` and the standalone local runner. Add only necessary identity/event/session persistence. Review source labels and existing dashboard filters.

- [ ] Implement atomic Messenger customer mapping scoped by reseller/Page/sender, without merging Telegram identities.
- [ ] Normalize messages/postbacks into shared actions. Implement Buy Package, My VPN, Support, protocol/plan selection, cancel/back, and expired-session recovery. Extract common bot-flow decisions where useful without moving the whole Telegram handler first.
- [ ] Store accepted webhook events durably before acknowledging them. Process with recoverable ownership/leases and idempotency so a worker crash cannot duplicate purchases.
- [ ] Validate and download receipt images safely, store them privately, and pass the validated storage path to the shared purchase operation.
- [ ] Render initial keys or queued confirmation, then expose authoritative subscription usage/expiry and order review state through My VPN.
- [ ] Support existing dashboard confirmation/rejection; make customer status replies Messenger-aware and compliant with the response window. Delayed delivery must not roll back review/accounting.
- [ ] Test authorized-user purchase journeys locally, including a clearly named live-panel development VPN user. Record all created resources and cleanup.

**Exit:** Messenger completes a purchase through the shared operation; no public customer automation or production deployment.

## Phase 4: Migrate Existing Entry Points Individually

### 4A. Telegram

- [ ] Convert `createBotPurchaseOrder` to a compatibility wrapper around the shared operation.
- [ ] Preserve commands, inline buttons, protocol choice, screenshot flow, owner notifications, and HTTP/webhook behavior.
- [ ] Run bot purchase/queue/menu tests and shared accounting/provisioning tests; verify error codes expected by handlers.

### 4B. Mini App

- [ ] Replace only audited purchase orchestration with the shared operation; retain Telegram init-data authentication, receipt ownership validation, and HTTP response shape.
- [ ] Verify initial checkout, queued checkout, review blocking, protocol choice, canonical quota, and frontend expectations.

### 4C. Dashboards

- [ ] Migrate reseller purchase creation first; migrate relevant admin callers only where the audit shows a matching operation.
- [ ] Preserve staff permissions, manual payments, commission policies, chosen-server behavior, and deliberate differences from customer checkout.
- [ ] Keep confirmation/rejection/adjustment operations in their existing domain service where already shared. Remove duplicate code only after the migrated caller and tests pass.

**Exit:** Each migrated entry point has equivalent observable behavior and regression evidence. A failing phase stops later migrations until repaired; it does not justify rewriting another caller.

## Phase 5: Review And Release Preparation

- [ ] Review the complete change for duplicate business logic, accidental privilege escalation, partial writes, source-label regressions, sensitive logging, and channel response differences.
- [ ] Run the final relevant backend suite and frontend checks when an API contract or dashboard behavior changed. Record evidence rather than relying on earlier runs.
- [ ] Complete the authorized Messenger walkthrough and cleanup only test-owned panel resources.
- [ ] Prepare Meta review evidence and a production rollout/rollback checklist with explicit reseller mapping. Production execution requires a separate order.

## Highest-Risk Cases

1. Two simultaneous receipt deliveries must produce one purchase, one payment record, and one access result.
2. A panel timeout or process restart must resume/recover the existing operation rather than charge or provision twice.
3. Customer input cannot claim staff permissions, another tenant, confirmed payment, or arbitrary pricing.
4. A queued purchase cannot reset the current key's quota or change its active protocol.
5. A completed review/purchase remains correct even when Messenger cannot send a reply.

## Review Order

Execution update: the owner subsequently authorized all phases. Implementation
and verification evidence, decisions and remaining external walkthrough gates
are recorded in `../audits/2026-10-13-purchase-execution.md`. The original checklist
below remains the planned contract, not a claim that Meta publishing is complete.

Owner reviews this revised design/plan first. The recommended next order is **Phase 1 only: audit and characterization tests**. Review the audit's concrete extraction contract before Phase 2. Later phases proceed in the listed sequence, with verification after each caller migration. This is a staged plan; Phase 1 determines exact implementation details rather than pretending the full audit is already complete.
