# API Route Inventory

Generated 2026-10-15 from literal Express app/router declarations in the production-source reference `786dd5f9d7cddd5fdc3341f7315a867ed87b365b` (local main). This is a source inventory, not an assertion that every endpoint was called on production. Dynamic middleware/factory routes require their source contract; docs below label the development Messenger factory separately. Detailed shapes are in ../SKILL_API_CONTRACTS.md; ../API_REFERENCE.md is the concise guide.

| Method | Route | Router source | Availability note |
| --- | --- | --- | --- |
| GET | `/api/admin/analytics` | `backend/src/routes/admin/adminDataRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| POST | `/api/admin/auth/login` | `backend/src/routes/admin/adminSessionRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| POST | `/api/admin/auth/logout` | `backend/src/routes/admin/adminSessionRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| GET | `/api/admin/auth/me` | `backend/src/routes/admin/adminSessionRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| POST | `/api/admin/auth/refresh` | `backend/src/routes/admin/adminSessionRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| GET | `/api/admin/customers` | `backend/src/routes/admin/adminDataRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| GET | `/api/admin/customers/:customerId` | `backend/src/routes/admin/adminDataRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| POST | `/api/admin/customers/cleanup-delete` | `backend/src/routes/admin/adminDataRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| POST | `/api/admin/customers/cleanup-preview` | `backend/src/routes/admin/adminDataRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| GET | `/api/admin/keys` | `backend/src/routes/admin/adminDataRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| GET | `/api/admin/launch-readiness` | `backend/src/routes/admin/launchReadinessRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| GET | `/api/admin/me` | `backend/src/routes/admin/adminMeRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| GET | `/api/admin/monitoring` | `backend/src/routes/admin/adminMonitoringRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| GET | `/api/admin/monitoring/events` | `backend/src/routes/admin/adminMonitoringRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| GET | `/api/admin/monitoring/health` | `backend/src/routes/admin/adminMonitoringRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| GET | `/api/admin/monitoring/journey` | `backend/src/routes/admin/adminMonitoringRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| POST | `/api/admin/monitoring/notifications/run-pass` | `backend/src/routes/admin/adminMonitoringRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| GET | `/api/admin/monitoring/screenshot-backlog` | `backend/src/routes/admin/adminMonitoringRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| GET | `/api/admin/monitoring/summary` | `backend/src/routes/admin/adminMonitoringRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| POST | `/api/admin/order-actions/:orderId/activate` | `backend/src/routes/admin/adminOrderActionsRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| POST | `/api/admin/order-actions/:orderId/confirm-payment` | `backend/src/routes/admin/adminOrderActionsRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| POST | `/api/admin/order-actions/:orderId/extend` | `backend/src/routes/admin/adminOrderActionsRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| POST | `/api/admin/order-actions/:orderId/reject-payment` | `backend/src/routes/admin/adminOrderActionsRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| POST | `/api/admin/order-actions/:orderId/stop` | `backend/src/routes/admin/adminOrderActionsRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| GET | `/api/admin/orders` | `backend/src/routes/admin/adminDataRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| GET | `/api/admin/overview` | `backend/src/routes/admin/adminDataRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| GET | `/api/admin/plans` | `backend/src/routes/admin/adminDataRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| POST | `/api/admin/plans` | `backend/src/routes/admin/adminPlansRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| PATCH | `/api/admin/plans/:id` | `backend/src/routes/admin/adminPlansRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| GET | `/api/admin/platform-settings` | `backend/src/routes/admin/adminPlatformSettingsRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| PUT | `/api/admin/platform-settings` | `backend/src/routes/admin/adminPlatformSettingsRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| GET | `/api/admin/resellers` | `backend/src/routes/admin/adminResellersRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| POST | `/api/admin/resellers` | `backend/src/routes/admin/adminResellersRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| PATCH | `/api/admin/resellers/:id` | `backend/src/routes/admin/adminResellersRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| GET | `/api/admin/resellers/:id/workspace` | `backend/src/routes/admin/adminResellersRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| PATCH | `/api/admin/resellers/:id/workspace` | `backend/src/routes/admin/adminResellersRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| GET | `/api/admin/servers` | `backend/src/routes/admin/adminServersRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| GET | `/api/admin/servers/:serverId` | `backend/src/routes/admin/adminServersRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| PATCH | `/api/admin/servers/:serverId/capacity` | `backend/src/routes/admin/adminServersRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| POST | `/api/admin/servers/:serverId/decommission` | `backend/src/routes/admin/adminServersRouter.js` | Disabled: HTTP 410 |
| PATCH | `/api/admin/servers/:serverId/tier` | `backend/src/routes/admin/adminServersRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| GET | `/api/admin/servers/inventory` | `backend/src/routes/admin/adminServersRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| POST | `/api/admin/servers/provision` | `backend/src/routes/admin/adminServersRouter.js` | Disabled: HTTP 410 |
| GET | `/api/admin/settlements` | `backend/src/routes/admin/adminSettlementsRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| POST | `/api/admin/settlements/:settlementId/confirm` | `backend/src/routes/admin/adminSettlementsRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| GET | `/api/admin/settlements/:settlementId/proof-url` | `backend/src/routes/admin/adminSettlementsRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| POST | `/api/admin/settlements/:settlementId/reopen` | `backend/src/routes/admin/adminSettlementsRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| POST | `/api/auth/reseller/confirm-reset` | `backend/src/routes/auth/resellerSessionRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| POST | `/api/auth/reseller/forgot-password` | `backend/src/routes/auth/resellerSessionRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| POST | `/api/auth/reseller/login` | `backend/src/routes/auth/resellerSessionRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| POST | `/api/auth/reseller/logout` | `backend/src/routes/auth/resellerSessionRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| GET | `/api/auth/reseller/me` | `backend/src/routes/auth/resellerSessionRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| POST | `/api/auth/reseller/refresh` | `backend/src/routes/auth/resellerSessionRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| POST | `/api/bot-webhook/:resellerId` | `backend/src/bot/webhookRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| GET | `/api/health` | `backend/src/server.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| POST | `/api/miniapp/:slug/auth` | `backend/src/routes/public/resellerMiniappRoutes.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| GET | `/api/miniapp/:slug/config` | `backend/src/routes/public/resellerMiniappRoutes.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| POST | `/api/miniapp/:slug/events` | `backend/src/routes/public/resellerMiniappRoutes.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| POST | `/api/miniapp/:slug/orders` | `backend/src/routes/public/resellerMiniappRoutes.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| GET | `/api/miniapp/:slug/plans` | `backend/src/routes/public/resellerMiniappRoutes.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| PATCH | `/api/miniapp/:slug/protocol-preference` | `backend/src/routes/public/resellerMiniappRoutes.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| GET | `/api/miniapp/:slug/servers` | `backend/src/routes/public/resellerMiniappRoutes.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| POST | `/api/miniapp/:slug/servers` | `backend/src/routes/public/resellerMiniappRoutes.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| POST | `/api/miniapp/:slug/servers/:serverId/link` | `backend/src/routes/public/resellerMiniappRoutes.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| POST | `/api/miniapp/:slug/upload-screenshot` | `backend/src/routes/public/resellerMiniappRoutes.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| GET | `/api/reseller/accounting/monthly` | `backend/src/routes/reseller/resellerAccountingRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| POST | `/api/reseller/accounting/monthly/settlement` | `backend/src/routes/reseller/resellerAccountingRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| POST | `/api/reseller/accounting/monthly/settlement-proof` | `backend/src/routes/reseller/resellerAccountingRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| GET | `/api/reseller/accounting/monthly/settlement-proof-url` | `backend/src/routes/reseller/resellerAccountingRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| GET | `/api/reseller/accounting/platform-payment` | `backend/src/routes/reseller/resellerAccountingRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| GET | `/api/reseller/customers` | `backend/src/routes/reseller/resellerCustomersRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| POST | `/api/reseller/customers/:customerId/switch-protocol` | `backend/src/routes/reseller/resellerCustomersRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| GET | `/api/reseller/customers/counts` | `backend/src/routes/reseller/resellerCustomersRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| GET | `/api/reseller/keys` | `backend/src/routes/reseller/resellerKeysRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| GET | `/api/reseller/launch-readiness` | `backend/src/routes/reseller/launchReadinessRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| GET | `/api/reseller/me` | `backend/src/routes/reseller/resellerMeRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| GET | `/api/reseller/notification-templates` | `backend/src/routes/reseller/resellerNotificationTemplatesRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| DELETE | `/api/reseller/notification-templates/:eventType` | `backend/src/routes/reseller/resellerNotificationTemplatesRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| PATCH | `/api/reseller/notification-templates/:eventType` | `backend/src/routes/reseller/resellerNotificationTemplatesRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| POST | `/api/reseller/notification-templates/:eventType/preview` | `backend/src/routes/reseller/resellerNotificationTemplatesRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| POST | `/api/reseller/order-actions/:orderId/activate` | `backend/src/routes/reseller/orderActionRoutes.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| POST | `/api/reseller/order-actions/:orderId/cancel-scheduled` | `backend/src/routes/reseller/orderActionRoutes.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| POST | `/api/reseller/order-actions/:orderId/confirm-payment` | `backend/src/routes/reseller/orderActionRoutes.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| POST | `/api/reseller/order-actions/:orderId/extend` | `backend/src/routes/reseller/orderActionRoutes.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| POST | `/api/reseller/order-actions/:orderId/payment-status` | `backend/src/routes/reseller/orderActionRoutes.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| POST | `/api/reseller/order-actions/:orderId/reject-payment` | `backend/src/routes/reseller/orderActionRoutes.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| POST | `/api/reseller/order-actions/:orderId/renew` | `backend/src/routes/reseller/orderActionRoutes.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| POST | `/api/reseller/order-actions/:orderId/stop` | `backend/src/routes/reseller/orderActionRoutes.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| GET | `/api/reseller/orders` | `backend/src/routes/reseller/resellerOrdersRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| POST | `/api/reseller/orders` | `backend/src/routes/reseller/resellerOrdersRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| GET | `/api/reseller/orders/:orderId/eligible-servers` | `backend/src/routes/reseller/resellerServerSwitchRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| GET | `/api/reseller/orders/:orderId/screenshot-url` | `backend/src/routes/reseller/resellerOrdersRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| POST | `/api/reseller/orders/:orderId/switch-server` | `backend/src/routes/reseller/resellerServerSwitchRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| GET | `/api/reseller/orders/counts` | `backend/src/routes/reseller/resellerOrdersRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| GET | `/api/reseller/plans` | `backend/src/routes/reseller/resellerPlansRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| GET | `/api/reseller/stats/overview` | `backend/src/routes/reseller/resellerStatsRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| GET | `/api/reseller/workspace` | `backend/src/routes/reseller/resellerWorkspaceRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| PATCH | `/api/reseller/workspace` | `backend/src/routes/reseller/resellerWorkspaceRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| GET | `/k/:token` | `backend/src/routes/public/ssconfRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |
| GET | `/open-key` | `backend/src/routes/public/portalRouter.js` | Existing baseline; auth/tenant guards and runtime configuration apply |

## Development-only factory routes

GET and POST `/api/messenger/webhook` are mounted by the current local development server/factory. They are not part of the deployed baseline above. See ../SKILL_API_CONTRACTS.md and MESSENGER_LOCAL_SETUP.md.

## Verification boundary

Literal route inventory excludes retired/unmounted legacy routers and does not treat a route name as permission to mutate production. It includes explicit source-baseline dev/proxy diagnostics where declared; those remain environment-gated. Regenerate after changing server mounts or router methods. Public customer payloads must not expose service-role credentials or staff-only finance.
