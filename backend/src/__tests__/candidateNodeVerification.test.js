import { describe, expect, it, vi } from "vitest";
import { verifyCandidate } from "../services/infrastructure/verification.js";
import { publishCandidate, registerCandidate } from "../services/infrastructure/panelAdapter.js";
import { infrastructureFixture } from "./fixtures/infrastructure.js";

async function fixture() {
  const f = await infrastructureFixture();
  const node = f.own("node", "51"), service = f.own("service", "502");
  const candidate = { operation: f.operation, resource: f.resource, node, publicService: service, supportedProtocols: ["shadowsocks", "vless"],
    public: false, address: "198.51.100.10", vlessPort: 443, ssPort: 8388, realityPublicKey: "test-public-key", shortId: "abcd", coreVersion: "25.5.16", endpoint: { id: "host-51", nodeId: "51" } };
  const ss = `ss://${Buffer.from("chacha20-ietf-poly1305:test-password@198.51.100.10:8388").toString("base64")}`;
  const links = [ss, "vless://test@198.51.100.10:443?security=reality&pbk=test-public-key&sid=abcd&type=tcp"];
  const probes = { create: vi.fn(async () => ({ id: "probe", operationId: "op", resourceId: "vm" })),
    health: vi.fn(async () => ({ connected: true, coreVersion: "25.5.16" })),
    subscription: vi.fn(async () => links),
    tunnel: vi.fn(async ({ protocol }) => ({ connected: true, protocol, resourceId: "vm", egressAddress: candidate.address })), cleanup: vi.fn(async () => true) };
  return { ...f, candidate, probes, links };
}
describe("candidate verification and publication", () => {
  it("parses encoded SS plus VLESS Reality and requires actual tunnel results", async () => {
    const f = await fixture();
    const proof = await verifyCandidate(f);
    expect(proof.verified).toBe(true);
    expect(f.probes.tunnel).toHaveBeenCalledTimes(2);
    expect(f.probes.cleanup).toHaveBeenCalled();
  });
  it.each(["wrong-reality-key", "unhealthy", "failed-tunnel"])("fails closed for %s and cleans probe resources", async failure => {
    const f = await fixture();
    if (failure === "wrong-reality-key") f.links[1] = f.links[1].replace("test-public-key", "foreign-key");
    if (failure === "unhealthy") f.probes.health.mockResolvedValue({ connected: false });
    if (failure === "failed-tunnel") f.probes.tunnel.mockResolvedValue({ connected: false });
    await expect(verifyCandidate(f)).rejects.toMatchObject({ code: "CANDIDATE_VERIFICATION_FAILED" });
    expect(f.probes.cleanup).toHaveBeenCalled();
  });
  it("rejects forged publication proof and foreign global service before mutation", async () => {
    const f = await fixture();
    const panel = { withServiceLock: vi.fn() }, repository = { publishCandidate: vi.fn() };
    await expect(publishCandidate({ ...f, proof: { verified: true }, lease: f.operation, panel, repository })).rejects.toMatchObject({ code: "VERIFICATION_PROOF_REQUIRED" });
    f.candidate.publicService = { ...f.candidate.publicService, environment: "production" };
    const proof = await verifyCandidate(f);
    await expect(publishCandidate({ ...f, proof, lease: f.operation, panel, repository })).rejects.toMatchObject({ code: "RESOURCE_SCOPE_MISMATCH" });
    expect(panel.withServiceLock).not.toHaveBeenCalled();
  });
  it("stops publication if panel readback lost an existing endpoint", async () => {
    const f = await fixture(); const proof = await verifyCandidate(f);
    const panel = { withServiceLock: async (_scope, fn) => fn(), readService: vi.fn().mockResolvedValueOnce({ endpoints: [{ id: "old" }], version: 1 }).mockResolvedValueOnce({ endpoints: [f.candidate.endpoint], version: 2 }),
      appendEndpoint: vi.fn() };
    const repository = { checkpointPublication: vi.fn(), publishCandidate: vi.fn() };
    await expect(publishCandidate({ ...f, proof, lease: f.operation, panel, repository })).rejects.toMatchObject({ code: "SERVICE_MEMBERSHIP_CHANGED" });
    expect(repository.publishCandidate).not.toHaveBeenCalled();
    expect(panel.appendEndpoint).toHaveBeenCalledWith(expect.objectContaining({ expectedVersion: 1 }));
  });
  it("registers only private operation-owned resources, never a public service", async () => {
    const f = await fixture();
    f.candidate.inbounds = [f.own("inbound", "in-51")];
    f.candidate.hosts = [f.own("host", "host-51")];
    f.candidate.privateServices = [f.own("service", "private-51")];
    const panel = { ensurePrivateCandidate: vi.fn(async () => f.candidate) };
    const input = { ...f, supportedProtocols: f.candidate.supportedProtocols,
      configuration: { operationId: "op", resourceId: "vm", fingerprint: "private-config-hash" }, panel };
    expect((await registerCandidate(input)).public).toBe(false);
    f.candidate.privateServices = [f.candidate.publicService];
    await expect(registerCandidate(input)).rejects.toMatchObject({ code: "CANDIDATE_REGISTRATION_INVALID" });
  });
  it("does not publish with a stale proof or unconfirmed probe cleanup", async () => {
    const f = await fixture();
    f.probes.cleanup.mockResolvedValue(false);
    await expect(verifyCandidate(f)).rejects.toMatchObject({ code: "PROBE_CLEANUP_REQUIRED" });
    f.probes.cleanup.mockResolvedValue(true);
    const proof = await verifyCandidate(f);
    f.candidate.address = "198.51.100.20";
    await expect(publishCandidate({ ...f, proof, lease: f.operation })).rejects.toMatchObject({ code: "VERIFICATION_PROOF_REQUIRED" });
  });
});
