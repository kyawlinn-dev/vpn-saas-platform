import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const { PGlite } = await import(process.env.PGLITE_MODULE_PATH || './pglite-runtime/node_modules/@electric-sql/pglite/dist/index.js');
const db = new PGlite();
const root = new URL('../../../supabase/migrations/', import.meta.url);
const pool = randomUUID(), owner = randomUUID(), origin = randomUUID(), deletion = randomUUID(), other = randomUUID(), server = randomUUID();
const scope = ['development', pool, 'fixture-db', 'fixture-panel'];
const rpc = async (name, args) => (await db.query(`select ${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) value`, args)).rows[0].value;
const body = (kind, id, extra = {}, operationId = origin) => ({ environment: scope[0], poolId: pool,
  databaseIdentity: scope[2], panelIdentity: scope[3], operationId, protected: false, kind, id: String(id), ...extra });
const node = body('node', 51, { provider_resource_id: 'vps-1' });
const inbound = body('inbound', 61, { panel_node_id: 51 });
const host = body('host', 71, { node_id: 51, inbound_id: 61 });
const service = body('service', 81, { node_ids: [51], inbound_ids: [61], protocol: 'vless' });
const register = (receipt, operation = receipt.operationId) => rpc('register_server_infrastructure_resource',
  [...scope, operation, owner, 1, receipt.kind, receipt.id, '', receipt, null]);
const archive = (receipt, operation = deletion, overrides = {}) => {
  const args = [...scope, operation, owner, 1, receipt.kind, receipt.id, receipt];
  for (const [index, value] of Object.entries(overrides)) args[Number(index)] = value;
  return rpc('archive_server_panel_resource', args);
};
const read = receipt => rpc('read_server_infrastructure_resource', [...scope, receipt.kind, receipt.id, '']);
const audit = async () => (await db.query('select * from server_panel_resource_archive order by archived_at')).rows;
const rejected = (promise, pattern = /RESOURCE_SCOPE_MISMATCH/) => assert.rejects(promise, pattern);
const finish = (operation, status = 'completed') => rpc('release_server_operation', [...scope, operation, owner, 1, status]);
const retireSource = () => rpc('retire_server_operation_resource', [...scope, deletion, owner, 1, server, 'vps-1', 51]);
async function prepareCandidate() {
  await db.query('update server_operations set payload=$1 where id=$2',
    [{ provider: 'digitalocean', region: 'fixture-region', supported_protocols: ['vless'] }, other]);
  const provider = body('provider', '222', { provider: 'digitalocean', addresses: ['198.51.100.22'] }, other);
  // Synthetic owned provider receipt; no provider API or create intent is executed.
  await db.query(`insert into server_infrastructure_resources(environment,access_pool_id,database_identity,panel_identity,
    kind,provider,resource_id,operation_id,body) values($1,$2,$3,$4,'provider','digitalocean','222',$5,$6)`, [...scope, other, provider]);
  return body('node', 51, { provider_resource_id: '222', addresses: ['198.51.100.22'] }, other);
}
const ensureCandidate = () => rpc('ensure_server_operation_candidate', [...scope, other, owner, 1, {
  name: 'Recycled candidate', provider: 'digitalocean', region: 'fixture-region', provider_resource_id: '222',
  panel_node_id: 51, host_ip: '198.51.100.22', panel_url: scope[3], panel_public_url: scope[3],
  panel_username: 'fixture', panel_password_encrypted: 'synthetic', max_active_keys: 10, marzneshin_service_ids: [],
}]);
let passed = 0, failed = 0;
let inCheck = false;
const query = db.query.bind(db);
// Expected SQL errors must not abort the surrounding isolated test transaction.
db.query = async (...args) => {
  if (!inCheck) return query(...args);
  await db.exec('savepoint assertion_query');
  try {
    const result = await query(...args);
    await db.exec('release savepoint assertion_query');
    return result;
  } catch (error) {
    await db.exec('rollback to savepoint assertion_query');
    await db.exec('release savepoint assertion_query');
    throw error;
  }
};
async function check(name, fn) {
  await db.exec('begin');
  inCheck = true;
  try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
  finally { inCheck = false; await db.exec('rollback'); }
}
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table vpn_servers(id uuid primary key default gen_random_uuid(),name text,provider text,region text,droplet_id bigint,host_ip text,
      status text default 'active',is_active boolean default true,is_default boolean default false,sort_order integer default 0,
      panel_type text default 'marzneshin',marzneshin_service_ids integer[],marzneshin_vless_service_ids integer[],marzneshin_vless_trial_service_ids integer[],
      panel_url text,panel_public_url text,panel_username text,panel_password_encrypted text,server_tier text,last_error text,
      current_active_keys integer default 0,max_active_keys integer,updated_at timestamptz);
    create table vpn_keys(id uuid primary key,server_id uuid,order_id uuid,status text,deleted_at timestamptz);
    create table vpn_orders(id uuid primary key);
    create table token_server_assignments(id uuid primary key,vpn_key_id uuid,server_id uuid,is_active boolean);`);
  // 0043 requires the real database-owned counter trigger; 0021 supplies it.
  for (const name of (await fs.readdir(root)).filter(n => /^(0021|004[0-6])_/.test(n)).sort()) {
    await db.exec(await fs.readFile(new URL(name, root), 'utf8'));
  }
  await db.query("insert into server_access_pools(id,environment,name,panel_identity,vless_service_id) values($1,'development','Fixture','fixture-panel',502)", [pool]);
  await db.query("insert into server_operation_runtime_bindings values('development',$1,'fixture-db','fixture-panel','{}')", [pool]);
  for (const [id, kind, payload] of [[origin, 'add', {}], [other, 'add', {}],
    [deletion, 'move_retire', { source_server_id: server, confirmations: { delete_source: true } }]]) {
    await db.query(`insert into server_operations(id,environment,access_pool_id,database_identity,panel_identity,kind,
      idempotency_key,payload_hash,payload,status,lease_owner,lease_until,fence)
      values($1::uuid,$2,$3,$4,$5,$6,$1::uuid::text,repeat('a',64),$7,'running',$8,clock_timestamp()+interval '1 hour',1)`,
    [id, ...scope, kind, payload, owner]);
  }
  await db.query(`insert into vpn_servers(id,environment,access_pool_id,panel_node_id,provider_resource_id,supported_protocols,
    marzneshin_service_ids,lifecycle_protected,ownership_provenance) values($1,'development',$2,51,'vps-1',array['vless'],array[]::integer[],false,$3)`,
  [server, pool, { method: 'provisioned', environment: scope[0], access_pool_id: pool, panel_identity: scope[3],
    panel_node_id: 51, provider_resource_id: 'vps-1', operation_id: origin, verified_at: new Date().toISOString() }]);
  await db.query("insert into server_operation_locks(environment,access_pool_id,resource_key,operation_id) values('development',$1,$2,$3)", [pool, `server:${server}`, deletion]);
  for (const receipt of [node, inbound, host, service]) await register(receipt);
  const beforeMigration = (await db.query('select jsonb_agg(to_jsonb(r)) value from server_infrastructure_resources r')).rows[0].value;
  const definition = (await db.query("select pg_get_functiondef('read_server_infrastructure_resource(text,uuid,text,text,text,text,text)'::regprocedure) value")).rows[0].value;
  if (!process.argv.includes('--baseline')) {
    const sql = await fs.readFile(new URL('0057_panel_resource_retirement.sql', root), 'utf8');
    await db.exec(sql);
    await db.exec(sql); // Migration reapplication must preserve all receipts.
    assert.deepEqual((await db.query('select jsonb_agg(to_jsonb(r) - array[\'retired_at\',\'deletion_operation_id\']) value from server_infrastructure_resources r')).rows[0].value, beforeMigration);
    assert.equal((await db.query("select pg_get_functiondef('read_server_infrastructure_resource(text,uuid,text,text,text,text,text)'::regprocedure) value")).rows[0].value, definition);
  }
  await check('unarchived reused ID still conflicts (0045 root cause)', async () => {
    await rejected(register({ ...node, operationId: other }, other), /OWNERSHIP_REGISTRATION_CONFLICT/);
    assert.deepEqual(await read(node), node);
  });
  for (const kindReceipt of [host, service, inbound, node]) {
    await check(`${kindReceipt.kind}: archive, recovery read, recycle, stale retry and audit`, async () => {
      assert.deepEqual(await archive(kindReceipt), kindReceipt);
      assert.deepEqual(await archive(kindReceipt), kindReceipt);
      assert.deepEqual(await read(kindReceipt), kindReceipt, 'Recovery proof remains readable');
      const rows = await audit();
      assert.equal(rows.length, 1);
      assert.deepEqual(rows[0].body, kindReceipt);
      assert.equal(rows[0].operation_id, origin);
      assert.equal(rows[0].deletion_operation_id, deletion);
      assert.ok(rows[0].archived_at);
      assert.deepEqual(await register(kindReceipt), kindReceipt, 'Old create retry cannot clear retirement');
      const next = { ...kindReceipt, operationId: other, incarnation: 2 };
      await rejected(register(next), /OWNERSHIP_REGISTRATION_CONFLICT/);
      assert.deepEqual(await read(kindReceipt), kindReceipt);
      await finish(deletion);
      assert.deepEqual(await register(next), next);
      assert.deepEqual(await register(next), next);
      await rejected(archive(kindReceipt), /STALE_FENCE/);
      await rejected(archive(kindReceipt, origin), /OWNERSHIP_REGISTRATION_CONFLICT/);
      assert.deepEqual(await read(next), next);
      assert.deepEqual(await audit(), rows);
    });
  }
  await check('own Add cleanup blocks same-operation reuse until cancellation then distinct Add', async () => {
    await archive(service, origin);
    await rejected(register({ ...service, incarnation: 2 }), /OWNERSHIP_REGISTRATION_CONFLICT/);
    assert.deepEqual(await read(service), service);
    await finish(origin, 'cancelled');
    const next = { ...service, incarnation: 2, operationId: other };
    assert.deepEqual(await register(next), next);
    await rejected(archive(service, other), /OWNERSHIP_REGISTRATION_CONFLICT/);
  });
  await check('own Replace cancellation/private cleanup', async () => {
    await db.query("update server_operations set kind='replace' where id=$1", [origin]);
    await archive(service, origin);
    await archive(service, origin);
    assert.equal((await audit()).length, 1);
  });
  await check('source Replace retirement and node-last subtree audit', async () => {
    await db.query("update server_operations set kind='replace' where id=$1", [deletion]);
    for (const receipt of [host, service, inbound, node]) await archive(receipt);
    for (const receipt of [host, service, inbound, node]) await archive(receipt);
    assert.equal((await audit()).length, 4);
    assert.deepEqual(await read(node), node);
  });
  await check('missing current registry permits only identical same-deletion-operation replay', async () => {
    await archive(service, origin);
    await db.query("delete from server_infrastructure_resources where kind='service' and resource_id='81'");
    assert.deepEqual(await archive(service, origin), service);
    await rejected(archive({ ...service, incarnation: 2 }, origin), /OWNERSHIP_REGISTRATION_CONFLICT/);
    await rejected(archive(service, deletion), /OWNERSHIP_REGISTRATION_CONFLICT/);
  });
  await check('different deletion operation cannot replay an existing tombstone', async () => {
    await archive(service, origin);
    await rejected(archive(service, deletion), /OWNERSHIP_REGISTRATION_CONFLICT/);
    assert.equal((await audit()).length, 1);
  });
  await check('multiple incarnations preserve every exact receipt and creation timestamp', async () => {
    const firstCreated = (await db.query("select created_at from server_infrastructure_resources where kind='service'")).rows[0].created_at;
    await archive(service, origin);
    await finish(origin, 'cancelled');
    const second = { ...service, incarnation: 2, operationId: other };
    await register(second);
    await archive(second, other);
    await finish(other);
    const thirdOperation = randomUUID();
    await db.query(`insert into server_operations(id,environment,access_pool_id,database_identity,panel_identity,kind,
      idempotency_key,payload_hash,payload,status,lease_owner,lease_until,fence)
      values($1::uuid,$2,$3,$4,$5,'add',$1::uuid::text,repeat('b',64),'{}','running',$6,clock_timestamp()+interval '1 hour',1)`,
    [thirdOperation, ...scope, owner]);
    const third = { ...service, incarnation: 3, operationId: thirdOperation };
    await register(third);
    await rejected(archive(second, thirdOperation), /OWNERSHIP_REGISTRATION_CONFLICT/);
    const rows = await audit();
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map(row => row.body), [service, second]);
    assert.deepEqual(rows[0].created_at, firstCreated);
    assert.deepEqual(await read(third), third);
  });
  await check('replacement preserves original proof until deletion completed or cancelled ONLY', async () => {
    await archive(node);
    const next = { ...node, operationId: other, incarnation: 2 };
    for (const status of ['queued', 'running', 'blocked', 'paused', 'partial', 'failed']) {
      await db.query('update server_operations set status=$1 where id=$2', [status, deletion]);
      await rejected(register(next), /OWNERSHIP_REGISTRATION_CONFLICT/);
      assert.deepEqual(await read(node), node);
    }
    for (const status of ['completed', 'cancelled']) {
      await db.exec('savepoint terminal');
      await db.query('update server_operations set status=$1 where id=$2', [status, deletion]);
      assert.deepEqual(await register(next), next);
      await db.exec('rollback to savepoint terminal');
    }
  });
  await check('terminal deletion status must match exact receipt scope', async () => {
    await archive(node);
    await finish(deletion);
    const next = { ...node, operationId: other, incarnation: 2 };
    for (const [column, value] of [['database_identity', 'foreign-db'], ['panel_identity', 'foreign-panel']]) {
      await db.exec('savepoint foreign_deleter');
      await db.query(`update server_operations set ${column}=$1 where id=$2`, [value, deletion]);
      await rejected(register(next), /OWNERSHIP_REGISTRATION_CONFLICT/);
      assert.deepEqual(await read(node), node);
      await db.exec('rollback to savepoint foreign_deleter');
    }
  });
  await check('0046 creates recycled node candidate after explicit archive and terminal retirement', async () => {
    const next = await prepareCandidate();
    const historical = (await db.query('select * from vpn_servers where id=$1', [server])).rows[0];
    await retireSource();
    await rejected(register(next), /OWNERSHIP_REGISTRATION_CONFLICT/);
    await archive(node);
    assert.deepEqual(await read(node), node);
    await finish(deletion);
    await register(next);
    const candidate = await ensureCandidate();
    assert.notEqual(candidate.id, server);
    assert.equal(candidate.panel_node_id, 51);
    assert.equal(candidate.status, 'provisioning');
    assert.equal(candidate.is_active, false);
    assert.equal((await ensureCandidate()).id, candidate.id);
    const retained = (await db.query('select * from vpn_servers where id=$1', [server])).rows[0];
    assert.equal(retained.status, 'decommissioned');
    assert.equal(retained.is_active, false);
    assert.deepEqual(retained.ownership_provenance, historical.ownership_provenance);
    assert.equal(retained.provider_resource_id, historical.provider_resource_id);
    assert.equal((await db.query('select count(*)::int n from vpn_servers where panel_node_id=51')).rows[0].n, 2);
    assert.deepEqual((await audit())[0].body, node);
    await rejected(archive(node, other), /OWNERSHIP_REGISTRATION_CONFLICT/);
  });
  await check('0046 duplicate active/provisioning/activeflag/unknown rows remain blocked', async () => {
    const next = await prepareCandidate();
    await archive(node);
    await finish(deletion);
    await register(next);
    for (const [status, isActive] of [['active', true], ['active', false], ['provisioning', false],
      ['decommissioned', true], ['decommissioned', null], [null, false]]) {
      await db.exec('savepoint duplicate');
      await db.query('update vpn_servers set status=$1,is_active=$2 where id=$3', [status, isActive, server]);
      await rejected(ensureCandidate(), /duplicate key value violates unique constraint/);
      assert.equal((await db.query('select count(*)::int n from vpn_servers')).rows[0].n, 1);
      await db.exec('rollback to savepoint duplicate');
    }
  });
  await check('forged tombstone cannot release an ID without matching archive', async () => {
    await db.query("update server_infrastructure_resources set retired_at=clock_timestamp(),deletion_operation_id=$1 where kind='service'", [deletion]);
    await rejected(register({ ...service, incarnation: 2 }), /OWNERSHIP_REGISTRATION_CONFLICT/);
    await rejected(archive(service), /OWNERSHIP_REGISTRATION_CONFLICT/);
  });
  await check('terminal old origin receipts remain untouched without explicit retirement', async () => {
    await db.query("update server_operations set status='completed',lease_owner=null,lease_until=null where id=$1", [origin]);
    await rejected(register({ ...service, operationId: other }), /OWNERSHIP_REGISTRATION_CONFLICT/);
    assert.deepEqual(await read(service), service);
    assert.equal((await audit()).length, 0);
    await archive(service); // A new authorized source operation can explicitly retire it.
  });
  await check('changed expected body and missing receipt fail closed', async () => {
    await rejected(archive({ ...node, address: 'changed' }), /OWNERSHIP_REGISTRATION_CONFLICT/);
    await rejected(archive(body('node', 999)), /OWNERSHIP_REGISTRATION_CONFLICT/);
    assert.equal((await audit()).length, 0);
  });
  await check('foreign environment/pool/database/panel and receipt scope', async () => {
    for (const [index, value] of [[0, 'production'], [1, randomUUID()], [2, 'foreign-db'], [3, 'foreign-panel']]) {
      await rejected(archive(node, deletion, { [index]: value }));
    }
    await rejected(archive({ ...node, databaseIdentity: 'foreign-db' }));
  });
  await check('foreign current registry and operation identities fail closed', async () => {
    await db.query("update server_infrastructure_resources set database_identity='foreign-db' where kind='service'");
    await rejected(archive(service));
    await rejected(register({ ...service, incarnation: 2 }), /OWNERSHIP_REGISTRATION_CONFLICT/);
    await db.query("update server_infrastructure_resources set database_identity=$1 where kind='service'", [scope[2]]);
    await db.query("update server_operations set panel_identity='foreign-panel' where id=$1", [deletion]);
    await rejected(archive(service));
  });
  await check('wrong owner, fence, expired and terminal leases including replay', async () => {
    await archive(service, origin);
    await rejected(archive(service, origin, { 5: randomUUID() }), /STALE_FENCE/);
    await rejected(archive(service, origin, { 6: 2 }), /STALE_FENCE/);
    await db.query("update server_operations set lease_until=clock_timestamp()-interval '1 second' where id=$1", [origin]);
    await rejected(archive(service, origin), /LEASE_EXPIRED/);
    await db.query("update server_operations set lease_until=clock_timestamp()+interval '1 hour',status='cancelled' where id=$1", [origin]);
    await rejected(archive(service, origin), /INVALID_OPERATION/);
  });
  await check('cross-operation Add cannot archive source or candidate', async () => {
    for (const receipt of [node, inbound, host, service]) await rejected(archive(receipt, other));
  });
  await check('protected/missing protection/global VLESS/non-panel receipts', async () => {
    for (const [kind, id, extra] of [['host', 72, { protected: true }], ['host', 73, { protected: null }],
      ['service', 502, {}], ['server', 'synthetic-server', {}]]) {
      const receipt = body(kind, id, extra);
      await register(receipt);
      await rejected(archive(receipt, origin), /PROTECTED_RESOURCE|RESOURCE_SCOPE_MISMATCH/);
    }
    assert.equal((await audit()).length, 0);
  });
  await check('source lock, source confirmation, unrelated source, provider and provenance required', async () => {
    const mutations = [
      ['delete from server_operation_locks', []],
      ["update server_operations set payload=jsonb_set(payload,'{confirmations,delete_source}','false') where id=$1", [deletion]],
      ["update server_operations set payload=jsonb_set(payload,'{source_server_id}',to_jsonb($2::text)) where id=$1", [deletion, randomUUID()]],
      ["update server_infrastructure_resources set body=jsonb_set(body,'{provider_resource_id}','\"foreign\"') where kind='node'", []],
      ["update server_infrastructure_resources set operation_id=$1 where kind='node'", [other]],
    ];
    for (const [sql, args] of mutations) {
      await db.exec('savepoint negative');
      await db.query(sql, args);
      await rejected(archive(service));
      await db.exec('rollback to savepoint negative');
    }
  });
  await check('source receipt ancestry rejects missing, foreign and mixed parents', async () => {
    for (const receipt of [body('inbound', 62, { panel_node_id: 99 }), body('host', 72, { node_id: 51, inbound_id: 999 }),
      body('host', 73, { node_id: 99, inbound_id: 61 }), body('service', 82, { node_ids: [51, 99], inbound_ids: [61] }),
      body('service', 83, { node_ids: [51], inbound_ids: [61, 999] }), body('service', 84, { node_ids: [51], inbound_ids: [] }),
      body('service', 85, { node_ids: [51], inbound_ids: [61] }, other)]) {
      await register(receipt);
      await rejected(archive(receipt));
    }
  });
  await check('source child cannot borrow a protected or foreign-origin inbound', async () => {
    for (const patch of [{ protected: true }, { operationId: other }, { databaseIdentity: 'foreign-db' }, { panel_node_id: 99 }]) {
      await db.exec('savepoint bad_parent');
      await db.query("update server_infrastructure_resources set body=body||$1::jsonb where kind='inbound'", [patch]);
      for (const receipt of [host, service]) await rejected(archive(receipt));
      await db.exec('rollback to savepoint bad_parent');
    }
  });
  await check('Shadowsocks private service uses the same source ancestry gate', async () => {
    const receipt = body('service', 82, { node_ids: [51], inbound_ids: [61], protocol: 'shadowsocks' });
    await register(receipt);
    await archive(receipt);
    assert.deepEqual((await audit())[0].body, receipt);
  });
  await check('protected/adopted source blocks own-operation and source deletion', async () => {
    for (const adopted of [false, true]) {
      await db.exec('savepoint protected_source');
      await db.query('delete from server_operation_locks');
      await db.query(`update vpn_servers set lifecycle_protected=$1,
        ownership_provenance=jsonb_set(ownership_provenance,'{method}',to_jsonb($2::text)) where id=$3`, [!adopted, adopted ? 'adopted' : 'provisioned', server]);
      await db.query("insert into server_operation_locks(environment,access_pool_id,resource_key,operation_id) values('development',$1,$2,$3)", [pool, `server:${server}`, deletion]);
      for (const receipt of [node, inbound, host, service]) {
        await rejected(archive(receipt), /PROTECTED_RESOURCE|RESOURCE_SCOPE_MISMATCH/);
        await rejected(archive(receipt, origin), /PROTECTED_RESOURCE|RESOURCE_SCOPE_MISMATCH/);
      }
      await db.exec('rollback to savepoint protected_source');
    }
  });
  await check('private archive and service-role-only fenced RPC; audit append-only', async () => {
    await archive(service, origin);
    for (const role of ['anon', 'authenticated', 'service_role']) {
      await db.exec(`set local role ${role}`);
      await rejected(db.query('select * from server_panel_resource_archive'), /permission denied/);
      await rejected(db.query('delete from server_panel_resource_archive'), /permission denied/);
      if (role !== 'service_role') await rejected(archive(node, origin), /permission denied/);
      else assert.deepEqual(await archive(service, origin), service);
      await db.exec('reset role');
    }
    await rejected(db.query("update server_panel_resource_archive set body='{}'"), /ARCHIVE_APPEND_ONLY/);
    await rejected(db.query('delete from server_panel_resource_archive'), /ARCHIVE_APPEND_ONLY/);
    await rejected(db.query('truncate server_panel_resource_archive'), /ARCHIVE_APPEND_ONLY/);
  });
  console.log(`${passed} passed; ${failed} failed. Synthetic PGlite only; no network, panel or shared database calls.`);
  if (failed) process.exitCode = 1;
} finally { await db.close(); }
