# SKILL_TEST.md

## Skill Name

NovaNet MM — Test Skill

## Invoke As

`/test` or: `Use the test skill and check <specific behavior>.`

## Purpose

Write and run a small, high-value set of tests for the code being changed. Focus on critical business logic, public APIs, edge cases, regressions, and bug fixes — not exhaustive coverage. Prefer behavior-focused tests over implementation details. Reuse and extend existing tests instead of creating duplicates. Keep the suite fast and maintainable. Run only the relevant tests when possible.

## When to Use

- After implementing or changing any backend service, middleware, or utility
- When fixing a bug — add a regression test before fixing
- When the verifier or auditor flags behavior that has no test coverage
- Before merging to `main`

## Test Runner

```bash
# From backend/
npm test           # vitest run (all tests)
npm test -- --reporter=verbose   # with detailed output
```

## Test Location

```
backend/src/__tests__/
  middleware.auth.test.js        — requireAdmin, requireActiveReseller
  miniapp.hmac.test.js          — Telegram initData HMAC-SHA256 verification
  orderLifecycle.test.js        — order state transitions, guard logic
  commission.test.js            — commission calculation formula
  serverCapacity.test.js        — key count and expiry date logic
  autoStop.test.js              — expiry detection and job date logic
```

## Priority Test Areas (highest value)

1. **Telegram HMAC verification** — if this breaks, every miniapp customer is locked out or the endpoint is open to forged requests
2. **requireAdmin / requireActiveReseller** — if these fail open, any user can access protected routes
3. **Order status guards** — activating an already-active order, rejecting a confirmed payment, extending a stopped order
4. **assertNoOtherActivePurchase** — prevents a customer having two active paid subscriptions at once
5. **Commission calculation** — financial data; rounding errors affect reseller payouts
6. **autoStop date logic** — wrong date means orders expire early or never

## Mocking Pattern

Backend uses ESM (`"type": "module"`). Mock Supabase with `vi.mock()`:

```js
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('../../lib/supabase.js', () => ({
  supabase: { from: vi.fn() }
}))
```

Use `vi.fn().mockResolvedValue(...)` for async Supabase chain methods.

## Output Format

```
Test result: pass / fail
Tests added: <list>
Coverage gaps: <list>
Issues: <list>
```

## Do Not

- Write low-value tests just to increase line coverage
- Mock things that don't need mocking (pure functions need no mocks)
- Write tests that test the mocks instead of the real logic
- Modify production code to make tests pass (refactor to testable first, then test)
