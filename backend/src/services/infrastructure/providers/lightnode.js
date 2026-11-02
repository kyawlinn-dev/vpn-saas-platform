import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { infrastructureError, payloadHash } from '../repository.js';
import { isInfrastructureContext } from '../context.js';
import { assertOperationAuthority, assertResourceOwnership, assertResourceRegistration } from '../ownership.js';
import { isProviderPricedQuote } from './providerPricing.js';

const fail = code => { throw infrastructureError(code); };
const scopeKeys = ['environment', 'databaseIdentity', 'panelIdentity', 'poolId'];
const id = value => typeof value === 'string' && /^[A-Za-z0-9-]{1,100}$/.test(value);
const planId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(value);
const same = (a, b) => a === undefined || b === undefined ? a === b : payloadHash(a) === payloadHash(b);
const select = (value, keys) => Object.fromEntries(keys.filter(key => value[key] !== undefined).map(key => [key, value[key]]));
const positive = value => Number.isFinite(value) && value > 0;
const specKeys=['cpu','memory_mb','disk_gb','transfer','billing_mode','bandwidth_mbps'];
const createKey = 'lightnode-create', deleteKey = 'lightnode-delete', provider = 'lightnode';
const emptyPackageInventory = () => ({ complete: true, scope: 'instance-package', items: [], externalAttachmentsVerified: false,
  source: 'https://apidoc.lightnode.com/en/441237889e0.md' });

/**
 * Public contracts checked 2026-11-01 (the delete URL is /release, NOT /delete):
 * https://apidoc.lightnode.com/en/441237883e0.md (create)
 * https://apidoc.lightnode.com/en/441237884e0.md (release)
 * https://apidoc.lightnode.com/en/441237889e0.md (detail)
 * https://apidoc.lightnode.com/en/441237894e0.md (task)
 *
 * Dependencies: externally verified immutable transport.accountId; catalog.getQuote
 * includes the entire operator price proof in trafficTerms.billing. assertSelection
 * returns normalized {id,cpu,memory_mb,disk_gb,transfer:{included,unit:'GB'}}.
 * The API has no packageCode/accountId in detail; compare these independent specs,
 * UUID, region, zone and image instead. createTime is retained verbatim: its timezone
 * is undocumented, so it must not be interpreted as a UTC ownership timestamp.
 *
 * store is the operation-bound encrypted/fenced CAS store. lightnode-create contains
 * {operationId,resourceId,taskId,region,zone,planId,...scope/account/intent/specs}.
 * A claimed intent without a saved task UUID requires manual reconciliation forever;
 * no name lookup, adoption, password reset or repeated POST is safe.
 *
 * Parent recordCreatedResource(owned,{expectedAttempt}) must validate this fresh
 * receipt, OBSERVE the host key, persist bootstrap.fingerprint, then register the
 * same ownership metadata plus sshHostKeySha256. It must not authenticate yet.
 * We reread that independent receipt; password auth belongs to configure stage.
 */
export function createLightNodeProvider({ context, transport, catalog, machine, store }) {
  if (!isInfrastructureContext(context) || !context.providerAccounts.lightnode ||
      transport?.accountId !== context.providerAccounts.lightnode || typeof transport.request !== 'function' ||
      typeof catalog?.getQuote !== 'function' || typeof catalog?.assertSelection !== 'function' ||
      typeof store?.readState !== 'function' || typeof store?.saveState !== 'function') fail('PROVIDER_ADAPTER_UNAVAILABLE');
  const scope = select(context, scopeKeys), accountId = context.providerAccounts.lightnode;
  // Snapshot nonsecret configuration; bootstrap secrets are supplied only to create.
  machine = structuredClone(select(machine || {}, ['zone', 'imageResourceUUID', 'bootstrapMode', 'firstContactPolicy']));
  const binding = { ...scope, provider, accountId };
  const bound = value => value && Object.keys(binding).every(key => value[key] === binding[key]);
  function account() { if (transport.accountId !== accountId) fail('RESOURCE_SCOPE_MISMATCH'); }
  const registry = async (method, ...args) => {
    try { return await context.registry[method](...args); }
    catch (error) {
      // Parent observation is part of registration and can legitimately wait for
      // SSH readiness. Preserve only lifecycle control codes, never its message,
      // cause, stack or arbitrary provider/SSH diagnostics.
      if (method === 'recordCreatedResource' && ['NODE_BOOTSTRAP_PENDING', 'STALE_FENCE', 'LEASE_EXPIRED',
        'RESOURCE_SCOPE_MISMATCH', 'PROTECTED_RESOURCE', 'NODE_SECURITY_CONFIGURATION_REQUIRED'].includes(error?.code)) fail(error.code);
      fail('OWNERSHIP_REGISTRY_UNAVAILABLE');
    }
  };
  const read = async key => {
    try {
      const result = await store.readState(key);
      if (!result || !Object.hasOwn(result, 'value') || !Object.hasOwn(result, 'version')) fail('PROVIDER_CHECKPOINT_UNAVAILABLE');
      return result;
    } catch { fail('PROVIDER_CHECKPOINT_UNAVAILABLE'); }
  };
  async function save(key, value, expectedVersion) {
    try { if (await store.saveState(key, value, expectedVersion) === false) fail('PROVIDER_CHECKPOINT_UNAVAILABLE'); }
    catch { fail('PROVIDER_CHECKPOINT_UNAVAILABLE'); }
  }
  async function request(input) {
    account();
    let response;
    try { response = await transport.request(input); } catch { fail('PROVIDER_REQUEST_UNCERTAIN'); }
    if (!Number.isInteger(response?.status)) fail('PROVIDER_RESPONSE_INVALID');
    return response;
  }
  async function authorize(method, input, code) {
    let allowed;
    try { allowed = await context.adapters[method]?.({ context, ...input }); } catch { /* No external diagnostics. */ }
    if (allowed !== true) fail(code);
  }
  async function quote({ region, planId: selectedPlan }) {
    account();
    if (!id(region) || !planId(selectedPlan)) fail('QUOTE_INVALID');
    let price;
    try { price = await catalog.getQuote({ provider, accountId, region, planId: selectedPlan }); } catch { fail('QUOTE_UNAVAILABLE'); }
    if (price?.available !== true || (!positive(price.recurringAmount)&&!isProviderPricedQuote(provider,price)) || !/^[A-Z]{3}$/.test(price.currency) ||
        !price.trafficTerms?.source || !price.trafficTerms.billing) fail('QUOTE_UNAVAILABLE');
    const value = { ...binding, region, planId: selectedPlan, recurringAmount: price.recurringAmount, currency: price.currency,
      trafficTerms: structuredClone(price.trafficTerms), expiresAt: new Date(Date.now() + 15 * 60000).toISOString() };
    return { ...value, hash: payloadHash(value) };
  }
  function validateQuote(value, allowExpired = false) {
    if (!value) fail('QUOTE_INVALID');
    const { hash, ...body } = value;
    if (!bound(value) || payloadHash(body) !== hash || !id(value.region) || !planId(value.planId) ||
        !Number.isFinite(Date.parse(value.expiresAt)) || (!allowExpired && Date.parse(value.expiresAt) <= Date.now())) fail('QUOTE_INVALID');
  }
  async function detail(resourceId) {
    if (!id(resourceId)) fail('RESOURCE_SCOPE_MISMATCH');
    const response = await request({ method: 'GET', path: '/instance/detail', query: { ecsResourceUUID: resourceId } });
    // HTTP404 is authoritative. LightNode also returns an observed business-level
    // HTTP400 after release; accept that exact shape only with independent proof.
    if (response.status === 404) return null;
    if (response.status === 400 && response.data?.httpStatus === 400 &&
        response.data.code === 'AvailableInstance.NotFound' && response.data.rowCount === 0 &&
        response.data.success !== true && !Object.hasOwn(response.data, 'instance')) {
      await confirmReleasedAbsence(resourceId);
      return null;
    }
    if (![200, 202].includes(response.status) || response.data?.success === false ||
        !response.data?.instance || (response.data.httpStatus !== undefined && ![200, 202].includes(response.data.httpStatus))) fail('PROVIDER_READ_UNAVAILABLE');
    const raw = response.data.instance;
    if (raw.ecsResourceUUID !== resourceId || typeof raw.createTime !== 'string' || !raw.createTime.trim() ||
        !id(raw.regionCode) || !id(raw.zoneCode) || !id(raw.imageResourceUUID)) fail('RESOURCE_SCOPE_MISMATCH');
    return raw;
  }
  async function confirmReleasedAbsence(resourceId) {
    const { value } = await read(deleteKey);
    const registered = await registry('getResource', { kind: 'provider', provider, id: resourceId });
    if (!bound(value) || !id(value.operationId) || value.resourceId !== resourceId || !id(value.taskId) ||
        !bound(registered) || registered.id !== resourceId || !id(registered.region) || !id(registered.zone) || !registered.lightnodeReceipt ||
        !same(value.identity, registered) || !same(value.attachments, emptyPackageInventory()) ||
        typeof catalog.list !== 'function') fail('PROVIDER_READ_UNAVAILABLE');
    await assertResourceRegistration({ context, resource: registered });
    await task(value.taskId, 'DELETE');
    // list() validates bounded pagination and exact resource identities. A task
    // success or an error string alone never establishes instance absence.
    const instances = await catalog.list('/instance/list', 'instances', { regionCode: registered.region, zoneCode: registered.zone });
    if (!Array.isArray(instances) || instances.some(row => !id(row?.ecsResourceUUID) || row.ecsResourceUUID === resourceId)) fail('PROVIDER_READ_UNAVAILABLE');
  }
  function normalized(raw) {
    return { kind: 'provider', provider, accountId, id: raw.ecsResourceUUID, createdAt: raw.createTime,
      region: raw.regionCode, zone: raw.zoneCode, imageResourceUUID: raw.imageResourceUUID,
      status: raw.ecsStatus, addresses: isIP(raw.publicIpAddress) && raw.publicIpAddress !== '0.0.0.0' && raw.publicIpAddress !== '::' ? [raw.publicIpAddress] : [] };
  }
  function matchesReceipt(resource, receipt) {
    return bound(receipt) && receipt.kind === 'provider' && receipt.id === resource.id && receipt.createdAt === resource.createdAt &&
      same(receipt.addresses, resource.addresses) && ['region', 'zone', 'imageResourceUUID'].every(key => receipt[key] === resource[key]);
  }
  async function inspect({ resourceId }) {
    const raw = await detail(resourceId);
    if (!raw) return null;
    const resource = normalized(raw), prior = await registry('getResource', { kind: 'provider', provider, id: resourceId });
    if (!matchesReceipt(resource, prior)) return resource;
    return { ...resource, ...select(prior, [...scopeKeys, 'operationId', 'protected', 'sshHostKeySha256', 'sshEnrollment', 'planId', 'lightnodeReceipt']) };
  }
  function checkAttempt(attempt, operationId) {
    if (!bound(attempt) || attempt.operationId !== operationId || !id(attempt.nonce) || !id(attempt.region) ||
        !planId(attempt.planId) || !attempt.machineHash || !attempt.specs || !attempt.quoteHash) fail('RESOURCE_SCOPE_MISMATCH');
  }
  function checkState(value, operationId, attempt) {
    if (!bound(value) || value.operationId !== operationId || !same(value.attempt, attempt) ||
        !['region', 'planId', 'quoteHash'].every(key => value[key] === attempt[key]) ||
        value.zone !== attempt.machine.zone || value.imageResourceUUID !== attempt.machine.imageResourceUUID) fail('RESOURCE_SCOPE_MISMATCH');
  }
  async function task(taskId, kind) {
    if (!id(taskId)) fail(`${kind}_RECONCILIATION_REQUIRED`);
    const response = await request({ method: 'GET', path: '/asynctask/getResult', query: { asyncTaskUUID: taskId } });
    if (![200, 202].includes(response.status) || response.data?.success === false ||
        (response.data?.httpStatus !== undefined && ![200, 202].includes(response.data.httpStatus))) fail('PROVIDER_READ_UNAVAILABLE');
    const info = response.data?.asyncTaskInfo;
    if (!info || !['PROCESSING', 'FINISHED'].includes(info.taskStatus) || !['SUCCESS', 'FAIL', 'RETRY', 'CANCEL'].includes(info.processResult)) fail('PROVIDER_RESPONSE_INVALID');
    if (info.taskStatus === 'PROCESSING' || info.processResult === 'RETRY') fail('PROVIDER_RESOURCE_PENDING');
    if (info.processResult !== 'SUCCESS') fail(`PROVIDER_${kind}_FAILED`);
  }
  function verifySpecs(raw, receipt) {
    const specs = receipt.attempt.specs;
    const mode=specs.billing_mode??'PayByTraffic';
    const networkValid=mode==='PayByBandwidth'
      ? raw.internetChargeType==='PAY_BY_BANDWIDTH'&&raw.bandwidth===specs.bandwidth_mbps
      : raw.freeFlow===specs.transfer.included&&(!specs.billing_mode||raw.internetChargeType==='PAY_BY_TRAFFIC');
    if (raw.regionCode !== receipt.region || raw.zoneCode !== receipt.zone || raw.imageResourceUUID !== receipt.imageResourceUUID ||
        raw.cpu !== specs.cpu || raw.memory * 1024 !== specs.memory_mb || raw.systemDiskSize !== specs.disk_gb ||
        !networkValid) fail('RESOURCE_SCOPE_MISMATCH');
  }
  async function findAllocation({ operationId }, cancellation = false) {
    account();
    if (!id(operationId)) fail('INVALID_OPERATION');
    const attempt = await registry('getCreateAttempt', { ...binding, operationId });
    if (!attempt) return null;
    checkAttempt(attempt, operationId);
    const { value } = await read(createKey);
    if (!value) fail('CREATE_RECONCILIATION_REQUIRED');
    checkState(value, operationId, attempt);
    if (!id(value.taskId) || !id(value.resourceId)) fail('CREATE_RECONCILIATION_REQUIRED');
    try { await task(value.taskId, 'CREATE'); }
    catch (error) {
      // An allocated, exactly identified VM can still incur charges after its
      // bootstrap task failed. Only guarded cancellation may use detail proof
      // instead of task readiness; malformed/unavailable task reads stay closed.
      if (!cancellation || !['PROVIDER_CREATE_FAILED', 'PROVIDER_RESOURCE_PENDING'].includes(error?.code)) throw error;
    }
    const raw = await detail(value.resourceId);
    if (!raw) fail('CREATE_RECONCILIATION_REQUIRED');
    verifySpecs(raw, value);
    const resource = normalized(raw);
    // Partial detail without a usable IP or exact package specs is unsupported:
    // require manual reconciliation rather than inventing ownership/billing proof.
    if (!resource.addresses.length || (!cancellation && (raw.ecsStatus !== 'STARTED' || raw.ecsPendingStatus !== 'NONE'))) fail('PROVIDER_RESOURCE_PENDING');
    return { resource, attempt, raw, receipt: value };
  }
  const find = input => findAllocation(input);
  async function recordFound(found, operation) {
    await assertOperationAuthority(context, operation);
    const { resource, attempt, receipt, raw } = found;
    if (context.protectedResourceIds.includes(resource.id) || resource.addresses.some(ip => context.protectedAddresses.includes(ip))) fail('PROTECTED_RESOURCE');
    const prior = await registry('getResource', { kind: 'provider', provider, id: resource.id });
    const lightnodeReceipt = { ...select(receipt, [...Object.keys(binding), 'operationId', 'resourceId', 'taskId', 'region', 'zone', 'planId', 'imageResourceUUID']),
      nonce: attempt.nonce, specs: attempt.specs, createdAt: raw.createTime,
      systemDiskResourceUUID: raw.systemDiskResourceUUID, publicIpResourceUUID: raw.publicIpResourceUUID };
    const owned = { ...resource, ...binding, operationId: operation.id, protected: false, planId: attempt.planId, lightnodeReceipt };
    if (prior) {
      if (prior.operationId !== operation.id || !same(prior.lightnodeReceipt, lightnodeReceipt)) fail('RESOURCE_SCOPE_MISMATCH');
      await assertResourceOwnership({ context, resource: { ...owned, sshHostKeySha256: prior.sshHostKeySha256 }, operation });
    } else {
      await registry('recordCreatedResource', owned, { expectedAttempt: attempt });
    }
    // Callback return values are not authority. Reread the independent receipt.
    const registered = await registry('getResource', { kind: 'provider', provider, id: resource.id });
    if (!matchesReceipt(owned, registered) || registered.operationId !== operation.id ||
        !same(registered.lightnodeReceipt, lightnodeReceipt)) fail('RESOURCE_SCOPE_MISMATCH');
    if (!registered.sshHostKeySha256 || registered.sshEnrollment === 'cancelled_before_enrollment') {
      // Only the parent can attest cancellation under its authenticated current
      // lease and prepublication guard. A caller flag or marker alone is no proof.
      if (registered.sshEnrollment !== 'cancelled_before_enrollment') fail('RESOURCE_SCOPE_MISMATCH');
      await authorize('assertCancellationScope', { operation }, 'RESOURCE_SCOPE_MISMATCH');
    }
    await assertResourceOwnership({ context, resource: registered, operation });
    return registered;
  }
  async function reconcile({ operationId, operation }, allowCancellation = false) {
    await assertOperationAuthority(context, operation);
    if (operation.id !== operationId) fail('RESOURCE_SCOPE_MISMATCH');
    let cancellation = false;
    if (allowCancellation) {
      try { cancellation = await context.adapters.assertCancellationScope?.({ operation }) === true; }
      catch { /* Missing or unverifiable cancellation authority keeps strict creation. */ }
    }
    const found = await findAllocation({ operationId }, cancellation);
    return found ? recordFound(found, operation) : null;
  }
  const reconcileCreate = input => reconcile(input, true);
  async function create({ operationId, operation = { id: operationId }, quote: value, profile, bootstrap }) {
    account();
    await assertOperationAuthority(context, operation);
    if (!id(operationId) || operation.id !== operationId || !['dual', 'vless_only'].includes(profile)) fail('INVALID_OPERATION');
    validateQuote(value, true);
    const prior = await registry('getCreateAttempt', { ...binding, operationId });
    if (prior) {
      checkAttempt(prior, operationId);
      if (prior.quoteHash !== value.hash || prior.profile !== profile || prior.machineHash !== payloadHash(machine)) fail('IDEMPOTENCY_CONFLICT');
      return reconcile({ operationId, operation });
    }
    validateQuote(value);
    if (!id(machine?.zone) || !id(machine?.imageResourceUUID) || machine.bootstrapMode !== 'password-tofu' ||
        machine.firstContactPolicy !== 'tofu' || typeof bootstrap?.password !== 'string' ||
        !/^[A-Za-z0-9()`~!@#$*+={}\[\]:;,.?/-]{8,30}$/.test(bootstrap.password) ||
        !/[A-Za-z]/.test(bootstrap.password) || !/[0-9]/.test(bootstrap.password) ||
        !/[()`~!@#$*+={}\[\]:;,.?/-]/.test(bootstrap.password) || `novanet-${operationId}`.length > 64) fail('MACHINE_CONFIGURATION_REQUIRED');
    const fresh = await quote({ region: value.region, planId: value.planId });
    if (fresh.recurringAmount !== value.recurringAmount || fresh.currency !== value.currency || !same(fresh.trafficTerms, value.trafficTerms)) fail('QUOTE_CHANGED');
    let specs;
    try { specs = await catalog.assertSelection({ region: value.region, planId: value.planId, profile }); } catch { fail('QUOTE_UNAVAILABLE'); }
    const mode=specs?.billing_mode??'PayByTraffic';
    const networkValid=mode==='PayByTraffic'
      ? specs.transfer?.unit==='GB'&&Number.isFinite(specs.transfer.included)&&specs.transfer.included>=0
      : mode==='PayByBandwidth'&&specs.transfer?.included===null&&specs.transfer.unit===null&&positive(specs.bandwidth_mbps);
    if (specs?.id !== value.planId || !positive(specs.cpu) || !positive(specs.memory_mb) || !positive(specs.disk_gb) ||
        !networkValid || !/-d0$/.test(value.planId)) fail('MACHINE_CONFIGURATION_REQUIRED');
    if (specs.zone !== machine.zone || value.trafficTerms.zone !== machine.zone ||
        (value.trafficTerms.imageResourceUUID!==undefined&&value.trafficTerms.imageResourceUUID!==machine.imageResourceUUID)||
        !same(select(specs, specKeys), value.trafficTerms.specs)) fail('QUOTE_CHANGED');
    specs = select(specs, specKeys);
    await authorize('assertPurchaseScope', { operation, quote: value, profile, machine }, 'PURCHASE_NOT_AUTHORIZED');
    // Authorization/catalogue reads can take time. Recheck expiry immediately before intent.
    validateQuote(value);
    const attempt = { ...binding, operationId, nonce: randomUUID(), region: value.region, planId: value.planId, quoteHash: value.hash,
      profile, machine, machineHash: payloadHash(machine), specs, startedAt: new Date().toISOString() };
    if (await registry('claimCreateAttempt', attempt) !== true) fail('CREATE_RECONCILIATION_REQUIRED');
    const checkpoint = await read(createKey);
    if (checkpoint.value) fail('CREATE_RECONCILIATION_REQUIRED');
    const receipt = { ...binding, operationId, region: value.region, zone: machine.zone, planId: value.planId,
      imageResourceUUID: machine.imageResourceUUID, quoteHash: value.hash, attempt, resourceId: null, taskId: null };
    await save(createKey, receipt, checkpoint.version);
    await assertOperationAuthority(context, operation);
    validateQuote(value);
    let response;
    try { response = await request({ method: 'POST', path: '/instance/create', body: { packageConfig: {
      packageCode: value.planId, regionCode: value.region, zoneCode: machine.zone, instanceName: `novanet-${operationId}`,
      imageResourceUUID: machine.imageResourceUUID, password: bootstrap.password } } }); }
    catch { fail('CREATE_RECONCILIATION_REQUIRED'); }
    const info = response.data?.asyncTaskInfo;
    if (![200, 201, 202].includes(response.status) || response.data?.success === false ||
        (response.data?.httpStatus !== undefined && ![200, 201, 202].includes(response.data.httpStatus)) ||
        !id(info?.asyncTaskUUID) || !id(info?.ecsResourceUUID)) fail('CREATE_RECONCILIATION_REQUIRED');
    const saved = await read(createKey);
    if (!same(saved.value, receipt)) fail('PROVIDER_CHECKPOINT_UNAVAILABLE');
    await save(createKey, { ...receipt, taskId: info.asyncTaskUUID, resourceId: info.ecsResourceUUID }, saved.version);
    return reconcile({ operationId, operation });
  }

  function packageInventory(raw, registered, knownAttachments) {
    if (knownAttachments !== undefined && (!Array.isArray(knownAttachments) || knownAttachments.length)) fail('ATTACHMENT_INVENTORY_UNAVAILABLE');
    const receipt = registered?.lightnodeReceipt;
    // Bounded evidence only: this workflow creates d0 packages, never independent
    // disks/IPs/snapshots. Public API cannot enumerate detached/external resources.
    // complete applies ONLY to this instance package; callers requiring account-wide
    // inventory must reject externalAttachmentsVerified:false, never infer completeness.
    if (!receipt || !bound(receipt) || receipt.resourceId !== registered.id || receipt.createdAt !== registered.createdAt ||
        !/-d0$/.test(receipt.planId) || !id(receipt.taskId) || !id(receipt.nonce) ||
        raw.systemDiskResourceUUID !== receipt.systemDiskResourceUUID || !id(raw.systemDiskResourceUUID) ||
        raw.publicIpResourceUUID !== receipt.publicIpResourceUUID || !id(raw.publicIpResourceUUID) ||
        raw.systemDiskSize !== receipt.specs?.disk_gb || raw.dataDiskSize !== 0 || raw.snapshotNum !== 0 ||
        // The published schema lists this field; actual default-package detail
        // (read-only parent observation 2026-11-01) omits it. The documented
        // aggregate dataDiskSize must still be exactly zero. A present malformed
        // or nonempty list contradicts that evidence and must fail closed.
        (raw.dataDiskInfoList !== undefined && (!Array.isArray(raw.dataDiskInfoList) || raw.dataDiskInfoList.length)) ||
        !Array.isArray(raw.secondaryPublicIpInfoList) || raw.secondaryPublicIpInfoList.length) fail('ATTACHMENT_INVENTORY_UNAVAILABLE');
    return emptyPackageInventory();
  }
  async function inspectBillableAttachments({ resourceId, knownAttachments }) {
    const registered = await registry('getResource', { kind: 'provider', provider, id: resourceId });
    await assertResourceRegistration({ context, resource: registered });
    if (knownAttachments !== undefined && (!Array.isArray(knownAttachments) || knownAttachments.length)) fail('ATTACHMENT_INVENTORY_UNAVAILABLE');
    const raw = await detail(resourceId);
    if (!raw) {
      // Retirement/cancellation re-inventory after deletion, including after a
      // restart in an operation OTHER than the creator. readState authenticates
      // the active operation's encrypted namespace; never read the creator's state.
      // 404 alone cannot establish billing evidence. Reuse only the exact saved
      // pre-delete package evidence for this independent immutable registry receipt.
      const { value } = await read(deleteKey);
      if (!bound(value) || !id(value.operationId) || value.resourceId !== resourceId ||
          !registered.lightnodeReceipt || !same(value.identity, registered) ||
          !same(value.attachments, emptyPackageInventory())) fail('ATTACHMENT_INVENTORY_UNAVAILABLE');
      return structuredClone(value.attachments);
    }
    if (!matchesReceipt(normalized(raw), registered)) fail('ATTACHMENT_INVENTORY_UNAVAILABLE');
    return packageInventory(raw, registered, knownAttachments);
  }
  async function deleteResource({ resourceId, expectedIdentity, operation }) {
    account();
    await assertOperationAuthority(context, operation);
    if (!id(resourceId) || expectedIdentity?.id !== resourceId) fail('RESOURCE_SCOPE_MISMATCH');
    // Common retirement deliberately supplies only immutable common identity.
    // Ownership validates id/account/provider/createdAt/addresses/scope and returns
    // the independent registry receipt, which alone supplies private package proof.
    const registered = await assertResourceOwnership({ context, resource: expectedIdentity, operation });
    if (Object.hasOwn(expectedIdentity, 'lightnodeReceipt') && !same(expectedIdentity.lightnodeReceipt, registered.lightnodeReceipt)) fail('RESOURCE_SCOPE_MISMATCH');
    if (!registered.lightnodeReceipt) fail('ATTACHMENT_INVENTORY_UNAVAILABLE');
    const checkpoint = await read(deleteKey), prior = checkpoint.value;
    if (prior && (!bound(prior) || prior.operationId !== operation.id || prior.resourceId !== resourceId || !same(prior.identity, registered))) fail('RESOURCE_SCOPE_MISMATCH');
    const raw = await detail(resourceId);
    if (raw) {
      const current = { ...normalized(raw), ...scope };
      await assertResourceOwnership({ context, resource: current, operation });
      if (!matchesReceipt(current, registered)) fail('RESOURCE_SCOPE_MISMATCH');
      verifySpecs(raw, { ...registered.lightnodeReceipt, attempt: { specs: registered.lightnodeReceipt.specs } });
    }
    const attachments = raw ? packageInventory(raw, registered) : prior?.attachments;
    if (!attachments || attachments.complete !== true || attachments.scope !== 'instance-package') fail('ATTACHMENT_INVENTORY_UNAVAILABLE');
    await authorize('assertDeletionScope', { resource: raw ? { ...registered, ...normalized(raw) } : registered, attachments, operation }, 'DELETION_NOT_AUTHORIZED');
    if (!raw) return { absent: true, resourceId };
    if (prior) {
      if (!id(prior.taskId)) fail('DELETE_RECONCILIATION_REQUIRED');
      await task(prior.taskId, 'DELETE');
    } else {
      const receipt = { ...binding, operationId: operation.id, resourceId, identity: registered, attachments, taskId: null };
      await save(deleteKey, receipt, checkpoint.version);
      await assertResourceOwnership({ context, resource: registered, operation });
      let response;
      try { response = await request({ method: 'POST', path: '/instance/release', body: { ecsResourceUUID: resourceId } }); }
      catch { fail('DELETE_RECONCILIATION_REQUIRED'); }
      const info = response.data?.asyncTaskInfo;
      if (![200, 202].includes(response.status) || response.data?.success === false ||
          (response.data?.httpStatus !== undefined && ![200, 202].includes(response.data.httpStatus)) ||
          !id(info?.asyncTaskUUID) || info.ecsResourceUUID !== resourceId) fail('DELETE_RECONCILIATION_REQUIRED');
      const saved = await read(deleteKey);
      if (!same(saved.value, receipt)) fail('PROVIDER_CHECKPOINT_UNAVAILABLE');
      await save(deleteKey, { ...receipt, taskId: info.asyncTaskUUID }, saved.version);
      await task(info.asyncTaskUUID, 'DELETE');
    }
    if (await detail(resourceId)) fail('DELETE_RECONCILIATION_REQUIRED');
    return { absent: true, resourceId };
  }
  return Object.freeze({ quote, create, reconcileCreate, find, inspect, delete: deleteResource, inspectBillableAttachments });
}
