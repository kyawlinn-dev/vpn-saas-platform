# NovaNet MM — Final Data Model (Target State)

**Status:** Design proposal — 4 core decisions locked 2026-09-23 (see §10), pending your final confirmation. Not yet migrated.
**Author basis:** ICT325 Ch.02 (OOP & Database Foundations) + Ch.03 (PHP Database Programming).
**Scope:** One canonical model serving all three frontends — the Telegram **Mini App**, the **Admin dashboard**, and the **Reseller dashboard** — plus the Telegram bot.
**Live DB verified:** Supabase project `huqmzvlzfcexycdrsxpn`, introspected via PostgREST OpenAPI on 2026-09-23 (20 tables).

---

## 0. Method — the rubric we design against

The two lectures give a concrete rubric. Every decision below traces to one of these:

| # | Principle (lecture) | Source |
|---|---|---|
| P1 | **3NF** — one fact in one place; don't store what can be reliably calculated | Ch.02 Normalization; Ch.02 Designing Tables |
| P2 | **Keys** — stable PKs; every relationship carried by a FK; 1:1 / 1:many / many:many via link table | Ch.02/03 Primary & Foreign Keys |
| P3 | **ACID transactions** — multi-table writes are one unit of work: `BEGIN → writes → COMMIT`, `ROLLBACK` on any failure, never leave half-saved data | Ch.03 Service Layer / Transaction Lifecycle |
| P4 | **Layering** — Domain object ↔ Repository ↔ Service; the service owns the transaction, repositories only run SQL | Ch.03 Data Layer |
| P5 | **Prepared statements & least privilege** — bind all input; validate at the boundary | Ch.03 Prepared Statements / DB Security |

> Note on platform: the lectures use PHP/PDO/MySQL. NovaNet runs Node + Supabase (PostgREST) + Postgres. The *principles* are identical; only the *mechanism* differs. Where PDO would `beginTransaction()`, we use a Postgres `plpgsql` function called via `supabase.rpc()` (see §6). Where PDO uses named placeholders, the Supabase client already parameterizes every `.eq()/.insert()` — so P5 is largely satisfied today.

---

## 1. Current-state audit

### 1.1 Documentation drift (SCHEMA.md vs live DB)

`SCHEMA.md` is stale. The live DB has **20 tables**; SCHEMA.md documents **17**.

**Undocumented tables:** `notifications_sent`, `platform_settings`, `reseller_notification_templates`.
**Undocumented columns:** `vpn_customers.protocol_preference`, `vpn_keys.protocol`, `vpn_keys.key_credentials`, `reseller_miniapps.admin_telegram_user_id`, `resellers.notifications_paused`, and `vpn_servers.server_tier` (only in a footnote).

*Action:* SCHEMA.md is regenerated as the last step of every phase below (see §9).

### 1.2 ACID gap — there are no transactions (P3)

The Supabase JS client issues **one PostgREST HTTP call per statement**. Every multi-table business operation is therefore a *sequence of independent writes* with no atomicity. The code compensates by hand — e.g. [`subscriptionProvisionService.js:442`](backend/src/services/subscriptionProvisionService.js) has `catch` blocks that manually decrement counters and soft-delete keys, several with silent `catch {}`. A crash between steps, or a failed compensation, leaves exactly the "half-saved data" Ch.03 warns against: an order with no key, a counter that never decremented, commission booked against a key that failed.

The only RPCs today are read/cleanup (`admin_monitoring_*`, `cleanup_old_app_events`). **Zero transactional business writes.**

### 1.3 3NF violations — derived/duplicated facts (P1)

| Stored value | Should be derived from | Drift risk |
|---|---|---|
| `vpn_servers.current_active_keys` | `count(vpn_keys where status='active' and server_id=…)` | Managed by an optimistic-concurrency loop; drifts on any missed inc/dec |
| `vpn_orders.price_mmk`, `commission_percent`, `commission_amount_mmk`, `total_paid_mmk` | `order_payments` (SCHEMA.md itself calls that "the source of truth") | Cached summary can disagree with the ledger |
| `commission_ledger` (whole table) | `order_payments.commission_amount_mmk` | Commission recorded in **two** parallel models |
| `vpn_customers.protocol_preference` vs `vpn_keys.protocol` | Two *different* facts conflated as one (**root cause of the 2026-09 bug**) | Bot read the key, dashboards read the preference → divergence |

### 1.4 Key & integrity gaps (P2)

- **Nullable FKs that should be mandatory:** `vpn_keys.order_id / customer_id / reseller_id / server_id` are all nullable — a key with no owner is meaningless. Same for `vpn_orders.reseller_id`, `vpn_customers.reseller_id`.
- **Enums as free `text`:** critical lifecycle columns have CHECK constraints (migration 0006), but newer ones — `vpn_keys.protocol`, `vpn_customers.protocol_preference`, `vpn_customers.customer_type` — do not.

### 1.5 Naming inconsistency

The `display name` fact is spelled three ways: `resellers.name`, `admins.full_name`, `vpn_customers.full_name`. Already a documented bug source ("Column Name Traps").

### 1.6 Legacy-but-live tables

`access_tokens`, `token_server_assignments`, `commission_ledger` are labelled "legacy" but are **still written** (`tokenService.js`, `subscriptionProvisionService.js`, `orderLifecycleService.js`). They cannot be dropped until the provisioning/commission code is migrated off them (§9 Phase 4).

---

## 2. Final entity model

Entities (the "nouns") and their relationships:

```
auth.users (Supabase)
   │ 1:1                    1:1 │
resellers ─────────────< reseller_miniapps
   │ 1:many                    │ 1:many
   │                     reseller_notification_templates
   ├───< vpn_customers
   │         │ 1:many
   │         ├───< vpn_orders >─── plan ── vpn_plans
   │         │        │ 1:many
   │         │        ├───< order_payments        (money ledger — source of truth)
   │         │        ├───< vpn_keys >──── server ── vpn_servers ──1:1── server_health_status
   │         │        └───< notifications_sent
   │         └───< telegram_links (reseller × telegram_user)
   └───< monthly_settlements

admins ──< (reviews / confirms) order_payments, monthly_settlements
platform_settings  (singleton)
app_events         (append-only event ledger — references most entities, enforces none)
system_job_runs    (singleton-per-job ops health)
```

Relationship types (P2): all business links are **1:many** except `resellers↔reseller_miniapps` and `vpn_servers↔server_health_status` (**1:1**), and `telegram_links` which is the **many:many link table** between resellers and Telegram users. This matches Ch.02's "one-to-many is most common; many-to-many uses a link table."

---

## 3. Final schema — table by table

Legend: **KEEP** unchanged · **ADD** new · **RENAME** (behind a compat view) · **DROP** (after code migration) · **CONSTRAIN** add NOT NULL/CHECK/FK.

### 3.1 `resellers`
- **RENAME** `name` → `display_name` (P5 naming consistency).
- **KEEP** `commission_percent`, `status`, `supabase_user_id`, `notifications_paused`.
- **CONSTRAIN** `status` CHECK (`active`,`disabled`); FK `supabase_user_id → auth.users`.

### 3.2 `admins`
- **RENAME** `full_name` → `display_name`.
- **CONSTRAIN** `status` CHECK; `email` UNIQUE.

### 3.3 `vpn_customers`
- **RENAME** `full_name` → `display_name`.
- **CONSTRAIN** `reseller_id` → **NOT NULL** + FK (every customer belongs to one reseller; P2). Backfill orphans first.
- **CONSTRAIN** CHECK `status ∈ (active,inactive)`, `customer_type ∈ (normal,telegram)`, `protocol_preference ∈ (shadowsocks,vless,hysteria2)`.
- **CLARIFY** `protocol_preference` = *desired protocol for the **next** provisioning* (intent), never read as the live key's protocol. See §5.3.

### 3.4 `vpn_orders`
- **CONSTRAIN** `reseller_id` → NOT NULL + FK.
- **Split money fields by kind (Decision 1 — locked).** `price_mmk` and `commission_percent` are **point-in-time snapshots** taken at order creation (the plan's price/percent that day) — legitimately stored, kept as-is. `total_paid_mmk` and `commission_amount_mmk` are **aggregates of `order_payments`** — derived in `order_view` (§5.2) and the stored columns are dropped (frontends read the view). No trigger needed at your scale; a trigger-cached column is a non-breaking fallback if profiling later shows a hot path.
- **CONSTRAIN** all enums (`status`, `payment_status`, `order_type`, `review_status`, `source`).

### 3.5 `order_payments` — the money source of truth
- **KEEP** as the canonical ledger. This is the "one fact, one place" home for all money **and commission** (P1). Commission-per-order is derived from here (Decision 2), not stored in a second table.
- **CONSTRAIN** enums (`review_status`, `payment_type`, `apply_status`, `source`); `idempotency_key` UNIQUE per `(reseller_id, idempotency_key)` to make payment application idempotent (supports the RPC in §6).

### 3.6 `vpn_keys`
- **CONSTRAIN** `order_id / customer_id / reseller_id / server_id` → NOT NULL + FK (P2).
- **CONSTRAIN** CHECK `status ∈ (active,deleted)`, `protocol ∈ (shadowsocks,vless,hysteria2)`.
- **KEEP** `protocol` as the **authoritative** live protocol (bot & all views read this — §5.3). `key_credentials` (jsonb) documented.
- Keep the partial unique index: one active key per `(order_id, server_id)`.

### 3.7 `vpn_servers`
- **DERIVE** `current_active_keys` — replace the app-managed counter with a trigger or view (§5.1).
- **DOCUMENT** `server_tier` (trial|premium), the three `marzneshin_*_service_ids` arrays, and the legacy `outline_*` columns (mark deprecated).
- **CONSTRAIN** `status`, `provider`, `panel_type`, `server_tier` CHECK.

### 3.8 `vpn_plans`, `reseller_miniapps`, `telegram_links`, `monthly_settlements`
- Largely **KEEP** (well-formed). Add the missing enum CHECKs. Document `reseller_miniapps.admin_telegram_user_id`. `monthly_settlements`' many aggregate columns are legitimate **point-in-time snapshots** (frozen at settlement), *not* a 3NF violation — keep, but document the freeze semantics.

### 3.9 Ops/append-only tables — **KEEP**
`app_events`, `notifications_sent`, `reseller_notification_templates`, `platform_settings` (singleton via boolean PK), `server_health_status`, `system_job_runs`. Add missing enum CHECKs; document all three undocumented tables.

### 3.10 Legacy — **DROP after code migration** (Phase 4)
- `access_tokens`, `token_server_assignments` — the retired token portal; provisioning must stop writing them first (still live in `subscriptionProvisionService.js` / `tokenService.js`).
- `commission_ledger` (Decision 2 — locked) — **fold into `order_payments`.** Commission-per-order = `SUM(order_payments.commission_amount_mmk WHERE confirmed+applied)`. Drop the table; expose a `commission_ledger` **view** with the old shape so the admin export (`adminDataRouter.js:294`) and dedup check keep working unchanged. Verified: no business logic reads it; settlement already runs off `order_payments`.

---

## 4. Naming standardization (P5 — Decision 3: locked)

`resellers.name`, `admins.full_name`, `vpn_customers.full_name` are inconsistent spellings of one fact. The physical rename touches all 3 frontends + backend + bot for **zero functional gain** (confusion bugs, never data bugs), so we capture the value cheaply and defer the risky part:

- **Now:** the read layer (§7 views) exposes the field as **`display_name`** regardless of the underlying column. All *new* code reads the consistent name.
- **Deferred (optional; later, or when already editing those files):** the physical column rename behind a compat view — add `display_name`, backfill, sync trigger, migrate readers, drop the old column. Keep the "Column Name Traps" note until the physical columns are gone.

---

## 5. Derived-data strategy — make drift impossible (P1)

The rule from Ch.02: *"avoid storing values that can be reliably calculated."* Where we keep a cache for dashboard speed, the **database** maintains it, not application code — so it can't drift no matter which of the 3 apps writes.

### 5.1 `vpn_servers.current_active_keys`
Replace the optimistic-concurrency counter with an **`AFTER INSERT/UPDATE/DELETE` trigger** on `vpn_keys` that recomputes the count for the affected server, OR drop the column and read a `server_capacity` view: `count(*) FILTER (WHERE status='active')`. Trigger preferred (capacity checks want a cheap column read).

### 5.2 `vpn_orders` money aggregates (Decision 1 — locked: pure view)
`total_paid_mmk` / `commission_amount_mmk` are **not stored** — `order_view` computes them as `SUM(order_payments.amount_mmk)` / `SUM(order_payments.commission_amount_mmk)` filtered to `review_status='confirmed' AND apply_status='applied'`. `order_payments` stays the one writer of money; nothing to drift. (Snapshot columns `price_mmk` / `commission_percent` remain on `vpn_orders`.)

### 5.3 Protocol — two facts, cleanly separated (fixes the 2026-09 bug at the model level)
- `vpn_keys.protocol` = **what the live key IS** (authoritative). Bot and all 3 views read this for display and link shape.
- `vpn_customers.protocol_preference` = **what to provision NEXT** (intent only). Written by the protocol-switch flow; never used to render an existing order.
- The enrichment layer (§7) exposes a single `protocol` field derived from the **active key**, falling back to preference only when no key exists. (This is the fix already applied in [`customerOrderEnrichmentService.js:33`](backend/src/services/customerOrderEnrichmentService.js); §7 makes it the *only* place protocol is derived.)

---

## 6. ACID transaction architecture (P3, P4)

**Auth model (Decision 4 — locked):** RPCs stay on the **service-role** connection the backend already uses; each RPC takes `reseller_id` explicitly and validates ownership (`SECURITY DEFINER`, `FOR UPDATE` locks). This matches 100% of existing code and needs no auth re-architecture. Postgres **RLS** is noted as future defense-in-depth — because every RPC is already tenant-checked, adding RLS later is additive policy work, not a rewrite. (RLS's main benefit, guarding direct client→DB access, doesn't apply here: only the trusted backend connects.)

Two mechanisms, chosen by whether an **external panel call** is involved.

### 6.1 Pattern A — Postgres transaction via RPC (pure-DB writes)
For operations that touch only our tables, write a `plpgsql` function (`SECURITY DEFINER`, tenant-guarded) and call it with `supabase.rpc()`. The function body is the lecture's transaction lifecycle — a function runs in a single implicit transaction, so any raised exception rolls back **all** its writes.

```sql
-- Example: apply a confirmed payment atomically (order + ledger cache + commission)
create or replace function apply_confirmed_payment(p_payment_id uuid, p_reseller_id uuid)
returns void language plpgsql security definer as $$
declare v_order uuid;
begin
  -- P4: validate first (Ch.03 "validate before you open anything")
  select order_id into v_order from order_payments
    where id = p_payment_id and reseller_id = p_reseller_id
      and review_status = 'confirmed' and apply_status = 'pending'
    for update;
  if v_order is null then raise exception 'payment not applicable'; end if;

  update order_payments set apply_status='applied', applied_at=now() where id=p_payment_id;
  update vpn_orders
     set expiry_date = <extend by package_duration_days>,   -- real state, kept
         status      = 'active'
   where id = v_order;
  -- total_paid / commission are DERIVED by order_view (Decision 1) — no cached-column write.
  -- commission lives only on order_payments.commission_amount_mmk (Decision 2) — no ledger insert.
  -- commit is implicit on normal return; any exception above rolls back everything
end $$;
```

### 6.2 Pattern B — Saga / outbox (writes coupled to a panel call)
You **cannot** put a Marzneshin/Outline HTTP call inside a DB transaction. So key provisioning is a saga with an explicit state machine on `vpn_keys.status`:

```
pending  ──(panel create OK)──▶ active
   │                              │
   └──(panel fails)──▶ failed     └──(reconcile job repairs drift)
```

1. **Tx1 (Pattern A):** insert `vpn_orders` + `order_payments` + `vpn_keys(status='pending')` atomically.
2. **External step:** call the panel to create the key. Store the returned `access_url`/credentials.
3. **Tx2 (Pattern A):** flip `vpn_keys → active`, bump the (trigger-derived) counter, record `key_provisioned` event — atomically.
4. **Compensation:** on panel failure, `vpn_keys → failed`; a reconcile job retries or refunds. No silent `catch {}`.

### 6.3 Operations classified

| Operation | Pattern | Tables |
|---|---|---|
| Create purchase order + initial payment | A | vpn_orders, order_payments, vpn_keys(pending) |
| Provision key on panel | **B** | vpn_keys, vpn_servers(counter via trigger) |
| Apply confirmed payment (extend/renew) | A | order_payments, vpn_orders (expiry/status only) |
| Switch protocol | **B** | vpn_customers, vpn_keys (retire old + create new on panel) |
| Switch server | **B** | vpn_keys ×2, vpn_servers counters |
| Confirm monthly settlement | A | monthly_settlements, commission_ledger/order_payments |

---

## 7. Canonical read layer — one truth for all 3 views (P4)

Today each frontend derives fields its own way — the direct cause of the protocol bug (bot read `key.protocol`, dashboards read `customer.protocol_preference`). The fix is a **single read layer** every consumer shares, per Ch.03's "repository returns domain objects, never raw rows."

Provide **Postgres views** (or keep the single `customerOrderEnrichmentService`) that compute derived fields **once**:

- `order_view` — order + plan + **derived `protocol`** (from active key) + live totals from `order_payments` + active key's URLs.
- `customer_view` — customer + active order summary.
- `server_view` — server + `current_active_keys` (derived) + health.

Rule: **Mini App, Admin, and Reseller all read these views/service — none re-derives a shared field.** New frontends inherit correctness for free.

---

## 8. Deep-dive: the Purchase flow, end-to-end

The worked example (Ch.03's "register() across multiple tables," adapted to a VPN purchase with an external panel).

### 8.1 Entities touched
`vpn_orders` (new) · `order_payments` (initial) · `vpn_keys` (new, panel-backed) · `vpn_servers.current_active_keys` (counter) · `commission_ledger` (on confirm) · `app_events` (audit).

### 8.2 Trigger points across the 3 views
- **Mini App:** customer taps Buy → `POST /miniapp/:slug/buy` → creates order (may be `pending_review` if screenshot payment).
- **Reseller dashboard:** reseller confirms the payment screenshot → applies package.
- **Admin dashboard:** reads the resulting rows via `order_view`; can override/refund.

### 8.3 The transaction boundary (correct design)

```
STAGE 1  Validate (no tx open)          — reseller owns customer? plan active? server has capacity?
STAGE 2  Tx1 = rpc('create_purchase')   — Pattern A, atomic:
             INSERT vpn_orders(status=pending)
             INSERT order_payments(payment_type=initial, apply_status=pending)
             INSERT vpn_keys(status=pending, protocol=<chosen>)
STAGE 3  Panel call (no tx)             — Marzneshin/Outline create key → access_url, credentials
STAGE 4  Tx2 = rpc('activate_key')      — Pattern A, atomic:
             UPDATE vpn_keys SET status=active, access_url=…, key_credentials=…
             -- vpn_servers.current_active_keys bumped by trigger (§5.1)
             UPDATE vpn_orders SET status=active, activated_at=now()   (if auto-confirm)
             INSERT app_events(key_provisioned, success)
STAGE 5  On confirm  = rpc('apply_confirmed_payment')  — §6.1, books commission + extends expiry
FAILURE  Panel fails at 3 → rpc('fail_key') sets vpn_keys=failed; reconcile job retries/refunds.
         Any rpc raises → that whole stage rolls back; earlier committed stages are repaired by
         the saga, never left inconsistent.
```

### 8.4 How each view then reads it
All three read `order_view`:
- `protocol` comes from the **active key** (not preference) → bot's ssconf vs dashboard's VLESS can never disagree again.
- `total_paid_mmk` comes from the `order_payments` roll-up → reseller and admin see identical money.
- `access_url` / subscription URL resolved once → Mini App "current server" marking and bot key delivery agree.

### 8.5 What this fixes vs today
- No order without a key (Stage 2 atomic; key born `pending`).
- No counter drift (trigger, not app loop).
- No commission double-count (one ledger, booked in a tx).
- No protocol divergence (one derived field).

---

## 9. Migration plan (data-safe, phased)

Ordered so the live system is never broken (matches your "additive first, breaking later" instinct even under a full-redesign goal):

- **Phase 0 — Docs & guardrails.** Regenerate `SCHEMA.md` from live introspection; add missing enum CHECKs and FK `NOT NULL`s where no orphans exist (backfill/repair first). *Additive, zero code change.*
- **Phase 1 — ACID (Pattern A).** Ship `create_purchase`, `activate_key`, `apply_confirmed_payment`, `switch_protocol`, `confirm_settlement` RPCs; migrate backend services to call them. Delete the hand-rolled compensation code.
- **Phase 2 — Kill drift.** Triggers for `current_active_keys` and order money caches; make `protocol` derivation single-sourced in `order_view`.
- **Phase 3 — Canonical read layer.** Introduce `order_view` / `customer_view` / `server_view`; point all 3 frontends at them.
- **Phase 4 — Clean redesign (breaking, behind compat views).** `name/full_name → display_name`; retire `access_tokens` + `token_server_assignments` from provisioning, then drop; fold `commission_ledger` into `order_payments` + view.
- **Phase 5 — Final SCHEMA.md** as the authoritative record of the locked model.

---

## 10. Resolved decisions (locked 2026-09-23, pending final confirmation)

1. **Order money fields → pure view.** Derive `total_paid_mmk` / `commission_amount_mmk` in `order_view`; drop the stored columns. Keep `price_mmk` / `commission_percent` as order-creation snapshots. (§3.4, §5.2)
2. **`commission_ledger` → folded into `order_payments`.** Drop the table; expose the old shape as a compat view. Commission is a derived sum. (§3.5, §3.10, §6.1)
3. **`display_name` → standardize at the view layer now; defer the physical column rename.** (§4)
4. **Auth → service-role + tenant-checked RPCs now; RLS as additive future hardening.** Every RPC takes `reseller_id` and validates ownership. (§6)
