import { execFile } from "node:child_process";
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
    "StrictHostKeyChecking=no",
    "-o",
    "UserKnownHostsFile=/dev/null",
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

function buildInstallCommand() {
  const scriptUrl = getInstallScriptUrl();

  return [
    "bash -lc",
    [
      "set -euo pipefail",
      "export DEBIAN_FRONTEND=noninteractive",
      `curl -fsSL ${JSON.stringify(scriptUrl)} -o /tmp/install_outline.sh`,
      "bash /tmp/install_outline.sh",
    ].join(" && "),
  ].join(" ");
}

export async function installOutlineOnServer(host) {
  if (!host) {
    throw new Error("Host is required for Outline installation");
  }

  await waitForSshReady(host);

  const installCommand = buildInstallCommand();

  try {
    const { stdout, stderr } = await runSshCommand(
      host,
      installCommand,
      DEFAULT_INSTALL_TIMEOUT_MS
    );

    const combinedOutput = [stdout, stderr].filter(Boolean).join("\n");
    return parseOutlineManagerConfig(combinedOutput);
  } catch (error) {
    const stdout = error?.stdout ? String(error.stdout) : "";
    const stderr = error?.stderr ? String(error.stderr) : "";
    const combinedOutput = [stdout, stderr].filter(Boolean).join("\n").trim();

    const usefulTail = combinedOutput
      ? combinedOutput.split("\n").slice(-30).join("\n")
      : "No installer output captured";

    throw new Error(
      `Outline installation failed on ${host}. ${error.message}. Installer output tail:\n${usefulTail}`
    );
  }
}