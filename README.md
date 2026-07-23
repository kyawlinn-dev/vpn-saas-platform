# NovaNet MM

NovaNet MM is a multi-tenant VPN reseller platform for selling Outline VPN
access through reseller-branded Telegram Mini Apps.

## Applications

| Directory | Purpose |
|---|---|
| `backend/` | Express API, Supabase service layer, PM2 bot runtime |
| `miniapp/` | Telegram Mini App served from the production Droplet |
| `admin-dashboard/` | Super-admin dashboard deployed to Cloudflare Pages |
| `reseller-dashboard/` | Reseller dashboard deployed to Cloudflare Pages |
| `ansible/` | Droplet provisioning, Nginx, SSL, backend and Mini App deploy |

## Production Shape

Production customer traffic goes to a DigitalOcean Droplet:

- `api.novanetmm.com` -> Nginx -> backend PM2 process on port 3000
- `app.novanetmm.com` -> Nginx -> Mini App static build

Cloudflare Worker and DO App Platform deployment paths are retired.

See `DEPLOYMENT.md` for the source of truth.
