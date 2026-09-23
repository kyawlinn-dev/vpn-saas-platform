# Known Bugs

## Miniapp: buying a package while customer has an active order (found 2026-07-24)

**Status: RESOLVED 2026-07-24 by removing the feature for this version**,
per user decision — see below. (Superseded an earlier narrower fix that
scoped the pending-payment check to `payment_type === "extend"`; that fix is
now moot since the extend/top-up path was removed entirely.)

**Original symptom**: a customer with an active order who tried to
buy/top-up a package was incorrectly rejected with "You already have a
payment waiting for reseller review" even when nothing was actually pending
on their side — caused by a blocking check that didn't distinguish the
order's original (always-pending-until-reviewed) initial payment from an
actual pending top-up.

**Product decision (2026-07-24)**: rather than fix the extend/top-up logic
now, close it for this version. One active purchase order at a time, full
stop — no renew/top-up while a package is active. Proper renew business
logic is planned for a future version.

**What changed**:
- `backend/src/routes/public/resellerMiniappRoutes.js` — `POST /:slug/orders`
  now returns `409 ACTIVE_PACKAGE_EXISTS` immediately if the customer already
  has an active purchase order, instead of creating an "extend" payment. The
  old extend branch (payment creation, key lookup, 202 response) was removed
  entirely, along with the now-unused `loadOrderPayments`/
  `syncOrderPaymentSummary` imports.
- `backend/src/routes/reseller/resellerOrdersRouter.js` — `POST /` (manual
  order creation from the reseller dashboard) now runs the same check before
  creating a new `purchase`-type order: if the customer already has an
  active purchase order, returns `409 ACTIVE_PACKAGE_EXISTS` instead of
  silently creating a second pending order that would only fail later at
  activation time.

Verified: both files parse and import cleanly, all 91 backend tests still
pass. Not verified via a live click-through in either the miniapp (needs
real Telegram init data) or the reseller dashboard UI — do that before
relying on this in production.

**Still open / follow-up for later**:
- No dedicated regression test exists for either blocked path yet.
- The miniapp frontend (`CheckoutPage.jsx` / `PackageCard.jsx`) doesn't
  proactively hide the "buy" action when a customer already has an active
  package — it'll surface the 409 error via the existing toast/error
  handling, but a nicer UX would disable/hide buying upfront. Not done, not
  asked for yet.
- The proper renew/top-up business logic itself is deferred to a future
  version — this is a placeholder until that's designed.

## Order protocol shown inconsistently: bot ssconf vs dashboard VLESS (found 2026-09-19)

**Status: RESOLVED 2026-09-19.**

**Symptom:** the bot served a Shadowsocks `ssconf://` link while the reseller
dashboard showed the same order as VLESS. Root cause: the order's `protocol`
was derived from `vpn_customers.protocol_preference` (intent for the *next*
provision) instead of the active key's own `vpn_keys.protocol` (ground truth).
When a customer's preference was switched to `vless` but the live key stayed
Shadowsocks (e.g. on a trial order that isn't re-provisioned), the two diverged.

**Fix:** `customerOrderEnrichmentService.js` now derives `protocol` from the
active key first, falling back to `protocol_preference` only when no key exists.
At the model level, migration `0023` `order_view` makes this the single canonical
derivation for all three frontends.

## Premium VLESS fails to add/connect in Hiddify on SG#2 & Tokyo (found 2026-09-23)

**Status: RESOLVED 2026-09-24.** Three separate causes, fixed in order:

1. **Import fails — "duplicate outbound/endpoint tag".** SG#2 and Tokyo VLESS
   host records had the generic remark `NovaNet ({USERNAME})` (no server name),
   so both rendered the same sing-box tag and Hiddify rejected the whole premium
   subscription. Fixed by `backend/scripts/fix-vless-host-remarks.mjs` (unique
   server-named remarks + `fingerprint=chrome`). Origin scripts
   (`setup-premium-services.mjs`, `fix-premium-node-hosts.mjs`) now write unique
   remarks. Note: clients cache subs — must refresh/re-import after the fix.
2. **IPv6 egress inconsistency.** SG#2/Tokyo are dual-stack and egressed IPv6 by
   default, unlike the IPv4-only working nodes. Disabled IPv6 at the OS; Xray
   config is now identical to the working fleet.
3. **"Timeout in any client" on SG#2 (the real blocker).** A `docker compose
   restart` hit a marznode asyncio bug that left Xray running without re-syncing
   users → `rejected proxy/vless/encoding: invalid request user id`. A clean
   `docker compose down && up -d` re-synced the users; SG#2 now accepts and
   forwards. **Rule: never `restart` marznode — always `down`+`up`.** (See
   DEPLOYMENT.md → Marznode VPN Nodes.)
