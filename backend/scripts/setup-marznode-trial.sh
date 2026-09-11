#!/bin/bash
# =============================================================================
# Install marznode on trial server (168.144.133.227) alongside Outline
#
# PREREQUISITES (run manually before this script):
#   1. Copy client.pem from SG1:
#      scp root@139.59.126.185:/var/lib/marznode/client.pem /tmp/client.pem
#
#   2. Generate a new Reality keypair:
#      docker run --rm dawsh/marznode:latest /usr/local/bin/xray x25519
#      (Save the Private & Public key output — you'll paste them below)
#
# Then run:
#   scp scripts/setup-marznode-trial.sh root@168.144.133.227:/tmp/
#   ssh root@168.144.133.227 "bash /tmp/setup-marznode-trial.sh <PRIVATE_KEY> <PUBLIC_KEY>"
# =============================================================================

set -euo pipefail

PRIVATE_KEY="${1:?Usage: $0 <reality_private_key> <reality_public_key>}"
PUBLIC_KEY="${2:?Usage: $0 <reality_private_key> <reality_public_key>}"

MARZNODE_DIR="/opt/marznode"
DATA_DIR="/var/lib/marznode"
SERVICE_PORT="62050"        # gRPC port for panel ↔ node communication
SS_PORT="1080"              # Shadowsocks
VLESS_PORT="2443"           # VLESS Reality (443 might conflict with future use)
REALITY_DEST="www.yahoo.com:443"
REALITY_SNI="www.yahoo.com"
SHORT_ID="$(openssl rand -hex 8)"

echo "=== Marznode Setup for Trial Server ==="
echo "  SS port:    $SS_PORT"
echo "  VLESS port: $VLESS_PORT"
echo "  gRPC port:  $SERVICE_PORT"
echo "  Reality dest: $REALITY_DEST"
echo "  Short ID:   $SHORT_ID"
echo ""

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
      XRAY_EXECUTABLE_PATH: "/usr/local/bin/xray"
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
docker compose up -d

echo ""
echo "=== DONE ==="
echo ""
echo "Marznode is running. Now add this node in the Marzneshin panel:"
echo "  Name:    Trial-SGP"
echo "  Address: 168.144.133.227"
echo "  Port:    $SERVICE_PORT"
echo ""
echo "After adding the node, create inbounds in the panel matching:"
echo "  - Shadowsocks TCP (port $SS_PORT)"
echo "  - VLESS TCP REALITY (port $VLESS_PORT, pubkey: $PUBLIC_KEY, shortId: $SHORT_ID)"
echo ""
echo "Verify with: docker compose logs -f"
