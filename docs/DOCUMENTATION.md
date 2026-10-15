# Documentation Authority and Status

Reviewed 2026-10-15. Use current production references for deployed behavior, the labelled development sections for local work, and design records for intended future behavior. A file existing on develop is not proof of a production deployment.

## Sources and environments

| Subject | Authority |
| --- | --- |
| Working rules and product boundaries | [AGENTS.md](../AGENTS.md) |
| Production architecture and separately labelled development | [SYSTEM_DESIGN.md](../SYSTEM_DESIGN.md) |
| Hosting, release and migration gates | [DEPLOYMENT.md](../DEPLOYMENT.md) |
| Verified columns and RPC/view exposure | [SCHEMA.md](../SCHEMA.md) |
| Detailed API behavior | [SKILL_API_CONTRACTS.md](../SKILL_API_CONTRACTS.md) |
| Concise routes / generated source inventory | [API_REFERENCE.md](../API_REFERENCE.md), [API_ROUTE_INVENTORY.md](API_ROUTE_INVENTORY.md) |
| Telegram production behavior | [SKILL_BOT.md](../SKILL_BOT.md) |
| Customer/content facts | [Knowledge base](../backend/knowledge/README.md) |
| Runtime copy and review snapshots | Source strings/dictionary; [BURMESE_TEXT.md](../BURMESE_TEXT.md), [MINIAPP_TEXT.md](../MINIAPP_TEXT.md) |
| Local Messenger setup | [MESSENGER_LOCAL_SETUP.md](MESSENGER_LOCAL_SETUP.md) |

Production Supabase: daenwuszqdfkbjiatsjs. Development: huqmzvlzfcexycdrsxpn. The schema documents independent read-only verification. OpenAPI does not prove all CHECK/trigger/grant DDL or migration history. The local development panel is shared by operator choice; development DB isolation alone does not authorize provisioning panel users.

Current production is Marzneshin-only for active access. Backend/Mini App use Droplet Nginx/PM2 and manual Ansible; dashboards deploy through GitHub Actions to Cloudflare Pages. Messenger/shared purchase/durable delivery/customer trial-claim changes (0027–0036) are local work, not the verified production baseline. Business-display consistency is implemented and verified locally on its isolated branch; production deployment and migration 0037 remain pending.

## Keeping references current

- Update API contracts with response changes and regenerate literal route inventory from the intended release source. Label disabled operations and development-only factories.
- Verify schema separately per environment; document the date and what was actually inspected. Do not infer migration completion solely from source files.
- Copy references record source hashes. Regenerate all Mini App MM/EN dictionary rows and exported bot/template declarations after copy edits; compare missing/removed/changed values.
- Preserve historical commands/results under a historical notice. Old tests are dated observations, not present verification.
- Historical target designs cannot authorize dropping compatibility fields or restoring retired provider paths.
- Check referenced local paths in context; ignored secret files and planned paths are not required public artifacts. Do not copy credentials into docs or test fixtures.
- Keep date-only expiry, Bangkok business/accounting boundaries and Yangon notification timing distinct. The accepted display design does not change reminder scheduling policy.

## Full document index

67 Markdown documents indexed, plus this index. Preserve production/development/implementation stages.

| Document | Status / authority |
| --- | --- |
| [AGENTS.md](../AGENTS.md) | Current engineering reference; obey labelled subsections |
| [API_REFERENCE.md](../API_REFERENCE.md) | Current engineering reference; obey labelled subsections |
| [BOT_FLOW_COPY_HANDOFF.md](../BOT_FLOW_COPY_HANDOFF.md) | Historical snapshot/proposal; not standing release instructions |
| [BOT_UX_10_OUT_OF_10_BURMESE_REVIEW.md](../BOT_UX_10_OUT_OF_10_BURMESE_REVIEW.md) | Historical snapshot/proposal; not standing release instructions |
| [BURMESE_TEXT.md](../BURMESE_TEXT.md) | Generated current source-copy snapshot |
| [CLAUDE.md](../CLAUDE.md) | Current engineering reference; obey labelled subsections |
| [DEPLOYMENT.md](../DEPLOYMENT.md) | Current engineering reference; obey labelled subsections |
| [DEPLOYMENT_RUNBOOK.md](../DEPLOYMENT_RUNBOOK.md) | Historical snapshot/proposal; not standing release instructions |
| [FINAL_DATA_MODEL.md](../FINAL_DATA_MODEL.md) | Historical target design with current partial-implementation map |
| [KNOWN_BUGS.md](../KNOWN_BUGS.md) | Current engineering reference; obey labelled subsections |
| [MINIAPP_TEXT.md](../MINIAPP_TEXT.md) | Generated current source-copy snapshot |
| [PROVIDER_COEXISTENCE_RUNBOOK.md](../PROVIDER_COEXISTENCE_RUNBOOK.md) | Historical snapshot/proposal; not standing release instructions |
| [README.md](../README.md) | Current engineering reference; obey labelled subsections |
| [SCHEMA.md](../SCHEMA.md) | Current engineering reference; obey labelled subsections |
| [SKILL_API_CONTRACTS.md](../SKILL_API_CONTRACTS.md) | Current engineering reference; obey labelled subsections |
| [SKILL_BACKEND.md](../SKILL_BACKEND.md) | Current engineering reference; obey labelled subsections |
| [SKILL_BOT.md](../SKILL_BOT.md) | Current engineering reference; obey labelled subsections |
| [SKILL_DATABASE.md](../SKILL_DATABASE.md) | Current engineering reference; obey labelled subsections |
| [SKILL_FRONTEND.md](../SKILL_FRONTEND.md) | Current engineering reference; obey labelled subsections |
| [SKILL_MINIAPP.md](../SKILL_MINIAPP.md) | Current engineering reference; obey labelled subsections |
| [SKILL_TEST.md](../SKILL_TEST.md) | Current engineering reference; obey labelled subsections |
| [SUBAGENT_AUDITOR.md](../SUBAGENT_AUDITOR.md) | Current engineering reference; obey labelled subsections |
| [SUBAGENT_BACKEND.md](../SUBAGENT_BACKEND.md) | Current engineering reference; obey labelled subsections |
| [SUBAGENT_DATABASE.md](../SUBAGENT_DATABASE.md) | Current engineering reference; obey labelled subsections |
| [SUBAGENT_FRONTEND.md](../SUBAGENT_FRONTEND.md) | Current engineering reference; obey labelled subsections |
| [SUBAGENT_TEST_REVIEWER.md](../SUBAGENT_TEST_REVIEWER.md) | Current engineering reference; obey labelled subsections |
| [SUBAGENT_VERIFIER.md](../SUBAGENT_VERIFIER.md) | Current engineering reference; obey labelled subsections |
| [SYSTEM_DESIGN.md](../SYSTEM_DESIGN.md) | Current engineering reference; obey labelled subsections |
| [admin-dashboard/README.md](../admin-dashboard/README.md) | Current engineering reference; obey labelled subsections |
| [audit/reports/documentation-alignment-audit.md](../audit/reports/documentation-alignment-audit.md) | Historical pre-correction audit; see the update record |
| [audit/reports/myanmar-blocking-migration-plan-2026-07-12.md](../audit/reports/myanmar-blocking-migration-plan-2026-07-12.md) | Historical audit/runbook |
| [audit/reports/phase3-business-data-repair-runbook-2026-08-04.md](../audit/reports/phase3-business-data-repair-runbook-2026-08-04.md) | Historical audit/runbook |
| [audit/reports/security-audit-2026-07-11.md](../audit/reports/security-audit-2026-07-11.md) | Historical audit/runbook |
| [backend/knowledge/README.md](../backend/knowledge/README.md) | Reviewed scoped customer/content reference; configuration may change |
| [backend/knowledge/company.md](../backend/knowledge/company.md) | Reviewed scoped customer/content reference; configuration may change |
| [backend/knowledge/plans.md](../backend/knowledge/plans.md) | Reviewed scoped customer/content reference; configuration may change |
| [backend/knowledge/product.md](../backend/knowledge/product.md) | Reviewed scoped customer/content reference; configuration may change |
| [backend/knowledge/purchase.md](../backend/knowledge/purchase.md) | Reviewed scoped customer/content reference; configuration may change |
| [backend/knowledge/servers.md](../backend/knowledge/servers.md) | Reviewed scoped customer/content reference; configuration may change |
| [backend/knowledge/setup.md](../backend/knowledge/setup.md) | Reviewed scoped customer/content reference; configuration may change |
| [backend/knowledge/support.md](../backend/knowledge/support.md) | Reviewed scoped customer/content reference; configuration may change |
| [backend/knowledge/trial.md](../backend/knowledge/trial.md) | Reviewed scoped customer/content reference; configuration may change |
| [backend/knowledge/troubleshooting.md](../backend/knowledge/troubleshooting.md) | Reviewed scoped customer/content reference; configuration may change |
| [backend/scripts/FIX-A-quota-preserve-on-migration.md](../backend/scripts/FIX-A-quota-preserve-on-migration.md) | Historical snapshot/proposal; not standing release instructions |
| [docs/API_ROUTE_INVENTORY.md](../docs/API_ROUTE_INVENTORY.md) | Generated production-source route reference |
| [docs/MESSENGER_LOCAL_SETUP.md](../docs/MESSENGER_LOCAL_SETUP.md) | Development-only setup |
| [docs/archive/telegram-bot-v2-original-design.md](../docs/archive/telegram-bot-v2-original-design.md) | Historical snapshot/proposal; not standing release instructions |
| [docs/audits/2026-10-13-channel-notifications-execution.md](../docs/audits/2026-10-13-channel-notifications-execution.md) | Dated local audit/update record |
| [docs/audits/2026-10-13-notification-delay.md](../docs/audits/2026-10-13-notification-delay.md) | Dated local audit/update record |
| [docs/audits/2026-10-14-business-display-validation.md](../docs/audits/2026-10-14-business-display-validation.md) | Local implementation validation; final review pending, not a deployment claim |
| [docs/audits/2026-10-14-production-business-display-inventory.md](../docs/audits/2026-10-14-production-business-display-inventory.md) | Engineering/design reference; obey the stated stage and scope |
| [docs/audits/2026-10-15-dashboard-setup-safety-proposal.md](../docs/audits/2026-10-15-dashboard-setup-safety-proposal.md) | Owner-approved migration prerequisite; implemented locally, not applied to production |
| [docs/audits/2026-10-15-documentation-alignment-update.md](../docs/audits/2026-10-15-documentation-alignment-update.md) | Current documentation correction/verification record |
| [docs/runbooks/business-display-consistency-release.md](../docs/runbooks/business-display-consistency-release.md) | Pending release preflight/recovery/rollback; requires separate production authorization |
| [docs/superpowers/audits/2026-10-13-dashboard-purchases.md](../docs/superpowers/audits/2026-10-13-dashboard-purchases.md) | Development design/plan/execution snapshot; not deployed |
| [docs/superpowers/audits/2026-10-13-messenger-account-menu.md](../docs/superpowers/audits/2026-10-13-messenger-account-menu.md) | Development design/plan/execution snapshot; not deployed |
| [docs/superpowers/audits/2026-10-13-messenger-duration-checkout.md](../docs/superpowers/audits/2026-10-13-messenger-duration-checkout.md) | Development design/plan/execution snapshot; not deployed |
| [docs/superpowers/audits/2026-10-13-purchase-entry-points.md](../docs/superpowers/audits/2026-10-13-purchase-entry-points.md) | Development design/plan/execution snapshot; not deployed |
| [docs/superpowers/audits/2026-10-13-purchase-execution.md](../docs/superpowers/audits/2026-10-13-purchase-execution.md) | Development design/plan/execution snapshot; not deployed |
| [docs/superpowers/plans/2026-10-13-channel-notifications-trials.md](../docs/superpowers/plans/2026-10-13-channel-notifications-trials.md) | Development design/plan/execution snapshot; not deployed |
| [docs/superpowers/plans/2026-10-13-messenger-connection.md](../docs/superpowers/plans/2026-10-13-messenger-connection.md) | Development design/plan/execution snapshot; not deployed |
| [docs/superpowers/plans/2026-10-13-shared-purchases-messenger.md](../docs/superpowers/plans/2026-10-13-shared-purchases-messenger.md) | Development design/plan/execution snapshot; not deployed |
| [docs/superpowers/plans/2026-10-14-production-business-display-consistency.md](../docs/superpowers/plans/2026-10-14-production-business-display-consistency.md) | Approved design/plan; implemented locally, final review pending; not deployed |
| [docs/superpowers/specs/2026-10-13-channel-notifications-trials-design.md](../docs/superpowers/specs/2026-10-13-channel-notifications-trials-design.md) | Development design/plan/execution snapshot; not deployed |
| [docs/superpowers/specs/2026-10-13-messenger-purchases-design.md](../docs/superpowers/specs/2026-10-13-messenger-purchases-design.md) | Development design/plan/execution snapshot; not deployed |
| [docs/superpowers/specs/2026-10-14-production-business-display-consistency-design.md](../docs/superpowers/specs/2026-10-14-production-business-display-consistency-design.md) | Approved design/plan; implemented locally, final review pending; not deployed |
| [miniapp/README.md](../miniapp/README.md) | Current engineering reference; obey labelled subsections |
