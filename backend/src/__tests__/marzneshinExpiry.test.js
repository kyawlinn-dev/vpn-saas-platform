import { beforeEach, describe, expect, it, vi } from "vitest";

const { post, get, put } = vi.hoisted(() => ({
  post: vi.fn(),
  get: vi.fn(),
  put: vi.fn(),
}));

vi.mock("axios", () => ({
  default: {
    post,
    create: () => ({ post, get, put }),
    isAxiosError: () => false,
  },
}));

const {
  clearTokenCache,
  createMarzneshinUser,
  panelExpireDateForOrder,
  updateMarzneshinUserDataLimit,
} = await import("../services/marzneshinService.js");

const server = {
  id: "trial-server",
  name: "Trial SGP",
  panel_url: "https://panel.example.test",
  panel_public_url: "https://panel.example.test",
  panel_username: "operator",
  _panel_password: "test-password",
  marzneshin_service_ids: [4],
  marzneshin_vless_trial_service_ids: [8],
};

beforeEach(() => {
  clearTokenCache();
  vi.clearAllMocks();
  post.mockImplementation(async (url, payload) => {
    if (url.endsWith("/api/admins/token")) {
      return { data: { access_token: "token" } };
    }
    return { data: { username: payload.username, key: "test-key" } };
  });
});

describe("Marzneshin order expiry", () => {
  it("ends after the order expiry day in Asia/Bangkok", () => {
    expect(panelExpireDateForOrder("2026-10-10")).toBe("2026-10-10T17:00:00.000Z");
    expect(() => panelExpireDateForOrder(null)).toThrow("valid order expiry_date");
    expect(() => panelExpireDateForOrder("2026-02-30")).toThrow("valid order expiry_date");
  });

  it("creates a trial VLESS user with a fixed expiry and trial-only service", async () => {
    await createMarzneshinUser({
      server,
      name: "Trial customer",
      protocol: "vless",
      serviceIds: [8],
      dataLimitBytes: 1024,
      expiryDate: "2026-10-10",
    });

    const payload = post.mock.calls.find(([url]) => url === "/users")[1];
    expect(payload).toMatchObject({
      service_ids: [8],
      expire_strategy: "fixed_date",
      expire_date: "2026-10-10T17:00:00.000Z",
      data_limit: 1024,
    });
  });

  it("rejects a missing expiry before contacting the panel", async () => {
    await expect(createMarzneshinUser({ server, name: "No expiry" }))
      .rejects.toThrow("valid order expiry_date");
    expect(post).not.toHaveBeenCalled();
  });

  it("updates panel expiry alongside the data limit", async () => {
    get.mockResolvedValue({ data: {
      username: "trial_customer",
      service_ids: [8],
      expire_strategy: "never",
      expire_date: null,
      data_limit: 1024,
      enabled: true,
    } });
    put.mockResolvedValue({ data: {} });

    await updateMarzneshinUserDataLimit({
      server,
      outlineKeyId: "trial_customer",
      dataLimitBytes: 2048,
      expiryDate: "2026-10-17",
    });

    expect(put).toHaveBeenCalledWith("/users/trial_customer", expect.objectContaining({
      service_ids: [8],
      expire_strategy: "fixed_date",
      expire_date: "2026-10-17T17:00:00.000Z",
      data_limit: 2048,
    }));
  });
});
