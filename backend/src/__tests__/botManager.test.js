import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  botInstances: [],
  fetch: vi.fn(),
  setupHandlers: vi.fn(),
  setCommandsMenu: vi.fn(),
  content:vi.fn(async()=>({})),
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
vi.mock('../services/telegramBotContentService.js',()=>({loadTelegramBotContent:mocks.content,getTelegramBotContentService:async()=>({snapshot:mocks.content})}));
vi.mock("../bot/commandMenu.js", async importOriginal => ({
  ...(await importOriginal()),
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
    mocks.content.mockReset().mockResolvedValue({});
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
  it('syncs a saved command description without restarting the bot and retries failures',async()=>{
    const manager=await import('../bot/manager.js');await manager.start();
    const bot=mocks.botInstances[0],before=mocks.setupHandlers.mock.calls.length;
    mocks.content.mockResolvedValue({'commands.start.description':'Custom start'});
    expect(await manager.syncBotContentCommands('reseller-1')).toEqual({status:'synced'});
    expect(bot.telegram.setMyCommands).toHaveBeenCalledTimes(2);
    expect(mocks.setupHandlers.mock.calls.length).toBe(before);
    expect(await manager.syncBotContentCommands('reseller-1')).toEqual({status:'synced'});
    expect(bot.telegram.setMyCommands).toHaveBeenCalledTimes(2);
    mocks.content.mockResolvedValue({'commands.start.description':'Changed again'});
    bot.telegram.setMyCommands.mockRejectedValueOnce(new Error('rate limit'));
    expect(await manager.syncBotContentCommands('reseller-1')).toEqual({status:'pending'});
    expect(await manager.syncBotContentCommands('reseller-1')).toEqual({status:'synced'});
    expect(await manager.syncBotContentCommands('other')).toEqual({status:'not_running'});
  });
});
