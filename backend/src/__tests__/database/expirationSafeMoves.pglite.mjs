import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const { PGlite } = await import(process.env.PGLITE_MODULE_PATH || './pglite-runtime/node_modules/@electric-sql/pglite/dist/index.js');
const db = new PGlite();
const root = new URL('../../../supabase/migrations/', import.meta.url);
const moveSql = 'select move_server_operation_key($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) as key';
let checks = 0;

async function state() {
  const result = {};
  for (const table of ['vpn_keys', 'vpn_orders', 'access_tokens', 'token_server_assignments', 'vpn_servers', 'server_operations', 'server_operation_locks']) {
    result[table] = (await db.query(`select to_jsonb(t) as row from ${table} t order by to_jsonb(t)::text`)).rows;
  }
  return result;
}

async function fixture({ protocol = 'vless', expiry = '2000-01-01', orderStatus = 'active', keyStatus = 'active',
  deleted = false, destinationActive = true, destinationStatus = 'active', destinationProtocols = ['shadowsocks', 'vless'], full = false } = {}) {
  const pool = randomUUID(), source = randomUUID(), destination = randomUUID(), customer = randomUUID();
  const reseller = randomUUID(), order = randomUUID(), key = randomUUID(), token = randomUUID(), owner = randomUUID();
  const scope = ['development', pool, 'fixture-db', 'fixture-panel-' + pool];
  await db.query("insert into server_access_pools(id,environment,name,panel_identity,vless_service_id) values($1,'development','DEV',$2,14)", [pool, scope[3]]);
  await db.query("insert into server_operation_runtime_bindings values('development',$1,'fixture-db',$2)", [pool, scope[3]]);
  for (const [id, node, protocols] of [[source, 51, ['shadowsocks', 'vless']], [destination, 52, destinationProtocols]]) {
    const services = protocols.includes('shadowsocks') ? [node] : [];
    await db.query(`insert into vpn_servers(id,name,environment,access_pool_id,panel_node_id,supported_protocols,marzneshin_service_ids,
      ownership_provenance,is_active,status,max_active_keys) values($1,'fixture','development',$2,$3,$4,$5,$6,$7,$8,$9)`,
    [id, pool, node, protocols, services,
      { method: 'adopted', environment: 'development', access_pool_id: pool, panel_node_id: node,
        panel_identity: scope[3], ss_service_ids: services, verified_at: new Date().toISOString() },
      id === source || destinationActive, id === source ? 'active' : destinationStatus, full && id === destination ? 1 : 100]);
  }
  await db.query('insert into vpn_orders values($1,$2,$3,$4,$5,1000,123,\'paid\',\'confirmed\')', [order, reseller, customer, orderStatus, expiry]);
  await db.query(`insert into vpn_keys(id,server_id,order_id,customer_id,reseller_id,key_name,status,protocol,outline_key_id,
    access_url,data_limit_bytes,used_bytes,key_credentials,ssconf_token,deleted_at)
    values($1,$2,$3,$4,$5,'stable key',$6,$7,'unchanged-user','https://fixture.invalid/sub/stable',877,456,
      '{"subscription_token":"stable-credential","enabled":false}','stable-key-token',$8)`,
  [key, source, order, customer, reseller, keyStatus, protocol, deleted ? '2000-01-01T00:00:00Z' : null]);
  if (full) {
    await db.query(`insert into vpn_keys(id,server_id,order_id,customer_id,reseller_id,status,protocol,used_bytes)
      values($1,$2,$3,$4,$5,'active',$6,0)`, [randomUUID(), destination, order, customer, reseller, protocol]);
  }
  await db.query("insert into access_tokens values($1,$2,$3,$4,'stable-access-token','active',$5)", [token, customer, reseller, order, expiry]);
  await db.query('insert into token_server_assignments values($1,$2,$3,$4,true,now())', [randomUUID(), token, key, source]);
  const { rows: [op] } = await db.query('select * from create_server_operation($1,$2,$3,$4,$5,$6,$7,$8)',
    [...scope, 'move_retire', randomUUID(), { source_server_id: source, destination_server_id: destination }, 'a'.repeat(64)]);
  const { rows: [lease] } = await db.query('select * from claim_server_operation($1,$2,$3,$4,$5,$6,$7)', [...scope, op.id, owner, 300]);
  const { rows: [snapshots] } = await db.query(`select to_jsonb(k) as key,to_jsonb(o) as "order"
    from vpn_keys k join vpn_orders o on o.id=k.order_id where k.id=$1`, [key]);
  const args = [...scope, op.id, owner, lease.fence, key, order, reseller, customer, source, destination, snapshots.key, snapshots.order];
  return { source, destination, key, order, args, snapshots,
    move: (values = args) => db.query(moveSql, values),
    mutate: async (sql, values) => {
      await db.exec('begin');
      try {
        await db.query('select begin_server_operation_write($1,$2,$3,$4,$5,$6,$7)', args.slice(0, 7));
        await db.query(sql, values);
        await db.exec('commit');
      } catch (error) {
        await db.exec('rollback');
        throw error;
      }
    } };
}

async function rejected(f, pattern, args = f.args) {
  const before = await state();
  await assert.rejects(f.move(args), pattern);
  assert.deepEqual(await state(), before, 'Rejected move must leave customer rows, locks and counters unchanged');
  checks++;
}

async function moved(f) {
  const before = await state();
  let result;
  await db.exec('set role service_role');
  try { ({ rows: [result] } = await f.move()); } finally { await db.exec('reset role'); }
  assert.deepEqual(result.key, { ...f.snapshots.key, server_id: f.destination }, 'Only the server anchor may change');
  const after = await state();
  for (const table of ['vpn_orders', 'access_tokens', 'token_server_assignments', 'server_operations', 'server_operation_locks']) {
    assert.deepEqual(after[table], before[table], `${table} must be preserved`);
  }
  assert.equal(after.vpn_keys.length, before.vpn_keys.length);
  for (const { row } of after.vpn_keys) {
    const original = before.vpn_keys.find(item => item.row.id === row.id).row;
    assert.deepEqual(row, row.id === f.key ? { ...original, server_id: f.destination } : original,
      'Key identity, link, credentials, tokens, quota and usage must survive');
  }
  const { rows: counters } = await db.query(`select s.id,s.current_active_keys,
    (select count(*)::integer from vpn_keys k where k.server_id=s.id and k.status in ('active','pending')) as actual
    from vpn_servers s where s.id=any($1::uuid[]) order by s.id`, [[f.source, f.destination]]);
  for (const row of counters) {
    assert.equal(row.current_active_keys, row.actual, 'Counter must equal active + pending keys');
    assert.equal(row.current_active_keys, row.id === f.source ? 0 : 1, 'Trigger must transfer one occupied slot');
  }
  for (const { row } of after.vpn_servers) {
    const original = before.vpn_servers.find(item => item.row.id === row.id).row;
    assert.deepEqual(row, row.id === f.source || row.id === f.destination
      ? { ...original, current_active_keys: row.id === f.source ? 0 : 1, updated_at: row.updated_at } : original);
  }
  await f.move();
  assert.deepEqual(await state(), after, 'Retry must not transfer counters twice');
  checks++;
}

try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table vpn_servers(id uuid primary key,name text,panel_type text default 'marzneshin',marzneshin_service_ids integer[],
      status text default 'active',is_active boolean default true,current_active_keys integer default 0,max_active_keys integer default 100,updated_at timestamptz);
    create table vpn_orders(id uuid primary key,reseller_id uuid,customer_id uuid,status text,expiry_date date,quota_limit_bytes bigint,usage_baseline_bytes bigint,payment_status text,review_status text);
    create table vpn_keys(id uuid primary key default gen_random_uuid(),server_id uuid,order_id uuid,customer_id uuid,reseller_id uuid,key_name text,
      data_limit_bytes bigint,used_bytes bigint,status text,protocol text,outline_key_id text,access_url text,key_credentials jsonb,ssconf_token text,
      is_used boolean,used_at timestamptz,deleted_at timestamptz,updated_at timestamptz);
    create table access_tokens(id uuid primary key,customer_id uuid,reseller_id uuid,order_id uuid,token text,status text,expires_at timestamptz);
    create table token_server_assignments(id uuid primary key,token_id uuid not null references access_tokens(id),
      vpn_key_id uuid references vpn_keys(id),server_id uuid references vpn_servers(id),is_active boolean,created_at timestamptz default now(),unique(token_id,server_id));`);
  for (const name of ['0020_acid_purchase_rpcs.sql', '0021_server_counter_trigger.sql', '0040_public_server_access.sql',
    '0041_server_operations.sql', '0042_server_operation_coordination.sql', '0043_server_operation_access_moves.sql']) {
    await db.exec(await fs.readFile(new URL(name, root), 'utf8'));
  }

  const expired = await fixture();
  await rejected(expired, /ACCESS_STATE_CHANGED/);
  console.log('RED reproduced: 0043 rejects unchanged active access with expiry 2000-01-01.');
  const beforeMigration = await state();
  const { rows: [beforeFunction] } = await db.query("select oid,proacl::text as acl from pg_proc where proname='move_server_operation_key'");
  await db.exec(await fs.readFile(new URL('0055_expiration_safe_server_moves.sql', root), 'utf8'));
  assert.deepEqual(await state(), beforeMigration, 'Applying migration alone must not change customer or server rows');
  const { rows: [afterFunction] } = await db.query("select oid,proacl::text as acl from pg_proc where proname='move_server_operation_key'");
  assert.deepEqual(afterFunction, beforeFunction, 'Replace in place and preserve existing role privileges');
  await moved(expired);

  const { rows: [dates] } = await db.query(`select to_char((clock_timestamp() at time zone 'Asia/Bangkok')::date,'YYYY-MM-DD') as today,
    to_char((clock_timestamp() at time zone 'Asia/Bangkok')::date-1,'YYYY-MM-DD') as yesterday,
    to_char((clock_timestamp() at time zone 'Asia/Bangkok')::date+7,'YYYY-MM-DD') as future`);
  for (const protocol of ['shadowsocks', 'vless']) {
    for (const expiry of ['2000-01-01', dates.yesterday, dates.today, dates.future]) {
      const f = await fixture({ protocol, expiry, destinationProtocols: protocol === 'vless' ? ['vless'] : ['shadowsocks', 'vless'] });
      await moved(f);
    }
  }

  for (const options of [{ expiry: null }, { orderStatus: 'expired' }, { orderStatus: 'stopped' }, { orderStatus: 'scheduled' },
    { keyStatus: 'deleted' }, { deleted: true }]) {
    await rejected(await fixture(options), /ACCESS_STATE_CHANGED/);
  }
  for (const options of [{ destinationActive: false }, { destinationStatus: 'provisioning' }, { destinationStatus: 'error' }]) {
    await rejected(await fixture(options), /DESTINATION_NOT_READY/);
  }
  await rejected(await fixture({ protocol: 'shadowsocks', destinationProtocols: ['vless'] }), /DESTINATION_PROTOCOL_MISMATCH/);
  const capacity = await fixture({ full: true });
  await rejected(capacity, { message: /capacity exceeded/, code: '23514' });

  const guarded = await fixture();
  for (const [index, value, error] of [[0, 'production', /RESOURCE_SCOPE_MISMATCH/], [1, randomUUID(), /RESOURCE_SCOPE_MISMATCH/],
    [2, 'wrong-db', /RESOURCE_SCOPE_MISMATCH/], [3, 'wrong-panel', /RESOURCE_SCOPE_MISMATCH/],
    [4, randomUUID(), /OPERATION_NOT_FOUND/], [5, randomUUID(), /STALE_FENCE/], [6, Number(guarded.args[6]) + 1, /STALE_FENCE/],
    [7, randomUUID(), /ACCESS_STATE_CHANGED/], [8, randomUUID(), /ACCESS_STATE_CHANGED/],
    [9, randomUUID(), /ACCESS_STATE_CHANGED/], [10, randomUUID(), /ACCESS_STATE_CHANGED/],
    [11, guarded.destination, /RESOURCE_SCOPE_MISMATCH/], [12, randomUUID(), /RESOURCE_SCOPE_MISMATCH/]]) {
    await rejected(guarded, error, guarded.args.map((v, i) => i === index ? value : v));
  }

  // Each field comparison must continue rejecting stale expected snapshots.
  for (const [index, fields] of [[13, ['id', 'order_id', 'customer_id', 'reseller_id', 'outline_key_id', 'protocol', 'status', 'deleted_at', 'access_url', 'data_limit_bytes']],
    [14, ['id', 'customer_id', 'reseller_id', 'status', 'expiry_date', 'quota_limit_bytes', 'usage_baseline_bytes', 'payment_status', 'review_status']]]) {
    for (const field of fields) {
      const expected = { ...guarded.args[index], [field]: 'stale-snapshot' };
      await rejected(guarded, /ACCESS_STATE_CHANGED/, guarded.args.map((v, i) => i === index ? expected : v));
    }
  }
  for (const [column, value] of [['expiry_date', '2001-01-01'], ['quota_limit_bytes', 2000], ['usage_baseline_bytes', 999],
    ['payment_status', 'overdue'], ['review_status', 'rejected'], ['status', 'expired']]) {
    const f = await fixture();
    await f.mutate(`update vpn_orders set ${column}=$1 where id=$2`, [value, f.order]);
    await rejected(f, /ACCESS_STATE_CHANGED/);
  }
  const usage = await fixture();
  await usage.mutate('update vpn_keys set used_bytes=789 where id=$1', [usage.key]);
  await moved({ ...usage, snapshots: { ...usage.snapshots, key: { ...usage.snapshots.key, used_bytes: 789 } } });

  const pending = await fixture();
  await pending.mutate("update vpn_keys set status='pending' where id=$1", [pending.key]);
  await rejected(pending, /ACCESS_STATE_CHANGED/);
  for (const side of ['source', 'destination']) {
    const unlocked = await fixture();
    await db.query('delete from server_operation_locks where operation_id=$1 and resource_key=$2', [unlocked.args[4], 'server:' + unlocked[side]]);
    await rejected(unlocked, /RESOURCE_SCOPE_MISMATCH/);
  }
  const counterBefore = await state();
  await assert.rejects(db.query('update vpn_servers set current_active_keys=0 where id=$1', [capacity.destination]), /SERVER_MIGRATION_IN_PROGRESS/);
  assert.deepEqual(await state(), counterBefore, 'Ordinary writes cannot tamper with locked counters to bypass capacity');
  checks++;
  const lease = await fixture();
  await db.query("update server_operations set lease_until=clock_timestamp()-interval '1 second' where id=$1", [lease.args[4]]);
  await rejected(lease, /LEASE_EXPIRED/);
  for (const status of ['completed', 'cancelled', 'failed']) {
    const f = await fixture();
    await db.query('update server_operations set status=$1 where id=$2', [status, f.args[4]]);
    await rejected(f, /INVALID_OPERATION/);
  }
  for (const role of ['anon', 'authenticated']) {
    const before = await state();
    await db.exec(`set role ${role}`);
    try { await assert.rejects(guarded.move(), /permission denied/); } finally { await db.exec('reset role'); }
    assert.deepEqual(await state(), before);
    checks++;
  }
  console.log(`PASS: ${checks} expiration-safe SQL cases; both protocols, preservation/retry, snapshots/status, scope/tenant/lease/locks, readiness/protocol, capacity rollback and role rejection.`);
  console.log('Local single-connection PostgreSQL WASM only; no live DB/network or multi-connection concurrency proof.');
} finally {
  await db.close();
}
