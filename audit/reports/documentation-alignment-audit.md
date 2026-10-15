# Documentation alignment audit

> Historical pre-correction audit. Documentation remediation on 2026-10-15 is
> recorded in [the update report](../../docs/audits/2026-10-15-documentation-alignment-update.md).
> Findings and evidence below preserve the original audit state; application
> consistency fixes remain unimplemented.

## Verdict and scope

**Needs work: the documentation set is not fully aligned with current code or production.** The top-level product/deployment overview is broadly correct, but standing operational guidance contains contradictory provider instructions, schema environment boundaries are ambiguous, and several customer/bot references are outdated.

This audit indexed and text-scanned **59 repository Markdown documents** (approximately 10,485 lines before this report). It deeply checked active architecture, deployment, schema, API, bot, customer knowledge and copy claims against source, with read-only production checks for the key findings. Historical audits and proposed designs were checked for stage/authority labels; their old test results and every historical assertion were not rerun. This is a documentation alignment audit, not a new security certification, full route integration test or endorsement of every marketing/support claim.

Comparison scopes:

- Current working checkout: `develop`, HEAD `4096547`, with substantial unrelated uncommitted Messenger/shared-notification work.
- Production-ready source reference: local `main`, `786dd5f9d7cddd5fdc3341f7315a867ed87b365b`; not assumed identical to every deployment.
- Deployed backend: selected source inspected read-only over SSH on the existing Droplet.
- Production Supabase: `daenwuszqdfkbjiatsjs`; development: `huqmzvlzfcexycdrsxpn`. Read-only PostgREST OpenAPI was retrieved independently from both using backend credentials held in memory.
- Current deployed client bundle evidence and quota investigation from this chat; current Mini App copy dictionary was also compared structurally with its Markdown reference.

No existing documentation, application source, production data, configuration or running process was changed. Only this audit report was created. Source-based examples below are evidence, not commands to execute against production.

## What is substantially aligned

- `README.md`, `AGENTS.md` and `CLAUDE.md` correctly identify Express, the Droplet/PM2/Nginx backend and Mini App hosting, and the two Cloudflare Pages dashboards.
- `SYSTEM_DESIGN.md` correctly records the Marzneshin cutover, one active paid package plus one queued package, tenant isolation and database-authoritative quota. Its development feature sections need clearer deployment labels (D02).
- `SKILL_BACKEND.md`, `SKILL_FRONTEND.md` and most of `SKILL_MINIAPP.md` describe the present stack and core boundaries correctly.
- The live production plan catalogue still matches the knowledge base's six paid 30/90-day price/quota combinations. This does not make the surrounding purchase/trial instructions current.
- The deployed provider code selects Marzneshin. All four active server rows returned by the production query are Marzneshin: Singapore #3, Singapore #4, Tokyo #1 and Singapore Trial. Outline rows are historical/decommissioned.
- The development database exposes the Messenger purchase/delivery/trial tables and RPCs documented in the local development sections; production does not expose these new objects. The development rollout gate in `DEPLOYMENT.md` correctly requires separate production authorization.
- `BOT_FLOW_COPY_HANDOFF.md` explicitly labels its pre-review appendices as a historical snapshot and disclaims production equality. Several old audit reports also have appropriate historical notices.
- The new business-display spec and plan are future work, not implemented capabilities. Their stage labels are substantially appropriate, subject to the inherited concurrency-pointer wording in D09.

## Findings requiring correction

### D01 — High: contradictory standing deployment procedure

**Evidence:** `DEPLOYMENT.md:319-349` says new provisioning defaults to Outline, references `VPN_MARZNESHIN_CANARY_RESELLER_IDS`/`VPN_NEW_ACCESS_PROVIDER`, and tells operators to deploy with Marzneshin off while retaining Outline. The beginning of that same document says Outline is retired.

**Actual code:** `backend/src/services/serverService.js:12` returns `marzneshin`; provider runtime rejects retired providers. The production server inventory confirms all active rows are Marzneshin.

**Impact:** Following this part of the standing release guide would apply a retired rollout model and obsolete flags to the current system.

**Correction:** Keep current cutover/deploy instructions in `DEPLOYMENT.md`. Move the old coexistence sequence into clearly marked historical material and remove standing links that treat it as the next release procedure. Preserve useful migration preflight checks without preserving obsolete rollout assumptions.

### D02 — High: production and development state are mixed in authoritative docs

**Evidence:** `SCHEMA.md:37` calls project `huqmzvlzfcexycdrsxpn` its live source and carries a September 23 verification date. Its opening section describes migrations 0031–0036 without a prominent development-only label. `SYSTEM_DESIGN.md:64` and `:277` describe shared purchases and cross-channel delivery under the document's current-production framing.

**Observed:** Production is `daenwuszqdfkbjiatsjs`, while `.env.local` selects `huqmzvlzfcexycdrsxpn`. Production OpenAPI exposed 23 relations (20 baseline tables and 3 canonical views) and the reserve/activate/fail/payment RPCs. Development additionally exposed `messenger_links`, `messenger_events`, `purchase_operations`, `notification_deliveries`, `customer_trial_claims`, `submit_purchase` and trial/delivery RPCs. These additional objects were absent from the production OpenAPI response; the deployed server source also has no Messenger mount.

**Impact:** An engineer can mistake a verified development addition for a deployed production prerequisite or capability.

**Correction:** Add explicit Production / Development implemented / Proposed sections, each with verification date and source. Keep current core production schema separate from 0027–0036 additions. Do not promote local notification behavior or migrations into production documentation merely because local code exists. OpenAPI exposure verifies these read surfaces; it is not a full SQL trigger/constraint audit.

### D03 — High: API reference promises unavailable server operations

**Evidence:** `API_REFERENCE.md:95` describes `POST /api/admin/servers/provision` as starting DO Outline provisioning.

**Actual code, also verified deployed:** `adminServersRouter.js:105` returns HTTP 410 with `PROVISIONING_UNAVAILABLE`; `:169` returns 410 with `DECOMMISSION_UNAVAILABLE`. The routes are mounted compatibility surfaces, not usable automation.

**Additional gap:** The reference claims to mirror active routes but omits important existing reseller customers/stats/accounting/server-switch routes and admin analytics/monitoring/settlement/platform-settings/workspace routes. `SKILL_API_CONTRACTS.md` is more complete, but still contains coexistence-era guidance and mixes local-development additions with production contracts.

**Correction:** Generate/check the route inventory against mounts, document disabled endpoints and exact error behavior, and identify whether the short API reference is intentionally a summary. Make one contract source authoritative and link the other to it. Include workspace ownership: bot/slug/logo/color/trial are admin-managed; brand/support/payment details are reseller-managed.

### D04 — High: the bot skill mixes an old baseline with shipped and proposed behavior

**Evidence:** `SKILL_BOT.md:10` says production is still about 12 days behind; it describes deep-link-only buying, inline receipt purchases as deferred, renewal/queue functionality as closed, data warnings as out of scope, and per-reseller template editing as unavailable. It also proposes new `reseller_events` and RAG components.

**Observed:** Deployed handlers contain protocol/plan callbacks and a photo receipt handler. The current bot has slash commands plus conditional `/trial` and a commands menu. Canonical balance, queued purchase support, usage warnings and reseller template editing are present. No `ragChatService.js`, proposed `notificationScheduler.js` or production `reseller_events` relation was found. The RAG section is a proposal, not evidence of a production chatbot.

**Correction:** Make the skill describe today's bot. Separate remaining proposals into historical/future design documents. Replace proposed migration numbering and file names with the actual shipped notification service/job/RPC boundaries. Do not implement these old proposals while fixing current display consistency.

### D05 — High: customer knowledge contains incorrect trial, switching and purchase rules

**Evidence:** `backend/knowledge/trial.md:55` says `/start` automatically creates a trial; `:49` says no warning notification exists; `:41` treats trials as universally enabled by default. `servers.md` describes tier restrictions as bidirectional and claims paid users cannot select trial capacity. `purchase.md:64-68` equates confirmation with key issuance and describes activation only after admin confirmation.

**Observed:** Trial creation is an explicit action in current/deployed handlers; workspace configuration controls availability. Trial reminders and quota warnings exist. Paid customers may manually switch to eligible trial-tier capacity, while trials cannot use premium capacity. Initial purchases provide immediate access pending review; another purchase during active paid access is queued. Production currently has multiple premium server rows rather than the old SG/Osaka inventory, and some reseller workspaces have trials disabled.

**Correction:** Update product/trial/server/purchase/support/setup/troubleshooting facts together. Describe Shadowsocks and VLESS, reseller-specific payment/support/trial settings, explicit trial claims, the one-direction tier rule and separate access/review/queued state. Label static account/contact information as a specific brand example, not a platform-wide payment instruction. Reconfirm business claims such as support hours/privacy guarantees with the owner; code cannot establish them.

### D06 — Medium: copy references do not mirror current strings

**Method:** Parse `DICTIONARY` in `miniapp/src/i18n/language.jsx` with the existing TypeScript parser; compare documented MM/EN table rows after removing Markdown backticks.

**Result:** 176 runtime MM keys versus 146 documented table rows; 32 runtime keys missing from `MINIAPP_TEXT.md`, 2 documented keys removed from code, and 15 shared rows with differing wording. Differences include `access.addKey`, `access.dataUsed`, protocol-selection and queued-payment copy. These are source-reference differences; this audit does not judge Burmese grammar.

`BURMESE_TEXT.md` also lists old reply-keyboard labels and `BTN.BUY`, whereas new navigation uses inline callbacks and several old labels are compatibility-only. `BOT_UX_10_OUT_OF_10_BURMESE_REVIEW.md` claims complete code alignment but is a review/proposal catalogue with stale line anchors; it needs an explicit source revision/date and applied-versus-proposed distinction.

**Correction:** Regenerate copy references from the actual dictionaries/constants at a named revision, with missing/removed/changed-key checks. Preserve historical copy appendices as snapshots rather than silently overwriting them.

### D07 — Medium: the known-bug register preserves superseded product rules as current

**Evidence:** The opening section of `KNOWN_BUGS.md:17-46` says active-package buying is closed and renewal remains future work. Current code supports a scheduled next purchase. Later resolved entries retain old locations and old proposed algorithms; the confirmed Ye Yint denominator regression is not recorded there.

**Correction:** Give each item current status, resolution/supersession revision and a link to current behavior. Keep the July decision as history, explicitly superseded by queued packages. Record the still-unfixed usage-bar regression separately from the fixed quota-enforcement bugs; do not claim display implementation is complete.

### D08 — Medium: schema and final-model documentation need one consolidated current state

`SCHEMA.md` primary tables omit `admin_telegram_user_id`, `notifications_paused`, `protocol_preference`, `protocol`, `key_credentials` and tier details, though most are described later in addenda. Key rows still describe `outline_key_id` as a numeric Outline ID; active keys use Marzneshin usernames. Server status descriptions omit the observed historical `decommissioned` value. Several new statuses are described only in later sections.

`FINAL_DATA_MODEL.md` says **Not yet migrated** and **Zero transactional business writes**, while production exposes reservation/activation/payment RPCs and canonical views. Parts of the proposal remain unimplemented: cached order columns and legacy tables still exist. Thus neither “entirely not migrated” nor “all complete” describes reality.

**Correction:** Consolidate actual columns/types/nullable semantics into primary table references; distinguish legacy names from runtime meaning. Add per-phase implementation/deployment status to the target-model proposal. Do not rename/drop fields to make the code match a historical proposal.

### D09 — Medium: agent instructions include stale implementation pointers

`SUBAGENT_FRONTEND.md:15` points to `src/services/api/`, absent in both dashboards; actual clients are in `src/lib/api.ts` and Mini App feature modules. Its dead `admin-dashboard/src/app/` warning points to a directory no longer present. `SKILL_TEST.md` lists real test files, but the shown `../../lib/supabase.js` mock path does not match the documented `src/__tests__/` location (normally `../lib/supabase.js`).

The concurrency safety wording in `AGENTS.md`, subagent docs, and the new business-display spec/plan refers to an optimistic loop in `subscriptionProvisionService.js`. Current provisioning instead calls `reserve_pending_key`/`activate_vpn_key`; counter helpers describe database-owned behavior. Preserve the safety requirement and user constraint, but clarify the actual present RPC/trigger boundary rather than implying a removed loop must be recreated. This audit did not inspect live trigger DDL.

**Correction:** Update file pointers and current invariants after owner review; retain isolation and secret-handling rules. Add explicit test-only environment guidance before any instructions that start the backend, since startup registers bots and starts jobs.

### D10 — Medium: development design status does not consistently reflect local execution

`docs/superpowers/specs/2026-10-13-channel-notifications-trials-design.md:3` says implementation has not started, while the execution ledger and working files record local implementation and development verification. This does not establish a production rollout. Other October 13 files preserve earlier plan/connection-only stages.

**Correction:** Preserve their original design content but add current stage/superseded-by links: proposed, approved, implemented locally, verified in development, deployed to production. Preserve old test results as dated observations, not fresh verification claims. Keep production readiness separate from Meta publishing/account permissions.

### D11 — Low: framework scaffolds and missing reference documents

`admin-dashboard/README.md:1` describes Next.js, `app/page.tsx`, port 3000 and Vercel deployment. Actual admin code/package is React/Vite/TypeScript and uses Cloudflare Pages. `miniapp/README.md` remains a generic Vite scaffold rather than Telegram/local/production setup guidance.

`backend/knowledge/README.md:24` references a missing `SKILL_KNOWLEDGE_BASE.md`; its deferred `reseller.md` is also absent (the deferred label is valid, the missing schema reference is not useful). Marketing references point into a workstream moved out of this application repo and need an explicit external location or removal.

**Correction:** Replace scaffold readmes with actual setup/build/environment and source-of-truth links. Fix genuinely missing references; do not flag contextual short file names, intentionally gitignored secret files, or planned new files as broken links.

## Historical material: retain, but label its authority

- `DEPLOYMENT_RUNBOOK.md` already calls itself a July one-time runbook. Keep it as historical evidence; avoid current skills treating its old security/deploy state as today's prerequisite.
- `PROVIDER_COEXISTENCE_RUNBOOK.md` and `backend/scripts/FIX-A-quota-preserve-on-migration.md` describe pre-cutover work and need a prominent superseded-by notice.
- Dated security, blocking-migration and business-data repair reports retain their value. This audit did not rerun old incidents or authorize their repair commands.
- Historical copy snapshots are legitimate. “Old” is not itself a defect when the document clearly says what revision and purpose it records.

## Recommended correction order

1. Correct standing deployment guidance and disabled API descriptions (D01, D03).
2. Establish explicit production/development/proposed boundaries and verified schema sources (D02, D08, D10).
3. Update the bot skill and customer knowledge as a coherent set (D04, D05).
4. Regenerate copy references, update bug status and repair agent/readme pointers (D06, D07, D09, D11).
5. Add a docs index with authority/stage/revision and a lightweight drift check for route inventory, copy keys and file references.

Do this documentation correction before executing the business-display plan. It does not require recreating retired providers, applying development migrations to production, rewriting customer data or expanding the product scope.

## Verification limits and next step

Evidence includes source searches, deployed source excerpts, separate production/development OpenAPI snapshots, live non-secret plan/server/trial configuration, path existence checks, and AST-based Mini App copy comparison. No application tests/builds were necessary to identify these documentation contradictions, and none are claimed passing by this audit.

The next step is a scoped documentation correction, followed by the previously planned implementation. Source-of-truth docs should distinguish implemented code from intended behavior, including the accepted but unimplemented business-display design. This audit itself does not modify those sources.

## Document inventory

Every pre-existing repository Markdown file is listed below. “Baseline” means no blocking inconsistency was identified in the passages reviewed; it is not an exhaustive certification. Future/historical documents were reviewed for context and stage, not re-executed.

| Document | Assessment |
| --- | --- |
| `AGENTS.md` | Core boundaries align; concurrency pointer needs clarification (D09) |
| `API_REFERENCE.md` | Disabled/incomplete route descriptions (D03) |
| `BOT_FLOW_COPY_HANDOFF.md` | Clearly labelled historical copy snapshot; retain |
| `BOT_UX_10_OUT_OF_10_BURMESE_REVIEW.md` | Copy review/proposals need revision and applied-state labels (D06) |
| `BURMESE_TEXT.md` | Current/legacy bot copy drift (D06) |
| `CLAUDE.md` | Baseline deployment/source-of-truth boundaries align |
| `DEPLOYMENT.md` | Current overview plus obsolete coexistence procedure (D01); development gate valid |
| `DEPLOYMENT_RUNBOOK.md` | Explicit July one-time history; avoid standing prerequisites |
| `FINAL_DATA_MODEL.md` | Partial implementation versus proposal stage is stale (D08) |
| `KNOWN_BUGS.md` | Superseded product decision and missing current regression (D07) |
| `MINIAPP_TEXT.md` | AST comparison confirms missing/removed/changed keys (D06) |
| `PROVIDER_COEXISTENCE_RUNBOOK.md` | Pre-cutover runbook needs superseded-by notice |
| `README.md` | Baseline architecture/deployment/lifecycle align |
| `SCHEMA.md` | Environment/stage ambiguity and scattered legacy descriptions (D02, D08) |
| `SKILL_API_CONTRACTS.md` | Mostly current contract coverage; deployment labels/coexistence cleanup (D02, D03) |
| `SKILL_BACKEND.md` | Baseline stack/environment/boundaries align |
| `SKILL_BOT.md` | Historical baseline and shipped/proposed features mixed (D04) |
| `SKILL_DATABASE.md` | Baseline tenancy/migration rules align; consolidated enums/schema stage needed (D08) |
| `SKILL_FRONTEND.md` | Baseline stack/API/build rules align |
| `SKILL_MINIAPP.md` | Baseline auth/queue/provider rules align; current copy is reviewed separately |
| `SKILL_TEST.md` | Real test paths exist; example mock import pointer differs (D09) |
| `SUBAGENT_AUDITOR.md` | Baseline review rules; stale concurrency/section pointers (D09) |
| `SUBAGENT_BACKEND.md` | Baseline boundaries; concurrency pointer/startup environment guidance (D09) |
| `SUBAGENT_DATABASE.md` | Baseline schema/tenancy restrictions align |
| `SUBAGENT_FRONTEND.md` | Missing client/scaffold paths (D09) |
| `SUBAGENT_TEST_REVIEWER.md` | Baseline testing responsibilities align; old results not asserted |
| `SUBAGENT_VERIFIER.md` | Baseline isolation/auth review boundaries align |
| `SYSTEM_DESIGN.md` | Production overview aligns; local feature sections need deployment labels (D02) |
| `admin-dashboard/README.md` | Wrong Next.js/Vercel scaffold (D11) |
| `audit/reports/myanmar-blocking-migration-plan-2026-07-12.md` | Dated historical audit/runbook; old incidents not rerun |
| `audit/reports/phase3-business-data-repair-runbook-2026-08-04.md` | Dated historical audit/runbook; old incidents not rerun |
| `audit/reports/security-audit-2026-07-11.md` | Dated historical audit/runbook; old incidents not rerun |
| `backend/knowledge/README.md` | Completeness labels misleading; missing reference schema (D05, D11) |
| `backend/knowledge/company.md` | Provider/brand explanations need refresh; business claims need owner confirmation (D05) |
| `backend/knowledge/plans.md` | Six paid price/quota combinations match live; historical source date/scope remain |
| `backend/knowledge/product.md` | Outline-only description and lifecycle/coverage claims stale (D05) |
| `backend/knowledge/purchase.md` | Old purchase/activation rules and globally scoped account example (D05) |
| `backend/knowledge/servers.md` | Inventory and bidirectional tier restriction contradicted (D05) |
| `backend/knowledge/setup.md` | Outline client guidance only; current multi-protocol coverage missing (D05) |
| `backend/knowledge/support.md` | Old menu/automatic trial steps; support-hours claims not code-verifiable (D05) |
| `backend/knowledge/trial.md` | Automatic trial/default/notification/ownership claims stale (D05) |
| `backend/knowledge/troubleshooting.md` | Outline/old errors dominate; refresh for current provider and queue (D05) |
| `backend/scripts/FIX-A-quota-preserve-on-migration.md` | Pre-refactor implementation note needs historical label |
| `docs/MESSENGER_LOCAL_SETUP.md` | Development-only workflow; production feature deployment remains separate |
| `docs/audits/2026-10-13-channel-notifications-execution.md` | Local audit/execution snapshot; no production equality inferred |
| `docs/audits/2026-10-13-notification-delay.md` | Local audit/execution snapshot; no production equality inferred |
| `docs/superpowers/audits/2026-10-13-dashboard-purchases.md` | Local audit/execution snapshot; no production equality inferred |
| `docs/superpowers/audits/2026-10-13-messenger-account-menu.md` | Local audit/execution snapshot; no production equality inferred |
| `docs/superpowers/audits/2026-10-13-messenger-duration-checkout.md` | Local audit/execution snapshot; no production equality inferred |
| `docs/superpowers/audits/2026-10-13-purchase-entry-points.md` | Local audit/execution snapshot; no production equality inferred |
| `docs/superpowers/audits/2026-10-13-purchase-execution.md` | Local audit/execution snapshot; no production equality inferred |
| `docs/superpowers/plans/2026-10-13-channel-notifications-trials.md` | Earlier development plan; link current execution/stage (D10) |
| `docs/superpowers/plans/2026-10-13-messenger-connection.md` | Earlier development plan; link current execution/stage (D10) |
| `docs/superpowers/plans/2026-10-13-shared-purchases-messenger.md` | Earlier development plan; link current execution/stage (D10) |
| `docs/superpowers/plans/2026-10-14-production-business-display-consistency.md` | Unexecuted plan; review/selection pending; inherited concurrency pointer (D09) |
| `docs/superpowers/specs/2026-10-13-channel-notifications-trials-design.md` | Not-started status contradicted by local execution ledger (D10) |
| `docs/superpowers/specs/2026-10-13-messenger-purchases-design.md` | Development design with local implementation elsewhere; add stage links (D10) |
| `docs/superpowers/specs/2026-10-14-production-business-display-consistency-design.md` | Approved future design; inherited concurrency pointer clarification (D09) |
| `miniapp/README.md` | Generic scaffold lacks actual Telegram/deployment setup (D11) |
