# Production business display inventory

Baseline: main 786dd5f; isolated branch codex/production-business-display-consistency. Reviewed docs carried in cb4b584; see business-display-documentation-manifest.json. No application/development migration/environment files copied.

Read-only production verification 2026-10-15: seven relevant backend files (lifecycle, provisioning, payment ledger, enrichment, reseller orders, Mini App routes, bot strings) match normalized source. Initial raw hash discrepancies were CRLF only. Public asset observations in the approved spec identify deployed bundles; rendered behavior remains to be verified locally.

| Surface | Source / route | Facts / scope | Verification |
| --- | --- | --- | --- |
| Admin overview/analytics | adminDataRouter.js /api/admin/stats,analytics; OverviewPage,AnalyticsPage | Platform period totals, ledger/legacy | Source inventoried; final rendered/behavior evidence pending |
| Admin orders/customers | adminDataRouter.js orders,customers; OrdersPage,CustomersPage | Order quota, states, current/queue/last, lifetime | Source inventoried; final rendered/behavior evidence pending |
| Admin settlements | adminAccountingRouter.js; SettlementsPage | Frozen month snapshot versus live totals | Source inventoried; final rendered/behavior evidence pending |
| Admin keys/servers | adminDataRouter.js; KeysPage,ServersPage | Key-specific usage; capacity, health, assigned node | Source inventoried; final rendered/behavior evidence pending |
| Admin catalogue/resellers/monitoring | PlansPage,ResellersPage,MonitoringPage | Catalogue/configuration and actual operational metrics | Source inventoried; final rendered/behavior evidence pending |
| Reseller overview/orders/Telegram | resellerStatsRouter.js,resellerOrdersRouter.js; OverviewPage,OrdersTable,TelegramOrdersPage | Tenant period totals, quota/review/access | Source inventoried; final rendered/behavior evidence pending |
| Reseller customers/accounting | resellerCustomersRouter.js,resellerAccountingRouter.js; CustomersPage,AccountingPage | Tenant current/history/lifetime/month | Source inventoried; final rendered/behavior evidence pending |
| Reseller configuration | PlansPage,SettingsPage,NotificationsPage | Catalogue, preferences and template variables | Source inventoried; final rendered/behavior evidence pending |
| Mini App Home/Settings/Servers | resellerMiniappRoutes.js auth; HomePage,SettingsPage,ServersPage | Public current/last/quota, actual key protocol/included nodes | Source inventoried; final rendered/behavior evidence pending |
| Mini App checkout | resellerMiniappRoutes.js purchase; PackagesPage,CheckoutPage,PaymentStatusPage | Offer versus recorded amount and submitted queue review | Source inventoried; final rendered/behavior evidence pending |
| Telegram notifications | bot/handlers.js,strings.js,notificationTemplates.js; notificationService.js | Customer package balance/review and Yangon schedule | Source inventoried; final rendered/behavior evidence pending |
| Dashboard create/confirm/retry | resellerOrdersRouter.js,orderActionRoutes.js,adminOrderActionsRouter.js; OrderForm,OrdersTable | Scoped manual received payment; start/queue; safe recovery | Source inventoried; final rendered/behavior evidence pending |

No live configuration, payment, order, provider or notification writes. All test IDs are synthetic.
