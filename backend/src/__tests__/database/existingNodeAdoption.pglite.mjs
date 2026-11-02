import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { payloadHash } from '../../services/infrastructure/repository.js';
import { createExistingNodeAdoption } from '../../services/infrastructure/existingNodeAdoption.js';
import { createInfrastructureContext } from '../../services/infrastructure/context.js';
import { assertResourceRegistration } from '../../services/infrastructure/ownership.js';
const { PGlite } = await import(process.env.PGLITE_MODULE_PATH || './pglite-runtime/node_modules/@electric-sql/pglite/dist/index.js');
const db = new PGlite();
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table vpn_servers(id uuid primary key default gen_random_uuid(),name text not null,provider text,region text,droplet_id bigint,host_ip text,
      status text default 'active',is_active boolean default true,is_default boolean default false,current_active_keys integer not null default 0,
      sort_order integer not null default 0,max_active_keys integer default 10,last_error text,updated_at timestamptz,panel_type text default 'marzneshin',
      panel_url text,panel_public_url text,panel_username text,panel_password_encrypted text,server_tier text,
      marzneshin_service_ids integer[],marzneshin_vless_service_ids integer[],marzneshin_vless_trial_service_ids integer[]);
    create table vpn_orders(id uuid primary key,reseller_id uuid,status text,customer_id uuid,expiry_date date,quota_limit_bytes bigint,usage_baseline_bytes bigint,payment_status text,review_status text);
    create table vpn_keys(id uuid primary key default gen_random_uuid(),server_id uuid,order_id uuid,customer_id uuid,reseller_id uuid,key_name text,data_limit_bytes bigint,
      used_bytes bigint,status text,protocol text,outline_key_id text,access_url text,key_credentials jsonb,is_used boolean,used_at timestamptz,deleted_at timestamptz,updated_at timestamptz);
    create table token_server_assignments(id uuid primary key,vpn_key_id uuid,server_id uuid,is_active boolean);
    create table server_health_status(server_id uuid primary key,outline_api_status text,last_checked_at timestamptz,last_success_at timestamptz,last_error text,consecutive_failures integer,updated_at timestamptz);
    create table customer_trial_claims(id uuid primary key,customer_id uuid,history jsonb);
    create table vpn_customers(id uuid primary key,trial_used boolean);`);
  const root = new URL('../../../supabase/migrations/', import.meta.url);
  for (const name of (await fs.readdir(root)).filter(n => /^(0020|0021|004[0-9]|0051)_/.test(n)).sort()) {
    await db.exec(await fs.readFile(new URL(name, root), 'utf8'));
  }
  const migration = await fs.readFile(new URL('0051_existing_node_adoption.sql', root), 'utf8');
  await db.exec(migration);
  const poolId = randomUUID(), serverId = randomUUID();
  const scope = { environment: 'development', poolId, databaseIdentity: 'dev.supabase.co', panelIdentity: 'https://panel.example' };
  const args = [scope.environment, poolId, scope.databaseIdentity, scope.panelIdentity];
  await db.query("insert into server_access_pools(id,environment,name,panel_identity,vless_service_id) values($1,'development','DEV','https://panel.example',502)", [poolId]);
  await db.query("insert into server_operation_runtime_bindings values('development',$1,'dev.supabase.co','https://panel.example',$2)", [poolId, { digitalocean: 'account' }]);
  await db.query("insert into vpn_servers(id,name,provider,region,droplet_id,host_ip,panel_url,panel_password_encrypted,marzneshin_service_ids,marzneshin_vless_service_ids,marzneshin_vless_trial_service_ids) values($1,'SG5','digitalocean','sgp1',55,'198.51.100.5','https://panel.example','do-not-return',array[]::int[],array[502],array[77])", [serverId]);
  const customer = randomUUID(), order = randomUUID(), key = randomUUID();
  await db.query('insert into vpn_customers values($1,true)', [customer]);
  await db.query("insert into vpn_orders(id,reseller_id,customer_id,status,expiry_date,quota_limit_bytes) values($1,$2,$3,'active','2099-01-01',10000)", [order, randomUUID(), customer]);
  await db.query("insert into vpn_keys(id,server_id,order_id,customer_id,status,protocol,outline_key_id,access_url,used_bytes,data_limit_bytes) values($1,$2,$3,$4,'active','vless','same-user','same-link',42,10000)", [key, serverId, order, customer]);
  await db.query('insert into customer_trial_claims values($1,$2,$3)', [randomUUID(), customer, { completed: true }]);
  const snapshot = async (id = serverId) => (await db.query('select inspect_existing_node_adoption($1,$2,$3,$4,$5) value', [...args, id])).rows[0].value;
  const inspect = await snapshot();
  assert.ok(!JSON.stringify(inspect).includes('do-not-return'));
  const protectedState = async () => (await db.query(`select jsonb_build_object('customers',(select jsonb_agg(c) from vpn_customers c),
    'keys',(select jsonb_agg(k) from vpn_keys k),'orders',(select jsonb_agg(o) from vpn_orders o),'trials',(select jsonb_agg(t) from customer_trial_claims t),
    'counter',(select current_active_keys from vpn_servers where id=$1),'trialService',(select marzneshin_vless_trial_service_ids from vpn_servers where id=$1)) value`, [serverId])).rows[0].value;
  const before = await protectedState();
  function preview(expected, id = serverId) {
    return { version: 1, scope, serverId: id, lifecycle: false, registration: null,
      provider: { id: '55', provider: 'digitalocean', accountId: 'account', createdAt: '2026-01-01T00:00:00Z', addresses: ['198.51.100.5'], region: 'sgp1', planId: 'small' },
      node: { id: 5, address: '198.51.100.5' }, supportedProtocols: ['vless'], ssServiceIds: [], publicServiceId: 502, sshHostKeySha256: null,
      inbounds: [{ id: 8, protocol: 'vless', hash: 'a'.repeat(64) }], hosts: [{ id: 80, inboundId: 8, address: '198.51.100.5', port: 443, hash: 'b'.repeat(64) }],
      services: [{ id: 502, inboundIds: [8], hash: 'c'.repeat(64) }], expected,
      receipts: [{ ...scope, id, kind: 'server', protected: true, method: 'owner_authorized_access_adoption',
        panel_node_id: 5, provider_resource_id: null, addresses: ['198.51.100.5'], supported_protocols: ['vless'] }] };
  }
  const apply = async (p, hash = payloadHash(p), credentials = null) => (await db.query('select adopt_existing_node($1,$2,$3,$4,$5,$6,$7) value',
    [...args, JSON.stringify(canonical(p)), hash, credentials])).rows[0].value;
  const p = preview(inspect);
  await assert.rejects(apply(p, '0'.repeat(64)), /ADOPTION_APPROVAL_REQUIRED/);
  await db.query("update vpn_servers set name='changed' where id=$1", [serverId]);
  await assert.rejects(apply(p), /ADOPTION_STATE_CHANGED/);
  const busyId = randomUUID();
  await db.query("insert into server_customer_mutation_guards values($1,'development',$2,$3,now()+interval '5 minutes','uncertain')", [busyId, poolId, ['server:' + serverId]]);
  await assert.rejects(apply(preview(await snapshot())), /ADOPTION_BUSY/);
  await db.query('delete from server_customer_mutation_guards where guard_id=$1', [busyId]);
  const good = preview(await snapshot());
  assert.equal((await apply(good)).adopted, true);
  assert.deepEqual(await protectedState(), before);
  const server = (await db.query('select * from vpn_servers where id=$1', [serverId])).rows[0];
  assert.equal(server.lifecycle_protected, true); assert.equal(server.provider_resource_id, null);
  assert.equal(server.ownership_provenance.purpose, 'owner_authorized_shared_node_customer_access');
  assert.equal((await db.query('select count(*)::int n from server_infrastructure_resources')).rows[0].n, 1);
  assert.deepEqual(await apply(good), await apply(good), 'Same approved transaction can be retried after response loss');
  // Synthetic counter/health drift must not invalidate a committed identity receipt.
  await db.query("update vpn_servers set current_active_keys=current_active_keys+1,last_error='routine health update',updated_at=now() where id=$1", [serverId]);
  assert.equal((await apply(good)).adopted, true, 'Committed response-loss retry tolerates counter and health metadata changes');
  await db.query('update vpn_servers set current_active_keys=current_active_keys-1 where id=$1', [serverId]);
  await db.query("update vpn_servers set host_ip='198.51.100.99' where id=$1", [serverId]);
  await assert.rejects(apply(good), /ADOPTION_STATE_CHANGED/);
  await db.query("update vpn_servers set host_ip='198.51.100.5' where id=$1", [serverId]);
  const bad = preview(await snapshot()); bad.receipts.push({ ...bad.receipts[0], id: '55', kind: 'provider', provider: 'digitalocean', protected: false });
  await assert.rejects(apply(bad), /ADOPTION_RECEIPTS_INVALID/);
  const missing = randomUUID(), collision = preview(await snapshot(missing), missing);
  collision.registration = { name: 'SG5 duplicate', region: 'sgp1', maxActiveKeys: 100, serverTier: 'premium' };
  await assert.rejects(apply(collision, payloadHash(collision), { username: 'fixture', passwordEncrypted: 'encrypted' }), /ADOPTION_RESOURCE_COLLISION/);
  const freshId = randomUUID(), fresh = preview(await snapshot(freshId), freshId);
  fresh.registration = { name: 'Singapore #5', region: 'sgp1', maxActiveKeys: 100, serverTier: 'premium' };
  fresh.provider.id = '66'; fresh.provider.addresses = ['198.51.100.6']; fresh.node = { id: 6, address: '198.51.100.6' };
  fresh.receipts[0].panel_node_id = 6; fresh.receipts[0].addresses = ['198.51.100.6'];
  assert.equal((await apply(fresh, payloadHash(fresh), { username: 'fixture', passwordEncrypted: 'encrypted' })).adopted, true);
  assert.equal((await db.query('select current_active_keys from vpn_servers where id=$1', [freshId])).rows[0].current_active_keys, 0);
  // Exercise the service-generated lifecycle document against the real RPC, then
  // consume its durable receipts through the current runtime ownership guards.
  const managed = randomUUID();
  await db.query("insert into vpn_servers(id,name,provider,region,droplet_id,host_ip,panel_url,marzneshin_service_ids,marzneshin_vless_service_ids) values($1,'managed existing','digitalocean','sgp1',77,'198.51.100.7','https://panel.example','{}',array[502])", [managed]);
  const client = {
    from(table) {
      assert.ok(['server_access_pools', 'server_operation_runtime_bindings'].includes(table));
      const filters = [], params = [];
      const q = { select: () => q, eq: (key, value) => { assert.match(key, /^[a-z_]+$/); params.push(value); filters.push(`${key}=$${params.length}`); return q; },
        maybeSingle: async () => ({ data: (await db.query(`select * from ${table} where ${filters.join(' and ')}`, params)).rows[0] }) };
      return q;
    },
    async rpc(name, values) {
      assert.ok(['inspect_existing_node_adoption','read_existing_node_adoption_approval','adopt_existing_node'].includes(name));
      return { data: (await db.query(`select ${name}(${Object.keys(values).map((_, i) => '$' + (i + 1)).join(',')}) value`, Object.values(values))).rows[0].value };
    }
  };
  const bodies = { '/v2/account': { account: { uuid: 'account' } }, '/api/admins/token': { access_token: 'fixture' },
    '/v2/droplets/77': { droplet: { id: 77, created_at: '2026-01-01T00:00:00Z', region: { slug: 'sgp1' }, size_slug: 'small', status: 'active', networks: { v4: [{ type: 'public', ip_address: '198.51.100.7' }] } } },
    '/api/nodes/7': { id: 7, address: '198.51.100.7' }, '/api/inbounds': [{ id: 9, node: { id: 7 }, protocol: 'vless' }],
    '/api/inbounds/9/hosts': [{ id: 90, address: '198.51.100.7', port: 443, is_disabled: false }],
    '/api/services': [{ id: 502, inbound_ids: [9] }, { id: 504, inbound_ids: [9] }], '/api/users': [] };
  const fingerprint = `SHA256:${'a'.repeat(43)}`;
  const adoption = await createExistingNodeAdoption({ client,
    env: { SERVER_ACCESS_ENVIRONMENT: scope.environment, SERVER_ACCESS_DATABASE_IDENTITY: scope.databaseIdentity, SERVER_ACCESS_POOL_ID: poolId,
      SERVER_ACCESS_PANEL_IDENTITY: scope.panelIdentity, SUPABASE_URL: 'https://dev.supabase.co', MARZNESHIN_PANEL_URL: scope.panelIdentity,
      MARZNESHIN_PANEL_USERNAME: 'fixture', MARZNESHIN_PANEL_PASSWORD: 'fixture', DIGITALOCEAN_TOKEN: 'fixture' },
    operatorConfig: { providers: { digitalocean: { accountId: 'account' } }, protectedAddresses: [], protectedResourceIds: [],
      existingNodeAdoption: { lifecycleScopes: [{ ...scope, serverId: managed, provider: 'digitalocean', resourceId: '77', nodeId: 7, sshHostKeySha256: fingerprint }] } },
    verifySsh: async () => true,
    fetchImpl: async (url, options) => { const path = new URL(url).pathname;
      assert.ok(options.method === 'GET' || path === '/api/admins/token'); assert.ok(bodies[path], path);
      return new Response(JSON.stringify(bodies[path]), { status: 200 }); }
  });
  const target = { serverId: managed, provider: 'digitalocean', resourceId: '77', nodeId: 7, mode: 'lifecycle' };
  const approved = await adoption.inspect(target);
  assert.equal((await adoption.apply(target, approved.hash)).adopted, true);
  assert.equal((await adoption.apply(target, approved.hash)).adopted, true, 'CLI/service retry re-inspects actual panel/provider evidence');
  const registry = { getResource: async r => (await db.query('select body from server_infrastructure_resources where environment=$1 and access_pool_id=$2 and kind=$3 and provider=$4 and resource_id=$5',
    [scope.environment, poolId, r.kind, r.provider || '', String(r.id)])).rows[0]?.body };
  const context = await createInfrastructureContext({ config: { ...scope, executionMode: 'mock', providerAccounts: { digitalocean: 'account' }, protectedAddresses: [], protectedResourceIds: [] },
    registry, adapters: { inspectRuntime: async () => ({ ...scope, verified: true, providerAccounts: { digitalocean: 'account' } }), assertOperationLease: async () => true } });
  for (const receipt of approved.preview.receipts) assert.ok(await assertResourceRegistration({ context, resource: receipt }));
  const managedRow = (await db.query('select * from vpn_servers where id=$1', [managed])).rows[0];
  assert.equal(managedRow.provider_resource_id, '77'); assert.equal(managedRow.lifecycle_protected, false);
  await assert.rejects(db.query('select adopt_existing_node($1,$2,$3,$4,$5,$6,$7)', [...args, JSON.stringify(canonical(approved.preview)), 'f'.repeat(64), null]), /ADOPTION_APPROVAL_REQUIRED/);
  assert.deepEqual(await protectedState(), before, 'Lifecycle registration also preserves legacy customer state');
  // Force failure after the server metadata update to prove transaction rollback.
  const rollbackId = randomUUID();
  await db.query("insert into vpn_servers(id,name,provider,region,droplet_id,host_ip,panel_url,marzneshin_service_ids,marzneshin_vless_service_ids) values($1,'rollback fixture','digitalocean','sgp1',88,'198.51.100.8','https://panel.example','{}',array[502])", [rollbackId]);
  const rollbackPreview = preview(await snapshot(rollbackId), rollbackId);
  rollbackPreview.provider.id = '88'; rollbackPreview.provider.addresses = ['198.51.100.8']; rollbackPreview.node = { id: 88, address: '198.51.100.8' };
  rollbackPreview.receipts[0].panel_node_id = 88; rollbackPreview.receipts[0].addresses = ['198.51.100.8'];
  await db.exec(`create function reject_adoption_fixture() returns trigger language plpgsql as $$ begin raise exception 'SYNTHETIC_RECEIPT_FAILURE'; end $$;
    create trigger reject_adoption_fixture before insert on server_infrastructure_resources for each row execute function reject_adoption_fixture();`);
  await assert.rejects(apply(rollbackPreview), /SYNTHETIC_RECEIPT_FAILURE/);
  assert.equal((await db.query('select environment from vpn_servers where id=$1', [rollbackId])).rows[0].environment, null);
  assert.equal((await db.query('select count(*)::int n from existing_node_adoptions where server_id=$1', [rollbackId])).rows[0].n, 0);
  await db.exec('drop trigger reject_adoption_fixture on server_infrastructure_resources; drop function reject_adoption_fixture()');
  const waiting = randomUUID();
  await db.query("insert into server_operations(id,environment,access_pool_id,database_identity,panel_identity,kind,idempotency_key,payload_hash,payload) values($1,$2,$3,$4,$5,'add','adoption-busy-fixture',$6,'{}')",
    [waiting, ...args, 'a'.repeat(64)]);
  await assert.rejects(apply(rollbackPreview), /ADOPTION_BUSY/);
  await db.query('delete from server_operations where id=$1', [waiting]);
  // New release migration extends access-only adoption; historical 0051 stays intact.
  const extension = new URL('0063_lightnode_access_adoption.sql', root);
  await db.exec(await fs.readFile(extension, 'utf8'));
  const legacyId = randomUUID();
  await db.query("insert into vpn_servers(id,name,provider,region,droplet_id,host_ip,panel_type,status,is_active,is_default) values($1,'Retired Outline history','digitalocean','sgp1',88,'198.51.100.8','outline','decommissioned',false,false)", [legacyId]);
  const withLegacy = { ...rollbackPreview, expected: await snapshot(rollbackId) };
  for (const update of ["is_active=true", "status='active'", "status=null", "panel_type='marzneshin'"]) {
    await db.query('update vpn_servers set '+update+' where id=$1', [legacyId]);
    await assert.rejects(apply({ ...withLegacy, expected: await snapshot(rollbackId) }), /ADOPTION_RESOURCE_COLLISION/);
    await db.query("update vpn_servers set is_active=false,status='decommissioned',panel_type='outline' where id=$1", [legacyId]);
  }
  await db.query("insert into vpn_keys(id,server_id,status,protocol) values($1,$2,'pending','vless')", [randomUUID(),legacyId]);
  await assert.rejects(apply({ ...withLegacy, expected: await snapshot(rollbackId) }), /ADOPTION_RESOURCE_COLLISION/);
  await db.query('delete from vpn_keys where server_id=$1', [legacyId]);
  assert.equal((await apply({ ...withLegacy, expected: await snapshot(rollbackId) })).adopted, true, 'Retired unscoped Outline history must not block the live node');
  assert.equal((await db.query('select count(*)::int n from vpn_servers where id=$1', [legacyId])).rows[0].n, 1, 'History is preserved');
  const lightId = randomUUID();
  await db.query("update server_operation_runtime_bindings set provider_accounts=provider_accounts||'{\"lightnode\":\"fixture-connection\"}'::jsonb");
  await db.query("insert into vpn_servers(id,name,provider,region,host_ip,panel_url,marzneshin_service_ids,marzneshin_vless_service_ids) values($1,'LightNode','lightnode','jp-tokyo-1','198.51.100.20','https://panel.example','{}',array[502])", [lightId]);
  const light = preview(await snapshot(lightId), lightId);
  light.provider = { id: 'ecs-fixture', provider: 'lightnode', accountId: 'fixture-connection', createdAt: '2026-01-01T00:00:00Z', addresses: ['198.51.100.20'], region: 'jp-tokyo-1' };
  light.node = { id: 20, address: '198.51.100.20' };
  Object.assign(light.receipts[0], { panel_node_id: 20, addresses: ['198.51.100.20'] });
  assert.equal((await apply(light)).adopted, true, 'Protected LightNode access registration must work');
  const lightRow = (await db.query('select lifecycle_protected,provider_resource_id from vpn_servers where id=$1',[lightId])).rows[0];
  assert.equal(lightRow.lifecycle_protected, true); assert.equal(lightRow.provider_resource_id, null);
  assert.equal((await db.query("select count(*)::int n from server_infrastructure_resources where body->>'serverId'=$1 and kind<>'server'", [lightId])).rows[0].n, 0);
  const unsafe = { ...light, expected: await snapshot(lightId), lifecycle: true };
  await assert.rejects(apply(unsafe), /RESOURCE_SCOPE_MISMATCH/);
  assert.deepEqual(await protectedState(), before, 'LightNode registration preserves existing customer state');
  await db.query("insert into server_infrastructure_resources(environment,access_pool_id,database_identity,panel_identity,kind,resource_id,body) values($1,$2,$3,$4,'service','999','{}')", args);
  const staleRegistry = { ...rollbackPreview, expected: await snapshot(rollbackId) };
  await db.query("update server_infrastructure_resources set database_identity='changed' where kind='service' and resource_id='999'");
  await assert.rejects(apply(staleRegistry), /ADOPTION_STATE_CHANGED/);
  await db.exec('set role authenticated');
  await assert.rejects(snapshot(), /permission denied/); await assert.rejects(apply(good), /permission denied/);
  await db.exec('reset role; set role service_role');
  assert.equal((await apply(good)).adopted, true);
  console.log('PASS existing adoption: actual lifecycle DDL, hash/CAS/busy/collision/receipt guards, safe snapshot, protected shared access, SG5 insert, retry, service-role permissions and preserved customer/key/counter/trial state. Single-connection synthetic PostgreSQL only.');
} catch (error) {
  console.error(error.message, error.where || ''); process.exitCode = 1;
} finally { await db.close(); }
