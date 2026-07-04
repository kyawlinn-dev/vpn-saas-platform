# Launch Readiness Check

## Purpose

This project is close to the first private launch, where the founder operates both the Platform Admin and first Reseller account. The launch readiness check gives the operator one backend answer for whether the reseller workspace can accept real customers without missing setup data.

## Endpoints

### Reseller

`GET /api/reseller/launch-readiness`

- Requires reseller cookie auth.
- Runs only for the logged-in reseller.
- Does not return bot tokens, Outline API URLs, cert hashes, Supabase keys, or storage credentials.
- Returns:

```json
{
  "success": true,
  "ready": false,
  "summary": { "pass": 10, "warn": 2, "fail": 1, "total": 13 },
  "data": {
    "reseller_id": "reseller-id",
    "miniapp_slug": "brand-slug",
    "workspace_enabled": true,
    "bot_status": {
      "token_saved": true,
      "token_valid": true,
      "webhook_registered": true,
      "running": true,
      "connected": true,
      "bot_username": "brand_bot",
      "bot_id": 123456789,
      "webhook_registered_at": "2026-07-05T00:00:00.000Z"
    }
  },
  "checks": [
    {
      "id": "bot_webhook",
      "status": "pass",
      "label": "Telegram webhook",
      "message": "Webhook is registered in the running bot manager."
    }
  ]
}
```

### Admin

`GET /api/admin/launch-readiness`

- Requires admin cookie auth.
- Gives a compact platform-level view: active reseller count, enabled workspace count, connected bot count, active paid plans, active servers, environment URLs, storage, lifecycle, and auto-stop readiness.
- This is optional operational visibility; the reseller endpoint is the main launch gate for the founder-operated reseller.

## Required Launch Setup Data

- Active reseller account.
- Enabled reseller Mini App workspace.
- Mini App slug.
- Brand name.
- Support username or link.
- Payment instructions/details.
- Encrypted Telegram bot token.
- Bot token identity detected.
- Bot webhook registered in the running backend process.
- Telegram Mini App URL configured with HTTPS.
- Public webhook base URL configured with HTTPS.
- At least one active Outline server with API URL, cert SHA-256, and remaining capacity.
- At least one active paid plan with price, duration, devices, and data limit.
- If trial is enabled: an active trial plan and workspace trial duration/data limit.
- Private Supabase Storage bucket named `payment-screenshots`.
- Order lifecycle service available for trial-to-paid cleanup and duplicate active paid order blocking.
- Hourly auto-stop job scheduled by backend startup.

## Blocking Failures

These checks block launch by setting `ready: false`:

- Reseller account inactive.
- Missing or disabled workspace.
- Missing Mini App slug or brand name.
- Missing payment instructions.
- Missing or invalid bot token identity.
- Webhook not registered or bot not running.
- Missing HTTPS Mini App URL.
- Missing HTTPS webhook base URL.
- Invalid bot token encryption key.
- No valid active paid package.
- No ready active Outline server.
- Trial enabled but no valid active trial plan.
- Trial enabled but no trial duration/data limit.
- Missing or public payment screenshot bucket.

## Warning Only

Warnings do not block `ready`, but should be resolved before public launch:

- Missing support contact.
- Missing `PUBLIC_SUBSCRIPTION_BASE_URL` for legacy token portal links.
- Missing `PUBLIC_WORKER_BASE_URL` for Outline import bridge links.
- No ready default server, when another ready server exists.
- Some active paid plans have incomplete fields.
- Storage bucket could not be verified due to an unexpected runtime error.
- Bot command/menu registration cannot be confirmed because the bot is not running.

## Manual Setup Checklist

1. Create active reseller account.
2. Set reseller brand name and miniapp slug.
3. Add support username/link.
4. Add payment instructions/details.
5. Save valid Telegram bot token.
6. Confirm bot webhook registered and bot username appears.
7. Add at least one active Outline server.
8. Confirm Outline API connection works.
9. Add at least one active paid plan.
10. If trial enabled, confirm trial plan/config works.
11. Confirm Mini App URL opens from Telegram bot.
12. Confirm payment screenshot upload works.
13. Confirm reseller dashboard can view and review orders.
14. Confirm stop/reject removes access.
15. Confirm auto-stop job is scheduled/runnable.

## Known Risks

- The readiness endpoint does not call Telegram on every request; it uses stored bot identity plus the current `botManager` runtime state. Re-save the bot token or restart the backend if status looks stale.
- Storage readiness uses Supabase Storage metadata. If the environment cannot reach storage, the check may warn even though the bucket exists.
- Outline server readiness checks configuration and capacity, but does not create a test key. Run a real trial or paid purchase smoke test before sending traffic.
- Bot command/menu registration is attempted during bot startup and token save. Telegram command state is not re-read on every readiness request.
- `GET /api/miniapp/:slug/config` and public package/server browsing remain public by slug, by design.

