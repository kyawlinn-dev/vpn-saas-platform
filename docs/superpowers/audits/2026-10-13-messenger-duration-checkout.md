# Messenger Duration Checkout

> Historical local audit/execution record. Scope clarified 2026-10-15: preserve the dated observations/results below; they do not certify the current production revision or constitute a fresh test run. Current production/development authority is listed in docs/DOCUMENTATION.md at repository root.

Approved bounded UX revision. The development catalogue was read without writes:
three paid 30-day plans and three paid 90-day plans, matching the owner's design.

- Main menu: Buy Package, My Account, plus Change Server for active Shadowsocks.
  Live Chat is removed. Account actions: Get VPN Key, Check Balance, Back.
- All regular controls use inline button templates. Shared presentation handles
  template limits and keeps long payment/key text in plain messages when needed.
- Initial checkout: app -> duration -> three filtered plans -> payment -> receipt.
  Queued checkout skips app selection and preserves the active protocol.
- Back traverses those stages; a locked queued protocol cannot be changed.
- Cancel Purchase is the sole quick-reply exception. It is request-scoped and
  only clears an unfinished checkout, followed by one Main Menu inline button.
  A submitted/retrying purchase remains intact. No order/subscription is deleted.
- Read-side plan data, shared purchase rules and switch concurrency guards are
  reused unchanged. No schema migration or production deployment is required.

New regression tests cover duration grouping, backwards navigation, cancellation
identity/confirmation, submitted-order protection, inline notifications and long
key URLs. No persistent services were started or restarted; live rendering is an
owner-run follow-up. Final verification/review evidence is recorded below.

Final review identified server-picker navigation overwriting an in-flight queued
purchase. A failing regression reproduced the lost command, then passed after
the early submitted-purchase guard. Focused re-review found no remaining issue.
Final full backend suite: 345 tests across 40 files passed. Syntax and whitespace
checks passed. Live rendering is not asserted by these mock-backed tests.

Subsequent owner revision: removed Cancel Purchase, its quick reply, confirmation
and extra purchase-progress message. Back is the sole checkout navigation;
historical Cancel payloads no longer clear draft or in-flight session state.
The revised regression tests preserve receipt/order protections and verify there
are no quick replies throughout checkout. No persistent services were restarted.
