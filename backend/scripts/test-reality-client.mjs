import { spawnSync } from 'child_process';

const testSni = async (sni) => {
  const config = {
    log: { loglevel: "warning" },
    inbounds: [{ port: 10811, protocol: "socks", settings: { auth: "noauth" } }],
    outbounds: [{
      protocol: "vless",
      settings: {
        vnext: [{
          address: "139.59.126.185",
          port: 443,
          users: [{ id: "5591a0ed-58a1-60d2-8ff2-d7536d9bbd8a", encryption: "none", flow: "xtls-rprx-vision" }]
        }]
      },
      streamSettings: {
        network: "tcp",
        security: "reality",
        realitySettings: {
          serverName: sni,
          fingerprint: "chrome",
          publicKey: "y_GaneHRKwxNak5b1SgcY4bAcdp0rXHlkQdjBzrwYEA",
          shortId: "c6079538870b8806"
        }
      }
    }]
  };

  const script = `
cat << 'EOF' > /tmp/test-sni.json
${JSON.stringify(config, null, 2)}
EOF
docker cp /tmp/test-sni.json marznode-marznode-1:/tmp/test-sni.json
docker exec marznode-marznode-1 sh -c 'xray run -c /tmp/test-sni.json > /tmp/xr_sni.log 2>&1 &'
sleep 2
CODE=$(curl -s -o /dev/null -w "%{http_code}" -x socks5h://127.0.0.1:10811 https://www.google.com/generate_204 --max-time 5)
echo "SNI: ${sni} -> HTTP: $CODE"
docker exec marznode-marznode-1 pkill -f test-sni.json 2>/dev/null
rm -f /tmp/test-sni.json
`;

  const res = spawnSync('ssh', ['-o', 'StrictHostKeyChecking=no', 'root@165.22.242.245', 'bash'], {
    input: script,
    encoding: 'utf8'
  });
  console.log(res.stdout.trim());
};

for (const s of ['www.apple.com', 'www.microsoft.com', 'www.tiktok.com']) {
  testSni(s);
}
