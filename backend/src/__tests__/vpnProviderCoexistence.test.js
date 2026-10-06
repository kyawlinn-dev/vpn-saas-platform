import { describe, expect, it, vi } from "vitest";

const outline = vi.hoisted(() => ({
  createOutlineKey: vi.fn(async () => ({ outline_key_id: "42", access_url: "ss://legacy" })),
  deleteOutlineKey: vi.fn(async () => ({ success: true })),
  getOutlineKey: vi.fn(async () => ({ id: "42" })),
  getOutlineTransferMetrics: vi.fn(async () => ({ "42": 100 })),
  listOutlineKeys: vi.fn(async () => [{ id: "42" }]),
  renameOutlineKey: vi.fn(async () => ({ success: true })),
  testOutlineServer: vi.fn(async () => ({ ok: true })),
  updateOutlineKeyDataLimit: vi.fn(async () => ({ success: true })),
}));
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

vi.mock("../services/outlineService.js", () => outline);
vi.mock("../services/marzneshinService.js", () => panel);
vi.mock("../lib/tokenEncryption.js", () => ({ decrypt: vi.fn(() => "password") }));

const provider = await import("../services/vpnProviderService.js");
const legacy = {
  id: "legacy", panel_type: "outline", outline_api_url: "https://legacy.example",
  outline_cert_sha256: "fingerprint",
};
const modern = {
  id: "modern", panel_type: "marzneshin", panel_url: "https://panel.example",
  panel_username: "admin", panel_password_encrypted: "ciphertext",
};

describe("VPN provider coexistence", () => {
  it("routes legacy key operations to Outline without touching the panel", async () => {
    await provider.testServer(legacy);
    await provider.createKey({ server: legacy, name: "customer", dataLimitBytes: 500 });
    await provider.getKey({ server: legacy, keyId: "42" });
    await provider.updateKeyDataLimit({ server: legacy, keyId: "42", dataLimitBytes: 300 });
    await provider.deleteKey({ server: legacy, keyId: "42" });
    expect(await provider.getTransferMetrics(legacy)).toEqual({ "42": 100 });
    expect(outline.createOutlineKey).toHaveBeenCalledWith({
      apiUrl: legacy.outline_api_url, certSha256: legacy.outline_cert_sha256,
      name: "customer", dataLimitBytes: 500,
    });
    expect(outline.deleteOutlineKey).toHaveBeenCalledWith({
      apiUrl: legacy.outline_api_url, certSha256: legacy.outline_cert_sha256,
      outlineKeyId: "42",
    });
    expect(panel.createMarzneshinUser).not.toHaveBeenCalled();
  });

  it("routes new key operations to Marzneshin", async () => {
    await provider.createKey({ server: modern, name: "customer", expiryDate: "2026-12-31" });
    expect(panel.createMarzneshinUser).toHaveBeenCalledWith(expect.objectContaining({
      server: expect.objectContaining({ id: "modern", _panel_password: "password" }),
      expiryDate: "2026-12-31",
    }));
  });

  it("rejects ambiguous and unsupported provider combinations", async () => {
    expect(() => provider.providerForServer({ id: "ambiguous", ...legacy, ...modern, panel_type: null }))
      .toThrow("unambiguous VPN provider");
    await expect(provider.createKey({ server: legacy, name: "customer", protocol: "vless" }))
      .rejects.toThrow("Shadowsocks only");
  });
});
