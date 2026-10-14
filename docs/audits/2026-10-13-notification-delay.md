# Payment Notification Delay Findings

> Historical local audit/execution record. Scope clarified 2026-10-15: preserve the dated observations/results below; they do not certify the current production revision or constitute a fresh test run. Current production/development authority is listed in docs/DOCUMENTATION.md at repository root.

The local customerNotificationsJob runs every 10 minutes after a 20-second
startup delay. No local 30-minute payment-review schedule was found.

Before this update, Telegram pay_ok/pay_no callbacks directly sent customer DMs,
but dashboard reviews only reached Telegram through scheduled payment scanning.
Messenger already had an immediate lifecycle hook. This adapter difference
explains a scheduled wait for dashboard approval, not the reported 30 minutes.
The running production revision and job logs were not inspected.

The new lifecycle hook dispatches both channels immediately after a successful
review. The scheduled path shares its durable delivery identity and cannot send
a second notification for the same reviewed payment. Explicit delivery failure,
reseller pause, and Messenger window restrictions remain distinct from scheduling.
