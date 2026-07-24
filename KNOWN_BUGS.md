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
