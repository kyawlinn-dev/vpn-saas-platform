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
    { name: "SS Trial-SGP",   svc: [4], expectIP: "168.144.133.227" },
    { name: "SS SG1",         svc: [3], expectIP: "139.59.126.185" },
    { name: "SS SGP1-3111",   svc: [6], expectIP: "165.22.110.55" },
    { name: "SS Osaka",       svc: [7], expectIP: "64.176.61.174" },
    { name: "VLESS Global",   svc: [5], expectIP: "all 4 nodes" },
  ];

  let allPassed = true;

  for (const t of tests) {
    const uname = `fulltest${t.svc[0]}`;
    const { data: user } = await api.post("/api/users", {
      username: uname, service_ids: t.svc, data_limit: 1073741824, expire_strategy: "never",
    });

    const { data: sub } = await axios.get(
      `${PANEL_URL}/sub/${user.username}/${user.key}`,
      { headers: { "User-Agent": "v2ray" } }
    );
    const decoded = Buffer.from(sub, "base64").toString("utf-8");

    console.log(`\n${t.name} (expect: ${t.expectIP})`);
    for (const line of decoded.split("\n").filter(Boolean)) {
      if (line.startsWith("ss://")) {
        const hashIdx = line.indexOf("#");
        const uriPart = hashIdx > 0 ? line.substring(5, hashIdx) : line.substring(5);
        const atIdx = uriPart.lastIndexOf("@");
        let ip = "?";
        if (atIdx > 0) {
          ip = uriPart.substring(atIdx + 1);
        } else {
          const full = Buffer.from(uriPart, "base64").toString("utf-8");
          const m = full.match(/@([\d.]+:\d+)/);
          ip = m?.[1] || full;
        }
        const ok = ip.includes(t.expectIP) ? "✅" : "❌";
        if (!ip.includes(t.expectIP) && t.svc[0] !== 5) allPassed = false;
        const label = hashIdx > 0 ? decodeURIComponent(line.substring(hashIdx + 1)) : "";
        console.log(`  ${ok} SS → ${ip}  ${label}`);
      } else if (line.startsWith("vless://")) {
        const m = line.match(/@([\d.]+:\d+)/);
        const frag = line.match(/#(.+)$/);
        const label = frag ? decodeURIComponent(frag[1]) : "";
        console.log(`  ✅ VLESS → ${m?.[1] || "?"}  ${label}`);
      }
    }

    await api.delete(`/api/users/${uname}`);
  }

  console.log(`\n${allPassed ? "✅ ALL TESTS PASSED" : "❌ SOME TESTS FAILED"}`);
}

run().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
