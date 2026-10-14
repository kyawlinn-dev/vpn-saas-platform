# Messenger Connection Implementation Plan

> Development implementation plan retained as a planning record. Stage reviewed 2026-10-15: local implementation has advanced beyond the original plan; consult the October 13 execution ledgers and docs/MESSENGER_LOCAL_SETUP.md from the repository root. Unchecked historical steps are not proof that production is missing a released feature, and old checked steps are not fresh test evidence.

**Goal:** Verify Messenger connectivity for the owner's NovaNet Page through a local HTTPS tunnel.

**Architecture:** An Express router owns raw-body signature validation, callback verification, and a fixed greeting. A standalone runner hosts only this router on loopback port 3010, without database access, Telegram startup, or jobs. Production is not deployed.

**Tech Stack:** Existing Express, Node crypto/fetch, Vitest, installed ngrok.

**Approved scope:** The connection milestone approved in this chat: local development only, callback verification, signed messages, test greeting, authorized-account test. Purchases and public release are deferred.

## Tasks

- [x] Add HTTP tests for verification, exact raw-body signatures, wrong Page IDs, echoes, duplicate delivery, concurrent delivery, and failed reply retry.
- [x] Implement `createMessengerWebhookRouter({ config, sendMessage, log })` and the timeout-bound Meta reply client.
- [x] Mount the router before the main JSON parser; keep it disabled when credentials are absent. Hide verification query values from access logging.
- [x] Add a standalone development runner and credential-validation script; document API and setup.
- [x] Generate an ignored local verification secret, run focused/regression tests, start the local runner, and check local verification.
- [x] Start ngrok and check public verification (user launched the tunnel; public health and exact challenge verified with HTTP 200).
- [x] Register only the development callback and Page message/postback subscriptions through Meta APIs when supported by the token; otherwise provide exact dashboard fields.
- [x] Authorized Facebook-account greeting test confirmed by the owner: the Messenger reply arrived.

## Constraints And Verification

Secrets stay in ignored `backend/.env.local`. Only the configured Page is accepted. Never send replies to synthetic test IDs through the live API. Use injected send functions in automated tests. In-memory duplicate protection lasts only while the development runner is running; durable delivery processing belongs to the purchase milestone.

No production deployment, purchases, database migrations, or Page profile/menu changes in this milestone. Existing unrelated worktree edits are preserved. Changes remain reviewable and uncommitted.

## Execution Record

Token inspection confirmed a valid PAGE token for the configured app and Page with `pages_messaging`. HTTP tests: 13 passed; reply-client tests: 3 passed. Full backend regression suite: 208 tests across 33 files passed. `git diff --check` and Node syntax checks passed. Local runner verified at `127.0.0.1:3010`; verification returned the exact challenge (200), unsigned POST returned 403. No live replies were sent and no Meta settings were changed. Public callback registration and an authorized-account greeting remain pending.

Follow-up: the user supplied the local ngrok origin `https://beulah-nonfactious-after.ngrok-free.dev`. Public `/health` and callback challenge checks both passed. Initial app subscription list was empty. Graph API registered `/api/messenger/webhook` and subscribed the configured Page to `messages,messaging_postbacks`, both returning HTTP 200 and `success:true`. App subscription readback confirmed the active callback and both fields. Page subscription listing returned 403 with the existing token, so it cannot independently confirm the successful Page write; actual Messenger delivery remains the end-to-end check. No production backend deployment occurred.
