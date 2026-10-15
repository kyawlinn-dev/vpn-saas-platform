# Messenger Account Menu Update

> Historical local audit/execution record. Scope clarified 2026-10-15: preserve the dated observations/results below; they do not certify the current production revision or constitute a fresh test run. Current production/development authority is listed in docs/DOCUMENTATION.md at repository root.

Owner-approved bounded update; Telegram UX, purchase/accounting policies and
production configuration are unchanged. No persistent servers were started.

Main menu is the exact NovaNet welcome with three stacked postback buttons:
Buy Package, My Account, Chat with Admin. My Account offers Get VPN Key,
Check Balance (remaining data and expiry), Back and Change Server for
Outline/Shadowsocks only. Its four actions use quick replies to respect
Messenger's three-button template limit. Chat with Admin sends only the agreed
plain text, without a Telegram link, additional buttons or handoff state.

Server choices reuse existing bot read helpers and `switchOrderServer`.
Selection validates tenant/order/key, offered choices, trial tier and live
capacity. Durable event checkpoints and a non-expiring atomic Redis guard
prevent same-event retries and fresh taps from repeating uncertain panel work.
Failure requires scoped operator reconciliation; no database migration is needed.

Timestamped postbacks derive a stable identity from Page/sender/time/payload to
support missing mids and distinguish separate button taps. Old MY_VPN/SUPPORT
actions remain compatible with messages already delivered.

Verification: 337 tests across all 40 backend test files passed; syntax and
whitespace checks passed. A focused review found a fresh-tap retry issue, which
was reproduced, fixed and re-reviewed with no remaining important findings.
Live Messenger rendering and real server switching remain owner-run tests;
this update made no panel calls and did not restart the owner's backend.
