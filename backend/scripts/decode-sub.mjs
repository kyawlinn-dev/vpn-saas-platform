#!/usr/bin/env node
// Decode a base64 subscription string
const b64 = process.argv[2];
if (!b64) { console.error("Pass base64 string as arg"); process.exit(1); }
const decoded = Buffer.from(b64, "base64").toString("utf-8");
for (const line of decoded.split("\n").filter(Boolean)) {
  console.log(line);
  // Parse ss:// URIs
  if (line.startsWith("ss://")) {
    const hashIdx = line.indexOf("#");
    const uriPart = hashIdx > 0 ? line.substring(5, hashIdx) : line.substring(5);
    try {
      const atIdx = uriPart.lastIndexOf("@");
      if (atIdx > 0) {
        const methodPass = Buffer.from(uriPart.substring(0, atIdx), "base64").toString("utf-8");
        const hostPort = uriPart.substring(atIdx + 1);
        console.log(`  → method:pass = ${methodPass}`);
        console.log(`  → host:port = ${hostPort}`);
      } else {
        const full = Buffer.from(uriPart, "base64").toString("utf-8");
        console.log(`  → decoded = ${full}`);
      }
    } catch {}
  }
}
