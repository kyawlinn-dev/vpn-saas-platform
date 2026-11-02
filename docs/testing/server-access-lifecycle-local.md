# Server Access Lifecycle: Development Acceptance

## Implementation

The dashboard and backend connect Add, Replace and Move-and-Retire to actual
DigitalOcean/Vultr HTTP adapters, Marzneshin, strict SSH installation, encrypted
state, protocol tunnel probes, stable-link checks and the fenced Supabase worker.
This is source implementation, not a claim that a real VPS canary has passed.

The owner starts the backend, dashboards and ngrok. The agent has not applied
migrations, contacted cloud/panel accounts, started services, purchased/deleted
a VPS or deployed production. The existing development Supabase is the intended
manual-test database. **Do not create an empty database for this workflow.**

All three flags default off. Normal backend imports do not contact providers.
When enabled, startup authenticates read-only and verifies the database binding,
panel origin, provider account identities and public-service ownership before
registering the runtime. Failed preflight disables infrastructure controls.

## Owner Setup

Use the normal development checkout containing the reviewed changes. Keep secrets in its
ignored `backend/.env.local`, using your existing development values. Do not copy
production encrypted credentials or replace the development encryption key.

1. Apply unapplied migrations **0040 through 0049, in filename order**, in your
   existing development Supabase SQL Editor. They depend on the current core
   migration chain, especially the original 0021 server counter trigger. Do not
   apply them to production as a development shortcut.
2. Use the configured development VLESS service on the shared panel, not
   production global service `5`. Install the development pool/runtime binding
   and independently verified service receipt using the operator template
   `server-operations-bootstrap.example.sql`. Fill its placeholders first.
   Existing nodes/users are not adopted by these migrations or startup. The
   owner's current DEV global service intentionally includes authorized shared
   live inbounds for customer-flow testing. Those remain protected read-only
   dependencies; only disposable DEV-owned nodes may be replaced/retired.
3. Copy `backend/config/server-infrastructure.example.json` to an ignored local
   file and fill account identities, SSH key IDs and firewall IDs. Management
   sources must contain your backend's public egress IP and the panel's actual
   public egress IP. Protect the controller/API VM and its addresses. Use separate
   free provider firewall groups for dual and VLESS-only profiles. Allow TCP
   22/62050 only from approved exact management IPs, TCP 443 publicly, plus TCP/UDP
   8388 only for dual nodes. Never use broad SSH rules.
4. Configure these backend variables, then start the services yourself:

```dotenv
PUBLIC_SERVER_ACCESS_ENABLED=true
SERVER_LIFECYCLE_COORDINATION_ENABLED=true
SERVER_OPERATIONS_WORKER_ENABLED=true
SERVER_ACCESS_ENVIRONMENT=development
SERVER_ACCESS_DATABASE_IDENTITY=huqmzvlzfcexycdrsxpn.supabase.co
SERVER_ACCESS_PANEL_IDENTITY=https://panel.novanetmm.com
SERVER_ACCESS_POOL_ID=YOUR_DEVELOPMENT_POOL_UUID
SERVER_INFRASTRUCTURE_CONFIG_PATH=C:/absolute/path/server-infrastructure.local.json
SERVER_BOOTSTRAP_PRIVATE_KEY_PATH=C:/absolute/path/operator-private-key
```

Keep your existing `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`BOT_TOKEN_ENCRYPTION_KEY`, `MARZNESHIN_PANEL_URL`, `MARZNESHIN_PANEL_USERNAME`,
`MARZNESHIN_PANEL_PASSWORD` and relevant `DIGITALOCEAN_TOKEN`/`VULTR_API_KEY`.
Panel identity must exactly match its configured origin. Provider account identity
is the DigitalOcean account UUID or, for Vultr, `email-sha256:` plus the SHA-256
of the normalized account email. These identities are not API secrets.
The application requires no Postgres password or `LOCAL_TEST_DATABASE_URL`.

## Manual Acceptance

Start with **Add**, using a new development-only VLESS Singapore node and the live
quote. Review recurring cost and traffic terms; unknown overage is not zero.

- Watch provisioning, configuration, private registration, verification and
  publication. The host key is generated and pinned before purchase; no SSH TOFU.
- Verification uses a temporary operation-specific user, real subscriptions and
  real tunnel traffic, confirming owned-VPS egress before publication. A failed
  probe never authorizes source deletion. This does not prove Myanmar ISP
  reachability: test Happ on your phone, then ask the customer to test.
- Trial and paid DEV users see the same compatible nodes. VLESS-only nodes never
  appear as Outline destinations. Trial allowance, expiry and claim history stay
  unchanged. Outline keeps one selected node; VLESS keeps the pool service.
- Next, Replace a disposable node **created by this workflow**, using dedicated
  DEV users. Confirm overlap and source deletion. Preserve usernames, keys/URLs,
  quota, expiry and usage; move only SS membership and DB anchors/assignments.
  VLESS membership stays global; unrelated public endpoints survive.
- Move-and-Retire between two published compatible DEV nodes must not purchase
  another VM. Capacity is checked before migration.
- Restart your backend between phases. Resume the same operation; uncertain
  create responses must not cause another purchase POST. Expected VM/node startup
  waits up to 20 minutes, separately from three failed-mutation attempts.
- Cancellation before publication reconciles owned resources. Later cancellation
  pauses rather than rolling customers back or destroying a published node.
- Verify provider absence independently from DELETE. Unknown/shared attachments
  block unsafe deletion; remaining billable resources stay cleanup pending and
  are never silently deleted.

Existing production/shared nodes remain protected. Historical trial-service
adoption/migration is separate from the new-node canary. The adoption CLI defaults
to offline mode; explicit live inspection and hash-approved application are
documented in server-management-operator-guide.md. Do not relabel borrowed live
nodes as DEV-owned lifecycle resources.
Production rollout and announcements remain separate owner decisions.

## Verification

Run finite offline backend tests with fake credentials and injected HTTP/SSH:

```powershell
npm test -- --config vitest.offline.config.js
```

Run `npm test -- --run` and `npm run build` in `admin-dashboard/`; build
`reseller-dashboard/` and `miniapp/` normally. No service startup is required.

In-memory PostgreSQL WASM checks execute 0020/0021 and 0040-0049 against a synthetic
schema, covering scope/fence rejection, private-state CAS, candidate creation,
publication and frontend permission denial. They do not prove multi-connection
locking or certify live Supabase drift. Optional localhost concurrency harnesses
are not an owner setup requirement; without their URI they exit 77, not a pass.

Final local evidence (2026-10-23): backend 95 files / 730 tests, admin 9 tests,
all three frontend builds, and PostgreSQL WASM checks pass. SQL checks also verify
stable-key/assignment moves, original-trigger counter transfer and terminal
service-lock release. No shared database or live VPN/provider was contacted.

To reproduce the in-memory SQL checks (no database service is started):

```powershell
cd backend/src/__tests__/database/pglite-runtime
npm ci --ignore-scripts --no-audit --no-fund
cd ../../../../..
node backend/src/__tests__/database/serverLifecycle.pglite.mjs
```

Real provider provisioning, phone connectivity and shared-panel acceptance remain
owner-run tests. Report operation ID, phase and sanitized error code, not secrets.
