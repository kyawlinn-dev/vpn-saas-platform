import { describe, expect, it, vi } from "vitest";

const panel = vi.hoisted(() => ({
  createMarzneshinUser: vi.fn(async () => ({ outline_key_id: "panel_user" })),
  deleteMarzneshinUser: vi.fn(async () => ({ success: true })),
  getMarzneshinUser: vi.fn(async () => ({ username: "panel_user" })),
  getMarzneshinTransferMetrics: vi.fn(async () => ({ panel_user: 200 })),
  listMarzneshinUsers: vi.fn(async () => [{ username: "panel_user" }]),
  renameMarzneshinUser: vi.fn(async () => ({ success: true })),
  testMarzneshinServer: vi.fn(async () => ({ ok: true })),
  updateMarzneshinUserDataLimit: vi.fn(async () => ({ success: true })),
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
  it("uses the panel for key operations", async () => {
    await provider.testServer(server);
    await provider.createKey({ server, name: "customer", expiryDate: "2026-12-31" });
    await provider.getKey({ server, keyId: "panel_user" });
    await provider.updateKeyDataLimit({ server, keyId: "panel_user", dataLimitBytes: 300 });
    await provider.deleteKey({ server, keyId: "panel_user" });
    expect(await provider.getTransferMetrics(server)).toEqual({ panel_user: 200 });
    expect(panel.createMarzneshinUser).toHaveBeenCalledWith(expect.objectContaining({
      server: expect.objectContaining({ id: "modern", _panel_password: "password" }),
      expiryDate: "2026-12-31",
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
