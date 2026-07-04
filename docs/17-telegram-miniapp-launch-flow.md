# Telegram Bot to Mini App Launch Flow

## Real `/start` Flow

1. A customer sends `/start` to the reseller's Telegram bot.
2. `bot/manager.js` has already started the reseller-specific bot from `reseller_miniapps.bot_token_encrypted`, registered its webhook, and passed `reseller_id`, brand, slug, support username, and trial settings into `setupHandlers()`.
3. `bot/handlers.js` reads `ctx.from.id`, username, first name, and last name.
4. `ensureCustomerAndLink()` finds or creates:
   - `vpn_customers` scoped to the reseller
   - `telegram_links` scoped to the same reseller and Telegram user ID
5. `ensureCustomerSsconfToken()` creates a stable customer `ssconf_token` if missing.
6. If trial is enabled and `telegram_links.trial_used_at` is empty, the bot checks for an existing active order.
7. If no active order exists, `trialService.createTrialOrder()` atomically claims `trial_used_at` and creates one active trial order.
8. `trialService.provisionTrialKey()` creates a trial Outline key if the order does not already have one.
9. The bot sends a branded welcome message with the persistent reply keyboard.
10. The bot sends inline buttons for Mini App purchase/renew and support when configured.

This is idempotent: returning users keep the same link and `ssconf_token`, do not get a second trial, and `provisionTrialKey()` skips duplicate active keys.

## Bot Buttons

- `Outline Key ရယူရန်`: resolves the reseller-scoped Telegram customer, finds the best active order, finds the active key, and returns a dynamic `ssconf://` link plus an Outline import bridge button.
- `လက်ကျန်စစ်ရန်`: opens the Mini App home URL with `?slug=<miniapp_slug>`.
- `Server ပြောင်းရန်`: opens the Mini App home URL with `?slug=<miniapp_slug>`; the customer uses the Servers tab.
- `Download Outline`: shows iOS, Android, macOS, and Windows official download options with callback handlers.
- `အသုံးပြုနည်း`: sends setup instructions and reseller support contact.
- `ဝယ်ယူရန် / သက်တမ်းတိုးရန်`: opens the Mini App packages URL with `?slug=<miniapp_slug>`.
- `Admin / Support`: opens the reseller support Telegram username when configured.
- `/app`: sends a clear Mini App open button for the reseller slug.

## Mini App Slug and Auth

- Bot WebApp URLs include `?slug=<miniapp_slug>`.
- The Mini App reads the slug from query string, Telegram `start_param`, then `VITE_MINIAPP_SLUG`.
- The hardcoded `nexa` fallback was removed so the app does not silently load the wrong reseller.
- Missing slug now produces a clear frontend error.
- `POST /api/miniapp/:slug/auth` verifies Telegram `initData` with that reseller workspace's encrypted bot token.
- The dev fallback remains environment-gated behind `NODE_ENV === "development"` and only when no `initData` is sent.

## Trial Rules

- Trial creation is attempted only when no active order exists, trial is enabled, and `trial_used_at` is empty.
- Trial claim is atomic in `trialService`.
- Trial key provisioning is idempotent and non-fatal.
- Mini App auth now remains usable if trial auto-creation fails because of missing trial plan/server setup; the failure is logged and the customer sees no active package instead of a crash.

## Paid Purchase Rules

- Packages load from active non-trial plans.
- Checkout requires a payment screenshot.
- Screenshot upload stores a private Supabase Storage path scoped as `{slug}/{reseller_id}/{uuid}.{ext}`.
- Screenshot upload, paid order creation, and server switching now verify Telegram `initData` and ensure it matches the submitted `telegram_user_id`.
- Paid order creation uses `orderLifecycleService.activatePendingReviewPurchase()`.
- Active trial access is stopped before paid access starts.
- Duplicate active paid purchase is blocked.
- Pending-review paid orders may have temporary active access by current business rule.

## Server Switch Rules

- The Servers page loads active servers for the reseller Mini App.
- When a Telegram user ID is supplied, the server list request must include matching Telegram `initData`.
- Server switching requires active valid access.
- Switching creates a new Outline key on the selected server.
- Old active keys for the same order are deleted/marked deleted after the new key is stored.
- If new key creation fails, route-local rollback removes the new partial key and decrements server usage where needed.

## Known Risks

- Server switching still does route-local Outline key creation/old-key cleanup rather than a dedicated lifecycle service.
- `GET /api/miniapp/:slug/config` and public plan/server browsing are intentionally public by slug.
- Official Outline app store URLs should be checked again before public launch.
- `API_REFERENCE.md` may contain stale older notes about lazy trial provisioning; this launch-flow doc reflects current code.

## Manual Test Checklist

1. New Telegram user sends `/start` and receives welcome, buttons, and one trial.
2. Same user sends `/start` again and does not receive duplicate trial/key.
3. User presses Outline Key button and receives current working key.
4. User presses Download Outline and sees platform download options.
5. User presses Server Change or Balance and Mini App opens with correct reseller brand.
6. `/app` command opens or sends Mini App link.
7. Mini App auth succeeds inside Telegram.
8. Mini App auth fails safely with invalid `initData`.
9. User with active trial sees trial status and key.
10. User buys paid package with screenshot upload.
11. Trial stops and paid order becomes active pending review.
12. Duplicate paid purchase is blocked while active paid order exists.
13. Reseller confirms payment and customer status updates.
14. Reseller rejects payment and customer access is removed.
15. Customer switches server and old key is removed.
16. Missing screenshot or storage signing failure shows a clear error.
