# Fix A — preserve remaining data balance on server migration / switch

**Problem.** `migrateActiveOrderToServer` creates the new key with
`data_limit_bytes = gbToBytes(order.plan.data_limit_gb)` (the **full plan
allowance**) and `used_bytes = 0`. So every admin *decommission* migration and
every reseller *Switch Server* click hands the customer a fresh full plan's
worth of data on the same expiry date. The mini‑app switch
(`resellerMiniappRoutes.js`) already does it right — it uses
`getOrderQuotaSnapshot(...).remainingBytes` and blocks the switch at 0. This
change ports that behaviour into the shared service path.

**Apply against `HEAD` (committed Outline code), on a branch separate from the
in‑progress Marzneshin refactor.** The 4 source files below are also touched by
that uncommitted refactor — do not mix the two.

Anchors quote the current committed lines.

---

## 1. `backend/src/services/subscriptionProvisionService.js`

### 1a. New exported helper — put it just above `migrateActiveOrderToServer`
(right before the `// Migrate a single active order …` comment):

```js
// Choose the data limit for a key created by a server migration / switch.
// Priority:
//   1. carryRemainingBytes when the caller passes it (number => bytes,
//      null => unlimited). Use this when the old key was ALREADY retired
//      (admin decommission) so a fresh snapshot would see no active key.
//   2. the order's live remaining balance (buildOrderQuotaSnapshot).
//   3. the plan's full allowance — only when the order has no resolvable
//      balance (e.g. an orphaned order with no keys at all).
// Never returns 0: an out-of-data order still gets a 1-byte (immediately
// capped) key rather than an unlimited one. Callers that want to BLOCK an
// out-of-data switch do it before calling migrate (reseller route + mini-app
// DATA_LIMIT_REACHED).
export function pickMigrationDataLimitBytes({ snapshot, planDataLimitGb, carryRemainingBytes }) {
  if (carryRemainingBytes !== undefined) {
    return carryRemainingBytes === null
      ? null
      : Math.max(1, Math.floor(Number(carryRemainingBytes) || 0));
  }
  if (snapshot && snapshot.isUnlimited) return null;
  if (snapshot && snapshot.remainingBytes != null) {
    return Math.max(1, Math.floor(snapshot.remainingBytes));
  }
  return gbToBytes(planDataLimitGb);
}
```

### 1b. `migrateActiveOrderToServer` — replace the signature + first line

FROM:
```js
export async function migrateActiveOrderToServer({ order, newServer, oldServerId }) {
  const dataLimitBytes = gbToBytes(order.plan?.data_limit_gb);
```
TO:
```js
export async function migrateActiveOrderToServer({
  order,
  newServer,
  oldServerId,
  // Optional caller-supplied remaining balance (bytes; null = unlimited).
  // Pass when the caller has already retired the order's old key.
  carryRemainingBytes,
}) {
  const snapshot =
    carryRemainingBytes === undefined ? await getOrderQuotaSnapshot(order.id) : null;
  const dataLimitBytes = pickMigrationDataLimitBytes({
    snapshot,
    planDataLimitGb: order.plan?.data_limit_gb,
    carryRemainingBytes,
  });
```

No other change in this function — `dataLimitBytes` already flows to both
`createOutlineKey({ ..., dataLimitBytes })` and the `vpn_keys` insert.

`switchOrderServer` needs **no change**: it calls `migrateActiveOrderToServer`
*before* it retires the old key, so the snapshot still sees the active key and
carries the real balance.

---

## 2. `backend/src/routes/admin/adminServersRouter.js`

### 2a. Import

FROM:
```js
import { migrateActiveOrderToServer } from "../../services/subscriptionProvisionService.js";
```
TO:
```js
import {
  migrateActiveOrderToServer,
  getOrderQuotaSnapshot,
} from "../../services/subscriptionProvisionService.js";
```

### 2b. Snapshot balances BEFORE the keys are retired

In `POST /:serverId/decommission`, immediately after:
```js
    const keys = activeKeys || [];
    const orderIds = [...new Set(keys.map((k) => k.order_id).filter(Boolean))];
```
insert:
```js
    // Snapshot each order's REMAINING balance now, while its key is still
    // active, so the migrated key carries the real balance instead of
    // resetting to the full plan (quota-reset gap, 2026-09-09). Uses stored
    // used_bytes — for a planned decommission of a HEALTHY server, run a
    // usage sync first for to-the-minute accuracy.
    const carryByOrderId = new Map();
    for (const oid of orderIds) {
      try {
        const snap = await getOrderQuotaSnapshot(oid);
        carryByOrderId.set(
          oid,
          snap.isUnlimited ? null : snap.remainingBytes != null ? snap.remainingBytes : undefined
        );
      } catch (err) {
        console.warn(`[decommission] quota snapshot failed for order ${oid}:`, err.message);
        carryByOrderId.set(oid, undefined);
      }
    }
```

### 2c. Pass it into migrate

FROM:
```js
          await migrateActiveOrderToServer({ order, newServer, oldServerId: serverId });
```
TO:
```js
          await migrateActiveOrderToServer({
            order,
            newServer,
            oldServerId: serverId,
            carryRemainingBytes: carryByOrderId.get(order.id),
          });
```

---

## 3. `backend/src/routes/reseller/resellerServerSwitchRouter.js`

### 3a. Imports

FROM:
```js
import express from "express";
import { supabase } from "../../lib/supabase.js";
import { switchOrderServer } from "../../services/subscriptionProvisionService.js";
import { getRegionLocation } from "../../constants/doRegions.js";
```
TO:
```js
import express from "express";
import rateLimit from "express-rate-limit";
import { supabase } from "../../lib/supabase.js";
import {
  switchOrderServer,
  getOrderQuotaSnapshot,
} from "../../services/subscriptionProvisionService.js";
import { getRegionLocation } from "../../constants/doRegions.js";
```

### 3b. Anti-farm limiter — after `const router = express.Router();`

```js
// A reseller may legitimately move many DIFFERENT customers during an
// outage, but repeatedly switching the SAME order is the only way the
// quota-reset bug could be farmed. Cap per (reseller, order).
const switchLimiter = rateLimit({
  windowMs: 6 * 60 * 60 * 1000, // 6h
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.reseller?.id || req.ip}:${req.params.orderId}`,
  message: {
    error: "SWITCH_RATE_LIMITED",
    message: "This subscription was switched too many times recently. Try again later.",
  },
});
```

### 3c. Apply the limiter + the out-of-data guard

FROM:
```js
router.post("/:orderId/switch-server", async (req, res) => {
```
TO:
```js
router.post("/:orderId/switch-server", switchLimiter, async (req, res) => {
```

Then, right after the `SAME_SERVER` check:
```js
    if (currentKey.server_id === newServerId) {
      return res.status(400).json({ error: "SAME_SERVER" });
    }
```
insert:
```js
    // Mirror the mini-app DATA_LIMIT_REACHED guard: no switch once the
    // order's balance is spent (otherwise the new key would be minted at the
    // remaining balance of ~0 and the customer would appear "broken", or —
    // pre-fix — get a free full-plan refill).
    const quota = await getOrderQuotaSnapshot(orderId);
    if (!quota.isUnlimited && quota.remainingBytes === 0) {
      return res.status(403).json({
        error: "DATA_LIMIT_REACHED",
        message: "This customer has used all their data. Renew or upgrade before switching servers.",
      });
    }
```

---

## 4. `backend/src/__tests__/subscriptionQuota.test.js`

Add `pickMigrationDataLimitBytes` to the import and append this block:

```js
describe("pickMigrationDataLimitBytes — server migration keeps remaining, not full plan", () => {
  const PLAN_GB = 100;

  it("carries the order's remaining balance (not the full plan)", () => {
    const snapshot = buildOrderQuotaSnapshot([
      { id: "old", status: "deleted", data_limit_bytes: 100 * GB, used_bytes: 70 * GB },
      { id: "cur", status: "active", data_limit_bytes: 30 * GB, used_bytes: 0 },
    ]);
    expect(pickMigrationDataLimitBytes({ snapshot, planDataLimitGb: PLAN_GB })).toBe(30 * GB);
  });

  it("honours an explicit carryRemainingBytes when the old key was already retired", () => {
    expect(
      pickMigrationDataLimitBytes({ snapshot: null, planDataLimitGb: PLAN_GB, carryRemainingBytes: 12345 })
    ).toBe(12345);
  });

  it("carryRemainingBytes null => unlimited", () => {
    expect(
      pickMigrationDataLimitBytes({ snapshot: null, planDataLimitGb: PLAN_GB, carryRemainingBytes: null })
    ).toBeNull();
  });

  it("keeps an unlimited order unlimited", () => {
    const snapshot = buildOrderQuotaSnapshot([
      { id: "cur", status: "active", data_limit_bytes: null, used_bytes: 0 },
    ]);
    expect(pickMigrationDataLimitBytes({ snapshot, planDataLimitGb: PLAN_GB })).toBeNull();
  });

  it("falls back to the full plan only when the order has no resolvable balance", () => {
    const snapshot = buildOrderQuotaSnapshot([]); // orphaned order, no keys
    expect(pickMigrationDataLimitBytes({ snapshot, planDataLimitGb: PLAN_GB })).toBe(100 * GB);
  });

  it("never returns 0 for a spent balance", () => {
    const snapshot = buildOrderQuotaSnapshot([
      { id: "old", status: "deleted", data_limit_bytes: 100 * GB, used_bytes: 100 * GB },
      { id: "cur", status: "active", data_limit_bytes: 1, used_bytes: 0 },
    ]);
    expect(pickMigrationDataLimitBytes({ snapshot, planDataLimitGb: PLAN_GB })).toBeGreaterThanOrEqual(1);
  });
});
```

---

## Apply / verify / ship

```bash
git checkout -b fix/quota-preserve-on-migration origin/main   # clean off HEAD
# make edits 1–4
cd backend && npm test -- subscriptionQuota
git commit -am "Preserve remaining data balance on server migration + switch; guard/limit reseller switch"
```

Deploy with the usual `git archive HEAD backend | …` Ansible flow. After deploy,
the admin *decommission* flow and reseller *Switch Server* both carry the real
remaining balance; the mini‑app path is unchanged (already correct).

**When the Marzneshin refactor lands**, re-apply the same 4 edits on top of it —
they are provider-agnostic (they only change which number is passed as
`dataLimitBytes` and add two guards), so they port cleanly.
