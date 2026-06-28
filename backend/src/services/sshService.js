import { Client } from "ssh2";
import fs from "fs";

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
      });
  });
}