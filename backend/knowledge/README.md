# NovaNet MM Knowledge Base

Business facts, canonical numbers, and content-ready explanations.
Serves two consumers: the content agent (immediate) and the RAG chatbot
(SKILL_BOT.md Feature 3, future). Both read the SAME files.

## File index

| File | Purpose | Status |
|---|---|---|
| `plans.md` | Pricing tiers, GB, MMK, duration | ✅ Complete (DB-sourced) |
| `product.md` | Outline VPN + Shadowsocks tech story | ✅ Complete |
| `servers.md` | Country list (SG + JP), use cases | ✅ Complete (DB-sourced) |
| `trial.md` | Free 5GB / 7-day trial details | ✅ Complete (DB-sourced) |
| `purchase.md` | Bot buy flow + payment methods | ✅ Complete (DB-sourced) |
| `setup.md` | Outline install + add-key + troubleshooting | ✅ Complete |
| `troubleshooting.md` | Common issues + fixes (Outline, payment, 409) | ✅ Complete |
| `support.md` | Channels + escalation + expectations | ✅ Complete (prod-sourced) |
| `company.md` | Brand story, team, official channels | ✅ Complete (prod-sourced) |
| `reseller.md` | Commission structure, dashboard | 🟢 Deferred (fill when reseller policy is public) |

## How to update

Every file follows the schema in `SKILL_KNOWLEDGE_BASE.md`. When you edit,
bump `last_updated` in the frontmatter. Both consumers reload on next
run/deploy — no cache invalidation needed.

## Verification markers

Some values are marked `[VERIFY]` because they were pulled from seed data
or user manual and may differ from live production. Please confirm the
actual numbers against your production DB and remove the `[VERIFY]` markers.
