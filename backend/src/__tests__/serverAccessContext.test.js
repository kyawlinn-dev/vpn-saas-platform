import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("../lib/supabase.js", () => ({ supabase: { from: mocks.from } }));
import { resolveServerAccessContext } from "../services/serverAccessContext.js";
import { publicAccessContext, publicPool } from "./fixtures/publicServerAccess.js";
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("trusted public access context", () => {
  it("defaults off without loading pool or runtime credentials", async () => {
    vi.stubEnv("PUBLIC_SERVER_ACCESS_ENABLED", "false");
    expect(await resolveServerAccessContext()).toEqual({ publicAccessEnabled: false });
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("accepts an internally resolved matching context", async () => {
    expect(await resolveServerAccessContext(publicAccessContext)).toEqual(publicAccessContext);
  });
  it("rejects an internally inconsistent environment/pool", async () => {
    await expect(resolveServerAccessContext({ ...publicAccessContext, environment: "production" })).rejects.toMatchObject({ code: "RESOURCE_SCOPE_MISMATCH" });
  });
  it("fails closed before database access when enabled without explicit identity", async () => {
    vi.stubEnv("PUBLIC_SERVER_ACCESS_ENABLED", "true");
    vi.stubEnv("SERVER_ACCESS_ENVIRONMENT", "");
    await expect(resolveServerAccessContext()).rejects.toMatchObject({ code: "PUBLIC_ACCESS_CONTEXT_REQUIRED" });
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("verifies configured database, environment and panel before returning a pool", async () => {
    for (const [key, value] of Object.entries({ PUBLIC_SERVER_ACCESS_ENABLED: "true", SERVER_ACCESS_ENVIRONMENT: "development", SERVER_ACCESS_DATABASE_IDENTITY: "test-db.example", SUPABASE_URL: "https://test-db.example", SERVER_ACCESS_PANEL_IDENTITY: "shared-panel", SERVER_ACCESS_POOL_ID: publicPool.id })) vi.stubEnv(key, value);
    const q = { select: () => q, eq: vi.fn(() => q), maybeSingle: vi.fn(async () => ({ data: publicPool })) };
    mocks.from.mockReturnValue(q);
    expect(await resolveServerAccessContext()).toEqual(publicAccessContext);
    expect(q.eq).toHaveBeenCalledWith("environment", "development");
    vi.stubEnv("SUPABASE_URL", "https://wrong-db.example"); mocks.from.mockClear();
    await expect(resolveServerAccessContext()).rejects.toMatchObject({ code: "RESOURCE_SCOPE_MISMATCH" });
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
