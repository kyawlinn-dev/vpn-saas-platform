import { supabase } from "../lib/supabase.js";
import { existsSync } from "node:fs";
import {
  createDroplet,
  destroyDroplet,
  listAccountSshKeys,
  waitForDropletReady,
  getDropletPublicIp,
} from "./digitalOceanService.js";
import { installOutlineOnServer } from "./outlineInstallerService.js";

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getDefaultMaxActiveKeys() {
  return toNumber(process.env.DEFAULT_SERVER_MAX_ACTIVE_KEYS, 5);
}

function getProvisionTimeoutMinutes() {
  return toNumber(process.env.SERVER_PROVISION_TIMEOUT_MINUTES, 25);
}

function getRequiredEnv(name) {
  const value = process.env[name];

  if (!value || !String(value).trim()) {
    throw new Error(`${name} is not set`);
  }

  return String(value).trim();
}

function normalizeServerTier(serverTier) {
  const value = String(serverTier || "").trim().toLowerCase();
  return value === "trial" ? "trial" : "premium";
}

function buildDropletName() {
  return `outline-${Date.now()}`;
}

async function updateServer(serverId, patch) {
  const { error } = await supabase
    .from("vpn_servers")
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq("id", serverId);

  if (error) {
    throw new Error(`Failed to update vpn_servers: ${error.message}`);
  }
}

async function insertProvisioningRow({
  dropletName,
  dropletId,
  region,
  serverTier,
  sortOrder,
}) {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("vpn_servers")
    .insert([
      {
        name: dropletName,
        provider: "digitalocean",
        region,
        server_tier: normalizeServerTier(serverTier),
        droplet_id: dropletId,
        status: "provisioning",
        max_active_keys: getDefaultMaxActiveKeys(),
        current_active_keys: 0,
        sort_order: sortOrder,
        is_default: false,
        host_ip: null,
        outline_api_url: null,
        outline_cert_sha256: null,
        last_error: null,
        created_at: now,
        updated_at: now,
      },
    ])
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Failed to create vpn_servers row");
  }

  return data;
}

async function markProvisionStage(serverId, stageMessage, patch = {}) {
  await updateServer(serverId, {
    last_error: stageMessage,
    ...patch,
  });
}

function clearStageMessageForSuccess() {
  return null;
}

function getProvisioningContext({ regionOverride, sizeOverride } = {}) {
  return {
    region: regionOverride || getRequiredEnv("DIGITALOCEAN_REGION"),
    size: sizeOverride || getRequiredEnv("DIGITALOCEAN_SIZE"),
    image: getRequiredEnv("DIGITALOCEAN_IMAGE"),
    sshKeyFingerprint: getRequiredEnv("DIGITALOCEAN_SSH_KEY_FINGERPRINT"),
    sshPrivateKeyPath: getRequiredEnv("SERVER_BOOTSTRAP_PRIVATE_KEY_PATH"),
  };
}

async function getNextSortOrder() {
  const { data, error } = await supabase
    .from("vpn_servers")
    .select("sort_order")
    .order("sort_order", { ascending: false, nullsFirst: false })
    .limit(1);

  if (error) {
    throw new Error(`Failed to calculate next server sort order: ${error.message}`);
  }

  const highest = Number(data?.[0]?.sort_order);
  return Number.isFinite(highest) ? highest + 1 : 0;
}

async function assertProvisionPreflight({ sshKeyFingerprint, sshPrivateKeyPath }) {
  if (!existsSync(sshPrivateKeyPath)) {
    throw new Error(
      `SERVER_BOOTSTRAP_PRIVATE_KEY_PATH does not exist: ${sshPrivateKeyPath}`
    );
  }

  let sshKeys;
  try {
    sshKeys = await listAccountSshKeys();
  } catch (error) {
    throw new Error(`DigitalOcean SSH key preflight failed: ${error.message}`);
  }

  const hasConfiguredKey = sshKeys.some(
    (key) => key?.fingerprint === sshKeyFingerprint
  );

  if (!hasConfiguredKey) {
    throw new Error(
      "DIGITALOCEAN_SSH_KEY_FINGERPRINT was not found in the DigitalOcean account"
    );
  }
}

export async function startProvisionOutlineServer({
  region: regionOverride,
  name: nameOverride,
  size: sizeOverride,
  serverTier,
} = {}) {
  const { region, size, image, sshKeyFingerprint, sshPrivateKeyPath } =
    getProvisioningContext({
      regionOverride,
      sizeOverride,
    });

  const dropletName = nameOverride?.trim() || buildDropletName();
  const sortOrder = await getNextSortOrder();

  await assertProvisionPreflight({ sshKeyFingerprint, sshPrivateKeyPath });

  const serverRow = await insertProvisioningRow({
    dropletName,
    dropletId: null,
    region,
    serverTier,
    sortOrder,
  });

  let droplet;
  try {
    droplet = await createDroplet({
      name: dropletName,
      region,
      size,
      image,
      sshKeyFingerprint,
    });
  } catch (error) {
    try {
      await updateServer(serverRow.id, {
        status: "failed",
        last_error: error.message,
      });
    } catch (updateError) {
      console.error(
        `[provision:${serverRow.id}] Failed to record DigitalOcean creation error:`,
        updateError.message
      );
    }

    throw error;
  }

  const dropletStageMessage =
    "DigitalOcean droplet created: waiting for network readiness";

  try {
    await updateServer(serverRow.id, {
      droplet_id: droplet.id,
      last_error: dropletStageMessage,
    });
  } catch (error) {
    try {
      await destroyDroplet(droplet.id);
    } catch (destroyError) {
      console.error(
        `[provision:${serverRow.id}] Failed to destroy droplet ${droplet.id} after DB tracking update failed:`,
        destroyError.message
      );
    }

    throw new Error(
      `Failed to attach droplet ${droplet.id} to vpn_servers row: ${error.message}`
    );
  }

  const trackedServerRow = {
    ...serverRow,
    droplet_id: droplet.id,
    last_error: dropletStageMessage,
  };

  void continueProvisionInBackground({
    serverId: trackedServerRow.id,
    dropletId: droplet.id,
  });

  return trackedServerRow;
}

async function continueProvisionInBackground({ serverId, dropletId }) {
  const startedAt = Date.now();
  const timeoutMs = getProvisionTimeoutMinutes() * 60 * 1000;

  try {
    console.log(`[provision:${serverId}] Waiting for droplet ${dropletId} to become active...`);
    await markProvisionStage(
      serverId,
      "Provisioning started: waiting for droplet network readiness"
    );

    const droplet = await waitForDropletReady(dropletId);
    const ip = getDropletPublicIp(droplet);

    if (!ip) {
      throw new Error("Droplet became active but no public IPv4 address was found");
    }

    console.log(`[provision:${serverId}] Droplet active at ${ip}, waiting for SSH...`);
    await markProvisionStage(serverId, "Droplet is active: waiting for SSH", {
      host_ip: ip,
    });

    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Provisioning timed out before Outline installation started");
    }

    console.log(`[provision:${serverId}] SSH ready, starting Outline installation on ${ip}...`);
    const outlineConfig = await installOutlineOnServer(ip);

    if (!outlineConfig?.apiUrl || !outlineConfig?.certSha256) {
      throw new Error(
        "Outline installer finished but did not return a valid management config"
      );
    }

    await updateServer(serverId, {
      host_ip: ip,
      outline_api_url: outlineConfig.apiUrl,
      outline_cert_sha256: outlineConfig.certSha256,
      status: "active",
      last_error: clearStageMessageForSuccess(),
    });

    console.log(`Provisioned server ${serverId} successfully`);
  } catch (error) {
    console.error(`Provisioning failed for server ${serverId}:`, error.message);

    try {
      await updateServer(serverId, {
        status: "failed",
        last_error: error.message,
      });
    } catch (updateError) {
      console.error(
        `Failed to mark server ${serverId} as failed:`,
        updateError.message
      );
    }
  }
}
