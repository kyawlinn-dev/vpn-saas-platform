import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const { PGlite } = await import(process.env.PGLITE_MODULE_PATH || './pglite-runtime/node_modules/@electric-sql/pglite/dist/index.js');
const db = new PGlite();
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table vpn_servers(id uuid primary key,name text,panel_type text,marzneshin_service_ids integer[],display_city text,display_country text,flag_emoji text,region_code text,
      updated_at timestamptz,status text default 'active',is_active boolean default true,current_active_keys integer default 0,max_active_keys integer default 100);
    create table vpn_keys(id uuid primary key,server_id uuid,order_id uuid,status text,deleted_at timestamptz,outline_key_id text,access_url text,updated_at timestamptz);
    create table vpn_orders(id uuid primary key,reseller_id uuid,customer_id uuid,status text,expiry_date date);
    create table token_server_assignments(id uuid primary key,vpn_key_id uuid,server_id uuid,is_active boolean);`);
  const root = new URL('../../../supabase/migrations/', import.meta.url);
  for (const name of ['0020_acid_purchase_rpcs.sql', '0021_server_counter_trigger.sql', '0040_public_server_access.sql', '0041_server_operations.sql', '0042_server_operation_coordination.sql',
    '0043_server_operation_access_moves.sql', '0053_server_display_names.sql']) {
    await db.exec(await fs.readFile(new URL(name, root), 'utf8'));
  }
  const pool = randomUUID(), owner = randomUUID();
  const scope = ['development', pool, 'fixture-db', 'fixture-panel'];
  await db.query("insert into server_access_pools(id,environment,name,panel_identity,vless_service_id) values($1,'development','DEV','fixture-panel',14)", [pool]);
  await db.query("insert into server_operation_runtime_bindings values('development',$1,'fixture-db','fixture-panel')", [pool]);
  await db.query("insert into vpn_servers(id,name) values($1,'Singapore #5')", [randomUUID()]);
  let nodeId = 7;
  async function candidate() {
    nodeId++;
    const op = randomUUID(), server = randomUUID();
    await db.query(`insert into server_operations(id,environment,access_pool_id,database_identity,panel_identity,kind,idempotency_key,payload_hash,payload,status,lease_owner,lease_until,fence)
      values($1::uuid,$2,$3,$4,$5,'add',$1::uuid::text,$6,'{}','running',$7,now()+interval '1 hour',1)`, [op, ...scope, 'a'.repeat(64), owner]);
    await db.query(`insert into vpn_servers(id,name,panel_type,environment,access_pool_id,panel_node_id,provider_resource_id,supported_protocols,lifecycle_protected,ownership_provenance)
      values($1,'NovaNet sgp1 123','marzneshin',$2,$3,$5::integer,$5::integer::text,array['vless'],false,$4)`, [server, scope[0], pool,
      { method: 'provisioned', environment: scope[0], access_pool_id: pool, panel_identity: scope[3], panel_node_id: nodeId, provider_resource_id: String(nodeId), operation_id: op, verified_at: new Date().toISOString() }, nodeId]);
    await db.query("insert into server_operation_locks(environment,access_pool_id,resource_key,operation_id) values($1,$2,$3,$4)", [scope[0], pool, 'server:' + server, op]);
    return { op, server };
  }
  const first = await candidate(), second = await candidate();
  const call = async (c, city = 'Singapore', worker = owner) => (await db.query('select assign_server_operation_display($1,$2,$3,$4,$5,$6,1,$7,$8,$9,$10,$11) value',
    [...scope, c.op, worker, c.server, city, 'Singapore', 'SG', '🇸🇬'])).rows[0].value;
  assert.equal((await call(first)).name, 'Singapore #6');
  assert.equal((await call(first)).name, 'Singapore #6', 'Retry preserves the same public identity');
  assert.equal((await call(second)).name, 'Singapore #7');
  await assert.rejects(call(first, 'Singapore', randomUUID()), /STALE_FENCE/);
  await assert.rejects(call(first, 'Singapore\nInjected'), /SERVER_DISPLAY_INVALID/);
  await assert.rejects(call({ ...first, server: second.server }), /RESOURCE_SCOPE_MISMATCH/);
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`); await assert.rejects(call(first), /permission denied/); await db.exec('reset role');
  }
  console.log('PASS display allocation: scoped fenced operation, preserved historical numbers, distinct sequential allocation, idempotent retry, invalid labels, foreign operation and grants. Single-connection PGlite, not a concurrency stress test.');
} catch (error) { console.error(error.message, error.where || ''); process.exitCode = 1; }
finally { await db.close(); }
