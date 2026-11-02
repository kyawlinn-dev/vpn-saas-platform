import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
const { PGlite } = await import(process.env.PGLITE_MODULE_PATH || './pglite-runtime/node_modules/@electric-sql/pglite/dist/index.js');
const db = new PGlite();
const root = new URL('../../../supabase/migrations/', import.meta.url);
const pool = randomUUID(), owner = randomUUID(), mirror = randomUUID();
const scope = ['development', pool, 'fixture-db', 'fixture-panel'];
const scopeBody = { environment: scope[0], poolId: pool, databaseIdentity: scope[2], panelIdentity: scope[3] };
const rpc = async (name, args) => (await db.query(`select ${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) value`, args)).rows[0].value;
const functions = async () => (await db.query(`select proname,pg_get_functiondef(p.oid) definition,proacl::text acl
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by p.oid`)).rows;
const snapshot = async () => (await db.query(`select jsonb_build_object(
  'resources',(select jsonb_agg(to_jsonb(r) order by resource_id) from server_infrastructure_resources r),
  'intents',(select jsonb_agg(to_jsonb(i) order by operation_id) from server_provider_create_intents i),
  'servers',(select jsonb_agg(to_jsonb(s) order by id) from vpn_servers s),
  'binding',(select jsonb_agg(to_jsonb(b)) from server_operation_runtime_bindings b)) value`)).rows[0].value;
async function operation(provider) {
  const id = randomUUID();
  await db.query(`insert into server_operations(id,environment,access_pool_id,database_identity,panel_identity,kind,
    idempotency_key,payload_hash,payload,status,lease_owner,lease_until,fence)
    values($1::uuid,$2,$3,$4,$5,'add',$1::uuid::text,repeat('a',64),$6,'running',$7,clock_timestamp()+interval '1 hour',1)`,
  [id, ...scope, { provider, region: 'tokyo', plan_id: 'fixture-plan', supported_protocols: ['vless'], quote: { hash: 'approved' } }, owner]);
  return id;
}
const intentFor = (id, provider) => ({ ...scopeBody, operationId: id, provider, accountId: `${provider}-fixture-account`,
  quoteHash: 'approved', region: 'tokyo', planId: 'fixture-plan', profile: 'vless_only', nonce: randomUUID() });
const claim = (id, provider, intent, overrides = []) => rpc('claim_server_provider_intent',
  [...(overrides.length ? overrides : scope), id, owner, 1, provider, intent]);
const register = (id, provider, receipt, intent, fence = 1) => rpc('register_server_infrastructure_resource',
  [...scope, id, owner, fence, 'provider', receipt.id, provider, receipt, intent]);
let passed = 0;
async function check(name, fn) { await fn(); console.log(`PASS ${name}`); passed++; }
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table vpn_servers(id uuid primary key default gen_random_uuid(),name text,provider text,region text,droplet_id bigint,host_ip text,
      status text default 'active',is_active boolean default true,is_default boolean default false,sort_order integer default 0,
      panel_type text default 'marzneshin',marzneshin_service_ids integer[],marzneshin_vless_service_ids integer[],marzneshin_vless_trial_service_ids integer[],
      panel_url text,panel_public_url text,panel_username text,panel_password_encrypted text,server_tier text,last_error text,
      current_active_keys integer default 0,max_active_keys integer,updated_at timestamptz);
    create table vpn_keys(id uuid primary key,server_id uuid,order_id uuid,status text,deleted_at timestamptz);
    create table vpn_orders(id uuid primary key);
    create table token_server_assignments(id uuid primary key,vpn_key_id uuid,server_id uuid,is_active boolean);
    create table server_health_status(server_id uuid primary key,outline_api_status text,last_checked_at timestamptz,
      last_success_at timestamptz,last_error text,consecutive_failures integer,updated_at timestamptz);`);
  for (const name of (await fs.readdir(root)).filter(n => /^(0021|004[0-6]|0051|0057)_/.test(n)).sort()) {
    await db.exec(await fs.readFile(new URL(name, root), 'utf8'));
  }
  await db.query("insert into server_access_pools(id,environment,name,panel_identity,vless_service_id) values($1,'development','Fixture','fixture-panel',502)", [pool]);
  await db.query("insert into server_operation_runtime_bindings values('development',$1,'fixture-db','fixture-panel',$2)",
    [pool, Object.fromEntries(['digitalocean', 'vultr', 'lightnode'].map(p => [p, `${p}-fixture-account`]))]);
  // Existing protected live mirror has no lifecycle authority. Migration must not adopt/backfill it.
  await db.query(`insert into vpn_servers(id,name,provider,host_ip,panel_url,environment,access_pool_id,panel_node_id,
    supported_protocols,lifecycle_protected,ownership_provenance,marzneshin_service_ids,marzneshin_vless_service_ids)
    values($1,'Protected mirror','lightnode','198.51.100.30','fixture-panel','development',$2,30,array['vless'],true,
      $3,'{}',array[502])`, [mirror, pool, { purpose: 'owner_authorized_shared_node_customer_access', method: 'adopted',
      environment: scope[0], access_pool_id: pool, panel_node_id: 30, panel_identity: scope[3],
      verified_at: '2026-11-01T00:00:00Z', ss_service_ids: [] }]);
  const protectedNode = { ...scopeBody, kind: 'node', id: '30', protected: true,
    method: 'owner_authorized_access_adoption', serverId: mirror };
  await db.query(`insert into server_infrastructure_resources(environment,access_pool_id,database_identity,panel_identity,kind,resource_id,body)
    values($1,$2,$3,$4,'node','30',$5)`, [...scope, protectedNode]);
  const old = {};
  for (const provider of ['digitalocean', 'vultr']) {
    const id = await operation(provider), intent = intentFor(id, provider);
    await claim(id, provider, intent);
    const receipt = { ...intent, kind: 'provider', id: `${provider}-resource`, createdAt: '2026-01-01T00:00:00Z', protected: false };
    await register(id, provider, receipt, intent);
    old[provider] = { id, intent, receipt };
  }
  const before = await snapshot(), beforeFunctions = await functions();
  const baseline = process.argv.includes('--baseline');
  if (!baseline) {
    const sql = await fs.readFile(new URL('0062_lightnode_infrastructure.sql', root), 'utf8');
    await db.exec(sql);
    await db.exec(sql);
  }
  await check('migration/reapplication preserves old rows, protected LightNode mirror, bindings and every RPC definition/ACL', async () => {
    assert.deepEqual(await snapshot(), before);
    assert.deepEqual(await functions(), beforeFunctions);
  });
  await check('DO/Vultr intent replay and exact receipt registration still work', async () => {
    for (const [provider, { id, intent, receipt }] of Object.entries(old)) {
      assert.equal(await claim(id, provider, intent), false);
      assert.deepEqual(await register(id, provider, receipt, intent), receipt);
    }
  });
  const id = await operation('lightnode'), intent = intentFor(id, 'lightnode');
  const receipt = { ...intent, kind: 'provider', id: randomUUID(), addresses: ['198.51.100.20'], createdAt: '2026-11-01T00:00:00Z', protected: false };
  await check('LightNode claim is fenced, scoped, account-bound and at most once', async () => {
    await assert.rejects(claim(id, 'lightnode', { ...intent, accountId: 'other' }), /RESOURCE_SCOPE_MISMATCH/);
    await assert.rejects(claim(id, 'lightnode', intent, ['production', ...scope.slice(1)]), /RESOURCE_SCOPE_MISMATCH/);
    await assert.rejects(claim(id, 'lightnode', { ...intent, quoteHash: 'changed' }), /RESOURCE_SCOPE_MISMATCH/);
    assert.equal(await claim(id, 'lightnode', intent), true);
    assert.equal(await claim(id, 'lightnode', { ...intent, nonce: randomUUID() }), false);
    assert.deepEqual(await rpc('read_server_provider_intent', [...scope, id, 'lightnode']), intent);
  });
  await check('LightNode registration requires exact intent, account, scope, lease and immutable receipt', async () => {
    await assert.rejects(register(id, 'lightnode', receipt, intent, 2), /STALE_FENCE/);
    for (const changed of [{ ...receipt, accountId: 'other' }, { ...receipt, poolId: randomUUID() }, { ...receipt, planId: 'other' }]) {
      await assert.rejects(register(id, 'lightnode', changed, intent), /RESOURCE_SCOPE_MISMATCH/);
    }
    await assert.rejects(register(id, 'lightnode', receipt, { ...intent, nonce: randomUUID() }), /RESOURCE_SCOPE_MISMATCH/);
    assert.deepEqual(await register(id, 'lightnode', receipt, intent), receipt);
    assert.deepEqual(await register(id, 'lightnode', receipt, intent), receipt);
    await assert.rejects(register(id, 'lightnode', { ...receipt, addresses: ['198.51.100.99'] }, intent), /OWNERSHIP_REGISTRATION_CONFLICT/);
    const unclaimed = await operation('lightnode');
    await assert.rejects(register(unclaimed, 'lightnode', { ...receipt, id: randomUUID(), operationId: unclaimed }, null), /RESOURCE_SCOPE_MISMATCH/);
  });
  await check('original named checks reject unknown providers and empty create provider; panel receipts keep empty provider', async () => {
    for (const provider of ['unknown', '']) {
      const invalid = await operation(provider);
      await assert.rejects(claim(invalid, provider, intentFor(invalid, provider)), /RESOURCE_SCOPE_MISMATCH|server_provider_create_intents_provider_check/);
      await assert.rejects(db.query(`insert into server_provider_create_intents(operation_id,provider,nonce,body) values($1,$2,$3,'{}')`,
        [invalid, provider, randomUUID()]), /server_provider_create_intents_provider_check/);
    }
    await assert.rejects(db.query(`insert into server_infrastructure_resources(environment,access_pool_id,database_identity,panel_identity,kind,provider,resource_id,body)
      values($1,$2,$3,$4,'node','unknown','unknown','{}')`, scope), /server_infrastructure_resources_provider_check/);
    const node = { ...scopeBody, operationId: id, protected: false, kind: 'node', id: '20', provider_resource_id: receipt.id };
    assert.deepEqual(await rpc('register_server_infrastructure_resource', [...scope, id, owner, 1, 'node', '20', '', node, null]), node);
  });
  await check('new LightNode UUID candidate uses common registration/publication and global VLESS service without SS', async () => {
    const candidate = await rpc('ensure_server_operation_candidate', [...scope, id, owner, 1, {
      name: 'Fixture candidate', provider: 'lightnode', region: 'tokyo', provider_resource_id: receipt.id, panel_node_id: 20,
      host_ip: '198.51.100.20', panel_url: scope[3], panel_public_url: scope[3], panel_username: 'fixture',
      panel_password_encrypted: 'synthetic', max_active_keys: 10, marzneshin_service_ids: [],
    }]);
    assert.equal(candidate.provider_resource_id, receipt.id);
    assert.equal(candidate.droplet_id, null);
    assert.equal(candidate.lifecycle_protected, false);
    assert.deepEqual(candidate.marzneshin_service_ids, []);
    assert.deepEqual(candidate.marzneshin_vless_service_ids, [502]);
    const published = await rpc('publish_server_operation_candidate', [...scope, id, owner, 1,
      candidate.id, 20, receipt.id, new Date().toISOString()]);
    assert.equal(published.status, 'active');
    assert.equal(published.is_active, true);
  });
  await check('LightNode protected mirror retirement and adoption remain forbidden and unchanged', async () => {
    await assert.rejects(rpc('register_server_infrastructure_resource', [...scope, id, owner, 1, 'node', '30', '',
      { ...scopeBody, kind: 'node', id: '30', protected: false, operationId: id, provider_resource_id: receipt.id }, null]), /OWNERSHIP_REGISTRATION_CONFLICT/);
    assert.deepEqual(await rpc('read_server_infrastructure_resource', [...scope, 'node', '30', '']), protectedNode);
    await assert.rejects(rpc('retire_server_operation_resource', [...scope, id, owner, 1, mirror, 'live-mirror', 30]), /RESOURCE_SCOPE_MISMATCH/);
    // Adoption's busy guard must not mask the explicit provider enum guard.
    await db.query("update server_operations set status='completed',lease_until=null");
    await db.query('delete from server_operation_locks');
    const expected = await rpc('inspect_existing_node_adoption', [...scope, mirror]);
    const document = { version: 1, scope: scopeBody, serverId: mirror, lifecycle: false, expected,
      provider: { provider: 'lightnode', id: 'live-mirror', accountId: 'lightnode-fixture-account', createdAt: '2026-01-01T00:00:00Z', addresses: ['198.51.100.30'] },
      node: { id: 30, address: '198.51.100.30' }, supportedProtocols: ['vless'], ssServiceIds: [], publicServiceId: 502, receipts: [] };
    for (const lifecycle of [false, true]) {
      const text = JSON.stringify({ ...document, lifecycle, sshHostKeySha256: `SHA256:${'a'.repeat(43)}` });
      const hash = createHash('sha256').update(text).digest('hex');
      await assert.rejects(rpc('adopt_existing_node', [...scope, text, hash, null]), /RESOURCE_SCOPE_MISMATCH/);
    }
    const current = (await db.query('select to_jsonb(s) value from vpn_servers s where id=$1', [mirror])).rows[0].value;
    assert.deepEqual(current, before.servers[0]);
  });
  await check('private table privileges and service-role-only mutation RPC grants are unchanged', async () => {
    for (const role of ['anon', 'authenticated', 'service_role']) {
      for (const table of ['server_provider_create_intents', 'server_infrastructure_resources']) {
        assert.equal((await db.query(`select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') allowed`, [role, table])).rows[0].allowed, false);
      }
    }
    assert.deepEqual(await functions(), beforeFunctions);
  });
  console.log(`${passed} PostgreSQL-engine checks passed`);
} catch (error) { console.error(error.message, error.where || ''); process.exitCode = 1; }
finally { await db.close(); }
