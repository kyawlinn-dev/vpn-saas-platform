import { beforeEach, describe, expect, it, vi } from "vitest";

const mockInsert = vi.fn();
const mockFrom = vi.fn(() => ({ insert: mockInsert }));

vi.mock("../lib/supabase.js", () => ({
  supabase: { from: mockFrom },
}));

const { recordAppEvent } = await import("../services/appEventService.js");

beforeEach(() => {
  vi.clearAllMocks();
  mockInsert.mockResolvedValue({ error: null });
});

describe("app event tracking", () => {
  it("dedupes passive Mini App open events in a short window", async () => {
    const event = {
      event_name: "miniapp_authenticated",
      event_source: "miniapp",
      actor_type: "customer",
      reseller_id: "reseller-1",
      customer_id: "customer-dedupe",
      page: "home",
      status: "success",
    };

    await recordAppEvent(event);
    const duplicate = await recordAppEvent(event);

    expect(duplicate).toEqual({ skipped: true, deduped: true });
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it("keeps action events exact", async () => {
    const event = {
      event_name: "server_selected",
      event_source: "miniapp",
      actor_type: "customer",
      reseller_id: "reseller-1",
      customer_id: "customer-action",
      server_id: "server-1",
      page: "servers",
      status: "success",
    };

    await recordAppEvent(event);
    await recordAppEvent(event);

    expect(mockFrom).toHaveBeenCalledTimes(2);
    expect(mockInsert).toHaveBeenCalledTimes(2);
  });
});
