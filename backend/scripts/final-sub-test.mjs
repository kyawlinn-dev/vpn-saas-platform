#!/usr/bin/env node
import "dotenv/config";
import axios from "axios";

const PANEL_URL = "https://panel.novanetmm.com";
const USERNAME = "novanet-admin";
const PASSWORD = "NovaNet3xuiTest2026!";

async function getToken() {
  const { data } = await axios.post(
    `${PANEL_URL}/api/admins/token`,
    new URLSearchParams({ username: USERNAME, password: PASSWORD, grant_type: "password" }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );
  return data.access_token;
}

async function run() {
  const token = await getToken();
  const api = axios.create({
    baseURL: PANEL_URL,
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15000,
  });

  const tests = [
    { name: "SS Trial-SGP",  svc: [4], expect: "168.144.133.227" },
    { name: "SS SG1",        svc: [3], expect: "139.59.126.185" },
    { name: "VLESS Global",  svc: [5], expect: "both" },
  ];

  for (const t of tests) {
    const uname = `finaltest${t.svc[0]}`;
    const { data: user } = await api.post("/api/users", {
      username: uname, service_ids: t.svc, data_limit: 1073741824, expire_strategy: "never",
    });

    const { data: sub } = await axios.get(
      `${PANEL_URL}/sub/${user.username}/${user.key}`,
      { headers: { "User-Agent": "v2ray" } }
    );
    const decoded = Buffer.from(sub, "base64").toString("utf-8");

    console.log(`\n=== ${t.name} (expect: ${t.expect}) ===`);
    for (const line of decoded.split("\n").filter(Boolean)) {
      if (line.startsWith("ss://")) {
        // Decode SS URI
        const hashIdx = line.indexOf("#");
        const uriPart = hashIdx > 0 ? line.substring(5, hashIdx) : line.substring(5);
        const atIdx = uriPart.lastIndexOf("@");
        if (atIdx > 0) {
          const cred = Buffer.from(uriPart.substring(0, atIdx), "base64").toString("utf-8");
          const hostPort = uriPart.substring(atIdx + 1);
          console.log(`  SS → ${hostPort} (${cred.split(":")[0]})`);
        } else {
          const full = Buffer.from(uriPart, "base64").toString("utf-8");
          const ipMatch = full.match(/@([\d.]+:\d+)/);
          console.log(`  SS → ${ipMatch?.[1] || full}`);
        }
        const frag = hashIdx > 0 ? decodeURIComponent(line.substring(hashIdx + 1)) : "";
        console.log(`       label: ${frag}`);
      } else if (line.startsWith("vless://")) {
        const ipMatch = line.match(/@([\d.]+:\d+)/);
        const fragMatch = line.match(/#(.+)$/);
        console.log(`  VLESS → ${ipMatch?.[1] || "?"}`);
        if (fragMatch) console.log(`         label: ${decodeURIComponent(fragMatch[1])}`);
      }
    }

    await api.delete(`/api/users/${uname}`);
  }

  console.log("\n✓ All cleaned up");
}

run().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
