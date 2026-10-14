# Documentation Alignment Update

Date: 2026-10-15, Asia/Bangkok. Scope: documentation only, authorized after the
[pre-correction audit](../../audit/reports/documentation-alignment-audit.md).

## Outcome

Standing references now describe the current Marzneshin production baseline,
separate local shared-purchase/Messenger/notification/trial work, and label future
display consistency as unimplemented. Historical designs, commands and test
observations remain historical; this update does not implement their proposals.

The [documentation authority index](../DOCUMENTATION.md) lists current sources
and every document's stage. The [route inventory](../API_ROUTE_INVENTORY.md)
records 100 literal routes from the named production-ready source baseline,
including the two disabled server operations. It is not a live endpoint test.

## Audit corrections

| Finding | Documentation correction |
| --- | --- |
| D01: obsolete deployment procedure | Current release sequence is Marzneshin-only; old coexistence material has historical notices |
| D02: environment/stage ambiguity | Production and development schema sources independently verified; local additions explicitly labelled in schema, design and contracts |
| D03: API availability | Provision/decommission HTTP 410 behavior documented; route guide/index expanded; current accounting limitations disclosed |
| D04: bot design drift | Current bot skill rewritten; original v2/RAG proposal preserved in docs/archive |
| D05: customer facts | All ten knowledge files updated for explicit trials, one-direction tier restriction, protocols, queued purchases and workspace-specific details |
| D06: copy drift | All 176 MM/EN dictionary entries regenerated; 93 exported bot/template declarations included verbatim with source hashes; older review catalogues labelled snapshots |
| D07: known-bug status | July blanket purchase block marked superseded; confirmed usage-bar regression remains OPEN |
| D08: scattered schema/target status | 20 production tables, 3 views and 5 development-only tables have primary column references; target-model proposal has a partial-implementation map |
| D09: stale implementation pointers | Actual API-client paths, test mock import and reservation/counter guards documented; safe development startup guidance added |
| D10: development stage status | Local implementation/execution records linked; original dates and old test results preserved without production equality claims |
| D11: scaffolds/missing refs | Vite/Telegram readmes replace scaffolds; missing knowledge-schema reference removed; document index added |

## Verification evidence

Checks performed during this documentation update:

- Independent read-only production/development OpenAPI comparison: **28 relation
  schemas and 419 column/required-field checks matched** the generated reference.
  This checks API-visible columns and required metadata, not all SQL grants,
  CHECK constraints, triggers or migration history.
- AST-based source/copy comparison: **176 Mini App MM/EN entries match exactly**;
  all **93 exported bot/template declarations** are present verbatim.
- Literal production-source route extraction: **100 routes**; exactly two server
  compatibility operations labelled disabled with HTTP 410. Local Messenger
  factory routes are separately labelled development-only.
- Local Markdown links in **21 active reference documents** checked with no
  missing targets; the index's document links resolve.
- Pre-update SHA-256 snapshot: **all 491 existing non-Markdown tracked/untracked
  files unchanged**, including the user's unfinished application work.
- Markdown whitespace checked with Git after normalization of generated trailing
  blank lines. No application tests/builds are claimed by these docs checks.

## Boundaries and follow-up

No production configuration, database rows, migrations, provider users, running
processes or Meta publishing state were changed. No application code or dependency
files were edited. The dirty development checkout remains distinct from a
release-ready production checkout.

Code-level consistency defects remain work for the approved business-display
design/plan; this documentation update does not fix the reseller bar or reconcile
all existing financial/status displays. Operator/owner policy not established
by code (privacy guarantees, legal identity, support hours, refunds and enforced
device limits) is not invented in the refreshed customer material.

Historical documents retain original context. Their old commands and results
must not be interpreted as current release authorization or fresh passing tests.
Future schema changes still require reviewed migrations and independent production
preflight; this update does not authorize dropping compatibility fields.

## Follow-up: plan alignment and queued purchases

The owner clarified that a queued purchase follows normal payment review:
confirmation records received money while service waits for the existing package
to stop or expire. The confirmed next package then activates automatically without
another payment or revenue entry. The design, implementation plan and relevant
architecture, API, bot and knowledge references now state this explicitly.
`apply_status = applied` describes payment recording rather than VPN activation.
The existing accounting period basis remains unchanged.

The implementation plan now carries the refreshed documentation into its isolated
checkout, preserves Yangon notification timing alongside Bangkok accounting and
expiry boundaries, and requires documentation updates with each owning code task.
These are documentation revisions; application implementation remains unstarted.
