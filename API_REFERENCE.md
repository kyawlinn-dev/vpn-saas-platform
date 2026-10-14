# API Reference — NovaNet MM Backend

Reviewed: 2026-10-15. This is the concise production route guide; SKILL_API_CONTRACTS.md owns detailed request/response contracts. docs/API_ROUTE_INVENTORY.md lists routes extracted from the production-source baseline and identifies local-only additions. An existing route is not necessarily an available operation.

## Access and tenancy

JSON APIs use /api. Dashboard sessions use backend-issued httpOnly cookies and trusted-origin checks. Admin operations have platform oversight; reseller operations use the authenticated reseller scope. Reseller /me and workspace have preparation gates for pending accounts; operational routes generally require an active reseller. Mini App requests verify Telegram init data against the slug's workspace.

Service-role credentials remain backend-only. Workspace bot token, slug, logo, color, trial settings and admin notification identity are admin-managed. Brand name, support contact and payment information are reseller-managed; bot status is read-only to resellers.

## Customer routes

- GET /api/health — process health.
- GET /api/miniapp/:slug/config — public workspace config.
- POST /api/miniapp/:slug/auth — Telegram auth, customer linkage, subscription/quota and queued_subscription.
- GET /api/miniapp/:slug/plans — purchasable catalogue.
- GET /api/miniapp/:slug/servers — server availability/access.
- POST /api/miniapp/:slug/servers/:serverId/link — existing protocol/tier/quota-checked link/switch.
- POST /api/miniapp/:slug/upload-screenshot — private receipt upload.
- POST /api/miniapp/:slug/orders — initial purchase or one queued next package.
- GET /k/:ssconf_token.json — customer Shadowsocks config.
- GET /open-key?url=ssconf://... — compatible Shadowsocks import bridge.

Initial purchases give access pending review. An active purchase awaiting review blocks another checkout; a confirmed active purchase may queue one next package. A queued purchase retains the current protocol and gets no immediate replacement key. VLESS imports use the panel subscription; Shadowsocks retains its customer ssconf surface.

## Reseller routes

- /api/auth/reseller — login/signup/session/refresh/logout handlers.
- /api/reseller/me and /workspace — profile and allowed workspace settings.
- /api/reseller/orders — scoped list/create/counts.
- /api/reseller/orders/:orderId/eligible-servers and /switch-server — paid manual switching.
- /api/reseller/customers — scoped customer reads/writes and protocol switching.
- /api/reseller/stats/overview — scoped aggregate overview.
- /api/reseller/plans and /keys — catalogue and key reads.
- /api/reseller/accounting/monthly and /monthly/settlement — accounting/settlement workflow.
- /api/reseller/notification-templates — per-workspace notification configuration.
- /api/reseller/order-actions/:orderId/:action — existing activation/queue/renew/review/stop actions.
- /api/reseller/launch-readiness — workspace checks.

See the route inventory for exact methods, suffixes and receipt/proof routes. Payment review and access state are different facts; recognized revenue uses confirmed and applied ledger entries.

## Admin routes

- /api/admin/auth and /me — authentication/session/profile.
- /api/admin/servers — server reads, capacity/tier edits and disabled compatibility operations below.
- /api/admin/resellers and /:id/workspace — reseller lifecycle and admin-owned workspace configuration.
- /api/admin/plans — catalogue management.
- /api/admin/orders, /customers, /customers/:customerId and /keys — oversight reads.
- /api/admin/customers/cleanup-preview and /cleanup-delete — explicit selected test-customer cleanup.
- /api/admin/analytics — ledger-based period analytics with explicit legacy handling.
- /api/admin/settlements — submitted settlement review/confirmation/reopening.
- /api/admin/platform-settings — platform configuration.
- /api/admin/monitoring and /launch-readiness — business/operational health.
- /api/admin/order-actions/:orderId/:action — existing admin order actions.

Cleanup requires exact reseller/customer selection and the existing typed confirmation/paid-data rules. Server tier changes are blocked when active keys remain.

## Disabled compatibility routes

| Method and route | Current result |
| --- | --- |
| POST /api/admin/servers/provision | HTTP 410, PROVISIONING_UNAVAILABLE |
| POST /api/admin/servers/:serverId/decommission | HTTP 410, DECOMMISSION_UNAVAILABLE |

Automatic Outline provisioning/droplet deletion is retired. These endpoints do not add or remove a current Marzneshin node.

## Telegram webhook

POST /api/bot-webhook/:resellerId requires X-Telegram-Bot-Api-Secret-Token. Registration and timing-safe verification are owned by the bot manager.

## Development-only channel API

GET/POST /api/messenger/webhook and shared purchase/notification/trial adapters exist in the local development checkout, not the deployed production baseline. See SKILL_API_CONTRACTS.md's development section and DEPLOYMENT.md's migration gate. Do not deploy the dirty checkout as a documentation update.

## Retired routes and future contracts

Legacy /t, /sub, /open/:token/:region and single-bot /api/public subscription routes are unmounted. DO App Platform and the Cloudflare Worker customer portal are retired.

The October 14 business-display spec/plan proposes additive summaries. Those fields are not current implemented contracts, and the known reseller percentage bug remains open until its implementation is verified.
