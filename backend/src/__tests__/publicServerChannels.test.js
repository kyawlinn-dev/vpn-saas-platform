import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("../lib/supabase.js", () => ({ supabase: { from: mocks.from } }));
import { getAllActiveServersForDisplay } from "../bot/botCustomerService.js";
import { getMiniAppServerAccessState } from "../services/miniAppServerState.js";
import { publicAccessContext, publicServer } from "./fixtures/publicServerAccess.js";

describe("shared public channel eligibility", () => {
  it.each(["trial", "purchase"])("bot and Mini App offer the same SS candidates for %s", async orderType => {
    const nodes = [publicServer(), publicServer({ id: "vless", supported_protocols: ["vless"], marzneshin_service_ids: [] }),
      publicServer({ id: "foreign", environment: "production" }), publicServer({ id: "full", current_active_keys: 10 })];
    const query = { select: () => query, eq: () => query, order: () => query, then: resolve => Promise.resolve({ data: nodes }).then(resolve) };
    mocks.from.mockReturnValue(query);
    const bot = await getAllActiveServersForDisplay({ protocol: "shadowsocks", orderType, accessContext: publicAccessContext });
    const miniapp = nodes.filter(server => getMiniAppServerAccessState({ activeOrder: { order_type: orderType }, server, protocol: "shadowsocks", accessContext: publicAccessContext }).canAccess);
    expect(bot.map(s => s.id)).toEqual(["dev-node"]);
    expect(miniapp.map(s => s.id)).toEqual(bot.map(s => s.id));
  });
  it("does not hide an existing VLESS endpoint merely because anchor assignment slots are full", () => {
    expect(getMiniAppServerAccessState({ activeOrder: { order_type: "trial" }, server: publicServer({ current_active_keys: 10 }), protocol: "vless", purpose: "display", accessContext: publicAccessContext }).canAccess).toBe(true);
  });
  it("does not grant server access without an active order", () => {
    expect(getMiniAppServerAccessState({ activeOrder: null, server: publicServer(), protocol: "shadowsocks", accessContext: publicAccessContext }).canAccess).toBe(false);
  });
});
