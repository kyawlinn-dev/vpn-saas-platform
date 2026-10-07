# NovaNet MM

NovaNet MM is a multi-tenant VPN reseller platform for selling Marzneshin-backed
Shadowsocks and VLESS access through reseller-branded Telegram Mini Apps.

## Applications

| Directory | Purpose |
|---|---|
| `backend/` | Express API, Supabase service layer, PM2 bot runtime |
| `miniapp/` | Telegram Mini App served from the production Droplet |
| `admin-dashboard/` | Super-admin dashboard deployed to Cloudflare Pages |
| `reseller-dashboard/` | Reseller dashboard deployed to Cloudflare Pages |
| `ansible/` | Droplet provisioning, Nginx, SSL, backend and Mini App deploy |

The Mini App supports one active paid package and one queued future package per
customer. See `SYSTEM_DESIGN.md` for the current lifecycle and provider model.

## Production Shape

Production customer traffic goes to a DigitalOcean Droplet:

- `api.novanetmm.com` -> Nginx -> backend PM2 process on port 3000
- `app.novanetmm.com` -> Nginx -> Mini App static build

Cloudflare Worker and DO App Platform deployment paths are retired.

See `DEPLOYMENT.md` for the source of truth.
