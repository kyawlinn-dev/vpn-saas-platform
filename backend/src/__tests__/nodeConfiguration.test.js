import { describe, expect, it, vi } from "vitest";
import { configureCandidate } from "../services/infrastructure/nodeConfigurator.js";
import { infrastructureFixture } from "./fixtures/infrastructure.js";

describe("candidate node configuration", () => {
  it('preserves sanitized SSH hardening failures through the common configurator',async()=>{
    const f=await infrastructureFixture();
    const nodeAdapter={secretStorageEncrypted:true,policy:{managementSources:['192.0.2.2'],realityServerName:'example.com'},
      readConfigurationCheckpoint:async()=>null,saveConfigurationCheckpoint:async()=>{},
      installBundle:async()=>{throw Object.assign(Error('secret diagnostic'),{code:'NODE_SSH_HARDENING_UNVERIFIED'});},close:async()=>{}};
    await expect(configureCandidate({...f,supportedProtocols:['vless'],nodeAdapter})).rejects.toThrow('NODE_SSH_HARDENING_UNVERIFIED');
  });
  it.each([["vless"], ["shadowsocks", "vless"]])("installs only requested listeners with private checkpoints and pinned images: %s", async (...supportedProtocols) => {
    const f = await infrastructureFixture();
    const nodeAdapter = { secretStorageEncrypted: true, policy: { managementSources: ["192.0.2.2"], realityServerName: "example.com" },
      readConfigurationCheckpoint: vi.fn(async () => null), saveConfigurationCheckpoint: vi.fn(),
      installBundle: vi.fn(async () => ({ hostKeyVerified: true, imageDigestsVerified: true, syntaxValid: true, firewallVerified: true, managementTlsVerified: true })), close: vi.fn(async () => {}) };
    const result = await configureCandidate({ ...f, supportedProtocols, nodeAdapter });
    const bundle = nodeAdapter.installBundle.mock.calls[0][0].bundle;
    const config = JSON.parse(bundle.files.find(file => file.path.endsWith("xray_config.json")).content);
    expect(config.inbounds.map(i => i.protocol).sort()).toEqual([...supportedProtocols].sort());
    expect(bundle.images.every(image => /@sha256:[a-f0-9]{64}$/.test(image))).toBe(true);
    expect(bundle.files.every(file => file.mode === "0600")).toBe(true);
    expect(result.realityPublicKey).toMatch(/^[a-zA-Z0-9_-]{43}$/);
    expect(result.realityServerName).toBe('example.com');
    expect(result.privateKey).toBeUndefined();
    expect(nodeAdapter.close).toHaveBeenCalled();
  });
  it("refuses missing host identity before generating/installing credentials", async () => {
    const f = await infrastructureFixture(); delete f.resource.sshHostKeySha256;
    const nodeAdapter = { installBundle: vi.fn() };
    await expect(configureCandidate({ ...f, supportedProtocols: ["vless"], nodeAdapter })).rejects.toMatchObject({ code: "NODE_SECURITY_CONFIGURATION_REQUIRED" });
    expect(nodeAdapter.installBundle).not.toHaveBeenCalled();
  });
});
