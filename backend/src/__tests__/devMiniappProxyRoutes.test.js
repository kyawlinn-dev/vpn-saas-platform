import { describe, expect, it } from "vitest";
import { isBackendRoute } from "../lib/devMiniappProxyRoutes.js";

describe("development Mini App proxy routing", () => {
  it("reserves backend API and key paths", () => {
    expect(isBackendRoute("/api/miniapp/slug/auth")).toBe(true);
    expect(isBackendRoute("/k/token.json")).toBe(true);
    expect(isBackendRoute("/open-key")).toBe(true);
  });

  it("allows Mini App assets beginning with k through the proxy", () => {
    expect(isBackendRoute("/kbzpay.png")).toBe(false);
    expect(isBackendRoute("/key-icon.svg")).toBe(false);
    expect(isBackendRoute("/api-icon.svg")).toBe(false);
  });
});
