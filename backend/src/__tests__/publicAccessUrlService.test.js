import { afterEach, describe, expect, it } from "vitest";
import {
  buildDynamicAccessUrl,
  buildSsconfHttpUrl,
  getPublicSubscriptionBaseUrl,
} from "../services/publicAccessUrlService.js";

const ORIGINAL_ENV = {
  PUBLIC_SUBSCRIPTION_BASE_URL: process.env.PUBLIC_SUBSCRIPTION_BASE_URL,
  WEBHOOK_BASE_URL: process.env.WEBHOOK_BASE_URL,
};

function resetPublicUrlEnv() {
  if (ORIGINAL_ENV.PUBLIC_SUBSCRIPTION_BASE_URL === undefined) {
    delete process.env.PUBLIC_SUBSCRIPTION_BASE_URL;
  } else {
    process.env.PUBLIC_SUBSCRIPTION_BASE_URL = ORIGINAL_ENV.PUBLIC_SUBSCRIPTION_BASE_URL;
  }

  if (ORIGINAL_ENV.WEBHOOK_BASE_URL === undefined) {
    delete process.env.WEBHOOK_BASE_URL;
  } else {
    process.env.WEBHOOK_BASE_URL = ORIGINAL_ENV.WEBHOOK_BASE_URL;
  }
}

function mockReq(host = "localhost:3000") {
  return {
    headers: {},
    protocol: "http",
    get(name) {
      return name === "host" ? host : undefined;
    },
  };
}

afterEach(resetPublicUrlEnv);

describe("public access URL service", () => {
  it("prefers PUBLIC_SUBSCRIPTION_BASE_URL over the local request host", () => {
    process.env.PUBLIC_SUBSCRIPTION_BASE_URL = "https://example-tunnel.ngrok-free.dev/";
    process.env.WEBHOOK_BASE_URL = "https://api.novanetmm.com";

    expect(getPublicSubscriptionBaseUrl(mockReq())).toBe("https://example-tunnel.ngrok-free.dev");
    expect(buildSsconfHttpUrl("tok_123", { req: mockReq() })).toBe(
      "https://example-tunnel.ngrok-free.dev/k/tok_123.json"
    );
    expect(buildDynamicAccessUrl("tok_123", "Shadow VPN", { req: mockReq() })).toBe(
      "ssconf://example-tunnel.ngrok-free.dev/k/tok_123.json#Shadow VPN"
    );
  });

  it("falls back to WEBHOOK_BASE_URL before request host", () => {
    delete process.env.PUBLIC_SUBSCRIPTION_BASE_URL;
    process.env.WEBHOOK_BASE_URL = "https://api.novanetmm.com/";

    expect(getPublicSubscriptionBaseUrl(mockReq())).toBe("https://api.novanetmm.com");
  });

  it("uses request host only when no public env URL is configured", () => {
    delete process.env.PUBLIC_SUBSCRIPTION_BASE_URL;
    delete process.env.WEBHOOK_BASE_URL;

    expect(buildSsconfHttpUrl("tok_123", { req: mockReq("localhost:3000") })).toBe(
      "http://localhost:3000/k/tok_123.json"
    );
  });
});
