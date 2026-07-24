import { buildOrderQuotaSnapshot } from "./subscriptionProvisionService.js";

function toNonNegativeInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.floor(number));
}

export function liveUsageForKey(key, metricsByKeyId = {}) {
  const outlineKeyId = key?.outline_key_id;
  return toNonNegativeInteger(outlineKeyId ? metricsByKeyId[String(outlineKeyId)] : 0);
}

export function keyUsageForMigration(key, metricsByKeyId = {}) {
  return Math.max(toNonNegativeInteger(key?.used_bytes), liveUsageForKey(key, metricsByKeyId));
}

export function keysWithMigrationUsage(keys = [], metricsByKeyId = {}) {
  return (Array.isArray(keys) ? keys : []).map((key) => ({
    ...key,
    used_bytes: keyUsageForMigration(key, metricsByKeyId),
  }));
}

export function replacementDataLimitBytesForMigration(keys = [], metricsByKeyId = {}) {
  const snapshot = buildOrderQuotaSnapshot(keysWithMigrationUsage(keys, metricsByKeyId));

  if (snapshot.isUnlimited) return null;
  return Math.max(1, toNonNegativeInteger(snapshot.remainingBytes));
}
