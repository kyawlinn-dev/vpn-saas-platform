# Shared Purchases And NovaNet Messenger Design

> Stage reviewed 2026-10-15: implemented locally with development evidence in ../audits/2026-10-13-purchase-execution.md and related ledgers. The design below is not a production release claim; owner walkthrough/Meta/production gates remain separate.

## Purpose And Scope

Build the owner's NovaNet Messenger bot before resuming website work. The owner has confirmed the existing Page and successful local greeting test. Ordinary customers remain outside the development app's authorized roles until Meta review. All development uses the local runner and ngrok, never a production deployment.

The selected development workspace is `shadow-vpn`, reseller `e51b3a9f-dca4-450a-aeb4-147064420a88`. Page `1325509713970390` is mapped explicitly through `MESSENGER_RESELLER_ID`, never through customer input. The production reseller mapping must be verified separately at release.

Success means one shared purchase operation enforces business rules for Messenger and, gradually, existing Telegram, Mini App, and dashboard callers. An authorized Messenger tester can select a protocol and plan, receive payment instructions, submit an image, receive initial access or a queued-package confirmation, and retrieve their subscription later. Reviews appear in the existing reseller dashboard. Existing caller contracts and permissions remain compatible.

## Customer Experience

Use Burmese-first messages consistent with the Telegram bot and familiar VPN-app names. The owner selected a bot-first checkout rather than website accounts. Google/email login and the website are outside this phase.

1. A greeting or Get Started presents Buy Package, My VPN, and Support.
2. Buy checks existing purchase eligibility before displaying payment instructions. A pending-review active purchase or an existing scheduled package blocks another purchase with a clear status message.
3. First purchases choose Outline/Shadowsocks or Happ/Hiddify/VLESS, then an active non-trial plan. A queued extension preserves the active protocol. Plan buttons carry IDs only; current prices, limits, and validity are loaded from the backend.
4. Payment instructions show the selected package, current price, and configured payment methods inside Messenger. They include Cancel and return navigation. An expired conversation requires restarting selection before submitting a receipt; the bot never associates a random image with an order.
5. A receipt image triggers one purchase operation, with a processing message and deterministic retry behavior. Initial access is provisioned pending review, matching current business rules. An active confirmed purchase creates at most one scheduled package and leaves its key and remaining allowance untouched.
6. My VPN presents the active key using the actual key protocol, canonical package usage, inclusive expiry, review state, and queued package details. It is also the recovery route when a reply failed after an order was created.
7. Support opens the configured support contact. Unrecognized text receives navigation help without creating an order. Human support remains possible through the Page inbox.

The first purchase implementation excludes free trials, automatic server switching, cross-channel account linking, and proactive renewal campaigns. These are subsequent features after paid checkout is verified. No real money should be transferred during development; screenshots are test fixtures.

## Architecture

The owner selected gradual consolidation: audit purchases across Telegram, Mini App, and dashboards; extract one shared purchase operation with explicit caller rules; connect Messenger; migrate existing callers one at a time with regression tests. Do not implement a separate Messenger business service or restructure unrelated services.

All entry adapters authenticate the actor, establish reseller ownership, normalize inputs, and call the shared application operation. Telegram and Messenger also translate platform events into a common bot-action vocabulary and render platform-neutral responses. HTTP routes translate request bodies and retain existing response contracts. Conversation state and menus belong above the purchase operation; they do not belong in provisioning or accounting services.

The shared purchase operation owns live plan validation, eligibility, initial/queued/renewal decisions, price and commission snapshots, idempotency, order/payment creation, and coordination with existing lifecycle/provisioning services. Existing quota, payment-ledger, lifecycle, and provisioning services remain the source of truth. Do not fork provisioning or bypass its concurrency loop.

Shared inputs include authenticated actor context, reseller/customer IDs, plan ID, protocol, validated screenshot storage path, source channel, and idempotency key. Caller policy is derived from trusted server-side context, not a customer's supplied role, price, review status, or channel. Customers cannot mark payments confirmed. Staff actions keep their existing permissions and payment semantics; sharing services does not make all callers identical.

Proposed shared module: `backend/src/services/purchaseService.js`. Preserve `createBotPurchaseOrder` as a temporary compatibility wrapper when Telegram migrates. Do not add another customer-purchase service alongside it. Messenger retains only webhook, transport, identity, attachment, and conversation adapters. Messenger orders must be distinguishable from Telegram orders; do not silently use `source=bot` where existing filters assume Telegram.

Audit evidence, rather than a directory cleanup, determines what moves. Gradually extract common Telegram/Messenger conversation decisions where useful; do not require a complete shared bot engine before the first purchase integration works. Retain existing `backend/src/bot/` and `backend/src/messenger/` paths initially. Moving them into a new `channels/` tree is unnecessary for this milestone.

The detailed phases and review gates are in `docs/superpowers/plans/2026-10-13-shared-purchases-messenger.md`. That plan supersedes the earlier Messenger-only sequence, not the completed connection milestone.

## Identity And Data

Add an additive `messenger_links` identity table keyed uniquely by reseller, Page ID, and Page-scoped sender ID. Store Page/sender identifiers as text, not JavaScript numbers. Link it to the reseller-owned `vpn_customers` row through tenant-safe foreign keys. Use an atomic get-or-create operation so concurrent greetings cannot create duplicate customers.

Do not invent Telegram IDs or merge customers by display name. A Telegram customer who starts Messenger is a separate channel identity until explicit account-linking support exists. Request no phone numbers, email addresses, or profile permissions in this phase. A neutral customer label and Messenger identifier suffice for testing and order review.

Conversation state is isolated by channel, reseller, Page, and sender. Reuse the existing Redis pattern with a 10-minute inactivity expiry. Session cancellation deletes only that sender's Messenger state. The selected protocol and plan are validated again before order submission.

Add durable webhook receipt/delivery tracking before enabling purchases. Claim incoming message IDs atomically and persist the purchase/session association plus resulting order ID. Webhook retries and worker restarts resume or retrieve the original operation; they must not create another initial or queued order. Successful replies are separate from successful purchases. Use the existing transaction/RPC patterns for atomic database writes where needed; a non-atomic check followed by an order insert is insufficient.

Schema labels and dashboard filters require review: `customer_type` currently permits only normal/Telegram, and `source=bot` is treated as Telegram in some action routes. Choose explicit Messenger labels through a reviewed additive migration and update `SCHEMA.md`, contracts, and affected filters. Preserve manual-only restrictions for bot-managed customers without mislabeling them as Telegram.

## Webhook And Delivery

Keep the proven GET verification and raw-byte HMAC validation. Accept only the configured Page, discard echoes and receipt-only events, and reject unauthenticated requests before processing. Do not log tokens, bank details, message bodies, receipt URLs, or VPN access URLs.

Purchases require a durable accepted-event queue. Acknowledge only after enqueue succeeds, then process independently so provisioning does not exceed Meta's webhook timeout. Retry transient processing safely; terminal failures retain the operation result and give the tester a recovery message. Signature validation failures do not enter the queue.

Read current supported Meta documentation during implementation for message payload limits and attachment-host behavior. Validate and bound attachment downloads: HTTPS, approved Meta media hosts based on observed attachments, checked redirects, timeout, byte limit, and verified supported image MIME/type. Never fetch arbitrary customer-supplied URLs or internal-network addresses. Upload receipts to private Supabase screenshot storage using channel/reseller paths.

Messenger's standard response window limits delayed automation. Persist last user interaction and check eligibility before attempting review-status messages. Do not apply a Human Agent tag to automated replies or promise unrestricted scheduled notifications. My VPN remains available when the customer reopens the conversation; dashboard review is authoritative even when outbound notification is ineligible.

## Owner Review

Initial version uses the existing reseller dashboard for receipt review, confirmation, and rejection. Include a Messenger source label and sufficient customer/order context to identify the purchaser. Reuse existing confirmation/rejection services and their access consequences.

Route eligible confirmation/rejection responses through Messenger identity lookup rather than the Telegram-only lookup. A failed or disallowed outbound notification must not undo a completed review or duplicate accounting. Owner Telegram notifications may be added through the existing runtime after the core flow works; they are not required for the initial Messenger purchase acceptance.

## Local Development And Release

The connection-only runner currently imports no database or jobs. Introduce an explicit purchase-development mode only after the development migration and workspace verification. Keep greeting-only mode available. The runner must not start production jobs or re-register Telegram bots.

The local database is separate, but its VPN panel is shared with production. The owner explicitly authorizes creating development VPN users on the live panel. Automated tests mock panel calls; deliberate end-to-end tests may provision clearly identifiable development users through the normal services. Record created resources and clean up only test-owned users/keys afterward. Existing production customers and server/service assignments must remain untouched. Live test permission does not authorize deploying code or database migrations to production.

No migration, app publication, or production deployment is included in this design-writing phase. Meta App Review and approved permissions must be completed before public customer automation. Tunnel lifetime and local process uptime limit development availability.

## Acceptance And Delivery Phases

1. Read-only purchase audit and characterization tests across Telegram, Mini App, reseller dashboard, and relevant admin routes. Produce a behavior matrix and exact extraction boundaries before implementation.
2. Extract and verify the shared purchase operation. Preserve trusted caller distinctions and existing API contracts. Do not switch all callers at once.
3. Connect Messenger to the operation, including menu/protocol/plan selection, identity mapping, durable receipts, payment instructions, screenshots, key retrieval, queued status, and dashboard review.
4. Migrate Telegram, then Mini App, then dashboard callers individually where the audit confirms equivalent semantics. Keep compatibility wrappers until callers and tests prove they can be removed. Leave distinct staff-only operations intact.
5. Authorized local end-to-end walkthrough using the selected development workspace and clearly identified live-panel test users. Record cleanup and prepare Meta review evidence. Production release remains separate.

Verification must include two simultaneous deliveries of the same receipt, a crash/retry between order creation and key delivery, a purchase while another is under review, a second queued purchase, expired sessions, and failure to send a post-review message after the response window. Each outcome must preserve one purchase, correct ledger totals, the current active key, and reseller ownership.

## Review Status

Revised for the owner's review after selecting shared purchase services across entry points. Local workspace, the working Messenger connection, and live-panel test-user permission are confirmed. Free trials and cross-channel linking remain deferred. The full purchase audit is the first planned phase, not a completed claim. No purchase code or database migration has been applied.
