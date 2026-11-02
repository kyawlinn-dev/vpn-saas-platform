import { createHash } from "node:crypto";
import { accessDateOnly } from "../utils/businessTime.js";

const fail = code => { throw Object.assign(new Error(code), { code }); };
const positiveId = id => Number.isSafeInteger(id) && id > 0;
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const hash = value => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
const sameIds = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length &&
  new Set(a).size === a.length && [...a].sort().every((id, i) => id === [...b].sort()[i]);
const binding = ["environment", "databaseIdentity", "poolId", "panelIdentity"];
const owned = (resource, context) => resource?.ownership?.verified === true &&
  binding.every(key => resource.ownership[key] === context[key]);
const contextValid = context => ["development", "production"].includes(context?.environment) &&
  binding.every(key => typeof context[key] === "string" && context[key].trim()) && positiveId(context.vlessServiceId);

function requireMockMutationAdapters(adapters) {
  // Live adoption is deliberately unavailable until fenced, ownership-guarded adapters exist.
  if (adapters?.executionMode !== "mock") fail("LIVE_ADOPTION_UNAVAILABLE");
  for (const method of ["withMutationGuard", "saveCheckpoint", "readCheckpoint"]) {
    if (typeof adapters[method] !== "function") fail("MUTATION_ADAPTERS_REQUIRED");
  }
}

export async function inspectAccessAdoption({ context, manifest, adapters }) {
  const blockers = [];
  const block = (code, kind, id) => blockers.push({ code, kind, id });
  const manifestHash = hash(manifest ?? null);
  if (!contextValid(context) || manifest?.version !== 1 ||
      ![...binding, "vlessServiceId"].every(key => manifest[key] === context[key]) ||
      !["nodes", "services", "users"].every(key => Array.isArray(manifest[key])) ||
      !manifest.protected || !["nodeIds", "serviceIds", "providerResourceIds", "userIds"].every(key => Array.isArray(manifest.protected[key]))) {
    return { manifestHash, blockers: [{ code: "MANIFEST_SCOPE_INVALID" }], ready: false };
  }
  const read = async (method, id, kind) => {
    if (typeof adapters?.[method] !== "function") { block("READ_ADAPTER_UNAVAILABLE", kind, id); return null; }
    try { return await adapters[method](id); }
    catch { block("RESOURCE_READ_FAILED", kind, id); return null; }
  };
  const runtime = await read("readRuntimeIdentity", undefined, "runtime");
  if (!runtime || !binding.every(key => runtime[key] === context[key])) block("RUNTIME_IDENTITY_MISMATCH", "runtime");
  const unique = (rows, key, kind) => {
    if (new Set(rows.map(row => row[key])).size !== rows.length) block("DUPLICATE_RESOURCE", kind);
  };
  unique(manifest.nodes, "nodeId", "node"); unique(manifest.nodes, "serverId", "server");
  unique(manifest.nodes, "providerResourceId", "provider"); unique(manifest.services, "id", "service"); unique(manifest.users, "id", "user");
  const check = (resource, id, kind) => {
    if (!resource || resource.id !== id || !owned(resource, context)) block("RESOURCE_SCOPE_MISMATCH", kind, id);
    if (resource?.protected === true) block("PROTECTED_RESOURCE", kind, id);
  };
  for (const node of manifest.nodes) {
    const protocols = node.supportedProtocols;
    const dual = sameIds(protocols, ["shadowsocks", "vless"]);
    if ((!dual && !sameIds(protocols, ["vless"])) || !positiveId(node.nodeId) ||
        !Array.isArray(node.ssServiceIds) || (dual ? node.ssServiceIds.length !== 1 || !positiveId(node.ssServiceIds[0]) : node.ssServiceIds.length !== 0)) {
      block("CAPABILITIES_INVALID", "node", node.nodeId);
    }
    if (manifest.protected.nodeIds.includes(node.nodeId) || manifest.protected.providerResourceIds.includes(node.providerResourceId)) block("PROTECTED_RESOURCE", "node", node.nodeId);
    const server = await read("readServer", node.serverId, "server");
    check(server, node.serverId, "server");
    if (server?.panel_node_id !== node.nodeId || server?.provider_resource_id !== node.providerResourceId) block("SERVER_BINDING_MISMATCH", "server", node.serverId);
    const actualNode = await read("readNode", node.nodeId, "node");
    check(actualNode, node.nodeId, "node");
    if (!sameIds(actualNode?.supportedProtocols, node.supportedProtocols)) block("NODE_CAPABILITIES_CHANGED", "node", node.nodeId);
    check(await read("readProviderResource", node.providerResourceId, "provider"), node.providerResourceId, "provider");
    for (const id of node.ssServiceIds || []) {
      const service = manifest.services.find(s => s.id === id);
      if (!service || service.protocol !== "shadowsocks" || !sameIds(service.nodeIds, [node.nodeId])) block("SS_SERVICE_BINDING_INVALID", "node", node.nodeId);
    }
  }
  const publicService = manifest.services.find(s => s.id === context.vlessServiceId);
  if (!publicService || publicService.protocol !== "vless" || !sameIds(publicService.nodeIds, manifest.nodes.map(n => n.nodeId))) block("PUBLIC_POOL_MEMBERSHIP_INVALID", "pool", context.poolId);
  for (const service of manifest.services) {
    if (!positiveId(service.id) || manifest.protected.serviceIds.includes(service.id)) block("PROTECTED_RESOURCE", "service", service.id);
    if (!Array.isArray(service.nodeIds) || !service.nodeIds.length || service.nodeIds.some(id => !manifest.nodes.some(n => n.nodeId === id))) block("SERVICE_HAS_FOREIGN_NODES", "service", service.id);
    const actual = await read("readService", service.id, "service");
    check(actual, service.id, "service");
    if (actual?.protocol !== service.protocol || !sameIds(actual?.nodeIds, service.nodeIds)) block("SERVICE_MEMBERSHIP_CHANGED", "service", service.id);
  }
  for (const item of manifest.users) {
    if (manifest.protected.userIds.includes(item.id)) block("PROTECTED_RESOURCE", "user", item.id);
    check(await read("readUser", item.id, "user"), item.id, "user");
    if (!Array.isArray(item.legacyServiceIds) || !item.legacyServiceIds.length || item.legacyServiceIds.some(id => !positiveId(id) || manifest.protected.serviceIds.includes(id))) block("LEGACY_SERVICE_SCOPE_INVALID", "user", item.id);
    for (const id of item.legacyServiceIds || []) {
      const service = await read("readService", id, "legacy-service");
      check(service, id, "legacy-service");
      if (service?.protocol !== "vless" || !Array.isArray(service.nodeIds) || !service.nodeIds.length || service.nodeIds.some(nodeId => !manifest.nodes.some(n => n.nodeId === nodeId))) block("LEGACY_SERVICE_SCOPE_INVALID", "user", item.id);
    }
  }
  return { manifestHash, blockers, ready: blockers.length === 0 };
}

async function approve(input) {
  requireMockMutationAdapters(input.adapters);
  const report = await inspectAccessAdoption(input);
  if (report.manifestHash !== input.approvedManifestHash) fail("MANIFEST_APPROVAL_MISMATCH");
  if (!report.ready) fail("ADOPTION_BLOCKED");
  return report;
}

export async function applyAccessAdoption(input) {
  const report = await approve(input);
  const { context, manifest, adapters } = input;
  if (typeof adapters.writeAdoptionMetadata !== "function") fail("MUTATION_ADAPTERS_REQUIRED");
  const adopted = [];
  for (const node of manifest.nodes) {
    await adapters.withMutationGuard({ context, serverId: node.serverId, manifestHash: report.manifestHash }, async () => {
      // Reinspect inside the guard; an earlier dry run is not mutation authority.
      if (!(await inspectAccessAdoption(input)).ready) fail("ADOPTION_STATE_CHANGED");
      const expected = await adapters.readServer(node.serverId);
      if (!owned(expected, context)) fail("RESOURCE_SCOPE_MISMATCH");
      await adapters.writeAdoptionMetadata({ context, expected, patch: {
        environment: context.environment, access_pool_id: context.poolId, panel_node_id: node.nodeId,
        provider_resource_id: node.providerResourceId, supported_protocols: node.supportedProtocols,
        marzneshin_service_ids: node.ssServiceIds, lifecycle_protected: true,
        ownership_provenance: { method: "adopted", environment: context.environment, access_pool_id: context.poolId,
          panel_identity: context.panelIdentity, panel_node_id: node.nodeId, provider_resource_id: node.providerResourceId, ss_service_ids: node.ssServiceIds,
          verified_at: new Date().toISOString(), manifest_hash: report.manifestHash },
      } });
      await adapters.saveCheckpoint({ context, manifestHash: report.manifestHash, serverId: node.serverId, phase: "adopted" });
      adopted.push(node.serverId);
    });
  }
  return { ...report, adopted };
}

export async function migrateActiveTrialServices(input) {
  const report = await approve(input);
  const { context, manifest, poolId, adapters, now = new Date() } = input;
  if (poolId !== context.poolId) fail("RESOURCE_SCOPE_MISMATCH");
  for (const method of ["readOrder", "readUser", "updateUserServices"]) if (typeof adapters[method] !== "function") fail("MUTATION_ADAPTERS_REQUIRED");
  const migrated = [], skipped = [];
  for (const item of manifest.users) {
    await adapters.withMutationGuard({ context, orderId: item.orderId, userId: item.id, manifestHash: report.manifestHash }, async () => {
      const order = await adapters.readOrder(item.orderId);
      if (!owned(order, context) || order.id !== item.orderId || order.panel_user_id !== item.id) fail("RESOURCE_SCOPE_MISMATCH");
      if (order.status !== "active" || order.order_type !== "trial" || order.protocol !== "vless" || !order.expiry_date || order.expiry_date < accessDateOnly(now)) {
        skipped.push(item.id); return;
      }
      const before = await adapters.readUser(item.id);
      if (!owned(before, context)) fail("RESOURCE_SCOPE_MISMATCH");
      const checkpoint = await adapters.readCheckpoint({ context, manifestHash: report.manifestHash, userId: item.id });
      if (checkpoint && (checkpoint.manifestHash !== report.manifestHash || checkpoint.userId !== item.id)) fail("CHECKPOINT_SCOPE_MISMATCH");
      const original = checkpoint?.snapshot || before;
      const desired = [context.vlessServiceId];
      if (!sameIds(before.service_ids, desired)) {
        if (!sameIds(before.service_ids, item.legacyServiceIds)) fail("USER_SERVICES_CHANGED");
        // Snapshot is private adapter storage, never returned in a status DTO.
        await adapters.saveCheckpoint({ context, manifestHash: report.manifestHash, userId: item.id, phase: "prepared", snapshot: before });
        if (!(await inspectAccessAdoption(input)).ready) fail("ADOPTION_STATE_CHANGED");
        await adapters.updateUserServices({ context, userId: item.id, expectedServiceIds: before.service_ids, serviceIds: desired });
      }
      const after = await adapters.readUser(item.id);
      if (!owned(after, context) || !sameIds(after.service_ids, desired) ||
          ["key", "data_limit", "expire", "enabled"].some(key => original[key] !== after[key]) ||
          !Number.isFinite(after.used_traffic) || after.used_traffic < original.used_traffic) fail("USER_READBACK_FAILED");
      await adapters.saveCheckpoint({ context, manifestHash: report.manifestHash, userId: item.id, phase: "verified" });
      migrated.push(item.id);
    });
  }
  return { manifestHash: report.manifestHash, migrated, skipped };
}
