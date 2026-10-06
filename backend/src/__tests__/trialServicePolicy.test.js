import { describe, expect, it } from "vitest";
import { requireTrialVlessServiceIds } from "../services/trialService.js";
import { serviceIdsForOrder } from "../services/vpnProviderService.js";

describe("trial VLESS service selection", () => {
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
