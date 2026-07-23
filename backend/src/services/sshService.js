import { Client } from "ssh2";
import fs from "fs";
import os from "os";
import path from "path";

function getKnownHostsStorePath() {
  return (
    process.env.SSH_SERVICE_KNOWN_HOSTS_FILE ||
    path.join(os.homedir(), ".ssh", "novanet-ssh-service-known-hosts.json")
  );
}

function loadKnownHosts() {
  try {
    return JSON.parse(fs.readFileSync(getKnownHostsStorePath(), "utf8"));
  } catch {
    return {};
  }
}

function trustHostFingerprint(host, fingerprint) {
  const storePath = getKnownHostsStorePath();
  const known = loadKnownHosts();
  known[host] = fingerprint;
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify(known, null, 2));
}

// Trust On First Use: the first connection to a host pins its key fingerprint;
// later connections must match or are rejected, catching a MITM'd host key
// after the initial trust is established.
function createHostVerifier(host) {
  const trusted = loadKnownHosts()[host];

  return (fingerprint) => {
    if (!trusted) {
      trustHostFingerprint(host, fingerprint);
      return true;
    }
    return fingerprint === trusted;
  };
}

export function runRemoteCommand({ host, username, privateKeyPath, command }) {
  return new Promise((resolve, reject) => {
    const conn = new Client();

    let stdout = "";
    let stderr = "";

    conn
      .on("ready", () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            conn.end();
            reject(err);
            return;
          }

          stream
            .on("close", (code) => {
              conn.end();

              if (code !== 0) {
                reject(
                  new Error(stderr || `Remote command failed with code ${code}`)
                );
                return;
              }

              resolve(stdout);
            })
            .on("data", (data) => {
              stdout += data.toString();
            });

          stream.stderr.on("data", (data) => {
            stderr += data.toString();
          });
        });
      })
      .on("error", reject)
      .connect({
        host,
        username,
        privateKey: fs.readFileSync(privateKeyPath),
        readyTimeout: Number(process.env.SERVER_BOOTSTRAP_TIMEOUT_MS || 60000),
        hostHash: "sha256",
        hostVerifier: createHostVerifier(host),
      });
  });
}
