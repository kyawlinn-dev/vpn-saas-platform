import { assertResourceOwnership, assertDestinationOwnership } from "./ownership.js";
import { infrastructureError, payloadHash } from "./repository.js";
import { validCapabilities } from "./nodeConfigurator.js";

const fail = code => { throw infrastructureError(code); };
export function assertCompatibleDestination({ source, destination, inventory }) {
  if (!destination || !["environment", "poolId", "panelIdentity", "databaseIdentity"].every(key => source[key] === destination[key]) || source.id === destination.id) fail("DESTINATION_SCOPE_MISMATCH");
  if (!validCapabilities(source.supported_protocols) || !validCapabilities(destination.supported_protocols) ||
      source.supported_protocols.some(protocol => !destination.supported_protocols.includes(protocol))) fail("DESTINATION_PROTOCOL_MISMATCH");
  const health = Array.isArray(destination.server_health_status) ? destination.server_health_status[0] : destination.server_health_status;
  if (destination.status !== "active" || destination.is_active !== true || health?.outline_api_status !== "healthy") fail("DESTINATION_NOT_READY");
  const incoming = (inventory.movable || []).filter(item => item.kind === "access").length;
  if (!Number.isSafeInteger(destination.current_active_keys) || destination.current_active_keys < 0 ||
      !Number.isSafeInteger(destination.max_active_keys) || destination.max_active_keys <= 0 ||
      destination.current_active_keys + incoming > destination.max_active_keys) fail("DESTINATION_CAPACITY_INSUFFICIENT");
  return true;
}

export async function inventoryDependencies({ context, operation, lease, source, destination, panel, repository, provider }) {
  const authority = operation || lease;
  const blockers = [], warnings = [], movable = [];
  const block = (code, id) => blockers.push({ code, ...(id == null ? {} : { id }) });
  const own = async (resource, code = "RESOURCE_SCOPE_MISMATCH") => {
    try { await assertResourceOwnership({ context, resource, operation: authority }); return true; }
    catch (error) { block(error.code === "PROTECTED_RESOURCE" ? error.code : code, resource?.id); return false; }
  };
  await own(source);
  if (destination) {
    try { await assertDestinationOwnership({context,resource:destination,operation:authority}); }
    catch (error) { block(error.code || 'RESOURCE_SCOPE_MISMATCH',destination.id); }
  }
  const readAll = async (adapter, kind) => {
    const items = [], cursors = new Set(); let cursor = null;
    try {
      for (let page = 0; page < 1000; page++) {
        const result = await adapter.listInventoryPage({ context, source, destination, kind, cursor });
        if (!Array.isArray(result?.items) || typeof result.complete !== "boolean") throw new Error("Incomplete page");
        items.push(...result.items);
        if (result.complete === true && !result.nextCursor) return items;
        if (!result.nextCursor || cursors.has(result.nextCursor)) throw new Error("Invalid cursor");
        cursors.add(result.nextCursor); cursor = result.nextCursor;
      }
      throw new Error("Page limit");
    } catch { block("INVENTORY_INCOMPLETE", kind); return []; }
  };
  const db = {};
  for (const kind of ["keys", "orders", "customers", "assignments", "serverAliases", "destinationKeys"]) db[kind] = await readAll(repository, kind);
  const external = {};
  for (const kind of ["users", "services", "hosts"]) external[kind] = await readAll(panel, kind);
  // IDs are unique within each complete inventory, not inferred from display labels.
  for (const [kind, rows] of Object.entries({ ...db, ...external })) {
    if (kind !== "destinationKeys" && rows.some((row, index) => !row.id || rows.findIndex(r => r.id === row.id) !== index)) block("DUPLICATE_INVENTORY_ID", kind);
  }
  for (const alias of db.serverAliases) {
    if (alias.id !== source.id && (alias.provider_resource_id === source.provider_resource_id ||
      alias.addresses?.some(address => source.addresses?.includes(address)))) block("SHARED_PROVIDER_IDENTITY", alias.id);
  }
  const services = external.services.filter(service => service.node_ids?.includes(source.panel_node_id));
  for (const service of services) {
    await own({ ...service, ...(await readOwner("service", service.id)), kind: "service", id: service.id }, "FOREIGN_PANEL_SERVICE");
    for (const nodeId of service.node_ids.filter(id => id !== source.panel_node_id)) {
      const node = await readOwner("node", String(nodeId));
      if (!node && String(service.id) === context.publicServiceId && panel.verifySharedNode) {
        try {
          if (await panel.verifySharedNode({ serviceId: String(service.id), nodeId }) === true) continue;
        } catch { /* Unverifiable shared exposure remains a retirement blocker. */ }
      }
      if (!node || !await own(node, "FOREIGN_PANEL_SERVICE")) block("FOREIGN_PANEL_SERVICE", service.id);
    }
  }
  const sourceServiceIds = services.map(service => String(service.id));
  const users = external.users.filter(user => user.service_ids?.some(id => sourceServiceIds.includes(String(id))));
  for (const user of users) {
    const keys = db.keys.filter(key => key.outline_key_id === user.id && key.status === "active" && !key.deleted_at);
    if (!keys.length) { block("UNMANAGED_PANEL_USER", user.id); continue; }
    await own({ ...user, ...(await readOwner("user", user.id)), kind: "user", id: user.id }, "FOREIGN_PANEL_USER");
    if(panel.verifyUserIdentity) {
      try{if(await panel.verifyUserIdentity({userId:user.id})!==true)block('USER_IDENTITY_CHANGED',user.id);}
      catch{block('USER_IDENTITY_CHANGED',user.id);}
    }
    // Pool-wide VLESS users anchored elsewhere are exposure dependencies, not SS moves.
    for (const key of keys) if (key.server_id !== source.id && key.protocol !== "vless") block("CROSS_NODE_SS_SERVICE", key.id);
  }
  for (const host of external.hosts.filter(host => host.node_id === source.panel_node_id)) {
    await own({ ...host, ...(await readOwner("host", host.id)), kind: "host", id: host.id }, "FOREIGN_PANEL_HOST");
  }
  for (const key of db.keys.filter(key => key.server_id === source.id && ["active", "pending"].includes(key.status) && !key.deleted_at)) {
    if (key.status === "pending") { block("PENDING_RESERVATION", key.id); continue; }
    const order = db.orders.find(row => row.id === key.order_id), customer = db.customers.find(row => row.id === key.customer_id);
    if (!order || !customer || !key.reseller_id || key.reseller_id !== order.reseller_id || key.reseller_id !== customer.reseller_id || order.customer_id !== key.customer_id) {
      block("TENANT_BINDING_MISMATCH", key.id); continue;
    }
    if (order.status !== "active") { block("ORDER_STATE_MISMATCH", key.id); continue; }
    if (!["shadowsocks", "vless"].includes(key.protocol)) { block("UNSUPPORTED_PROTOCOL", key.id); continue; }
    const user = users.find(row => row.id === key.outline_key_id);
    if (!user) { block("PANEL_USER_MISSING", key.id); continue; }
    if (db.destinationKeys.some(row => row.order_id === key.order_id && ["active", "pending"].includes(row.status) && !row.deleted_at)) block("DESTINATION_KEY_CONFLICT", key.id);
    movable.push({ kind: "access", keyId: key.id, orderId: key.order_id, customerId: key.customer_id,
      resellerId: key.reseller_id, protocol: key.protocol, userId: user.id,
      sourceServiceIds: [...user.service_ids], expectedKey: key, expectedOrder: order });
  }
  for (const assignment of db.assignments.filter(row => row.server_id === source.id && row.is_active === true)) {
    const key = db.keys.find(row => row.id === assignment.vpn_key_id);
    if (!key) { block("UNRESOLVED_TOKEN_ASSIGNMENT", assignment.id); continue; }
    if (key.status === "deleted" || key.deleted_at) {
      movable.push({ kind: "assignment_cleanup", assignmentId: assignment.id, keyId: key.id, expectedAssignment: assignment });
      warnings.push({ code: "STALE_ACTIVE_ASSIGNMENT", id: assignment.id });
    } else if (key.server_id !== source.id || key.status !== "active") block("ASSIGNMENT_STATE_MISMATCH", assignment.id);
  }
  let resource = null, attachments = null;
  try {
    resource = await provider.inspect({ resourceId: source.provider_resource_id });
    await own(resource);
    if (resource?.id !== source.provider_resource_id || source.addresses?.some(address => !resource?.addresses?.includes(address))) block("PROVIDER_IDENTITY_CHANGED");
    attachments = await provider.inspectBillableAttachments({ resourceId: source.provider_resource_id });
    if (attachments?.complete !== true || !Array.isArray(attachments.items)) block("ATTACHMENT_INVENTORY_INCOMPLETE");
    else for (const item of attachments.items) {
      warnings.push({ code: "BILLABLE_ATTACHMENT", id: item.id });
      if (item.shared || item.protected || item.environment !== context.environment || item.poolId !== context.poolId) block("FOREIGN_BILLABLE_ATTACHMENT", item.id);
    }
  } catch { block("PROVIDER_INVENTORY_UNAVAILABLE"); }
  if (destination) {
    try { assertCompatibleDestination({ source, destination, inventory: { movable } }); }
    catch (error) { block(error.code); }
  }
  const exposure = users.filter(user => !movable.some(item => item.userId === user.id)).map(user => user.id);
  return { movable, blockers, warnings, poolExposureUserIds: exposure,
    activeSourceAssignments: db.assignments.filter(row => row.server_id === source.id && row.is_active === true).length,
    pendingSourceKeys: db.keys.filter(row => row.server_id === source.id && row.status === "pending" && !row.deleted_at).length,
    fingerprint: payloadHash({ source, destination, movable, blockers, warnings, exposure, resource, attachments }) };

  async function readOwner(kind, id) {
    try {
      const owner = await context.registry.getResource({ kind, id });
      return owner?.id === id && owner.kind === kind ? owner : null;
    } catch { return null; }
  }
}
