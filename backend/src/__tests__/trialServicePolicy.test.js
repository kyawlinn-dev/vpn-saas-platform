import { describe, expect, it } from "vitest";
import { requireTrialVlessServiceIds, trialQuotaBytes } from "../services/trialService.js";
import { serviceIdsForOrder } from "../services/vpnProviderService.js";
import { publicAccessContext, publicServer } from "./fixtures/publicServerAccess.js";

describe("trial VLESS service selection", () => {
  it("public trial and paid VLESS use the same verified pool despite old service columns", () => {
    const server = publicServer({ marzneshin_vless_service_ids: [5], marzneshin_vless_trial_service_ids: [8] });
    for (const orderType of ["trial", "purchase"]) expect(serviceIdsForOrder({ server, protocol: "vless", orderType, accessContext: publicAccessContext })).toEqual([502]);
  });
  it("public trials resolve the selected SS node only", () => {
    expect(serviceIdsForOrder({ server: publicServer(), protocol: "shadowsocks", orderType: "trial", accessContext: publicAccessContext })).toEqual([501]);
  });
  it("uses the saved reseller trial quota instead of catalogue limits", () => {
    expect(trialQuotaBytes({ quota_limit_bytes: 5 * 1024 ** 3 }, { data_limit_gb: 50 })).toBe(5 * 1024 ** 3);
    expect(trialQuotaBytes({ quota_limit_bytes: null }, { data_limit_gb: 5 })).toBe(5 * 1024 ** 3);
  });
  it("uses only the trial service", () => {
    expect(requireTrialVlessServiceIds({
      panel_type: "marzneshin",
      panel_url: "https://panel.example",
      server_tier: "trial",
      marzneshin_vless_trial_service_ids: [7],
      marzneshin_vless_service_ids: [5],
    })).toEqual([7]);
  });

  it("refuses to fall back to the premium all-nodes service", () => {
    expect(() => requireTrialVlessServiceIds({
      panel_type: "marzneshin",
      panel_url: "https://panel.example",
      server_tier: "trial",
      marzneshin_vless_trial_service_ids: [],
      marzneshin_vless_service_ids: [5],
    })).toThrow("Trial VLESS service is not configured");
  });

  it("refuses a premium-tier server for a trial VLESS order", () => {
    expect(() => serviceIdsForOrder({
      server: { panel_type: "marzneshin", panel_url: "https://panel.example", server_tier: "premium", marzneshin_vless_trial_service_ids: [8] },
      protocol: "vless",
      orderType: "trial",
    })).toThrow("requires a trial server");
  });

  it("keeps paid VLESS on the configured global service", () => {
    expect(serviceIdsForOrder({
      server: { panel_type: "marzneshin", panel_url: "https://panel.example", server_tier: "trial", marzneshin_vless_trial_service_ids: [8] },
      protocol: "vless",
      orderType: "purchase",
    })).toBeNull();
  });
});
