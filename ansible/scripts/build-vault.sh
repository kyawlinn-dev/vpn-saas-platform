#!/usr/bin/env bash
# Run this yourself from the ansible/ directory:
#   bash scripts/build-vault.sh
#
# Reads values that are the SAME in prod as in your local backend/.env
# (Supabase keys, bot token, encryption key, DO token, SSH bootstrap config)
# and writes them into group_vars/novanet/vault.yml, pre-filled with the
# documented production URLs from DEPLOYMENT.md for everything else.
#
# This script never prints secret values to the terminal — it only copies
# file-to-file. Review the output file yourself, fill in anything left
# blank (CORS origins, miniapp slug), then encrypt it:
#
#   ansible-vault encrypt group_vars/novanet/vault.yml
#
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE="../backend/.env"
OUT_FILE="group_vars/novanet/vault.yml"

if [ ! -f "$ENV_FILE" ]; then
  echo "Cannot find $ENV_FILE — run this from the ansible/ directory of the repo." >&2
  exit 1
fi

if [ -f "$OUT_FILE" ]; then
  echo "$OUT_FILE already exists — refusing to overwrite. Delete it first if you want to regenerate." >&2
  exit 1
fi

get() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2-; }

cat > "$OUT_FILE" <<VAULTEOF
# Filled by build-vault.sh from local backend/.env for the values that carry
# over unchanged to production. Review every line before encrypting —
# CORS_ALLOWED_ORIGINS and VITE_MINIAPP_SLUG are left for you to confirm.
vault_backend_env_production: |
  NODE_ENV=production
  PORT=3000

  SUPABASE_URL=$(get SUPABASE_URL)
  SUPABASE_ANON_KEY=$(get SUPABASE_ANON_KEY)
  SUPABASE_SERVICE_ROLE_KEY=$(get SUPABASE_SERVICE_ROLE_KEY)

  ADMIN_DASHBOARD_URL=https://novanet-admin.pages.dev
  RESELLER_DASHBOARD_URL=https://novanet-reseller.pages.dev
  MINIAPP_URL=https://app.novanetmm.com
  TELEGRAM_MINIAPP_URL=https://app.novanetmm.com
  CORS_ALLOWED_ORIGINS=https://novanet-admin.pages.dev,https://novanet-reseller.pages.dev,https://app.novanetmm.com

  WEBHOOK_BASE_URL=https://api.novanetmm.com
  PUBLIC_SUBSCRIPTION_BASE_URL=https://api.novanetmm.com

  TELEGRAM_BOT_TOKEN=$(get TELEGRAM_BOT_TOKEN)
  BOT_TOKEN_ENCRYPTION_KEY=$(get BOT_TOKEN_ENCRYPTION_KEY)

  DIGITALOCEAN_TOKEN=$(get DIGITALOCEAN_TOKEN)
  DIGITALOCEAN_REGION=$(get DIGITALOCEAN_REGION)
  DIGITALOCEAN_SIZE=$(get DIGITALOCEAN_SIZE)
  DIGITALOCEAN_IMAGE=$(get DIGITALOCEAN_IMAGE)
  DIGITALOCEAN_SSH_KEY_FINGERPRINT=$(get DIGITALOCEAN_SSH_KEY_FINGERPRINT)
  DO_AUTO_PROVISION_ENABLED=false

  SERVER_BOOTSTRAP_SSH_USER=$(get SERVER_BOOTSTRAP_SSH_USER)
  SERVER_BOOTSTRAP_PRIVATE_KEY_PATH=/root/.ssh/novanet_do_bootstrap_key
  SERVER_BOOTSTRAP_KNOWN_HOSTS_FILE=/root/.ssh/known_hosts
  SERVER_BOOTSTRAP_TIMEOUT_MS=$(get SERVER_BOOTSTRAP_TIMEOUT_MS)
  SERVER_BOOTSTRAP_POLL_INTERVAL_MS=10000
  SERVER_PROVISION_TIMEOUT_MINUTES=25

  OUTLINE_INSTALL_SCRIPT_URL=$(get OUTLINE_INSTALL_SCRIPT_URL)
  DEFAULT_SERVER_MAX_ACTIVE_KEYS=$(get DEFAULT_SERVER_MAX_ACTIVE_KEYS)
  DEFAULT_TRIAL_RESELLER_ID=$(get DEFAULT_TRIAL_RESELLER_ID)

vault_miniapp_env_production: |
  VITE_BACKEND_BASE_URL=https://api.novanetmm.com
  VITE_API_BASE_URL=https://api.novanetmm.com
  VITE_MINIAPP_SLUG=
VAULTEOF

echo "Wrote $OUT_FILE."
echo "IMPORTANT: SERVER_BOOTSTRAP_PRIVATE_KEY_PATH was deliberately set to a Linux"
echo "path (/root/.ssh/novanet_do_bootstrap_key), NOT copied from your local .env — the value"
echo "there is usually a Windows path and would be wrong on the production Droplet."
echo "Confirm that /root/.ssh/novanet_do_bootstrap_key exists on the Droplet before relying on it."
echo ""
echo "Next steps:"
echo "  1. Open $OUT_FILE and fill in anything still blank."
echo "  2. ansible-vault encrypt $OUT_FILE"
echo "  3. ansible-playbook env.yml --ask-vault-pass"
