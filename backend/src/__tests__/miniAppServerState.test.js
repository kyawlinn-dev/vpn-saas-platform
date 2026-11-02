import { describe, expect, it } from "vitest";
import { isCurrentMiniAppServer, getMiniAppServerAccessState } from "../services/miniAppServerState.js";
import { publicAccessContext, publicServer } from "./fixtures/publicServerAccess.js";

const trialServer = { id: "trial", marzneshin_vless_service_ids: [5] };
const premiumServer = { id: "premium", marzneshin_vless_service_ids: [5] };

describe("Mini App current server state", () => {
  it("disables maintenance selection even before the visitor has an active order", () => {
    expect(getMiniAppServerAccessState({ server: publicServer({ under_maintenance: true }) }))
      .toMatchObject({ canAccess: false, reason: "SERVER_UNDER_MAINTENANCE" });
  });
  it.each(["trial", "purchase"])("represents a public %s VLESS key across eligible pool nodes", order_type => {
    expect(isCurrentMiniAppServer({ key: { server_id: "anchor", protocol: "vless" }, order: { order_type }, server: publicServer(), canAccess: true, accessContext: publicAccessContext })).toBe(true);
    expect(isCurrentMiniAppServer({ key: { server_id: "anchor", protocol: "vless" }, order: { order_type }, server: publicServer({ access_pool_id: "other" }), canAccess: true, accessContext: publicAccessContext })).toBe(false);
  });
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
