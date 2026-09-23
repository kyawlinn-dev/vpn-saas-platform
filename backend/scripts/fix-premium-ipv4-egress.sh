#!/bin/bash
# =============================================================================
# Normalize a marznode server to the IPv4-only fleet standard.
#
# Some droplets (e.g. SG#2, Tokyo) are dual-stack and egress via IPv6 by
# default, which is inconsistent with the IPv4-only nodes (SG1, Trial-SGP) and
# breaks strict clients. This makes a node match the working fleet exactly:
#   1. Disable IPv6 at the OS (runtime + persistent) — IPv4-only egress.
#   2. Ensure the Xray "direct" outbound is plain freedom (no domainStrategy),
#      identical to the working nodes.
#   3. Restart marznode and verify.
#
# Run from your machine (needs root SSH to the droplets):
#   bash backend/scripts/fix-premium-ipv4-egress.sh 165.22.242.245 107.191.53.200
# With no args it defaults to SG#2 + Tokyo.
# =============================================================================
set -uo pipefail

SERVERS=("$@")
if [ ${#SERVERS[@]} -eq 0 ]; then
  SERVERS=("165.22.242.245" "107.191.53.200")   # SG#2, Tokyo #1
fi

read -r -d '' REMOTE <<'REMOTE_EOF'
set -e
CFG="/var/lib/marznode/xray_config.json"
COMPOSE="/opt/marznode/docker-compose.yml"

# 1. Disable IPv6 (runtime + persistent).
sysctl -w net.ipv6.conf.all.disable_ipv6=1 net.ipv6.conf.default.disable_ipv6=1 >/dev/null
printf 'net.ipv6.conf.all.disable_ipv6=1\nnet.ipv6.conf.default.disable_ipv6=1\n' > /etc/sysctl.d/99-disable-ipv6.conf

# 2. Ensure the direct outbound is plain freedom (matches the working nodes).
[ -f "$CFG" ] || { echo "  ! $CFG not found"; exit 1; }
cp "$CFG" "$CFG.bak.$(date +%s)"
python3 - "$CFG" <<'PY'
import json, sys
p = sys.argv[1]
c = json.load(open(p))
for o in c.get("outbounds", []):
    if o.get("tag") == "direct":
        o.pop("settings", None)   # remove any domainStrategy; plain freedom
json.dump(c, open(p, "w"), indent=2)
print("  direct outbound:", [o for o in c["outbounds"] if o.get("tag") == "direct"])
PY

# 3. Recreate (down+up, NOT restart) + verify. `docker compose restart` can hit a
#    marznode asyncio bug that leaves Xray running WITHOUT re-syncing users, so
#    every client is rejected with "invalid request user id". A clean recreate
#    forces marznode to re-push all users to Xray.
docker compose -f "$COMPOSE" down >/dev/null 2>&1
docker compose -f "$COMPOSE" up -d >/dev/null 2>&1
sleep 10
echo "  IPv4 egress: $(curl -4 -s --max-time 8 ifconfig.co)"
echo "  IPv6 egress: $(curl -6 -s --max-time 6 ifconfig.co || echo 'none (good)')"
REMOTE_EOF

for IP in "${SERVERS[@]}"; do
  echo ""
  echo "=== $IP ==="
  ssh -o StrictHostKeyChecking=accept-new "root@$IP" "bash -s" <<< "$REMOTE" || echo "  ! failed for $IP"
done
echo ""
echo "=== DONE — nodes normalized to IPv4-only, config identical to the working fleet ==="
