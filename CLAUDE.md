# CLAUDE.md

Use the same source-of-truth files as other agents:

- `AGENTS.md`
- `SYSTEM_DESIGN.md`
- `DEPLOYMENT.md`
- `SCHEMA.md`
- Relevant `SKILL_*.md` files

Current production deployment is DigitalOcean Droplet + PM2 + Nginx + Ansible
for backend and Mini App. GitHub Actions deploys only the admin and reseller
dashboards to Cloudflare Pages.

Retired paths:

- DO App Platform backend
- Cloudflare Worker token portal
- Cloudflare Pages Mini App deployment

Do not run production deploy commands unless the user explicitly asks.
