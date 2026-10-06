import { describe, expect, it } from "vitest";
import { isCurrentMiniAppServer } from "../services/miniAppServerState.js";

const trialServer = { id: "trial", marzneshin_vless_service_ids: [5] };
const premiumServer = { id: "premium", marzneshin_vless_service_ids: [5] };

describe("Mini App current server state", () => {
  it("does not mark premium nodes current for an Outline trial", () => {
    const key = { server_id: "trial", protocol: "shadowsocks" };
    const order = { order_type: "trial" };
    expect(isCurrentMiniAppServer({ key, order, server: trialServer, canAccess: true })).toBe(true);
    expect(isCurrentMiniAppServer({ key, order, server: premiumServer, canAccess: false })).toBe(false);
  });

  it("keeps a VLESS trial on its trial node", () => {
    const key = { server_id: "trial", protocol: "vless" };
    const order = { order_type: "trial" };
    expect(isCurrentMiniAppServer({ key, order, server: trialServer, canAccess: true })).toBe(true);
    expect(isCurrentMiniAppServer({ key, order, server: premiumServer, canAccess: false })).toBe(false);
  });

  it("marks accessible global VLESS nodes current for a paid key", () => {
    const key = { server_id: "trial", protocol: "vless" };
    const order = { order_type: "purchase" };
    expect(isCurrentMiniAppServer({ key, order, server: premiumServer, canAccess: true })).toBe(true);
    expect(isCurrentMiniAppServer({ key, order, server: premiumServer, canAccess: false })).toBe(false);
  });

  it("marks only the linked node current for a paid Outline key", () => {
    const key = { server_id: "trial", protocol: "shadowsocks" };
    const order = { order_type: "purchase" };
    expect(isCurrentMiniAppServer({ key, order, server: trialServer, canAccess: true })).toBe(true);
    expect(isCurrentMiniAppServer({ key, order, server: premiumServer, canAccess: true })).toBe(false);
  });
});
