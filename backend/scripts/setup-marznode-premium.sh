#!/bin/bash
# =============================================================================
# Install marznode on a premium server (any IP) alongside Outline
#
# PREREQUISITES (run manually before this script):
#   1. Copy client.pem from the trial server (which has marznode running):
#      scp root@139.59.126.185:/var/lib/marznode/client.pem /tmp/client.pem
#
#   2. Generate a NEW Reality keypair — one per server, never reuse:
#      docker run --rm dawsh/marznode:latest /usr/local/bin/xray x25519
#      (Save the Private & Public key output — you'll paste them below)
#
# Then run:
#   scp /tmp/client.pem scripts/setup-marznode-premium.sh root@<SERVER_IP>:/tmp/
#   ssh root@<SERVER_IP> "bash /tmp/setup-marznode-premium.sh <PRIVATE_KEY> <PUBLIC_KEY> [SERVER_NAME]"
#
# Example for Singapore #2:
#   ssh root@165.22.242.245 "bash /tmp/setup-marznode-premium.sh <PRIV> <PUB> 'Singapore #2'"
# Example for Tokyo #1:
#   ssh root@107.191.53.200 "bash /tmp/setup-marznode-premium.sh <PRIV> <PUB> 'Tokyo #1'"
# =============================================================================

set -euo pipefail

PRIVATE_KEY="${1:?Usage: $0 <reality_private_key> <reality_public_key> [server_name]}"
PUBLIC_KEY="${2:?Usage: $0 <reality_private_key> <reality_public_key> [server_name]}"
SERVER_NAME="${3:-Premium Server}"

MARZNODE_DIR="/opt/marznode"
DATA_DIR="/var/lib/marznode"
XRAY_VERSION="25.5.16"
XRAY_IMAGE="ghcr.io/xtls/xray-core@sha256:be505df0b9a8602a09d54f87a4f8e57153262f44b4ce93d84dcab8bb9adac841"
XRAY_BINARY="$DATA_DIR/xray-$XRAY_VERSION"
SERVICE_PORT="62050"        # gRPC port for panel ↔ node communication
SS_PORT="1080"              # Shadowsocks
VLESS_PORT="443"            # VLESS Reality — matches all existing marznode servers
REALITY_DEST="www.apple.com:443"
REALITY_SNI="www.apple.com"
SHORT_ID="$(openssl rand -hex 8)"

echo "=== Marznode Setup for $SERVER_NAME ==="
echo "  SS port:    $SS_PORT"
echo "  VLESS port: $VLESS_PORT"
echo "  gRPC port:  $SERVICE_PORT"
echo "  Reality dest: $REALITY_DEST"
echo "  Short ID:   $SHORT_ID"
echo ""

# 0. Disable IPv6 egress so this node matches the rest of the fleet (IPv4-only).
#    Dual-stack droplets otherwise egress via IPv6 by default, which is
#    inconsistent with the IPv4-only nodes and breaks strict clients.
sysctl -w net.ipv6.conf.all.disable_ipv6=1 net.ipv6.conf.default.disable_ipv6=1 >/dev/null 2>&1 || true
printf 'net.ipv6.conf.all.disable_ipv6=1\nnet.ipv6.conf.default.disable_ipv6=1\n' > /etc/sysctl.d/99-disable-ipv6.conf
echo "✓ IPv6 disabled (IPv4-only egress)"

# 1. Create directories
mkdir -p "$MARZNODE_DIR" "$DATA_DIR"

# 2. Copy client.pem (must already be at /tmp/client.pem)
if [ ! -f /tmp/client.pem ]; then
    echo "ERROR: /tmp/client.pem not found!"
    echo "Run: scp root@139.59.126.185:/var/lib/marznode/client.pem /tmp/client.pem"
    exit 1
fi
cp /tmp/client.pem "$DATA_DIR/client.pem"
echo "✓ client.pem copied"

# 3. Generate self-signed TLS cert for marznode gRPC
if [ ! -f "$MARZNODE_DIR/server.cert" ]; then
    openssl req -x509 -newkey rsa:2048 -keyout "$MARZNODE_DIR/server.key" \
        -out "$MARZNODE_DIR/server.cert" -days 3650 -nodes \
        -subj "/CN=marznode" 2>/dev/null
    echo "✓ Server TLS cert generated"
else
    echo "✓ Server TLS cert already exists"
fi

# 4. Write Xray config
cat > "$DATA_DIR/xray_config.json" << XRAYEOF
{
  "log": {
    "loglevel": "warning",
    "access": "/var/lib/marznode/access.log",
    "error": "/var/lib/marznode/error.log"
  },
  "routing": {
    "domainStrategy": "AsIs",
    "rules": [
      {
        "type": "field",
        "ip": ["geoip:private"],
        "outboundTag": "block"
      }
    ]
  },
  "inbounds": [
    {
      "tag": "Shadowsocks TCP",
      "listen": "0.0.0.0",
      "port": $SS_PORT,
      "protocol": "shadowsocks",
      "settings": {
        "clients": [],
        "network": "tcp,udp"
      }
    },
    {
      "tag": "VLESS TCP REALITY",
      "listen": "0.0.0.0",
      "port": $VLESS_PORT,
      "protocol": "vless",
      "settings": {
        "clients": [],
        "decryption": "none"
      },
      "streamSettings": {
        "network": "tcp",
        "security": "reality",
        "realitySettings": {
          "show": false,
          "dest": "$REALITY_DEST",
          "xver": 0,
          "serverNames": ["$REALITY_SNI"],
          "privateKey": "$PRIVATE_KEY",
          "publicKey": "$PUBLIC_KEY",
          "shortIds": ["$SHORT_ID", ""]
        }
      },
      "sniffing": {
        "enabled": true,
        "destOverride": ["http", "tls", "quic"]
      }
    }
  ],
  "outbounds": [
    { "protocol": "freedom", "tag": "direct" },
    { "protocol": "blackhole", "tag": "block" }
  ]
}
XRAYEOF
echo "✓ Xray config written"

# 5. Write docker-compose.yml
cat > "$MARZNODE_DIR/docker-compose.yml" << COMPOSEEOF
services:
  marznode:
    image: dawsh/marznode:latest
    restart: always
    network_mode: host
    environment:
      SERVICE_PORT: "$SERVICE_PORT"
      XRAY_EXECUTABLE_PATH: "$XRAY_BINARY"
      XRAY_ASSETS_PATH: "/usr/local/lib/xray"
      XRAY_CONFIG_PATH: "/var/lib/marznode/xray_config.json"
      SSL_CLIENT_CERT_FILE: "/var/lib/marznode/client.pem"
      SSL_KEY_FILE: "./server.key"
      SSL_CERT_FILE: "./server.cert"
    volumes:
      - /var/lib/marznode:/var/lib/marznode
COMPOSEEOF
echo "✓ docker-compose.yml written"

# 6. Open firewall ports
echo "Opening firewall ports..."
ufw allow $SS_PORT/tcp comment "Marznode SS" 2>/dev/null || true
ufw allow $SS_PORT/udp comment "Marznode SS UDP" 2>/dev/null || true
ufw allow $VLESS_PORT/tcp comment "Marznode VLESS" 2>/dev/null || true
ufw allow $SERVICE_PORT/tcp comment "Marznode gRPC" 2>/dev/null || true
echo "✓ Firewall rules added"

# 7. Pull and start
cd "$MARZNODE_DIR"
docker compose pull
docker pull "$XRAY_IMAGE"
STAGE_CONTAINER="$(docker create "$XRAY_IMAGE")"
docker cp "$STAGE_CONTAINER:/usr/bin/xray" "$XRAY_BINARY"
docker rm "$STAGE_CONTAINER" >/dev/null
chmod 755 "$XRAY_BINARY"
docker compose up -d

echo ""
echo "=== DONE — $SERVER_NAME ==="
echo ""
echo "Marznode is running. Now register this node in the Marzneshin panel:"
echo "  Run: node backend/scripts/add-premium-nodes.mjs"
echo ""
echo "Reality public key (keep for panel service inbound): $PUBLIC_KEY"
echo "Short ID: $SHORT_ID"
echo ""
echo "Verify with: docker compose -f /opt/marznode/docker-compose.yml logs -f"
