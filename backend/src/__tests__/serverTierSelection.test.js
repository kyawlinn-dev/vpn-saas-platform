import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFrom = vi.fn();

vi.mock("../lib/supabase.js", () => ({
  supabase: { from: mockFrom },
}));

const { getActiveServers, getAvailableServer, rankProvisionableServers } = await import("../services/serverService.js");

function makeServer(overrides = {}) {
  return {
    id: overrides.id || "server-1",
    name: overrides.name || "Server 1",
    status: "active",
    server_tier: "premium",
    outline_api_url: "https://outline.example/api",
    outline_cert_sha256: "abc123",
    current_active_keys: 0,
    max_active_keys: 5,
    is_default: false,
    region: "sgp1",
    ...overrides,
  };
}

function mockQueryResult({ data = [], error = null } = {}) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    in: vi.fn(() => query),
    then: (resolve, reject) => Promise.resolve({ data, error }).then(resolve, reject),
  };

  mockFrom.mockReturnValue(query);
  return query;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("server tier selection", () => {
  it("filters active server lookup to premium by default", async () => {
    const query = mockQueryResult({
      data: [makeServer({ id: "premium-1", server_tier: "premium" })],
    });

    const servers = await getActiveServers();

    expect(servers).toHaveLength(1);
    expect(query.eq).toHaveBeenCalledWith("server_tier", "premium");
  });

  it("filters active server lookup to trial when requested", async () => {
    const query = mockQueryResult({
      data: [makeServer({ id: "trial-1", server_tier: "trial" })],
    });

    const servers = await getActiveServers({ serverTier: "trial" });

    expect(servers).toHaveLength(1);
    expect(servers[0].server_tier).toBe("trial");
    expect(query.eq).toHaveBeenCalledWith("server_tier", "trial");
  });

  it("keeps legacy getAvailableServer on premium capacity", async () => {
    mockQueryResult({
      data: [
        makeServer({ id: "trial-1", server_tier: "trial", is_default: true }),
        makeServer({ id: "premium-1", server_tier: "premium" }),
      ],
    });

    const server = await getAvailableServer();

    expect(server.id).toBe("premium-1");
  });

  it("ranks lower server load before the default server", () => {
    const ranked = rankProvisionableServers([
      makeServer({
        id: "default-sg",
        is_default: true,
        current_active_keys: 4,
        max_active_keys: 10,
      }),
      makeServer({
        id: "lighter-sg",
        current_active_keys: 1,
        max_active_keys: 10,
      }),
    ]);

    expect(ranked.map((server) => server.id)).toEqual(["lighter-sg", "default-sg"]);
  });

  it("uses the default server as the tie-breaker when load is equal", () => {
    const ranked = rankProvisionableServers([
      makeServer({
        id: "non-default",
        current_active_keys: 1,
        max_active_keys: 5,
        sort_order: 0,
      }),
      makeServer({
        id: "default",
        is_default: true,
        current_active_keys: 2,
        max_active_keys: 10,
        sort_order: 10,
      }),
    ]);

    expect(ranked.map((server) => server.id)).toEqual(["default", "non-default"]);
  });

  it("skips full servers before ranking", () => {
    const ranked = rankProvisionableServers([
      makeServer({
        id: "full-default",
        is_default: true,
        current_active_keys: 10,
        max_active_keys: 10,
      }),
      makeServer({
        id: "available",
        current_active_keys: 9,
        max_active_keys: 10,
      }),
    ]);

    expect(ranked.map((server) => server.id)).toEqual(["available"]);
  });

  it("selects the best available server per requested region", async () => {
    mockQueryResult({
      data: [
        makeServer({
          id: "sg-default",
          region: "sgp1",
          is_default: true,
          current_active_keys: 6,
          max_active_keys: 10,
        }),
        makeServer({
          id: "sg-light",
          region: "sgp1",
          current_active_keys: 2,
          max_active_keys: 10,
        }),
        makeServer({
          id: "jp-default",
          region: "jpn",
          is_default: true,
          current_active_keys: 1,
          max_active_keys: 10,
        }),
      ],
    });

    const servers = await getActiveServers({
      regions: ["sgp1", "jpn"],
      limit: 2,
      serverTier: "premium",
    });

    expect(servers.map((server) => server.id)).toEqual(["sg-light", "jp-default"]);
  });
});
