import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  existsSync: vi.fn(),
  createDroplet: vi.fn(),
  destroyDroplet: vi.fn(),
  listAccountSshKeys: vi.fn(),
  waitForDropletReady: vi.fn(),
  getDropletPublicIp: vi.fn(),
  installOutlineOnServer: vi.fn(),
  from: vi.fn(),
}));

vi.mock("node:fs", () => ({
  existsSync: mocks.existsSync,
}));

vi.mock("../lib/supabase.js", () => ({
  supabase: {
    from: mocks.from,
  },
}));

vi.mock("../services/digitalOceanService.js", () => ({
  createDroplet: mocks.createDroplet,
  destroyDroplet: mocks.destroyDroplet,
  listAccountSshKeys: mocks.listAccountSshKeys,
  waitForDropletReady: mocks.waitForDropletReady,
  getDropletPublicIp: mocks.getDropletPublicIp,
}));

vi.mock("../services/outlineInstallerService.js", () => ({
  installOutlineOnServer: mocks.installOutlineOnServer,
}));

const { startProvisionOutlineServer } = await import(
  "../services/serverProvisionService.js"
);

const ENV_KEYS = [
  "DIGITALOCEAN_TOKEN",
  "DIGITALOCEAN_REGION",
  "DIGITALOCEAN_SIZE",
  "DIGITALOCEAN_IMAGE",
  "DIGITALOCEAN_SSH_KEY_FINGERPRINT",
  "SERVER_BOOTSTRAP_PRIVATE_KEY_PATH",
  "DEFAULT_SERVER_MAX_ACTIVE_KEYS",
];

function setProvisionEnv() {
  process.env.DIGITALOCEAN_TOKEN = "do-token";
  process.env.DIGITALOCEAN_REGION = "sgp1";
  process.env.DIGITALOCEAN_SIZE = "s-1vcpu-1gb";
  process.env.DIGITALOCEAN_IMAGE = "ubuntu-24-04-x64";
  process.env.DIGITALOCEAN_SSH_KEY_FINGERPRINT = "fp-1";
  process.env.SERVER_BOOTSTRAP_PRIVATE_KEY_PATH = "C:/keys/outline";
  process.env.DEFAULT_SERVER_MAX_ACTIVE_KEYS = "50";
}

function makeSelectSortQuery(data = [{ sort_order: 3 }]) {
  const limit = vi.fn().mockResolvedValue({ data, error: null });
  const order = vi.fn().mockReturnValue({ limit });
  const select = vi.fn().mockReturnValue({ order });
  return { select, order, limit };
}

function makeInsertQuery(row = { id: "server-1", name: "outline-test" }) {
  const single = vi.fn().mockResolvedValue({ data: row, error: null });
  const select = vi.fn().mockReturnValue({ single });
  const insert = vi.fn().mockReturnValue({ select });
  return { insert, select, single };
}

function makeUpdateQuery(error = null) {
  const eq = vi.fn().mockResolvedValue({ error });
  const update = vi.fn().mockReturnValue({ eq });
  return { update, eq };
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of ENV_KEYS) delete process.env[key];
  setProvisionEnv();
  mocks.existsSync.mockReturnValue(true);
  mocks.listAccountSshKeys.mockResolvedValue([{ fingerprint: "fp-1" }]);
  mocks.createDroplet.mockResolvedValue({ id: 12345 });
  mocks.destroyDroplet.mockResolvedValue({ success: true });
  mocks.waitForDropletReady.mockReturnValue(new Promise(() => {}));
});

describe("server provisioning safety", () => {
  it("adds the next sort_order when creating the tracking row", async () => {
    const sortQuery = makeSelectSortQuery([{ sort_order: 3 }]);
    const insertQuery = makeInsertQuery({
      id: "server-1",
      name: "outline-test",
      droplet_id: null,
      last_error: null,
    });
    const updateQuery = makeUpdateQuery();
    const backgroundStageQuery = makeUpdateQuery();
    mocks.from
      .mockReturnValueOnce(sortQuery)
      .mockReturnValueOnce(insertQuery)
      .mockReturnValueOnce(updateQuery)
      .mockReturnValueOnce(backgroundStageQuery);

    const server = await startProvisionOutlineServer({
      name: "outline-test",
      serverTier: "trial",
    });

    expect(insertQuery.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        name: "outline-test",
        droplet_id: null,
        server_tier: "trial",
        sort_order: 4,
        status: "provisioning",
      }),
    ]);
    expect(updateQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        droplet_id: 12345,
      })
    );
    expect(server).toMatchObject({ id: "server-1", droplet_id: 12345 });
  });

  it("stops before inserting or creating a droplet when the private key is missing", async () => {
    const sortQuery = makeSelectSortQuery();
    mocks.from.mockReturnValueOnce(sortQuery);
    mocks.existsSync.mockReturnValue(false);

    await expect(startProvisionOutlineServer()).rejects.toThrow(
      "SERVER_BOOTSTRAP_PRIVATE_KEY_PATH does not exist"
    );

    expect(mocks.listAccountSshKeys).not.toHaveBeenCalled();
    expect(mocks.createDroplet).not.toHaveBeenCalled();
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });

  it("cleans up the DigitalOcean droplet if DB tracking update fails", async () => {
    const sortQuery = makeSelectSortQuery();
    const insertQuery = makeInsertQuery({
      id: "server-1",
      name: "outline-test",
      droplet_id: null,
      last_error: null,
    });
    const updateQuery = makeUpdateQuery({ message: "database unavailable" });
    mocks.from
      .mockReturnValueOnce(sortQuery)
      .mockReturnValueOnce(insertQuery)
      .mockReturnValueOnce(updateQuery);

    await expect(startProvisionOutlineServer()).rejects.toThrow(
      "Failed to attach droplet 12345"
    );

    expect(mocks.destroyDroplet).toHaveBeenCalledWith(12345);
    expect(mocks.waitForDropletReady).not.toHaveBeenCalled();
  });
});
