import { afterEach, describe, expect, it } from "vitest";
import { buildWebAppUrl } from "../bot/webAppUrl.js";

const ORIGINAL_RELEASE_VERSION = process.env.MINIAPP_RELEASE_VERSION;

afterEach(() => {
  if (ORIGINAL_RELEASE_VERSION === undefined) {
    delete process.env.MINIAPP_RELEASE_VERSION;
  } else {
    process.env.MINIAPP_RELEASE_VERSION = ORIGINAL_RELEASE_VERSION;
  }
});

describe("buildWebAppUrl", () => {
  it("includes the reseller slug", () => {
    delete process.env.MINIAPP_RELEASE_VERSION;
    expect(buildWebAppUrl("https://app.novanetmm.com", "shadow-vpn")).toBe(
      "https://app.novanetmm.com/?slug=shadow-vpn"
    );
  });

  it("adds the Mini App release version when configured", () => {
    process.env.MINIAPP_RELEASE_VERSION = "20260725-9065526";
    expect(buildWebAppUrl("https://app.novanetmm.com", "shadow-vpn")).toBe(
      "https://app.novanetmm.com/?slug=shadow-vpn&v=20260725-9065526"
    );
  });

  it("preserves subpaths and existing query params", () => {
    process.env.MINIAPP_RELEASE_VERSION = "release-1";
    expect(buildWebAppUrl("https://app.novanetmm.com?source=bot", "novanet-mm", "/servers")).toBe(
      "https://app.novanetmm.com/servers?source=bot&slug=novanet-mm&v=release-1"
    );
  });
});
