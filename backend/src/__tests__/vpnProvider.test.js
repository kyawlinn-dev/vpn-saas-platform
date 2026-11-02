import { describe, expect, it, vi } from "vitest";
import { publicAccessContext, publicServer } from "./fixtures/publicServerAccess.js";

const panel = vi.hoisted(() => ({
  createMarzneshinUser: vi.fn(async () => ({ outline_key_id: "panel_user" })),
  deleteMarzneshinUser: vi.fn(async () => ({ success: true })),
  getMarzneshinUser: vi.fn(async () => ({ username: "panel_user" })),
  getMarzneshinTransferMetrics: vi.fn(async () => ({ panel_user: 200 })),
  listMarzneshinUsers: vi.fn(async () => [{ username: "panel_user" }]),
  renameMarzneshinUser: vi.fn(async () => ({ success: true })),
  testMarzneshinServer: vi.fn(async () => ({ ok: true })),
  updateMarzneshinUserDataLimit: vi.fn(async () => ({ success: true })),
  updateMarzneshinUserServices: vi.fn(async () => ({ success: true })),
}));

vi.mock("../services/marzneshinService.js", () => panel);
vi.mock("../lib/tokenEncryption.js", () => ({ decrypt: vi.fn(() => "password") }));

const provider = await import("../services/vpnProviderService.js");
const server = {
  id: "modern", panel_type: "marzneshin", panel_url: "https://panel.example",
  panel_username: "admin", panel_password_encrypted: "ciphertext",
  server_tier: "trial", marzneshin_vless_trial_service_ids: [8],
};

describe("Marzneshin provider", () => {
  it("rejects a foreign service override before public key creation", async () => {
    panel.createMarzneshinUser.mockClear();
    await expect(provider.createKey({ server: publicServer(), protocol: "vless", serviceIds: [5], accessContext: publicAccessContext })).rejects.toMatchObject({ code: "SERVICE_CONFIGURATION_INVALID" });
    expect(panel.createMarzneshinUser).not.toHaveBeenCalled();
  });
  it("resolves a verified public VLESS service for creation", async () => {
    panel.createMarzneshinUser.mockClear();
    await provider.createKey({ server: publicServer(), protocol: "vless", accessContext: publicAccessContext });
    expect(panel.createMarzneshinUser).toHaveBeenCalledWith(expect.objectContaining({ serviceIds: [502] }));
  });
  it("rejects direct legacy service lookup when public mode lacks a context", () => {
    vi.stubEnv("PUBLIC_SERVER_ACCESS_ENABLED", "true");
    try { expect(() => provider.serviceIdsForOrder({ server, protocol: "vless", orderType: "trial" })).toThrow(expect.objectContaining({ code: "PUBLIC_ACCESS_CONTEXT_REQUIRED" })); }
    finally { vi.unstubAllEnvs(); }
  });
  it("uses the panel for key operations", async () => {
    await provider.testServer(server);
    await provider.createKey({ server, name: "customer", expiryDate: "2026-12-31" });
    await provider.getKey({ server, keyId: "panel_user" });
    await provider.updateKeyDataLimit({ server, keyId: "panel_user", dataLimitBytes: 300 });
    await provider.updateKeyServices({ server, keyId: "panel_user", serviceIds: [12] });
    await provider.deleteKey({ server, keyId: "panel_user" });
    expect(await provider.getTransferMetrics(server)).toEqual({ panel_user: 200 });
    expect(panel.createMarzneshinUser).toHaveBeenCalledWith(expect.objectContaining({
      server: expect.objectContaining({ id: "modern", _panel_password: "password" }),
      expiryDate: "2026-12-31",
    }));
    expect(panel.updateMarzneshinUserServices).toHaveBeenCalledWith(expect.objectContaining({
      outlineKeyId: "panel_user",
      serviceIds: [12],
    }));
  });

  it("rejects retired provider rows", () => {
    expect(() => provider.providerForServer({ id: "retired", panel_type: "outline" }))
      .toThrow("not a Marzneshin server");
  });

  it("uses trial-only VLESS service IDs", () => {
    expect(provider.serviceIdsForOrder({ server, protocol: "vless", orderType: "trial" }))
      .toEqual([8]);
  });
});
