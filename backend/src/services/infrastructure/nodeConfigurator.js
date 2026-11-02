import { generateKeyPairSync, randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { assertOperationAuthority, assertResourceOwnership } from "./ownership.js";
import { infrastructureError, payloadHash } from "./repository.js";

// Pinned versions match the reviewed operator template; no mutable :latest pulls.
export const NODE_IMAGE = "dawsh/marznode@sha256:64734e9a0a075cd4da590765ed11f86c564ba311a339dab72b0976438104adab";
export const CORE_IMAGE = "ghcr.io/xtls/xray-core@sha256:be505df0b9a8602a09d54f87a4f8e57153262f44b4ce93d84dcab8bb9adac841";
export const CORE_VERSION = "25.5.16";
export function validCapabilities(protocols) {
  return Array.isArray(protocols) && ((protocols.length === 1 && protocols[0] === "vless") ||
    (protocols.length === 2 && protocols.includes("vless") && protocols.includes("shadowsocks")));
}

function buildBundle(supportedProtocols, policy) {
  const pair = generateKeyPairSync("x25519");
  const privateKey = pair.privateKey.export({ format: "jwk" }).d;
  const realityPublicKey = pair.publicKey.export({ format: "jwk" }).x;
  const shortId = randomBytes(8).toString("hex");
  const inbounds = [{ tag: "managed-vless", listen: "0.0.0.0", port: 443, protocol: "vless",
    settings: { clients: [], decryption: "none" }, streamSettings: { network: "tcp", security: "reality",
      realitySettings: { dest: `${policy.realityServerName}:443`, xver: 0, serverNames: [policy.realityServerName], privateKey, shortIds: [shortId] } } }];
  if (supportedProtocols.includes("shadowsocks")) inbounds.push({ tag: "managed-shadowsocks", listen: "0.0.0.0", port: 8388, protocol: "shadowsocks",
    settings: { method: "chacha20-ietf-poly1305", password: randomBytes(32).toString("base64"), clients: [], network: "tcp,udp" } });
  const config = { log: { loglevel: "warning" }, inbounds, routing: { rules: [{ type: "field", ip: ["geoip:private"], outboundTag: "block" }] },
    outbounds: [{ protocol: "freedom", tag: "direct" }, { protocol: "blackhole", tag: "block" }] };
  const compose = { version: '3.8', services: { marznode: { image: NODE_IMAGE, restart: "unless-stopped", network_mode: "host",
    environment: { SERVICE_PORT: "62050", XRAY_EXECUTABLE_PATH: `/var/lib/marznode/xray-${CORE_VERSION}`,
      XRAY_CONFIG_PATH: "/var/lib/marznode/xray_config.json", SSL_CLIENT_CERT_FILE: "/var/lib/marznode/client.pem",
      XRAY_ASSETS_PATH: "/var/lib/marznode/assets", XRAY_LOCATION_ASSET: "/var/lib/marznode/assets",
      SSL_KEY_FILE: "/var/lib/marznode/server.key", SSL_CERT_FILE: "/var/lib/marznode/server.cert" },
    volumes: ["/var/lib/marznode:/var/lib/marznode"] } } };
  return { images: [NODE_IMAGE, CORE_IMAGE], coreVersion: CORE_VERSION, supportedProtocols: [...supportedProtocols],
    publicMetadata: { realityPublicKey, realityServerName: policy.realityServerName, shortId, vlessPort: 443, ssPort: supportedProtocols.includes("shadowsocks") ? 8388 : null },
    files: [{ path: "/var/lib/marznode/xray_config.json", mode: "0600", content: JSON.stringify(config) },
      { path: "/opt/marznode/compose.json", mode: "0600", content: JSON.stringify(compose) }],
    managementTLS: { mutualTLSRequired: true, privateFileMode: "0600", checkpointRequired: true },
    firewall: { defaultIncoming: "deny", sshPort: 22, managementPort: 62050, managementSources: [...policy.managementSources],
      publicTcpPorts: supportedProtocols.includes("shadowsocks") ? [443, 8388] : [443], publicUdpPorts: supportedProtocols.includes("shadowsocks") ? [8388] : [] } };
}

export async function configureCandidate({ context, operation, resource, supportedProtocols, nodeAdapter }) {
  await assertResourceOwnership({ context, resource, operation });
  const policy = nodeAdapter?.policy;
  if (!validCapabilities(supportedProtocols) || !/^SHA256:[a-zA-Z0-9+/]{43}=?$/.test(resource.sshHostKeySha256 || "") ||
      nodeAdapter?.secretStorageEncrypted !== true || !policy?.managementSources?.length || policy.managementSources.some(ip => !isIP(ip)) ||
      !/^(?=.{1,253}$)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(policy.realityServerName || "")) throw infrastructureError("NODE_SECURITY_CONFIGURATION_REQUIRED");
  for (const method of ["readConfigurationCheckpoint", "saveConfigurationCheckpoint", "installBundle", "close"]) if (typeof nodeAdapter[method] !== "function") throw infrastructureError("NODE_ADAPTER_UNAVAILABLE");
  const identity = { operationId: operation.id, resourceId: resource.id, supportedProtocols: [...supportedProtocols].sort(), policyHash: payloadHash(policy) };
  try {
    let saved = await nodeAdapter.readConfigurationCheckpoint(identity);
    if (saved && payloadHash(saved.identity) !== payloadHash(identity)) throw infrastructureError("NODE_CONFIGURATION_CHANGED");
    if (!saved) {
      const bundle = buildBundle(supportedProtocols, policy);
      saved = { identity, bundle, fingerprint: payloadHash(bundle) };
      await assertOperationAuthority(context, operation);
      await nodeAdapter.saveConfigurationCheckpoint(saved);
    }
    if (payloadHash(saved.bundle) !== saved.fingerprint) throw infrastructureError("NODE_CONFIGURATION_CHANGED");
    await assertResourceOwnership({ context, resource, operation });
    const result = await nodeAdapter.installBundle({ context, operation, resource, bundle: saved.bundle,
      expectedHostKey: resource.sshHostKeySha256, strictHostKeyChecking: true });
    if (!["hostKeyVerified", "imageDigestsVerified", "syntaxValid", "firewallVerified", "managementTlsVerified"].every(key => result?.[key] === true)) throw infrastructureError("NODE_CONFIGURATION_UNVERIFIED");
    return { ...identity, fingerprint: saved.fingerprint, coreVersion: CORE_VERSION, ...saved.bundle.publicMetadata };
  } catch (error) {
    const safe = ["STALE_FENCE", "LEASE_EXPIRED", "NODE_CONFIGURATION_CHANGED", "RESOURCE_SCOPE_MISMATCH", "NODE_CONFIGURATION_UNVERIFIED", "NODE_MANAGEMENT_TLS_UNVERIFIED", "NODE_FIREWALL_POLICY_UNVERIFIED", "NODE_BOOTSTRAP_PENDING", "NODE_BOOTSTRAP_FAILED"];
    throw infrastructureError(safe.includes(error.code) || error.code==='NODE_SSH_HARDENING_UNVERIFIED' ? error.code : "NODE_CONFIGURATION_FAILED");
  } finally {
    try { await nodeAdapter.close({ operationId: operation.id }); } catch { /* Adapter owns bounded connection cleanup. */ }
  }
}
