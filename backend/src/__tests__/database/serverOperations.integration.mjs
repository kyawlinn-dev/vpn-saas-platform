// Opt-in, finite SQL tests. Creates/removes only its own random fixture schema.
// No dotenv, remote databases, service startup or shared Supabase access.
import pg from "pg";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const uri = process.env.LOCAL_TEST_DATABASE_URL;
if (!uri) { console.error("NOT RUN: LOCAL_TEST_DATABASE_URL is absent; no database contacted."); process.exit(77); }
const url = new URL(uri);
if (!["postgres:", "postgresql:"].includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !/^novanet_lifecycle_test(?:_[a-z0-9_]+)?$/.test(url.pathname.slice(1)) || url.search) throw new Error("Refusing non-local/non-disposable SQL target");
const schema = `novanet_fixture_${randomUUID().replaceAll("-", "")}`;
const clients = [];
const connect = async () => {
  const c = new pg.Client({ connectionString: uri, connectionTimeoutMillis: 3000, statement_timeout: 5000 });
  await c.connect(); clients.push(c);
  const identity = (await c.query("select current_database() name,inet_server_addr()::text address")).rows[0];
  assert.equal(identity.name, url.pathname.slice(1)); assert.ok(["127.0.0.1", "::1"].includes(identity.address));
  await c.query(`set search_path=${schema},pg_temp`);
  return c;
};
let created = false, checks = 0;
const primary = await connect();
try {
  const roles = (await primary.query("select rolname from pg_roles where rolname=any($1)", [["anon", "authenticated", "service_role"]])).rows;
  assert.equal(roles.length, 3, "Owner must supply Supabase-compatible roles; this harness never creates cluster-wide roles");
  await primary.query(`create schema ${schema}`); created = true;
  await primary.query(`create table server_access_pools(id uuid primary key,environment text,panel_identity text,unique(id,environment));
    create table vpn_servers(id uuid primary key,environment text,access_pool_id uuid,current_active_keys integer default 0,max_active_keys integer default 10,last_error text,updated_at timestamptz,is_active boolean default true,status text default 'active',supported_protocols text[] default array['shadowsocks','vless']);
    create table vpn_orders(id uuid primary key,reseller_id uuid,status text,customer_id uuid,expiry_date date,quota_limit_bytes bigint,usage_baseline_bytes bigint,payment_status text,review_status text);
    create table vpn_keys(id uuid primary key default gen_random_uuid(),server_id uuid,order_id uuid,customer_id uuid,reseller_id uuid,
      key_name text,data_limit_bytes bigint,used_bytes bigint,status text,protocol text,outline_key_id text,access_url text,
      key_credentials jsonb,is_used boolean,used_at timestamptz,deleted_at timestamptz,updated_at timestamptz);
    create table token_server_assignments(id uuid primary key,vpn_key_id uuid,server_id uuid,is_active boolean);`);
  for (const file of ["0020_acid_purchase_rpcs.sql", "0021_server_counter_trigger.sql", "0041_server_operations.sql", "0042_server_operation_coordination.sql", "0043_server_operation_access_moves.sql", "0044_server_operation_commands.sql"]) {
    const sql = (await fs.readFile(new URL(`../../../supabase/migrations/${file}`, import.meta.url), "utf8"))
      .replace(/\bpublic\./g, `${schema}.`).replace(/search_path\s*=\s*public/g, `search_path=${schema}`).replace(/n\.nspname='public'/g, `n.nspname='${schema}'`);
    await primary.query(sql);
  }
  const pool = randomUUID(), server = randomUUID(), order = randomUUID(), reseller = randomUUID(), customer = randomUUID();
  const scope = ["development", pool, "fixture-db", "fixture-panel"];
  await primary.query("insert into server_access_pools values($1,'development','fixture-panel')", [pool]);
  await primary.query("insert into server_operation_runtime_bindings values('development',$1,'fixture-db','fixture-panel')", [pool]);
  await primary.query("insert into vpn_servers(id,environment,access_pool_id) values($1,'development',$2)", [server, pool]);
  await primary.query("insert into vpn_orders(id,reseller_id,status,customer_id,expiry_date,quota_limit_bytes,usage_baseline_bytes) values($1,$2,'active',$3,'2099-01-01',1000,0)", [order, reseller, customer]);
  const other = await connect();
  const rpc = async (client, name, args) => (await client.query(`select * from ${schema}.${name}(${args.map((_, i) => `$${i + 1}`).join(",")})`, args)).rows[0];
  const request = [...scope, "replace", "same-request", { source_server_id: server }, "a".repeat(64)];
  await primary.query("begin");
  const first = await rpc(primary, "create_server_operation", request);
  let secondFinished = false;
  const duplicate = rpc(other, "create_server_operation", request).then(row => { secondFinished = true; return row; });
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(secondFinished, false, "Concurrent duplicate must wait for the idempotency lock");
  await primary.query("commit");
  assert.equal((await duplicate).id, first.id); checks++;
  await assert.rejects(rpc(primary, "create_server_operation", [...request.slice(0, 6), { source_server_id: server, changed: true }, "b".repeat(64)]), /IDEMPOTENCY_CONFLICT/); checks++;
  const owner = randomUUID(), nextOwner = randomUUID();
  const lease = await rpc(primary, "claim_server_operation", [...scope, first.id, owner, 30]);
  await assert.rejects(rpc(other, "claim_server_operation", [...scope, first.id, nextOwner, 30]), /LEASE_BUSY/); checks++;
  await primary.query("update server_operations set lease_until=clock_timestamp()-interval '1 second' where id=$1", [first.id]);
  const takeover = await rpc(other, "claim_server_operation", [...scope, first.id, nextOwner, 30]);
  assert.equal(Number(takeover.fence), Number(lease.fence) + 1); checks++;
  await assert.rejects(rpc(primary, "checkpoint_server_operation", [...scope, first.id, owner, lease.fence, "inventory", "running", {}]), /STALE_FENCE/); checks++;
  await assert.rejects(rpc(primary, "read_server_operation", ["production", ...scope.slice(1), first.id]), /RESOURCE_SCOPE_MISMATCH/); checks++;
  await assert.rejects(rpc(primary, "create_server_operation", [...scope, "replace", "competing-source", { source_server_id: server }, "c".repeat(64)]), /SERVER_MIGRATION_IN_PROGRESS/); checks++;
  await assert.rejects(rpc(primary, "reserve_pending_key", [order, customer, reseller, server, "fixture", 100, "shadowsocks"]), /SERVER_MIGRATION_IN_PROGRESS/);
  assert.equal((await primary.query("select current_active_keys from vpn_servers where id=$1", [server])).rows[0].current_active_keys, 0); checks++;
  await rpc(other, "release_server_operation", [...scope, first.id, nextOwner, takeover.fence, "cancelled"]);
  const destination = randomUUID(), key = randomUUID();
  await primary.query("insert into vpn_servers(id,environment,access_pool_id) values($1,'development',$2)", [destination, pool]);
  await primary.query("insert into vpn_keys(id,server_id,order_id,customer_id,reseller_id,status,protocol,outline_key_id,access_url,data_limit_bytes,used_bytes) values($1,$2,$3,$4,$5,'active','shadowsocks','same-user','same-link',1000,42)", [key, server, order, customer, reseller]);
  await primary.query("insert into token_server_assignments values($1,$2,$3,true)", [randomUUID(), key, server]);
  const move = await rpc(primary, "create_server_operation", [...scope, "move_retire", "move-key", { source_server_id: server, destination_server_id: destination }, "e".repeat(64)]);
  const moveLease = await rpc(primary, "claim_server_operation", [...scope, move.id, owner, 30]);
  const access = (await rpc(primary, "read_server_operation_access", [...scope, move.id, owner, moveLease.fence, key, order, reseller, customer])).read_server_operation_access;
  await rpc(primary, "move_server_operation_key", [...scope, move.id, owner, moveLease.fence, key, order, reseller, customer, server, destination, access.key, access.order]);
  const moved = (await primary.query("select * from vpn_keys where id=$1", [key])).rows[0];
  assert.equal(moved.server_id, destination); assert.equal(moved.access_url, "same-link"); assert.equal(Number(moved.used_bytes), 42); checks++;
  const counters = (await primary.query("select id,current_active_keys from vpn_servers order by id")).rows;
  assert.equal(counters.find(r => r.id === server).current_active_keys, 0); assert.equal(counters.find(r => r.id === destination).current_active_keys, 1); checks++;
  await rpc(primary, "repair_server_operation_assignments", [...scope, move.id, owner, moveLease.fence, key, order, reseller, customer, destination]);
  assert.equal((await primary.query("select server_id from token_server_assignments where vpn_key_id=$1", [key])).rows[0].server_id, destination); checks++;
  await rpc(primary, "release_server_operation", [...scope, move.id, owner, moveLease.fence, "cancelled"]);
  const guard = randomUUID();
  await assert.rejects(rpc(primary, "acquire_server_customer_mutation", [...scope, randomUUID(), [`order:${order}`], randomUUID()]), /RESOURCE_SCOPE_MISMATCH/); checks++;
  await rpc(primary, "acquire_server_customer_mutation", [...scope, guard, [`server:${server}`], null]);
  await primary.query("update server_customer_mutation_guards set lease_until=clock_timestamp()-interval '1 second' where guard_id=$1", [guard]);
  await assert.rejects(rpc(other, "create_server_operation", [...scope, "replace", "uncertain-mutation", { source_server_id: server }, "d".repeat(64)]), /SERVER_MIGRATION_IN_PROGRESS/); checks++;
  await primary.query("begin");
  await primary.query("set local role authenticated");
  await assert.rejects(primary.query(`select * from ${schema}.server_operations`), error => error.code === "42501");
  await primary.query("rollback"); checks++;
  console.log(JSON.stringify({ sql_checks_passed: checks, simultaneous_connections: 2, fixture_schema_removed_on_exit: true }));
} finally {
  for (const c of clients) await c.query("rollback").catch(() => {});
  for (const c of clients.slice(1)) await c.end();
  if (created) await primary.query(`drop schema ${schema} cascade`);
  await primary.end();
}
