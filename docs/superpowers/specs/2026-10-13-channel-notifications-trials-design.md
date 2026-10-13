# Shared Channel Notifications And Messenger Trials

Status: design proposed for written review; implementation not started.

## Intent

NovaNet MM customers should receive consistent purchase and trial behavior
through Telegram, Mini App, and Messenger. Staff should receive every submitted
customer purchase in their configured Telegram admin chat. Business rules remain
shared; channel adapters handle identity, presentation, and delivery restrictions.

The user approved an explicit Start Free Trial button for Messenger. Merely
messaging the Page must not provision a trial. Ordinary Page-inbox conversations
remain silent unless the customer invokes an existing bot action.

## Existing Gaps

- Messenger checkout records orders but does not notify the Telegram admin.
- Telegram payment-review buttons send immediate customer messages; dashboard
  reviews rely on the scheduled Telegram notification pass.
- The local scheduled pass runs every 10 minutes. The reported 30-minute delay
  is not yet reproduced or explained; do not claim production matches local.
- Messenger payment-review delivery is already hooked into order lifecycle,
  with a 24-hour last-interaction guard.
- Scheduled trial, subscription, and usage notifications currently use Telegram
  identities only.
- Messenger customer names are generated placeholders; no profile lookup exists.
- Shared trial creation currently claims eligibility on telegram_links.

## Architecture

Extend existing purchase, lifecycle, notification, and trial boundaries rather
than implementing another channel-specific business service.

One notification orchestration boundary accepts business events and resolves
tenant-scoped recipients. Telegram and Messenger adapters render and deliver
them. The Telegram admin recipient is separate from customer recipients.

Use durable, backend-only notification delivery state for immediate events.
Identify deliveries by reseller, event, business record, channel, and recipient.
Concurrent callbacks, webhook retries, and scheduled recovery must share this
identity. Provider timeouts can have ambiguous outcomes: do not promise exactly
once delivery or blindly resend ambiguous attempts. Record failures, skip reasons,
and uncertain outcomes for operator diagnosis. Successful delivery must not be
resent. Bounded recovery handles proven retryable failures only.

## Admin Purchase Alerts

After purchase persistence, send the configured reseller Telegram admin the
customer display name, source channel, order identifier, plan, price, duration,
quota, queued status, and payment receipt. Preserve existing Confirm/Reject
callback formats and authorization checks.

Messenger and Mini App private receipt paths require signed storage URLs.
Telegram receipt file IDs are a separate adapter input, not storage paths.
Missing photos may fall back to a text alert with the review buttons; missing
admin configuration or failed delivery must remain visible to operators.
Notification failure never reverses a purchase or repeats VPN provisioning.

## Payment Results And Reminders

Successful confirm/reject transitions emit the same customer notification event,
whether initiated by Telegram or a dashboard. Remove overlapping adapter sends
only after the shared path is covered by regression tests. Payment results must
not wait for the periodic reminder pass or be suppressed by reminder daily caps.
Keep applicable reseller notification controls explicit rather than bypassing
them accidentally. Scheduled recovery uses the same delivery identity.

Reminder events include trial ending/expired, subscription expiring/expired, and
data warning/limit reached. Preserve existing event thresholds and reseller
template settings. Route only to verified linked channel identities; do not
infer or create a Telegram identity for Messenger customers. A customer with
multiple linked channels uses the originating order channel when known; legacy
orders retain their existing Telegram delivery rather than receiving broadcasts
on every linked channel.

Messenger delivery must follow verified current Meta permissions and response
window rules. Do not reuse human-agent tags for automated reminders. Outside an
allowed window, record the skip and keep current status available in My Account;
do not claim all proactive Telegram reminders have Messenger parity.

## Messenger Display Names

Use a backend Page-token profile lookup to retrieve the available account display
name, subject to verified Meta profile-access permissions. Store only the name
and minimal cache/provenance metadata needed to avoid requesting on every event.
Names are display names, not verified legal identity.

Replace generated placeholders for existing customers without recreating their
orders, identities, or keys. Do not overwrite staff-entered names. Permission
denial, malformed responses, and timeouts retain the fallback name and do not
block checkout, trials, or ordinary message processing. Escape names in Telegram
HTML output and keep all updates scoped by reseller and customer.

## Explicit Messenger Trial

Show Start Free Trial to an eligible customer when reseller trials are enabled.
Keep the existing three-button template limit: Buy Package, My Account, and
Start Free Trial for eligible new customers. Active Shadowsocks customers retain
Change Server instead. Eligibility is revalidated on the button action, not
trusted from a previously displayed menu.

Use the reseller-configured trial protocol, quota, duration, and trial-tier
capacity. Reuse shared trial order creation and provisioning rules. Repeated
taps, concurrent workers, and retries must not create additional trials or keys.
If provisioning is unavailable, communicate preparation/unavailability without
claiming a working key. Never grant premium services to a trial.

Move eligibility toward a tenant-scoped customer claim shared across channels.
Migrate existing Telegram trial-used history conservatively so previously used
trials do not become eligible again. Preserve rollback/recovery semantics for
failed order creation and distinguish them from ambiguous external provisioning.
Do not fabricate telegram_links for Messenger customers.

Account linking is outside this update. Separate unlinked Telegram and Messenger
accounts cannot reliably be recognized as the same person. The design guarantees
one trial per identified customer within a reseller, not one per physical person.

## Delivery Sequence

1. Audit paths and add baseline notification/trial regression tests.
2. Add shared admin purchase alert delivery and connect all purchase channels.
3. Centralize immediate payment results and deduplicated recovery.
4. Add permission-aware Messenger profile enrichment.
5. Generalize trial claims and connect the explicit Messenger trial button.
6. Connect channel-aware reminders, verify compatibility, and document rollout.

Each phase leaves existing channels usable. Schema changes are additive and
versioned. Update SCHEMA.md, SYSTEM_DESIGN.md, SKILL_API_CONTRACTS.md, and local
setup/rollout instructions alongside their owning changes.

## Verification And Boundaries

Test tenant isolation, simultaneous trial claims, preserved historical eligibility,
repeated reviews, purchase replay, receipt formats, failed/ambiguous notification
delivery, profile permission denial, manual-name preservation, expired Messenger
windows, quiet inbox behavior, and three-button menu limits. Run focused tests
per phase and the full backend suite before reporting completion.

Use development DB migrations first. Production inspection or deployment is not
authorized by this design. Do not start or stop the user's backend, dashboards,
or ngrok. Preserve ignored credentials and unrelated dirty work. Live VPN test
users, if needed later, must be clearly named and cleaned up; mock-backed tests
are the default. Never bypass subscription provisioning concurrency controls.

## Review Gate

Review this written design before creating the executable task plan. Following
approval, produce exact migration/service/adapter tasks and test cases, then
review that implementation plan before coding.
