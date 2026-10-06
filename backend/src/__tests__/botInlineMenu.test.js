import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureCustomerAndLink: vi.fn(),
  resolveCustomerByTelegram: vi.fn(),
  getBestActiveOrder: vi.fn(),
  getCustomerTrialInfo: vi.fn(),
  getCustomerQueuedOrder: vi.fn(),
  getCustomerOrderPurchaseState: vi.fn(),
  getPurchasablePlans: vi.fn(),
  setSession: vi.fn(),
  clearSession: vi.fn(),
  resolveActiveKey: vi.fn(),
}));

vi.mock("../bot/botCustomerService.js", () => ({
  ensureCustomerAndLink: mocks.ensureCustomerAndLink,
  resolveCustomerByTelegram: mocks.resolveCustomerByTelegram,
  getBestActiveOrder: mocks.getBestActiveOrder,
  getCustomerTrialInfo: mocks.getCustomerTrialInfo,
  resolveActiveKey: mocks.resolveActiveKey,
  getFullActiveOrder: vi.fn(),
  getAllActiveServersForDisplay: vi.fn(),
  getFullServerById: vi.fn(),
  ensureCustomerSsconfToken: vi.fn(),
}));

vi.mock("../bot/botPurchaseService.js", () => ({
  getCustomerOrderPurchaseState: mocks.getCustomerOrderPurchaseState,
  getPurchasablePlans: mocks.getPurchasablePlans,
  getResellerPaymentInfo: vi.fn(),
  uploadScreenshot: vi.fn(),
  createBotPurchaseOrder: vi.fn(),
  setCustomerProtocolPreference: vi.fn(),
  getOrderCustomerTelegramId: vi.fn(),
  getCustomerQueuedOrder: mocks.getCustomerQueuedOrder,
}));

vi.mock("../bot/botSession.js", () => ({
  getSession: vi.fn(),
  setSession: mocks.setSession,
  clearSession: mocks.clearSession,
}));

const { setupHandlers } = await import("../bot/handlers.js");

function makeBot(options = {}) {
  const handlers = { commands: {}, actions: {}, hears: {} };
  const bot = {
    start: (handler) => { handlers.start = handler; },
    command: (name, handler) => { handlers.commands[name] = handler; },
    action: (name, handler) => { handlers.actions[name] = handler; },
    hears: (name, handler) => { handlers.hears[name] = handler; },
    on: vi.fn(),
  };
  setupHandlers(bot, {
    resellerId: "reseller-1",
    brandName: "NovaNet MM",
    miniappSlug: "novanet-mm",
    miniappBaseUrl: options.miniappBaseUrl ?? "https://app.example.com",
    supportUsername: "support",
    trialEnabled: options.trialEnabled ?? true,
  });
  return handlers;
}

function makeContext() {
  return {
    from: { id: 123, first_name: "Test", username: "test" },
    chat: { id: 123, type: "private" },
    telegram: { setChatMenuButton: vi.fn().mockResolvedValue(undefined) },
    replyWithHTML: vi.fn().mockResolvedValue(undefined),
    editMessageText: vi.fn().mockResolvedValue(undefined),
    editMessageReplyMarkup: vi.fn().mockResolvedValue(undefined),
    answerCbQuery: vi.fn().mockResolvedValue(undefined),
  };
}

function inlineButtons(ctx) {
  return ctx.replyWithHTML.mock.calls.at(-1)[1].reply_markup.inline_keyboard.flat();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ensureCustomerAndLink.mockResolvedValue({ customerId: "customer-1", trial_used_at: null });
  mocks.resolveCustomerByTelegram.mockResolvedValue({ customerId: "customer-1" });
  mocks.getBestActiveOrder.mockResolvedValue(null);
  mocks.getCustomerTrialInfo.mockResolvedValue({ customer_id: "customer-1", trial_used_at: null });
  mocks.getCustomerQueuedOrder.mockResolvedValue(null);
  mocks.getCustomerOrderPurchaseState.mockResolvedValue({ canBuy: true, isExtend: false });
  mocks.getPurchasablePlans.mockResolvedValue([{ id: "plan-1", price_mmk: 5000, data_limit_gb: 50, duration_days: 30 }]);
  mocks.resolveActiveKey.mockResolvedValue({ protocol: "shadowsocks" });
  mocks.clearSession.mockResolvedValue(undefined);
});

describe("inline-first bot navigation", () => {
  it("registers the shortcuts, repairs the command menu, and removes the old keyboard", async () => {
    const handlers = makeBot();
    const ctx = makeContext();
    await handlers.start(ctx);

    expect(Object.keys(handlers.commands)).toEqual(["app", "key", "balance", "buy", "help", "trial"]);
    expect(ctx.telegram.setChatMenuButton).toHaveBeenCalledWith({
      chat_id: 123,
      menu_button: { type: "commands" },
    });
    expect(ctx.replyWithHTML).toHaveBeenCalledTimes(2);
    expect(ctx.replyWithHTML.mock.calls[0][1].reply_markup.remove_keyboard).toBe(true);
    expect(inlineButtons(ctx).some((button) => button.callback_data === "start:get_trial")).toBe(true);
    expect(inlineButtons(ctx).some((button) => button.web_app)).toBe(true);
  });

  it("does not expose /trial on a reseller bot with trials disabled", () => {
    const handlers = makeBot({ trialEnabled: false });
    expect(handlers.commands.trial).toBeUndefined();
  });

  it("opens the reseller Mini App from /app, or explains when unavailable", async () => {
    const handlers = makeBot();
    const ctx = makeContext();
    await handlers.commands.app(ctx);
    expect(inlineButtons(ctx)[0].web_app.url).toContain("slug=novanet-mm");
    expect(ctx.telegram.setChatMenuButton).toHaveBeenCalledWith({
      chat_id: 123,
      menu_button: { type: "commands" },
    });

    const unavailable = makeBot({ miniappBaseUrl: "" });
    const otherCtx = makeContext();
    await unavailable.commands.app(otherCtx);
    expect(otherCtx.replyWithHTML.mock.calls.at(-1)[0]).toContain("Mini App");
    expect(otherCtx.replyWithHTML.mock.calls.at(-1)[1]).toBeUndefined();
  });

  it("routes /key, /balance, and /help to their existing views", async () => {
    const handlers = makeBot();
    const keyCtx = makeContext();
    await handlers.commands.key(keyCtx);
    expect(keyCtx.replyWithHTML.mock.calls.at(-1)[0]).toContain("VPN Key");

    const balanceCtx = makeContext();
    await handlers.commands.balance(balanceCtx);
    expect(balanceCtx.replyWithHTML.mock.calls.at(-1)[0]).toContain("ဒေတာ");

    const helpCtx = makeContext();
    await handlers.commands.help(helpCtx);
    expect(inlineButtons(helpCtx).map((button) => button.callback_data)).toContain("menu:howto");
  });

  it("routes /buy through queued-order policy and /trial through eligibility", async () => {
    const handlers = makeBot();
    const buyCtx = makeContext();
    await handlers.commands.buy(buyCtx);
    expect(inlineButtons(buyCtx).map((button) => button.callback_data)).toContain("buy:proto:ss");

    mocks.getCustomerOrderPurchaseState.mockResolvedValue({ canBuy: false });
    const queuedCtx = makeContext();
    await handlers.commands.buy(queuedCtx);
    expect(queuedCtx.replyWithHTML.mock.calls.at(-1)[0]).toContain("ကြိုတင်ဝယ်ယူထားသော");

    const trialCtx = makeContext();
    await handlers.commands.trial(trialCtx);
    expect(inlineButtons(trialCtx).map((button) => button.callback_data)).toContain("trial:proto:ss");

    mocks.getCustomerTrialInfo.mockResolvedValue({ trial_used_at: "2026-10-01" });
    const usedCtx = makeContext();
    await handlers.commands.trial(usedCtx);
    expect(usedCtx.replyWithHTML.mock.calls.at(-1)[0]).toContain("ရယူပြီး");
  });

  it("asks unlinked users to run /start before customer commands", async () => {
    mocks.resolveCustomerByTelegram.mockResolvedValue(null);
    const handlers = makeBot();
    for (const name of ["key", "balance", "buy", "trial"]) {
      const ctx = makeContext();
      await handlers.commands[name](ctx);
      expect(ctx.replyWithHTML.mock.calls.at(-1)[0]).toContain("/start");
    }
    expect(mocks.getPurchasablePlans).not.toHaveBeenCalled();
  });

  it("shows My VPN first for a customer with active access", async () => {
    mocks.ensureCustomerAndLink.mockResolvedValue({ customerId: "customer-1", trial_used_at: "2026-10-01" });
    mocks.getBestActiveOrder.mockResolvedValue({ id: "order-1" });
    const handlers = makeBot();
    const ctx = makeContext();
    await handlers.start(ctx);

    expect(inlineButtons(ctx)[0].callback_data).toBe("menu:vpn");
    await handlers.actions["menu:vpn"](ctx);
    const keyboard = ctx.editMessageText.mock.calls.at(-1)[1].reply_markup.inline_keyboard.flat();
    expect(keyboard.map((button) => button.callback_data)).toContain("menu:key");
    expect(keyboard.map((button) => button.callback_data)).toContain("menu:home");
  });

  it("does not label the VLESS provisioning node as the connected server in the key reply", async () => {
    mocks.getBestActiveOrder.mockResolvedValue({ id: "order-1" });
    mocks.resolveActiveKey.mockResolvedValue({
      protocol: "vless",
      access_url: "https://panel.example/sub/test",
      vpn_servers: { display_city: "Tokyo" },
    });
    const handlers = makeBot();
    const ctx = makeContext();
    ctx.replyWithPhoto = vi.fn().mockResolvedValue(undefined);

    await handlers.actions["menu:key"](ctx);

    expect(ctx.replyWithPhoto).toHaveBeenCalledTimes(1);
    const caption = ctx.replyWithPhoto.mock.calls[0][1].caption;
    expect(caption).toContain("https://panel.example/sub/test");
    expect(caption).not.toContain("Tokyo");
    expect(caption).not.toContain("ချိတ်ဆက်ထားသော ဆာဗာ");
  });

  it("shows Buy first after trial when access is inactive", async () => {
    mocks.ensureCustomerAndLink.mockResolvedValue({ customerId: "customer-1", trial_used_at: "2026-10-01" });
    const handlers = makeBot();
    const ctx = makeContext();
    await handlers.start(ctx);

    expect(inlineButtons(ctx)[0].callback_data).toBe("menu:buy");
  });

  it("shows package status instead of Buy when an order is queued", async () => {
    mocks.ensureCustomerAndLink.mockResolvedValue({ customerId: "customer-1", trial_used_at: "2026-10-01" });
    mocks.getCustomerQueuedOrder.mockResolvedValue({ orderId: "queued-1" });
    const handlers = makeBot();
    const ctx = makeContext();
    await handlers.start(ctx);

    expect(inlineButtons(ctx)[0].callback_data).toBe("menu:balance");
    expect(inlineButtons(ctx).some((button) => button.callback_data === "menu:buy")).toBe(false);
  });

  it("requires a second tap before provisioning a trial", async () => {
    const handlers = makeBot();
    const ctx = makeContext();
    await handlers.actions["start:get_trial"](ctx);
    await handlers.actions["trial:proto:ss"](ctx);

    const keyboard = ctx.editMessageText.mock.calls.at(-1)[1].reply_markup.inline_keyboard.flat();
    expect(keyboard.map((button) => button.callback_data)).toContain("trial:confirm:shadowsocks");
    expect(keyboard.map((button) => button.callback_data)).toContain("trial:back");
  });

  it("opens the app choice from Buy without a slash command", async () => {
    const handlers = makeBot();
    const ctx = makeContext();
    await handlers.actions["menu:buy"](ctx);

    const callbacks = inlineButtons(ctx).map((button) => button.callback_data);
    expect(callbacks).toContain("buy:proto:ss");
    expect(callbacks).toContain("buy:proto:vless");
    expect(callbacks).toContain("menu:home");
  });

  it("keeps an active purchase on its current app when buying a queued plan", async () => {
    mocks.getCustomerOrderPurchaseState.mockResolvedValue({
      canBuy: true,
      isExtend: true,
      activeOrder: { id: "order-1" },
    });
    const handlers = makeBot();
    const ctx = makeContext();
    await handlers.actions["menu:buy"](ctx);

    const callbacks = inlineButtons(ctx).map((button) => button.callback_data);
    expect(callbacks).toContain("buy:plan:plan-1");
    expect(callbacks).not.toContain("buy:proto:vless");
  });

  it("returns to the main inline menu after cancelling a purchase", async () => {
    const handlers = makeBot();
    const ctx = makeContext();
    await handlers.actions["buy:cancel"](ctx);

    expect(mocks.clearSession).toHaveBeenCalledWith("reseller-1", 123);
    expect(ctx.editMessageReplyMarkup).toHaveBeenCalledWith({ inline_keyboard: [] });
    expect(ctx.replyWithHTML).toHaveBeenCalledTimes(1);
    expect(ctx.replyWithHTML.mock.calls[0][0]).toContain("ဝယ်ယူမှုကို ပယ်ဖျက်");
    expect(inlineButtons(ctx).some((button) => button.callback_data === "start:get_trial")).toBe(true);
    expect(inlineButtons(ctx).some((button) => button.web_app)).toBe(true);
  });
});
