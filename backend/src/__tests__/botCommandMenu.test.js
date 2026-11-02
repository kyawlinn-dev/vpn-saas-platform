import { describe, expect, it, vi } from "vitest";
import { getBotCommands, setCommandsMenu } from "../bot/commandMenu.js";

describe("bot command menu", () => {
  it('changes descriptions only and never accepts command names or invalid markup',()=>{
    const commands=getBotCommands(false,{'commands.start.description':'Open my account','commands.buy.description':'<b>Buy</b>'});
    expect(commands[0]).toEqual({command:'start',description:'Open my account'});
    expect(commands.find(x=>x.command==='buy').description).not.toContain('<b>');
  });
  it("registers Burmese core commands and adds trial only when enabled", () => {
    const core = getBotCommands(false);
    expect(core.map(({ command }) => command)).toEqual([
      "start", "app", "key", "balance", "buy", "help",
    ]);
    expect(core.every(({ description }) => description.length > 0)).toBe(true);
    expect(getBotCommands(true).map(({ command }) => command)).toEqual([
      "start", "app", "key", "balance", "buy", "help", "trial",
    ]);
  });

  it("sets either the default or an existing chat's menu to commands", async () => {
    const telegram = { setChatMenuButton: vi.fn().mockResolvedValue(true) };
    await setCommandsMenu(telegram);
    await setCommandsMenu(telegram, 123);
    expect(telegram.setChatMenuButton.mock.calls).toEqual([
      [{ menu_button: { type: "commands" } }],
      [{ chat_id: 123, menu_button: { type: "commands" } }],
    ]);
  });
});
