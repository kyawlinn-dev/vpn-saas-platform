# Messenger Local Development

The local runner supports connection-only mode and the shared purchase prototype.
The Messenger/shared-purchase changes have not been deployed to the existing production backend, and Meta publishing is a separate owner-controlled step. This guide is for development only.

## Local Configuration

### Combined Local Testing

For Telegram, Messenger, dashboards and Mini App together, use the normal
backend on port 3000 instead of the isolated Messenger runner. Do not run both
Messenger workers. Start the Mini App on 5173 and dashboards on 3001/3002;
the backend's development proxy serves the Mini App through the same tunnel.

Keep these values in ignored `backend/.env.local`:

```dotenv
PORT=3000
NODE_ENV=development
DEV_MINIAPP_PROXY_TARGET=http://localhost:5173
WEBHOOK_BASE_URL=https://your-development-tunnel
TELEGRAM_MINIAPP_URL=https://your-development-tunnel
PUBLIC_SUBSCRIPTION_BASE_URL=https://your-development-tunnel
MESSENGER_PURCHASES_ENABLED=true
```

Run the backend with `npm run dev`, then tunnel with
`ngrok http http://127.0.0.1:3000 --inspect=false`. Meta's callback uses
`/api/messenger/webhook`; Telegram callbacks use `/api/bot-webhook/:resellerId`.
Use only development Telegram tokens: startup registers their webhooks and
starts development database jobs. Dashboard API bases use
`http://localhost:3000/api`; Mini App API base uses the tunnel origin plus `/api`.
No production deployment is involved. Isolated mode below remains available
when deliberately testing Messenger without Telegram or scheduled jobs.

Set the following in ignored `backend/.env.local`:

```dotenv
META_APP_ID=1658756948976371
META_APP_SECRET=<Meta App Secret>
MESSENGER_PAGE_ID=1325509713970390
MESSENGER_PAGE_ACCESS_TOKEN=<Page token>
MESSENGER_VERIFY_TOKEN=<locally generated secret>
META_GRAPH_API_VERSION=v25.0
MESSENGER_DEV_PORT=3010
MESSENGER_RESELLER_ID=<development shadow-vpn reseller UUID>
MESSENGER_PURCHASES_ENABLED=false
```

From `backend/`, run `npm run check:messenger` and `npm run dev:messenger`.
The standalone runner binds `127.0.0.1:3010`. It starts no scheduled jobs or
Telegram manager. `/health` reports whether purchase mode is enabled, without secrets.

Expose it with `ngrok http http://127.0.0.1:3010`. Set Meta's callback to the resulting HTTPS origin plus `/api/messenger/webhook`, and use `MESSENGER_VERIFY_TOKEN` for verification. The verification token is a secret we choose; it is not a Meta access token.

Subscribe the Page to `messages` and `messaging_postbacks`. Keep client certificates off for this standard signed-webhook setup. Development participants need the app roles shown in the Meta dashboard; ordinary customers are not enabled by this test.

Send `Hi`, `Hello`, or `Start` from an authorized account. The expected reply identifies NovaNet MM and says that purchases are not available in this development test. Other text and payment screenshots are ignored. Do not submit real payments to the prototype.

The Meta token currently has `pages_messaging` and `public_profile`. Additional permission may be needed to manage Page subscriptions through Graph API; use the dashboard when the token cannot do it. Request only permissions needed for the integration.

## Limitations

### Purchase Mode

Apply migrations 0027 and 0028, plus subsequent Messenger compatibility migrations,
to the development project only. Run `node scripts/check-shared-purchases-dev.mjs`
before setting `MESSENGER_PURCHASES_ENABLED=true` and restarting the runner. Startup
validates the reseller binding and persistence prerequisites. Use development
Supabase and Redis; never paste credentials into chat or commit them.

The flow is Buy Package -> protocol -> 30/90-day duration -> three matching plans
-> payment information -> receipt -> pending-review access (or queued purchase).
Queued purchases keep the active protocol locked. My Account has inline Get VPN
Key, Check Balance (data/expiry) and Back. Change Server is on the main menu only
for an active Outline/Shadowsocks key. No Live Chat button is shown.

There is no Cancel Purchase button, quick reply, or cancellation confirmation.
Ordinary customer text/files/images remain silent for human Page-inbox replies.
Exact Hi, Hello, Start, /start or Main Menu opens the menu; buttons invoke the
bot actions. During checkout unrelated messages preserve the selected plan.
Only expected receipt images trigger purchase processing; invalid receipt images
still get receipt-specific feedback. No admin handoff mode or pause is introduced.
All controls are message-attached inline buttons. Back replaces cancellation;
leaving an unfinished checkout clears only its draft, not submitted orders or
existing access. Verify Back from duration returns to app choice,
Back from plans returns to duration, and Back from payment returns to plans.
Use test receipts, not real payments. An authorized app-role
account must still perform the actual Messenger walkthrough. Confirm/reject from
the development dashboard; replies are limited to the latest interaction window.

`node scripts/check-messenger-live-canary.mjs` is explicitly live-panel-affecting:
it pins the development database, creates a named DEV-MSG-CANARY customer, checks
provisioning and idempotent replay, then deletes and verifies only its panel users.
It retains inactive development audit records. A pending ambiguous key fails
cleanup loudly and leaves its fixture ID for recovery; do not rerun blindly.

In purchase mode webhook receipts are durable, delivery checkpoints survive
session expiry, and worker failures never roll back an existing purchase. Failed
events/recovery-required purchases need operator inspection, not a new charge.

### Recovery Procedure

Server switching uses an atomic, non-expiring guard at
`messenger:switch:<resellerId>:<pageId>:<senderId>:<orderId>`. A failed switch must
be reconciled against both panel users and database keys before an operator clears
that exact guard. Checkout Back navigation/session expiry never clears it. Do not
delete guards broadly; they prevent a new button tap from duplicating an
interrupted operation. Completed normal switches remove their own guard.

A fresh checkout for the same customer/channel/plan/protocol resumes its recorded
unfinished purchase, retaining the original receipt and request key. This works
after a Telegram session reset or exhausted Messenger delivery retries too; it
does not create a second order/payment. Changing the unfinished checkout requires
support rather than silently replacing its commercial terms.

For `recovery_required`, an operator must inspect the scoped operation, order,
reserved keys and panel user. If access exists, reconcile that same key/order and
mark the operation completed only after verification. If abandoning the purchase,
first verify deletion of all its panel users and release reservations through
the existing lifecycle; stop its order, reject/refund as appropriate, then mark
that exact operation completed as an audit tombstone. Never mark a still-running
lease completed or clear pending keys without panel verification. Retry failed
Messenger delivery only after resolving the underlying operation; reset that
exact event's attempts/status in the scoped development inbox. Do not delete the
purchase operation or invent another request key to bypass recovery.

### Shared Notifications, Names, And Explicit Trials

The new channel update requires development migrations 0031 through 0036 before
testing. Customer purchases from every channel send receipt alerts to the
reseller's configured Telegram admin; only that Telegram identity may review
through pay_ok/pay_no callbacks. Dashboard reviews and Telegram reviews use the
same immediate customer notification path. Recovery/reminders still run on the
existing 10-minute job; this is not a 30-minute payment delay.

Eligible Messenger customers see Start Free Trial. Greetings do not provision
keys. Used trial history remains consumed; concurrent actions recover the same
order. Capacity errors keep a recoverable trial; ambiguous panel operations need
admin reconciliation before another external create attempt.

Name enrichment requests first_name/last_name using the Page access token and
caches attempts for 24 hours. It replaces placeholders but preserves manual
customer names. Missing Meta profile permission leaves the fallback name and
does not block buying. Request the relevant Business Asset User Profile Access
in the developer dashboard as required for your app/access level.

API reference used: Meta's maintained sample
https://github.com/fbsamples/original-coast-clothing/blob/main/services/graph-api.js
and its Messenger Platform Postman collection:
https://github.com/fbsamples/messenger-platform-samples/blob/main/postman/messenger-platform-api.postman_collection.json
The latter documents the standard 24-hour reply window. No human-agent tags are
used for automated reminders. Verify real-account name access before public use.

### Connection-Only Mode

Duplicate message IDs are suppressed in memory for 24 hours, up to 5000 successful replies. Failed sends return 503 so Meta can retry. This is not a durable queue and resets when the process restarts; durable delivery processing is required before adding payments. Callback verification through the tunnel does not prove real message delivery; check the actual Messenger reply separately.

Temporary local runner logs belong under `backend/logs/` (ignored). The ngrok inspection interface contains message data; do not publish it. Stop the runner and tunnel when testing ends, and update Meta's callback when the tunnel URL changes.

The initial setup generated `MESSENGER_VERIFY_TOKEN` in the ignored local environment. The runner is already running for this session. Launch the tunnel in a terminal with `ngrok http http://127.0.0.1:3010 --inspect=false` to disable request inspection. Then provide the HTTPS forwarding origin for public verification and callback setup. Automatic approval review rejected the agent's tunnel-launch action; it was not executed.
