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

## Server switch race mints uncapped (null limit) Outline keys & breaks dashboard (found 2026-09-29)

**Status: RESOLVED 2026-10-07.** Canonical order-period quota fields now
preserve usage across server and protocol switches without inheriting an
uncapped key. Affected legacy orders were repaired after migration `0026`.

**Symptom:** In the dashboard (e.g. for Xiao Wu, order `34b6e99d`), the usage bar shows `0% remaining`, `279.25 GB / 0.00 GB` (`Rem: -`), and the order is never auto-stopped when reaching its quota. However, the Mini App still correctly shows `93%` and `279.25 / 300.00 GB`.

**Root Cause:**
1. During rapid server switching in production, `quota.remainingBytes` returned `null` mid-transition.
2. The switch endpoint fell through and created a replacement key with `data_limit_bytes = null` on the Outline server and in `vpn_keys`.
3. Because the active key has `data_limit_bytes = null`, `buildOrderQuotaSnapshot` flags the order as `isUnlimited: true`, so `syncUsageJob`'s `stopOrdersOverDataLimit` skips auto-stopping.
4. In `OrdersTable.tsx`, `getOrderRemainingGb()` and `getOrderLimitGb()` collapse to `0 GB` when both `remaining` and `data_limit_bytes` are `null`, causing the usage bar to render `0%` and `used / 0.00 GB`.

**Required Fixes:**
- **Data (Production):** Xiao Wu's active key (`5a367c2d` on Singapore Trial) needs its `data_limit_bytes` updated to its true remaining balance (`22,282,459,832` bytes / ~20.75 GB).
- **Code:** Local commit `5b82f07` added a fallback `planBytes - totalUsedBytes` for Shadowsocks switches in `resellerMiniappRoutes.js`, but three related edge cases remain below.

## VLESS first-time creation in MiniApp lacks quota fallback (found 2026-09-29)

**Status: RESOLVED 2026-10-07.** Provisioning now derives a finite remaining
allowance from the canonical order-period quota before creating the VLESS user.

**Location:** `backend/src/routes/public/resellerMiniappRoutes.js` (lines 1700–1702).

**Symptom:** When a customer switches protocol to VLESS for the first time without an existing VLESS key, `vlessQuota.remainingBytes` can be `null` if the order was in a transient state. It passes `remainingBytes` straight to `createKey`, minting an uncapped VLESS panel user (`data_limit: 0`).

**Fix:** Apply the same defensive fallback used in the Shadowsocks branch:
```javascript
const planBytes = gbToBytes(plan?.data_limit_gb);
const remainingBytes = vlessQuota.isUnlimited
  ? null
  : (vlessQuota.remainingBytes ?? (planBytes ? Math.max(1, planBytes - Number(vlessQuota.totalUsedBytes || 0)) : null));
```

## "Null limit inheritance" on migrated orders in `buildOrderQuotaSnapshot` (found 2026-09-29)

**Status: RESOLVED 2026-10-07.** `buildOrderQuotaSnapshot` now prefers the
order's explicit quota snapshot and treats historical null key limits as
legacy data instead of automatically making the package unlimited.

**Location:** `backend/src/services/subscriptionProvisionService.js` (lines 50–57).

**Symptom:** If an existing order has a key with `data_limit_bytes = null` (like Xiao Wu's order), `buildOrderQuotaSnapshot` unconditionally sets `isUnlimited: true`. Even with the new switch logic, `if (quota.isUnlimited) remainingBytes = null` evaluates to true, perpetuating the `null` limit across all future switches.

**Fix:** Verify if the plan is genuinely unlimited (`plan.data_limit_gb == null`) rather than relying solely on whether a previously provisioned key row had a null limit.

## Dashboard server switch resets remaining quota to 100% (found 2026-09-29)

**Status: RESOLVED 2026-10-07.** Dashboard and Mini App switches now use the
same canonical remaining allowance; switching no longer grants a fresh plan.

**Location:** `backend/src/services/subscriptionProvisionService.js` (`migrateActiveOrderToServer`, line 558).

**Symptom:** When a reseller or admin switches an active paid order's server from the Reseller Dashboard, `migrateActiveOrderToServer` assigns `const dataLimitBytes = gbToBytes(order.plan?.data_limit_gb);` to the new key. This gives the customer a fresh full-quota allotment (e.g. 300 GB) instead of their remaining balance.

**Fix:** Reconstruct remaining balance (`planBytes - lifetimeUsedBytes`) and pass that as the new key's data limit.
