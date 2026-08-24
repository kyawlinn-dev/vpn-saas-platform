import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_SSH_USER = process.env.SERVER_BOOTSTRAP_SSH_USER || "root";
const DEFAULT_SSH_PORT = Number(process.env.SERVER_BOOTSTRAP_SSH_PORT || 22);
const DEFAULT_SSH_WAIT_TIMEOUT_MS = Number(
  process.env.SERVER_BOOTSTRAP_TIMEOUT_MS || 10 * 60 * 1000
);
const DEFAULT_SSH_POLL_INTERVAL_MS = Number(
  process.env.SERVER_BOOTSTRAP_POLL_INTERVAL_MS || 10 * 1000
);
const DEFAULT_INSTALL_TIMEOUT_MS = Number(
  process.env.OUTLINE_INSTALL_TIMEOUT_MS || 15 * 60 * 1000
);

function getRequiredEnv(name) {
  const value = process.env[name];

  if (!value || !String(value).trim()) {
    throw new Error(`${name} is not set`);
  }

  return String(value).trim();
}

function getSshPrivateKeyPath() {
  return getRequiredEnv("SERVER_BOOTSTRAP_PRIVATE_KEY_PATH");
}

function getKnownHostsPath() {
  return (
    process.env.SERVER_BOOTSTRAP_KNOWN_HOSTS_FILE ||
    path.join(os.homedir(), ".ssh", "known_hosts")
  );
}

function getInstallScriptUrl() {
  return (
    process.env.OUTLINE_INSTALL_SCRIPT_URL ||
    "https://raw.githubusercontent.com/OutlineFoundation/outline-apps/master/server_manager/install_scripts/install_server.sh"
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildSshBaseArgs({ host, command }) {
  const keyPath = getSshPrivateKeyPath();

  return [
    "-i",
    keyPath,
    "-p",
    String(DEFAULT_SSH_PORT),
    "-o",
    "StrictHostKeyChecking=accept-new",
    "-o",
    `UserKnownHostsFile=${getKnownHostsPath()}`,
    "-o",
    "LogLevel=ERROR",
    "-o",
    "ConnectTimeout=10",
    `${DEFAULT_SSH_USER}@${host}`,
    command,
  ];
}

async function runSshCommand(host, command, timeoutMs = 120000) {
  const args = buildSshBaseArgs({ host, command });

  const { stdout, stderr } = await execFileAsync("ssh", args, {
    timeout: timeoutMs,
    maxBuffer: 10 * 1024 * 1024,
  });

  return {
    stdout: String(stdout || ""),
    stderr: String(stderr || ""),
  };
}

async function probeSsh(host) {
  try {
    const result = await runSshCommand(host, "echo ready", 20000);
    return {
      ready: true,
      detail: result.stdout?.trim() || "SSH ready",
    };
  } catch (error) {
    const stderr = String(error?.stderr || "").trim();
    const stdout = String(error?.stdout || "").trim();
    const detail = stderr || stdout || error.message || "SSH not ready";
    return {
      ready: false,
      detail,
    };
  }
}

export async function waitForSshReady(
  host,
  {
    timeoutMs = DEFAULT_SSH_WAIT_TIMEOUT_MS,
    pollIntervalMs = DEFAULT_SSH_POLL_INTERVAL_MS,
  } = {}
) {
  if (!host) {
    throw new Error("Host is required for SSH readiness check");
  }

  const startedAt = Date.now();
  let lastDetail = "SSH not ready yet";

  while (Date.now() - startedAt < timeoutMs) {
    const probe = await probeSsh(host);

    if (probe.ready) {
      return true;
    }

    lastDetail = probe.detail;
    await sleep(pollIntervalMs);
  }

  throw new Error(
    `SSH did not become ready for ${host} within ${Math.floor(
      timeoutMs / 1000
    )} seconds. Last SSH detail: ${lastDetail}`
  );
}

function extractJsonObjects(text) {
  const results = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{") {
      if (depth === 0) {
        start = i;
      }
      depth += 1;
      continue;
    }

    if (ch === "}") {
      depth -= 1;

      if (depth === 0 && start !== -1) {
        results.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }

  return results;
}

function parseOutlineManagerConfig(rawOutput) {
  const jsonCandidates = extractJsonObjects(rawOutput);

  for (const candidate of jsonCandidates.reverse()) {
    try {
      const parsed = JSON.parse(candidate);

      if (parsed?.apiUrl && parsed?.certSha256) {
        return {
          apiUrl: parsed.apiUrl,
          certSha256: parsed.certSha256,
        };
      }
    } catch {
      // ignore invalid fragments
    }
  }

  const apiUrlMatch = rawOutput.match(/"apiUrl"\s*:\s*"([^"]+)"/);
  const certMatch = rawOutput.match(/"certSha256"\s*:\s*"([^"]+)"/);

  if (apiUrlMatch && certMatch) {
    return {
      apiUrl: apiUrlMatch[1],
      certSha256: certMatch[1],
    };
  }

  throw new Error(
    "Could not parse Outline management API config from installer output"
  );
}

// Fresh DO droplets run `apt-get upgrade` via cloud-init, holding the apt lock.
// `cloud-init status --wait` blocks until cloud-init finishes all startup tasks
// before we touch apt. The `|| true` keeps the chain alive if cloud-init isn't
// available. Timeouts are kept as a second line of defence.
function buildDockerPreinstallCommand() {
  return [
    "export DEBIAN_FRONTEND=noninteractive",
    "cloud-init status --wait || true",
    "apt-get update -qq -o Acquire::Lock::Timeout=300 -o DPkg::Lock::Timeout=300",
    "apt-get install -y -o DPkg::Lock::Timeout=300 docker.io",
  ].join(" && ");
}

function buildOutlineInstallCommand() {
  const scriptUrl = getInstallScriptUrl();

  return [
    "bash -lc",
    [
      "export DEBIAN_FRONTEND=noninteractive",
      `curl -fsSL ${JSON.stringify(scriptUrl)} -o /tmp/install_outline.sh`,
      "bash /tmp/install_outline.sh",
    ].join(" && "),
  ].join(" ");
}

// OS-level tuning every VPN server needs, independent of the Outline install
// itself. Discovered 2026-08-23: DigitalOcean-provisioned servers were
// shipping with plain `cubic` congestion control and zero swap — on a
// customers-over-imperfect-mobile-networks workload this produces exactly
// the "sometimes can't connect, video stutters" pattern reported for
// sgp1-3111, while a manually-tuned box (Japan, BBR + swap already set) had
// no such complaints on the same key count. BBR handles lossy/high-latency
// paths far better than cubic; swap is a safety net against the OOM killer
// taking down the Outline process under a memory spike on a 1GB droplet.
// Idempotent — safe to re-run against an already-tuned server.
function buildOsTuningCommand() {
  return [
    "bash -lc",
    [
      "set -e",
      // BBR congestion control
      "modprobe tcp_bbr",
      "echo tcp_bbr > /etc/modules-load.d/tcp_bbr.conf",
      "printf 'net.core.default_qdisc=fq_codel\\nnet.ipv4.tcp_congestion_control=bbr\\n' > /etc/sysctl.d/99-bbr.conf",
      "sysctl -p /etc/sysctl.d/99-bbr.conf",
      // 2.4GB swap, matching the known-good Japan server's configuration
      "if ! swapon --show | grep -q swapfile; then " +
        "fallocate -l 2400M /swapfile && " +
        "chmod 600 /swapfile && " +
        "mkswap /swapfile && " +
        "swapon /swapfile && " +
        "echo '/swapfile swap swap defaults 0 0' >> /etc/fstab; " +
        "fi",
    ].join(" && "),
  ].join(" ");
}

export async function installOutlineOnServer(host) {
  if (!host) {
    throw new Error("Host is required for Outline installation");
  }

  await waitForSshReady(host);

  // Step 1: Install Docker via apt (handles cloud-init apt lock; skips the
  // Outline installer's interactive Docker prompt since Docker is already present)
  try {
    await runSshCommand(host, buildDockerPreinstallCommand(), 10 * 60 * 1000);
  } catch (error) {
    const stderr = String(error?.stderr || "").trim();
    throw new Error(
      `Docker pre-installation failed on ${host}: ${stderr || error.message}`
    );
  }

  // Step 1.5: OS tuning (BBR + swap) — best-effort. A server that fails this
  // step still works, just without the hardening, so it doesn't abort
  // provisioning — log and move on rather than losing an otherwise-good
  // server over a sysctl hiccup.
  try {
    await runSshCommand(host, buildOsTuningCommand(), 2 * 60 * 1000);
  } catch (error) {
    const stderr = String(error?.stderr || "").trim();
    console.error(
      `[outlineInstaller] OS tuning (BBR/swap) failed on ${host}, continuing anyway: ${stderr || error.message}`
    );
  }

  // Step 2: Run Outline installer (Docker already installed, no prompts)
  try {
    const { stdout, stderr } = await runSshCommand(
      host,
      buildOutlineInstallCommand(),
      DEFAULT_INSTALL_TIMEOUT_MS
    );

    const combinedOutput = [stdout, stderr].filter(Boolean).join("\n");
    return parseOutlineManagerConfig(combinedOutput);
  } catch (error) {
    const stdout = error?.stdout ? String(error.stdout) : "";
    const stderr = error?.stderr ? String(error.stderr) : "";
    const combinedOutput = [stdout, stderr].filter(Boolean).join("\n").trim();

    const usefulTail = combinedOutput
      ? combinedOutput.split("\n").slice(-60).join("\n")
      : "No installer output captured";

    throw new Error(
      `Outline installation failed on ${host}. ${error.message}. Installer output tail:\n${usefulTail}`
    );
  }
}
