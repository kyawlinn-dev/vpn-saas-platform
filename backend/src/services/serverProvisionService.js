import { supabase } from "../lib/supabase.js";
import {
  createDroplet,
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

async function insertProvisioningRow({ dropletName, dropletId, region }) {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("vpn_servers")
    .insert([
      {
        name: dropletName,
        provider: "digitalocean",
        region,
        droplet_id: dropletId,
        status: "provisioning",
        max_active_keys: getDefaultMaxActiveKeys(),
        current_active_keys: 0,
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
  };
}

export async function startProvisionOutlineServer({
  region: regionOverride,
  name: nameOverride,
  size: sizeOverride,
} = {}) {
  const { region, size, image, sshKeyFingerprint } = getProvisioningContext({
    regionOverride,
    sizeOverride,
  });

  const dropletName = nameOverride?.trim() || buildDropletName();

  const droplet = await createDroplet({
    name: dropletName,
    region,
    size,
    image,
    sshKeyFingerprint,
  });

  const serverRow = await insertProvisioningRow({
    dropletName,
    dropletId: droplet.id,
    region,
  });

  void continueProvisionInBackground({
    serverId: serverRow.id,
    dropletId: droplet.id,
  });

  return serverRow;
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