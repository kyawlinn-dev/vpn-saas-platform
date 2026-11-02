import { parseSsUrl } from "../../utils/parseSsUrl.js";
import { assertOperationAuthority, assertResourceOwnership } from "./ownership.js";
import { infrastructureError, payloadHash } from "./repository.js";
import { validCapabilities } from "./nodeConfigurator.js";

const proofs = new WeakMap();
const fingerprint = candidate => payloadHash(candidate);
export function assertCandidateVerification({ context, candidate, proof, lease }) {
  const record = proof && proofs.get(proof);
  if (!record || record.context !== context || record.fingerprint !== fingerprint(candidate) ||
      record.expiresAt <= Date.now() || record.operationId !== lease?.id || record.fence !== lease?.fence) throw infrastructureError("VERIFICATION_PROOF_REQUIRED");
  return record;
}

export async function verifyCandidate({ context, candidate, probes }) {
  const operation = candidate.operation;
  await assertResourceOwnership({ context, resource: candidate.resource, operation });
  await assertResourceOwnership({ context, resource: candidate.node, operation });
  if (!validCapabilities(candidate.supportedProtocols)) throw infrastructureError("CANDIDATE_VERIFICATION_FAILED");
  for (const method of ["create", "health", "subscription", "tunnel", "cleanup"]) if (typeof probes?.[method] !== "function") throw infrastructureError("PROBE_ADAPTER_UNAVAILABLE");
  let probe;
  try {
    // Cleanup is keyed by operation even if creation times out before returning an ID.
    probe = await probes.create({ context, candidate, operation });
    if (probe?.operationId !== operation.id || probe.resourceId !== candidate.resource.id) throw new Error("Probe scope mismatch");
    const health = await probes.health({ context, candidate });
    if (health?.connected !== true || health.coreVersion !== candidate.coreVersion) throw new Error("Unhealthy core");
    const links = await probes.subscription({ context, candidate, probe });
    if (!Array.isArray(links)) throw new Error("Missing subscription");
    for (const protocol of candidate.supportedProtocols) {
      let parsed = false;
      for (const link of links) {
        try {
          if (protocol === "shadowsocks" && link.startsWith("ss://")) {
            const ss = parseSsUrl(link);
            parsed ||= ss.server === candidate.address && ss.port === candidate.ssPort && ss.method === "chacha20-ietf-poly1305";
          } else if (protocol === "vless" && link.startsWith("vless://")) {
            const url = new URL(link);
            parsed ||= url.hostname === candidate.address && Number(url.port) === candidate.vlessPort &&
              url.searchParams.get("security") === "reality" && url.searchParams.get("pbk") === candidate.realityPublicKey &&
              url.searchParams.get("sid") === candidate.shortId && url.searchParams.get("type") === "tcp";
          }
        } catch { /* Malformed endpoints cannot satisfy verification. */ }
      }
      if (!parsed) throw new Error("Endpoint mismatch");
      await assertOperationAuthority(context, operation);
      const tunnel = await probes.tunnel({ context, candidate, probe, protocol });
      if (tunnel?.connected !== true || tunnel.protocol !== protocol || tunnel.resourceId !== candidate.resource.id ||
          !candidate.resource.addresses.includes(tunnel.egressAddress)) throw new Error("Tunnel failed");
    }
    await assertOperationAuthority(context, operation);
    const proof = Object.freeze({ verified: true, nodeId: candidate.node.id, verifiedAt: new Date().toISOString() });
    proofs.set(proof, { context, fingerprint: fingerprint(candidate), operationId: operation.id, fence: operation.fence, expiresAt: Date.now() + 5 * 60000 });
    return proof;
  } catch (error) {
    throw infrastructureError(error.code === "STALE_FENCE" ? "STALE_FENCE" : "CANDIDATE_VERIFICATION_FAILED");
  } finally {
    // Probe deletion is operation-scoped, never a customer-account cleanup.
    let cleaned = false;
    try { cleaned = await probes.cleanup({ context, candidate, operationId: operation.id, probe }); } catch { /* Require explicit cleanup confirmation below. */ }
    if (cleaned !== true) throw infrastructureError("PROBE_CLEANUP_REQUIRED");
  }
}
