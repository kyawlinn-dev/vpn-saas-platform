# Shared Notifications And Messenger Trials Implementation Plan

> Development implementation plan retained as a planning record. Stage reviewed 2026-10-15: local implementation has advanced beyond the original plan; consult the October 13 execution ledgers and docs/MESSENGER_LOCAL_SETUP.md from the repository root. Unchecked historical steps are not proof that production is missing a released feature, and old checked steps are not fresh test evidence.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Native execution is proposed and requires user confirmation.

**Goal:** Deliver shared purchase notifications and explicit Messenger trials without duplicating business rules or regressing existing channels.

**Architecture:** Extend existing lifecycle, notification, and trial services. Add durable notification delivery claims with channel adapters; generalize trial claims to reseller-scoped customers while preserving Telegram history. Messenger profile enrichment is nonfatal and separate from purchase/provisioning success.

**Tech Stack:** Node.js ES modules, Express, Supabase/PostgreSQL, Telegraf, Redis, Vitest; existing Meta Graph client.

**Spec:** `docs/superpowers/specs/2026-10-13-channel-notifications-trials-design.md` (approved by user).

**Execution Status:** Product code implemented locally with independent review
fixes. Full backend suite passes 396 tests. 0031-0036 are development-applied;
notification and trial DB audits each pass 8 checks. A read-only Meta name lookup
succeeds and audit fixtures are fully cleaned up. Manual channel walkthrough and
actual trial-key provisioning remain unperformed; production is untouched.
See docs/audits/2026-10-13-channel-notifications-execution.md.

## Global Constraints

- No production inspection, migration, deployment, or service start/stop.
- Development migrations only; never print credentials or modify ignored env files.
- Every tenant lookup/update includes reseller_id. Backend-only tables use RLS and service-role-only RPC execution.
- Do not fabricate Telegram links, recreate customers, or alter paid keys.
- Keep existing Telegram callback formats, trial history, reminder thresholds, and provisioning concurrency controls.
- Ordinary Page chat stays silent. Messenger templates have at most three buttons.
- No account linking, legal-name verification, or unrestricted Messenger reminder promise.
- Provider timeouts can be ambiguous; never promise exactly-once network delivery.

## Review Focus

1. Provider accepts a message but response times out: mark uncertain; do not automatically duplicate it.
2. Old Telegram trial history exists without a surviving order: eligibility must remain consumed.
3. Profile name was edited by staff after lookup began: optimistic name update must not overwrite it.
4. Approval succeeds but delivery fails: financial state remains committed and retry never re-confirms payment.
5. Two linked channels exist: notify the intended channel, not both by default.

## Execution Rules

Run tests from backend/. Write failing tests before product code in every task.
Keep changes reviewable per task and never stage unrelated existing work. Commit
only task-owned files after verification; pause if a migration needs user SQL
Editor application. Do not count unapplied SQL as verified behavior.

## Task 1: Durable Admin Purchase Alerts

**Files:**
- Create `backend/supabase/migrations/0031_notification_deliveries.sql`.
- Create `backend/src/services/notificationDeliveryService.js` and `backend/src/__tests__/notificationDelivery.test.js`.
- Modify `backend/src/services/notificationService.js`, `backend/src/messenger/handlers.js`, `backend/src/bot/handlers.js`, `backend/src/routes/public/resellerMiniappRoutes.js`, `SCHEMA.md`.
- Create `backend/src/__tests__/adminPurchaseNotifications.test.js`; extend Messenger and Mini App adapter tests.

**Interfaces:**
- Delivery service: `deliverOnce({ resellerId, eventType, recordId, channel, recipientId }, send)` -> `{ sent, reason, deliveryId }`.
- Notification service: `notifyPurchaseSubmitted({ resellerId, orderId, receipt })` -> delivery result; receipt is `{ kind: 'telegram_file', fileId }`, `{ kind: 'storage', path }`, or null.
- Call after successful shared purchase submission, including replay, using order ID for deduplication. Messenger invokes even when a checkpoint already contains its purchase result.

- [ ] Write tests: same identity concurrently sends at most once; tenant mismatch sends nothing; webhook replay retains one alert; send failure leaves order intact; receipt-kind adapters differ; captions escape names; configuration absence has explicit reason.
- [ ] Run `npx vitest run src/__tests__/notificationDelivery.test.js src/__tests__/adminPurchaseNotifications.test.js` and record expected failures before implementation.
- [ ] Add notification_deliveries with UUID ID, tenant/customer/order references where applicable, event_type, record_id, channel, recipient_id, status, owner_token, lease_until, attempt_count, next_attempt_at, provider_message_id, error_code, timestamps. Unique key: reseller/event/record/channel/recipient. Statuses: pending, sending, sent, retryable, uncertain, skipped. No token or receipt URL payload storage.
- [ ] Implement service-role claim/finish RPCs with owner fencing. Expired sending becomes uncertain, not reclaimable sending. Claims use a 60-second lease; failures proven not delivered retry at 30 seconds then 2 minutes, maximum three attempts. Successful provider responses retain message IDs; transport/JSON uncertainty is not automatically retried.
- [ ] Build alerts using existing resellerNotifyCaption and Confirm/Reject labels. Add source channel; retrieve scoped current customer/plan/payment/config. Sign private receipt URLs and fall back to text if signing fails. Verify Telegram HTTP/API result, not just fetch completion. Admin alerts are independent of customer-reminder pause/cap.
- [ ] Replace existing Telegram/Mini App admin sends and connect Messenger after purchase completion. Customer checkout success does not depend on delivery success.
- [ ] Run focused tests plus `npx vitest run src/__tests__/messengerFlow.test.js src/__tests__/miniappPurchaseAdapter.test.js src/__tests__/botQueuedPurchase.test.js`; review and commit task-owned files.

## Task 2: Immediate Customer Payment Results

**Files:**
- Modify `backend/src/services/orderLifecycleService.js`, `backend/src/services/notificationService.js`, `backend/src/messenger/purchaseNotifications.js`, `backend/src/messenger/client.js`, `backend/src/bot/handlers.js`, `backend/src/jobs/customerNotificationsJob.js`.
- Create `backend/src/__tests__/paymentNotificationDelivery.test.js`; extend `messengerReviewIntegration.test.js` and `messengerClient.test.js`.

**Interfaces:**
- `notifyPaymentReviewed({ resellerId, orderId, reviewStatus })` -> delivery result; reviewStatus is confirmed or rejected.
- `recoverNotificationDeliveries({ limit: 50 })` claims only pending/due retryable deliveries, never sent/uncertain.
- Meta send adapter returns provider message ID; callers not needing it remain compatible.

- [ ] Write tests: dashboard and Telegram approval both notify immediately; repeated review and scheduled passes do not resend; failed delivery leaves reviewed payment committed; pause skips customer notification explicitly; reminder cap does not delay payment results; outside-window Messenger is skipped.
- [ ] Run `npx vitest run src/__tests__/paymentNotificationDelivery.test.js src/__tests__/messengerReviewIntegration.test.js` and confirm failures.
- [ ] Replace Messenger-only lifecycle hooks with shared payment-reviewed notifications after committed state. Use order.source to choose customer channel: messenger -> Messenger, bot/miniapp -> Telegram; legacy unknown -> Telegram only. Resolve only same-tenant links and enforce Messenger Page binding.
- [ ] Remove overlapping Telegram callback customer DMs after shared path coverage. Keep admin caption update and review authorization. Move scheduled payment-event scanning onto the same delivery key; use notifications_sent historical entries to suppress already-delivered legacy events. Payment events retain reseller customer pause but bypass reminder daily cap.
- [ ] Add bounded recovery to existing notification job; do not change its 10-minute reminder interval. Record local path findings in `docs/audits/2026-10-13-notification-delay.md`; label observed 30-minute delay unverified without production evidence.
- [ ] Run focused tests and Task 1 adapter tests; review and commit task-owned files.

## Task 3: Nonfatal Messenger Display Names

**Files:**
- Create `backend/supabase/migrations/0032_messenger_profile_cache.sql`, `backend/src/messenger/profileService.js`, `backend/src/__tests__/messengerProfile.test.js`.
- Modify `backend/src/messenger/client.js`, `backend/src/messenger/handlers.js`, `SCHEMA.md`, `docs/MESSENGER_LOCAL_SETUP.md`.

**Interfaces:**
- `getMessengerProfile(config, senderId, fetchImpl)` -> `{ displayName } | null`; name only, no photo/email collection.
- `enrichMessengerCustomer({ scope, customerId }, options)` -> `{ updated, reason }`; errors do not propagate into checkout.

- [ ] Write tests for permission denial, timeout, malformed names, HTML escaping, existing placeholder replacement, manual-name preservation, cached lookup, and staff edit during fetch (compare-and-set prevents overwrite).
- [ ] Run `npx vitest run src/__tests__/messengerProfile.test.js` and confirm failures.
- [ ] Verify current official Meta profile endpoint/permissions for configured API version before coding request fields. If official docs remain inaccessible, preserve fallback behavior and document the verification blocker rather than guess fields.
- [ ] Add nullable profile_name, profile_checked_at, and profile_applied_name to messenger_links. Cache successful/failed attempts for 24 hours. Update vpn_customers only when full_name equals its exact generated placeholder or previous profile_applied_name; scope update and compare old value atomically. Do not update profile_applied_name when manual-name CAS fails.
- [ ] Call enrichment after scoped identity resolution; failure is logged with sanitized codes, no raw tokens or responses. Persist existing customer identity and key records unchanged.
- [ ] Run profile, client, and Messenger flow tests; update permission/setup docs, review and commit task-owned files.

## Task 4: Customer-Scoped Shared Trial Claims

**Files:**
- Create `backend/supabase/migrations/0033_customer_trial_claims.sql`, `backend/src/__tests__/trialClaims.test.js`, `backend/scripts/check-trial-claims-dev.mjs`.
- Modify `backend/src/services/trialService.js`, `backend/src/bot/handlers.js`, `backend/src/routes/public/resellerMiniappRoutes.js`, `SCHEMA.md`, `SYSTEM_DESIGN.md`.
- Extend `backend/src/__tests__/trialServicePolicy.test.js`.

**Interfaces:**
- Preserve `createTrialOrder({ customerId, resellerId, telegramLinkId?, telegramUsername?, source })` and existing result shape `{ order, plan, created }`.
- Add `getTrialEligibility({ customerId, resellerId })` -> `{ eligible, reason }`; active paid access blocks a fresh trial.
- Customer claim RPC owns claim/order creation atomically. Legacy Telegram link fields become compatibility projections, not the eligibility authority.

- [ ] Write tests for concurrent channels creating one order, used history without surviving order, inactive tenant/customer, paid customers, plan failure rollback, reseller ownership mismatch, and uncertain provisioning not creating a second order/key.
- [ ] Run `npx vitest run src/__tests__/trialClaims.test.js src/__tests__/trialServicePolicy.test.js` and confirm failures.
- [ ] Add customer_trial_claims keyed by reseller_id/customer_id with used_at and nullable order_id. Backfill consumed history from all non-null Telegram trial_used_at and existing trial orders, including expired history. Resolve duplicate historical orders deterministically without deleting records.
- [ ] Implement service-role atomic trial order RPC validating customer/reseller/link ownership and enabled trial settings. Use existing active trial plan selection and business-date calculation, applying configured trial duration/quota consistently through existing provisioning inputs. Failed order creation rolls back transaction; provisioning failure retains a recoverable order/claim.
- [ ] Adapt Telegram/Mini App callers without changing their UX or eligibility meaning. Audit provisionTrialKey concurrency before reusing: parallel callers must serialize via the established provisioning mechanism; uncertain external creation requires reconciliation, not another createKey call.
- [ ] Add dev-pinned transactional audit for migration backfill, simultaneous claims, isolation and rollback; apply SQL only to development, verify it, then run regression tests. Review and commit task-owned files.

## Task 5: Explicit Messenger Trial Button

**Files:**
- Modify `backend/src/messenger/handlers.js`, `backend/src/messenger/session.js`, `backend/src/__tests__/messengerFlow.test.js`, `SKILL_API_CONTRACTS.md`, `docs/MESSENGER_LOCAL_SETUP.md`.

**Interfaces:**
- Add START_TRIAL postback using shared getTrialEligibility/createTrialOrder/provisionTrialKey; no channel-specific order creation.
- Durable trial context: `{ trial: { customerId, orderId, phase } }`, phases created/provisioning/completed/uncertain; tenant and customer validated before resume.

- [ ] Write tests: eligible menu Buy Package/My Account/Start Free Trial; active SS menu Change Server instead; disabled/consumed/paid customers have no trial action; stale trial button revalidates; ordinary Hi does not provision; repeated taps/retry/session expiry do not duplicate access; unavailable capacity does not claim a working key.
- [ ] Run `npx vitest run src/__tests__/messengerFlow.test.js` and confirm new failures.
- [ ] Wire trial config and eligibility into home. Reuse reseller-configured protocol and safe trial-tier provisioning. Persist the created order checkpoint before external provisioning and recover the same order. Do not allow checkout Back or BUY to discard an in-flight trial with uncertain access creation.
- [ ] Send working key only after verified provisioning. Otherwise send preparation/support status and existing account navigation. Preserve silent inbox fallback and max-three-button output.
- [ ] Run flow, trial policy, purchase replay and server-switch regressions; update API/setup docs, review and commit task-owned files.

## Task 6: Channel-Aware Reminders And Final Verification

**Files:**
- Modify `backend/src/services/notificationService.js`, `backend/src/messenger/purchaseNotifications.js`, `backend/src/jobs/syncUsageJob.js`, `SCHEMA.md`, `SKILL_API_CONTRACTS.md`, `DEPLOYMENT.md`.
- Create `backend/src/__tests__/channelReminders.test.js`.

**Interfaces:**
- `notifyCustomerEvent({ resellerId, customerId, orderId, eventType, data })` -> delivery result, reusing Task 1 ledger and Task 2 routing.
- Preserve existing notifyDataLimitWarning/notifyDataLimitReached exports and scheduled runNotificationPass result shape.

- [ ] Write tests for Messenger-only customers, dual links selecting source channel, legacy Telegram behavior, same event dedup, reseller pause, reminder cap, custom templates, expired Messenger windows, and no human_agent tag usage.
- [ ] Run `npx vitest run src/__tests__/channelReminders.test.js` and confirm failures.
- [ ] Remove Telegram-only recipient filtering from event selection. Retain current eligibility thresholds and daily cap for reminders; count successful sends only. Render Messenger plain text/buttons without Telegram HTML or Mini App-only WebApp controls. Outside permitted window record skipped delivery and no API send.
- [ ] Verify current Meta automated-delivery restrictions against official docs and add tests enforcing permitted behavior; permission uncertainty defaults to no proactive send.
- [ ] Run `npm test` and `git diff --check`. Run dev DB audits after applied migrations; report counts and any unapplied/unverified gates explicitly. No live panel test is necessary unless mock/DB checks cannot establish provisioning behavior.
- [ ] Update deployment follow-up with ordered migrations 0031-0033, reconciliation procedure, and owner-run manual checks for admin receipt, dashboard review, profile name, explicit trial and reminders. Review final task-owned diff and commit.

## Plan Review

The spec is covered by Tasks 1-6. Review-focus cases are pinned respectively in
Tasks 1, 4, 3, 2, and 6. No production execution is included. Proposed execution:
native implementation in this session, focused verification per task, then an
independent final review. Wait for user approval of this plan and execution choice
before writing product code.
