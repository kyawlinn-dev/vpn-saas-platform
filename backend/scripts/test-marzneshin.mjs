#!/usr/bin/env node
/**
 * test-marzneshin.mjs — Smoke-test the marzneshinService against the live panel.
 *
 * Usage:
 *   node scripts/test-marzneshin.mjs
 *
 * Reads panel credentials from env or defaults to the production Marzneshin panel.
 * Tests: auth → system info → create user → get user → update data limit → delete user.
 */

import "dotenv/config";
import { encrypt, decrypt } from "../src/lib/tokenEncryption.js";
import {
  testMarzneshinServer,
  createMarzneshinUser,
  getMarzneshinUser,
  updateMarzneshinUserDataLimit,
  deleteMarzneshinUser,
  listMarzneshinUsers,
  getMarzneshinTransferMetrics,
  clearTokenCache,
} from "../src/services/marzneshinService.js";

// ---------------------------------------------------------------------------
// Config — override with env vars or edit defaults
// ---------------------------------------------------------------------------

const PANEL_URL = process.env.MARZNESHIN_PANEL_URL || "https://panel.novanetmm.com";
const PANEL_PUBLIC_URL = process.env.MARZNESHIN_PANEL_PUBLIC_URL || "https://panel.novanetmm.com";
const PANEL_USERNAME = process.env.MARZNESHIN_PANEL_USERNAME || "novanet-admin";
const PANEL_PASSWORD = process.env.MARZNESHIN_PANEL_PASSWORD || "NovaNet3xuiTest2026!";
const SERVICE_IDS = process.env.MARZNESHIN_SERVICE_IDS
  ? process.env.MARZNESHIN_SERVICE_IDS.split(",").map(Number)
  : [1]; // NovaNet VPN service

// Build a fake server row that looks like a vpn_servers DB row
function buildServerRow() {
  // Encrypt the password just like it would be stored in the DB
  const encryptedPassword = encrypt(PANEL_PASSWORD);
  const decryptedPassword = decrypt(encryptedPassword);

  console.log("✓ Password encryption/decryption roundtrip OK");

  return {
    id: "test-local-00000000",
    name: "Test Marzneshin Server",
    panel_url: PANEL_URL,
    panel_public_url: PANEL_PUBLIC_URL,
    panel_username: PANEL_USERNAME,
    panel_password_encrypted: encryptedPassword,
    marzneshin_service_ids: SERVICE_IDS,
    // marzneshinService expects _panel_password (decrypted by caller)
    _panel_password: decryptedPassword,
  };
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

async function run() {
  console.log("\n=== Marzneshin Service Integration Test ===\n");
  console.log(`Panel:    ${PANEL_URL}`);
  console.log(`Username: ${PANEL_USERNAME}`);
  console.log(`Services: [${SERVICE_IDS.join(", ")}]\n`);

  const server = buildServerRow();

  // 1. Test connectivity
  console.log("--- 1. testMarzneshinServer ---");
  try {
    const sysInfo = await testMarzneshinServer(server);
    console.log("✓ Panel reachable. System info:", JSON.stringify(sysInfo, null, 2));
  } catch (err) {
    console.error("✗ FAILED:", err.message);
    process.exit(1);
  }

  // 2. List existing users
  console.log("\n--- 2. listMarzneshinUsers ---");
  try {
    const users = await listMarzneshinUsers(server);
    console.log(`✓ ${users.length} user(s) on panel`);
    for (const u of users.slice(0, 5)) {
      console.log(`  - ${u.username} (status: ${u.status}, traffic: ${u.used_traffic || 0})`);
    }
    if (users.length > 5) console.log(`  ... and ${users.length - 5} more`);
  } catch (err) {
    console.error("✗ FAILED:", err.message);
  }

  // 3. Create a test user
  console.log("\n--- 3. createMarzneshinUser ---");
  let createdUser;
  try {
    createdUser = await createMarzneshinUser({
      server,
      name: "Test | SmokeTest | ORD-local",
      dataLimitBytes: 1 * 1024 * 1024 * 1024, // 1 GB
    });
    console.log("✓ Created user:", JSON.stringify(createdUser, null, 2));
  } catch (err) {
    console.error("✗ FAILED:", err.message);
    if (err.response) console.error("  Response:", JSON.stringify(err.response));
    process.exit(1);
  }

  const username = createdUser.outline_key_id;

  // 4. Get the user back
  console.log("\n--- 4. getMarzneshinUser ---");
  try {
    const user = await getMarzneshinUser({ server, outlineKeyId: username });
    console.log("✓ Got user:", JSON.stringify({
      username: user?.username,
      status: user?.status,
      data_limit: user?.data_limit,
      used_traffic: user?.used_traffic,
      service_ids: user?.service_ids,
    }, null, 2));
  } catch (err) {
    console.error("✗ FAILED:", err.message);
  }

  // 5. Update data limit
  console.log("\n--- 5. updateMarzneshinUserDataLimit (2 GB) ---");
  try {
    const result = await updateMarzneshinUserDataLimit({
      server,
      outlineKeyId: username,
      dataLimitBytes: 2 * 1024 * 1024 * 1024,
    });
    console.log("✓ Updated:", JSON.stringify(result));
  } catch (err) {
    console.error("✗ FAILED:", err.message);
  }

  // 6. Get transfer metrics
  console.log("\n--- 6. getMarzneshinTransferMetrics ---");
  try {
    const metrics = await getMarzneshinTransferMetrics(server);
    const count = Object.keys(metrics).length;
    console.log(`✓ Got metrics for ${count} user(s)`);
    if (count > 0) {
      const sample = Object.entries(metrics).slice(0, 3);
      for (const [u, bytes] of sample) {
        console.log(`  - ${u}: ${(bytes / 1024 / 1024).toFixed(1)} MB`);
      }
    }
  } catch (err) {
    console.error("✗ FAILED:", err.message);
  }

  // 7. Delete the test user
  console.log("\n--- 7. deleteMarzneshinUser ---");
  try {
    const result = await deleteMarzneshinUser({ server, outlineKeyId: username });
    console.log("✓ Deleted:", JSON.stringify(result));
  } catch (err) {
    console.error("✗ FAILED:", err.message);
  }

  // 8. Verify deletion
  console.log("\n--- 8. Verify user is gone ---");
  try {
    const gone = await getMarzneshinUser({ server, outlineKeyId: username });
    if (gone === null) {
      console.log("✓ User confirmed deleted (404)");
    } else {
      console.log("⚠ User still exists:", gone.username, gone.status);
    }
  } catch (err) {
    console.error("✗ FAILED:", err.message);
  }

  // Cleanup
  clearTokenCache();
  console.log("\n=== All tests complete ===\n");
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
