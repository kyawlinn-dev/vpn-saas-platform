import axios from "axios";

const DIGITALOCEAN_API_BASE_URL = "https://api.digitalocean.com/v2";
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_POLL_INTERVAL_MS = 15000;
const DEFAULT_MAX_ATTEMPTS = 40;

function getRequiredEnv(name) {
  const value = process.env[name];

  if (!value || !String(value).trim()) {
    throw new Error(`${name} is not set`);
  }

  return String(value).trim();
}

function getClient() {
  const token = getRequiredEnv("DIGITALOCEAN_TOKEN");

  return axios.create({
    baseURL: DIGITALOCEAN_API_BASE_URL,
    timeout: DEFAULT_TIMEOUT_MS,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeDroplet(droplet) {
  return {
    ...droplet,
    id: droplet?.id,
    name: droplet?.name || null,
    status: droplet?.status || null,
    networks: droplet?.networks || { v4: [], v6: [] },
    created_at: droplet?.created_at || null,
    features: Array.isArray(droplet?.features) ? droplet.features : [],
    tags: Array.isArray(droplet?.tags) ? droplet.tags : [],
  };
}

export function getDropletPublicIp(droplet) {
  const normalized = normalizeDroplet(droplet);

  return (
    normalized.networks?.v4?.find((network) => network.type === "public")
      ?.ip_address || null
  );
}

export function getDropletPrivateIp(droplet) {
  const normalized = normalizeDroplet(droplet);

  return (
    normalized.networks?.v4?.find((network) => network.type === "private")
      ?.ip_address || null
  );
}

export async function createDroplet({
  name,
  region,
  size,
  image,
  sshKeyFingerprint,
}) {
  if (!name) {
    throw new Error("Droplet name is required");
  }

  if (!region) {
    throw new Error("Droplet region is required");
  }

  if (!size) {
    throw new Error("Droplet size is required");
  }

  if (!image) {
    throw new Error("Droplet image is required");
  }

  if (!sshKeyFingerprint) {
    throw new Error("Droplet SSH key fingerprint is required");
  }

  const client = getClient();

  const payload = {
    name,
    region,
    size,
    image,
    ssh_keys: [sshKeyFingerprint],
    backups: false,
    ipv6: false,
    monitoring: true,
    tags: ["vpn-reseller", "outline-server"],
  };

  let res;
  try {
    res = await client.post("/droplets", payload);
  } catch (err) {
    const status = err?.response?.status;
    const doMessage = err?.response?.data?.message || err?.response?.data?.id || err?.message;
    throw new Error(`DigitalOcean droplet creation failed (${status}): ${doMessage}`);
  }

  if (!res?.data?.droplet) {
    throw new Error("DigitalOcean API did not return a droplet object");
  }

  return normalizeDroplet(res.data.droplet);
}

export async function getDroplet(dropletId) {
  if (!dropletId) {
    throw new Error("Droplet ID is required");
  }

  const client = getClient();
  const res = await client.get(`/droplets/${dropletId}`);

  if (!res?.data?.droplet) {
    throw new Error(`DigitalOcean API did not return droplet ${dropletId}`);
  }

  return normalizeDroplet(res.data.droplet);
}

export async function listAccountSshKeys() {
  const client = getClient();
  const res = await client.get("/account/keys", {
    params: { per_page: 200 },
  });

  return Array.isArray(res?.data?.ssh_keys) ? res.data.ssh_keys : [];
}

export async function waitForDropletReady(
  dropletId,
  {
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  } = {}
) {
  if (!dropletId) {
    throw new Error("Droplet ID is required");
  }

  let lastDroplet = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const droplet = await getDroplet(dropletId);
    lastDroplet = droplet;

    const publicIp = getDropletPublicIp(droplet);

    if (droplet.status === "active" && publicIp) {
      return droplet;
    }

    await sleep(pollIntervalMs);
  }

  throw new Error(
    `Droplet ${dropletId} did not become ready in time. Last known status: ${
      lastDroplet?.status || "unknown"
    }, public IP: ${getDropletPublicIp(lastDroplet) || "not assigned"}`
  );
}

export async function destroyDroplet(dropletId) {
  if (!dropletId) {
    throw new Error("Droplet ID is required");
  }

  const client = getClient();
  await client.delete(`/droplets/${dropletId}`);

  return { success: true };
}
