import { describe, expect, it, vi } from "vitest";
import { resolveShadowsocksConfig } from "../services/shadowsocksConfigService.js";

describe("Shadowsocks config resolution during provider migration", () => {
  const config = { server: "vpn.example.com", port: 12345, method: "aes-256-gcm", password: "secret" };

  it("keeps existing Outline ss:// keys usable without fetching a subscription", async () => {
    const credentials = Buffer.from(`${config.method}:${config.password}`).toString("base64");
    const fetchConfigs = vi.fn();
    expect(await resolveShadowsocksConfig(`ss://${credentials}@${config.server}:${config.port}/?outline=1`, fetchConfigs)).toEqual(config);
    expect(fetchConfigs).not.toHaveBeenCalled();
  });

  it("reads the SS node from a Marzneshin subscription", async () => {
    const fetchConfigs = vi.fn().mockResolvedValue({ ss: config });
    expect(await resolveShadowsocksConfig("https://panel.example.com/sub/user/key", fetchConfigs)).toEqual(config);
    expect(fetchConfigs).toHaveBeenCalledOnce();
  });

  it("does not fetch unknown URL schemes", async () => {
    const fetchConfigs = vi.fn();
    expect(await resolveShadowsocksConfig("file:///etc/passwd", fetchConfigs)).toBeNull();
    expect(fetchConfigs).not.toHaveBeenCalled();
  });
});
