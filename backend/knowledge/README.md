# NovaNet MM Knowledge Base

Reviewed 2026-10-15. These are scoped customer/content reference facts. No production RAG chatbot currently reads them. The earlier RAG proposal is historical; do not interpret this directory as an enabled AI support service.

| File | Scope |
| --- | --- |
| plans.md | Catalogue snapshot and dynamic pricing rules |
| product.md | Marzneshin-backed Shadowsocks/VLESS and package lifecycle |
| servers.md | Verified fleet snapshot, tier rules and location semantics |
| trial.md | Explicit claim, workspace eligibility and expiry |
| purchase.md | Initial versus queued purchase, receipt and review |
| setup.md | App/protocol-specific link import |
| troubleshooting.md | Current access, quota, queue and review troubleshooting |
| support.md | Workspace-specific support and safe escalation |
| company.md | Platform/white-label identity and limits of verified claims |

## Authority and updates

Runtime values come from the current reseller workspace, plan/order/payment snapshots and backend responses. Do not publish a static payment account, support identity, server count or trial promise as universal. The documents record a reviewed snapshot, not a promise that future configuration stays unchanged.

When code or configuration changes, update the affected facts and last_updated date; compare current source and the intended environment. Source copy is in backend/src/bot/strings.js, notificationTemplates.js and miniapp/src/i18n/language.jsx. Root SCHEMA.md, SYSTEM_DESIGN.md, SKILL_API_CONTRACTS.md and DEPLOYMENT.md own technical details; docs/DOCUMENTATION.md identifies stages.

Historical marketing work is outside this application repository. No missing SKILL_KNOWLEDGE_BASE.md or deferred reseller.md is required to use these files. Reseller commercial policy is not established by this customer knowledge base.
