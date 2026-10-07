import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  botInstances: [],
  fetch: vi.fn(),
  setupHandlers: vi.fn(),
  setCommandsMenu: vi.fn(),
}));

vi.mock("telegraf", () => ({
  Telegraf: class MockTelegraf {
    constructor() {
      this.botInfo = undefined;
      this.telegram = {
        getMe: vi.fn().mockResolvedValue({ id: 123, username: "test_bot" }),
        setMyCommands: vi.fn().mockResolvedValue(true),
      };
      mocks.botInstances.push(this);
    }

    catch() {}

    async handleUpdate() {
      if (!this.botInfo) this.botInfo = await this.telegram.getMe();
    }
  },
}));

vi.mock("../bot/handlers.js", () => ({ setupHandlers: mocks.setupHandlers }));
vi.mock("../bot/commandMenu.js", () => ({
  getBotCommands: vi.fn(() => []),
  setCommandsMenu: mocks.setCommandsMenu,
}));
vi.mock("../lib/tokenEncryption.js", () => ({ decrypt: vi.fn(() => "plain-token") }));
vi.mock("../lib/supabase.js", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => {
        const builder = {
          eq: vi.fn(() => builder),
          not: vi.fn().mockResolvedValue({
            data: [
              {
                reseller_id: "reseller-1",
                bot_token_encrypted: "encrypted-token",
                brand_name: "Test",
                miniapp_slug: "test",
                trial_enabled: false,
              },
            ],
            error: null,
          }),
        };
        return builder;
      }),
      update: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })),
    })),
  },
}));

describe("bot manager", () => {
  beforeEach(() => {
    mocks.botInstances.length = 0;
    mocks.fetch.mockReset().mockResolvedValue({
      json: vi.fn().mockResolvedValue({ ok: true }),
    });
    mocks.setupHandlers.mockClear();
    mocks.setCommandsMenu.mockReset().mockResolvedValue(true);
    vi.stubGlobal("fetch", mocks.fetch);
    process.env.WEBHOOK_BASE_URL = "https://api.example.com";
    process.env.TELEGRAM_MINIAPP_URL = "https://app.example.com";
  });

  it("reuses the startup bot identity when handling updates", async () => {
    const manager = await import("../bot/manager.js");

    await manager.start();

    const [bot] = mocks.botInstances;
    expect(bot.botInfo).toEqual({ id: 123, username: "test_bot" });
    await bot.handleUpdate({ update_id: 1 });
    expect(bot.telegram.getMe).toHaveBeenCalledTimes(1);
  });
});
