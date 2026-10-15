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

## Documentation status

Use [the documentation index](docs/DOCUMENTATION.md) to distinguish production,
local development, approved future designs and historical records. The Messenger
and shared notification/trial work in the dirty development checkout is not a
production availability claim. The business-display consistency design is
approved but its implementation has not started.
