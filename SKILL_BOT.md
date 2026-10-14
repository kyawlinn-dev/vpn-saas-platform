# SKILL_BOT.md — Current Telegram Bot

Reviewed: 2026-10-15. Scope: the production Telegram baseline. See docs/DOCUMENTATION.md for authority and docs/MESSENGER_LOCAL_SETUP.md for local channel work.

## Runtime and sources

One bot per configured reseller runs inside the backend PM2 process. manager.js loads encrypted workspace tokens, registers secret-authenticated webhooks and bot commands, and tracks runtime status. handlers.js implements commands/callbacks; strings.js owns Burmese copy. commandMenu.js owns the Telegram command menu. botCustomerService.js resolves reseller-scoped customer identities; botPurchaseService.js owns purchase read/adaptation helpers.

Webhook: POST /api/bot-webhook/:resellerId. Validate the Telegram secret before dispatch. Carry reseller_id through every customer/order/payment operation. Never log tokens, receipt URLs or access credentials.

## Customer navigation

Commands: /start, /app, /key, /balance, /buy, /help; /trial is advertised only when the workspace enables trials. The chat menu button opens the command list. /app and inline WebApp buttons open that reseller's Mini App. /start links the account and shows inline navigation; it does not automatically provision a trial. Legacy reply-keyboard labels remain recognized for existing chats.

Customer actions requiring an account must use the existing /start gate. Do not replace inline purchase callbacks with a deep-link-only buying flow.

## Purchases and package lifecycle

- New customers choose an app/protocol and plan, see the reseller's payment details, and upload a Telegram photo receipt.
- An initial customer purchase provisions access immediately, pending payment review.
- While an active paid purchase awaits review, another purchase is blocked with PURCHASE_UNDER_REVIEW.
- A confirmed active paid purchase can have one scheduled next purchase. Another queue is blocked with QUEUED_PACKAGE_EXISTS.
- Queued purchases retain the active protocol and receive no new key until the current package ends.
- Review uses the configured workspace admin's Telegram identity and the existing pay_ok/pay_no callbacks. Money is recorded per payment in order_payments.
- Confirming a queued purchase records its received money and commission immediately while access stays queued. The confirmed package starts automatically after the current package stops or expires, without another payment or revenue entry. Payment application means payment recording, not VPN activation.
- Stopped/expired renewal creates a new package period through the shared lifecycle. Preserve historical orders and payment records.

Use the existing lifecycle and provisioning services. Do not duplicate quota, activation, server capacity or accounting rules in a handler.

## Trial, quota and protocol

Trials require an explicit action and workspace eligibility. Trial data/duration/protocol come from admin-managed reseller_miniapps settings. Production Telegram eligibility uses its existing linked-account/trial history; the newer customer-wide claim RPCs are development-only.

Balance uses getOrderQuotaSnapshot: current-package usage across key history, adjusted by the order baseline and snapshotted allowance. A key's data_limit_bytes after a switch is its carried enforcement cap, not the full package allowance. Never refill quota on a server/protocol switch.

Current protocol comes from the active key. Shadowsocks uses an assigned server and customer ssconf access; VLESS uses the panel subscription and included nodes. Trial access stays on trial capacity. Paid new provisioning defaults to premium; paid manual switching can use eligible trial-tier capacity.

## Notifications

Production scheduling: jobs/customerNotificationsJob.js, services/notificationService.js, bot/notificationTemplates.js. The scheduled pass runs every 10 minutes after startup delay; usage sync runs hourly and checks warnings at 80% and exhaustion at 100%. Existing pause, deduplication and reminder cap rules apply. Notification scheduling/quiet-hour rules use Asia/Yangon; package expiry and accounting business boundaries use Asia/Bangkok. Do not silently change either policy during copy work.

Resellers can edit their notification templates through the dashboard; defaults live in notificationTemplates.js. Some Telegram callback review paths send immediately, while the production dashboard review path can rely on scheduled recovery. Do not promise that the newer immediate shared delivery service is already deployed.

## Development-only additions

The dirty development checkout adds purchaseService.js/submit_purchase, durable notification delivery, shared customer trial claims and Messenger adapters (migrations 0027–0036). Those replace some local adapter behavior but require a separately verified production release. Feature-flag off does not remove shared-caller migration dependencies.

No RAG chatbot is implemented in the production bot. Earlier RAG, reseller_events and deep-link purchase proposals are preserved in docs/archive/telegram-bot-v2-original-design.md; they are not current requirements.

## Validation and copy

Use backend/src/__tests__/ for mocked bot/queue/webhook/notification checks. Before starting a real backend, verify development env and bot credentials: startup registers webhooks and jobs. Do not test against production customers or run production deployments without an explicit request.

Current strings are in backend/src/bot/strings.js and notificationTemplates.js. BURMESE_TEXT.md is a generated source reference; historical copy-review documents are labelled snapshots.
