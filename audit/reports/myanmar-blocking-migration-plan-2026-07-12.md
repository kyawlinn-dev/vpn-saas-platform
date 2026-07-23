# Myanmar Blocking — Root Cause & Migration Plan
**Date:** 2026-07-12  
**Status:** Historical migration report. Option A is now reflected in repository deployment docs/config; production changes still require an explicit Ansible deployment.

---

## Root Cause

Myanmar's military government (SAC) orders ISPs to block Cloudflare IP ranges. Every service in the NovaNet MM stack except the Telegram bot runs on Cloudflare IPs — including the backend on DO App Platform, which routes through Cloudflare internally even with DNS Only set in Cloudflare.

### Infrastructure IP Reality

| Service | Hosting | Actual IPs | Myanmar status |
|---------|---------|-----------|----------------|
| `app.novanetmm.com` (miniapp) | Cloudflare Pages | 162.159.x.x, 172.66.x.x | BLOCKED |
| `api.novanetmm.com` (backend) | DO App Platform | 162.159.x.x, 172.66.x.x | BLOCKED |
| Worker | Cloudflare Workers | CF IPs | BLOCKED |
| Telegram bot API | Telegram's own servers | Non-CF | Works |
| VPN servers (Outline) | DO Droplets Singapore | 128.199.x.x, 167.71.x.x | Probably fine |

**Key insight**: DO App Platform uses Cloudflare infrastructure internally. Even with DNS Only (grey cloud) in Cloudflare DNS, `api.novanetmm.com` still resolves to CF IPs. This is outside the user's control — it's how DO App Platform is built.

### Broken Connection Chain

```
Customer → Telegram bot → WebApp button → app.novanetmm.com (CF Pages) → BLOCKED
Customer → Outline app → ssconf://api.novanetmm.com/k/TOKEN.json → BLOCKED
Customer → Worker portal → *.workers.dev → BLOCKED
```

Why "can't connect via dynamic key": Outline fetches the ssconf JSON every time it connects. That fetch goes to `api.novanetmm.com` (CF IP) → blocked → connection error. The actual VPN server (DO droplet, direct IP) is probably reachable if the customer could get the key.

---

## Selected Solution: Option A — Move to Plain DO Droplet

Replace DO App Platform with a DO Droplet in Singapore. DO Droplets get direct DO IPs (128.199.x.x, 167.71.x.x) — not Cloudflare. With DNS Only in Cloudflare pointing to the droplet IP, `api.novanetmm.com` resolves to a real non-CF IP.

### What this fixes
- `api.novanetmm.com` → direct DO IP → ssconf fetchable → Outline connects → VPN works
- Same droplet serves miniapp static files via nginx → eliminates CF Pages dependency
- Worker routes (`/t/TOKEN`, `/sub/...`, `/open/...`) can be absorbed into backend Express routes → eliminates CF Workers dependency
- Net result: Cloudflare is only used for DNS registration. All traffic hits DO IPs.

### Stack on the Droplet

```
DO Droplet (Singapore, ~$12/month)
├── nginx
│   ├── api.novanetmm.com → reverse proxy → Node:3000
│   └── app.novanetmm.com → serve /var/www/miniapp/ (static files)
├── Node.js + PM2 (backend Express app)
├── certbot (Let's Encrypt SSL for both domains)
└── ufw firewall (allow 22/80/443 only)
```

### Server Management: Ansible

Ansible (agentless, SSH-based) is the right tool. Run from WSL2 on Windows.

**Planned playbooks:**

| Playbook | Purpose |
|----------|---------|
| `provision.yml` | One-time: install Node.js, nginx, PM2, certbot, ufw, git |
| `deploy.yml` | Push code: git pull, npm ci, pm2 reload |
| `nginx.yml` | Manage nginx site configs, reload |
| `ssl.yml` | Certbot for both domains, auto-renew cron |
| `env.yml` | Push `.env` from Ansible Vault (encrypted secrets) |
| `firewall.yml` | ufw rules |

**WSL2 setup**: Install Ubuntu in WSL2 → `sudo apt install ansible` → write inventory pointing to droplet IP → run playbooks from WSL2 terminal.

---

## Risk Assessment: Myanmar Government Blocking

### Technical blocking risk (REAL, manageable)

**Layer 1 — IP-range blocking**: Myanmar ISPs may block the DO Singapore subnet. Blocking is not uniform — MPT, Atom, Ooredoo, Myanmar Net each maintain separate blocklists. Some may block DO ranges, others may not. If a DO IP gets blocked: provision a new droplet (new IP), update DNS — takes ~10 minutes. Can pre-provision a spare droplet as hot standby.

**Layer 2 — DPI (Deep Packet Inspection) on VPN traffic**: ISP detects Shadowsocks protocol signature and blocks the VPN connection itself, regardless of IP. Myanmar has DPI equipment (Huawei/ZTE). Enforcement is currently targeted at high-profile political traffic, not small VPN resellers. Risk is low-medium. Mitigation: use non-standard high ports (e.g., 51280) on Outline VPN servers rather than 443/80 — reduces fingerprint risk.

### Legal risk to operator (NEGLIGIBLE)

The operator is in Bangkok, Thailand. Myanmar law cannot reach Thailand. Myanmar regulations prohibit citizens from using VPNs to access blocked content, but enforcement targets political activists and journalists — not ordinary users or foreign operators. No VPN service operator outside Myanmar has faced legal action from the SAC. Risk to the operator: negligible.

### Risk Summary

| Risk | Level | Mitigation |
|------|-------|-----------|
| CF IPs blocked (current problem) | CONFIRMED | Move to DO Droplet |
| DO Singapore IP-range blocked | Medium | Rotate IPs quickly; multi-IP setup |
| Shadowsocks DPI detection | Low-Medium | Non-standard ports on Outline servers |
| Legal risk to operator (Bangkok) | Negligible | Different jurisdiction |

---

## Immediate Workaround (while migrating)

Existing customers with Outline installed may have an old key cached. For those who don't:
1. Admin dashboard → find customer's VPN key → copy `ss://` URL
2. Send to customer via Telegram DM
3. Customer: Outline → "Add server" → paste `ss://` manually

Bypasses miniapp and ssconf entirely. The actual VPN server is probably reachable.

---

## Migration Checklist (not started)

- [ ] Provision DO Droplet (Singapore, Ubuntu 24.04, $12/month basic)
- [ ] Write Ansible inventory + provision.yml
- [ ] Run provision playbook (Node, nginx, PM2, certbot, ufw)
- [ ] Write nginx config for api.novanetmm.com + app.novanetmm.com
- [ ] Copy backend `.env` to droplet (via Ansible Vault)
- [ ] Run certbot for both domains
- [ ] Update Cloudflare DNS: api.novanetmm.com A → droplet IP, app.novanetmm.com A → droplet IP
- [ ] Build miniapp → upload dist to `/var/www/miniapp/`
- [ ] Test: api.novanetmm.com/health, app.novanetmm.com, ssconf fetch, full VPN connect
- [ ] Verify DO App Platform can be deleted (confirm no other traffic depending on it)
- [ ] Optionally: absorb worker routes into Express backend, retire CF Worker
