import { afterAll, describe, expect, it } from "vitest";
import express from "express";
import adminServersRouter from "../routes/admin/adminServersRouter.js";

const app = express();
app.use(express.json());
app.use("/api/admin/servers", adminServersRouter);
const server = app.listen(0, "127.0.0.1");
afterAll(() => server.close());

describe("retired server actions", () => {
  it.each([
    ["/api/admin/servers/provision", {}],
    ["/api/admin/servers/old-server/decommission", { force: false }],
  ])("rejects %s without touching a droplet", async (path, body) => {
    const port = server.address().port;
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(410);
    expect((await response.json()).code).toMatch(/_UNAVAILABLE$/);
  });
});
