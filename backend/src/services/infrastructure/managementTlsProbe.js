// Run inside the pinned node container. Verify policy and protocol behavior,
// not localized OpenSSL error text; Python asyncio may close with an EOF.
export const MANAGEMENT_TLS_PROBE = `timeout 15s docker-compose -f /opt/marznode/compose.json exec -T marznode python3 - <<'NOVANET_TLS_PROBE'
import socket
import ssl
from marznode import config
from marznode.utils.ssl import create_secure_context

if config.INSECURE or int(config.SERVICE_PORT) != 62050:
    raise RuntimeError("MANAGEMENT_TLS_POLICY_INVALID")
server_context = create_secure_context(config.SSL_CERT_FILE, config.SSL_KEY_FILE, trusted=config.SSL_CLIENT_CERT_FILE)
if server_context.verify_mode != ssl.CERT_REQUIRED:
    raise RuntimeError("MANAGEMENT_CLIENT_CERT_NOT_REQUIRED")
client_context = ssl.create_default_context(cafile=config.SSL_CERT_FILE)
client_context.set_alpn_protocols(["h2"])
peer_verified = False
rejected = False
try:
    with socket.create_connection(("127.0.0.1", 62050), timeout=5) as raw:
        with client_context.wrap_socket(raw, server_hostname="marznode") as connection:
            peer_verified = bool(connection.getpeercert())
            if connection.selected_alpn_protocol() != "h2":
                raise RuntimeError("MANAGEMENT_PROTOCOL_UNVERIFIED")
            connection.settimeout(5)
            connection.sendall(b"PRI * HTTP/2.0\\r\\n\\r\\nSM\\r\\n\\r\\n" + b"\\x00\\x00\\x00\\x04\\x00\\x00\\x00\\x00\\x00")
            rejected = connection.recv(1) == b""
except ssl.SSLCertVerificationError:
    raise
except ssl.SSLError as error:
    certificate_alert = error.reason in ("TLSV13_ALERT_CERTIFICATE_REQUIRED", "SSLV3_ALERT_BAD_CERTIFICATE", "SSLV3_ALERT_HANDSHAKE_FAILURE")
    if not (certificate_alert or peer_verified and isinstance(error, ssl.SSLEOFError)):
        raise
    rejected = True
if not rejected:
    raise RuntimeError("MANAGEMENT_UNAUTHENTICATED_CLIENT_ACCEPTED")
print("MANAGEMENT_MTLS_VERIFIED")
NOVANET_TLS_PROBE`;
