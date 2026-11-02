// Explicit opt-in local PostgreSQL checks. No dotenv, Supabase or service startup.
import fs from "node:fs";
import assert from "node:assert/strict";
import pg from "pg";

const connectionString = process.env.LOCAL_TEST_DATABASE_URL;
if (!connectionString) {
  console.error("NOT RUN: provide an owner-started disposable LOCAL_TEST_DATABASE_URL; no database was contacted.");
  process.exit(77);
}
const url = new URL(connectionString);
const database = url.pathname.slice(1);
if (!["postgres:", "postgresql:"].includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !/^novanet_lifecycle_test(?:_[a-z0-9_]+)?$/.test(database) || url.search) {
  throw Error("Refusing non-local or non-disposable database; name must start novanet_lifecycle_test and URI must have no query overrides");
}
const client = new pg.Client({ connectionString, connectionTimeoutMillis: 3000, statement_timeout: 5000 });
await client.connect();
let checked = 0;
try {
  const identity = (await client.query("select current_database() as name, inet_server_addr()::text as address")).rows[0];
  assert.equal(identity.name, database);
  assert.ok(["127.0.0.1", "::1"].includes(identity.address));
  await client.query("begin");
  assert.equal((await client.query("select to_regclass('public.vpn_servers') as existing")).rows[0].existing, null, "Use an empty disposable database");
  await client.query(`do $$ begin
    if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
    if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
    if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
    end $$;
    create table public.vpn_servers(id uuid primary key default gen_random_uuid(),
      panel_type text not null default 'marzneshin', marzneshin_service_ids integer[]);
    grant select, insert, update on public.vpn_servers to service_role, authenticated;
    insert into public.vpn_servers default values;`);
  // Keep the fixture and migration inside one rolled-back transaction.
  const migration = fs.readFileSync(new URL("../../../supabase/migrations/0040_public_server_access.sql", import.meta.url), "utf8");
  await client.query(migration.replace(/^begin;\s*/i, "").replace(/commit;\s*$/i, ""));
  const legacy = (await client.query("select * from vpn_servers")).rows[0];
  assert.equal(legacy.environment, null); assert.equal(legacy.supported_protocols, null); assert.equal(legacy.lifecycle_protected, true); checked++;
  const pool = (await client.query("insert into server_access_pools(environment,name,panel_identity,vless_service_id) values ('development','DEV Public','test-panel',502) returning *")).rows[0];
  const owner = { method: "adopted", environment: "development", access_pool_id: pool.id, panel_identity: "test-panel", panel_node_id: 51, ss_service_ids: [501], verified_at: "2026-10-21T00:00:00Z" };
  const insert = (protocols, patch = {}, nodeId = 51) => client.query(`insert into vpn_servers
    (supported_protocols,environment,access_pool_id,panel_node_id,ownership_provenance,marzneshin_service_ids)
    values($1,$2,$3,$4,$5,$6) returning id`, [protocols, patch.environment || "development", pool.id, nodeId,
    { ...owner, panel_node_id: nodeId, ...patch }, protocols.includes("shadowsocks") ? [501] : []]);
  const reject = async (action, codes = ["23514"]) => {
    await client.query("savepoint invalid_case");
    await assert.rejects(action, error => codes.includes(error.code));
    await client.query("rollback to savepoint invalid_case"); checked++;
  };
  const adopted = (await insert(["shadowsocks", "vless"])).rows[0]; checked++;
  await insert(["vless"], {}, 52); checked++;
  for (const protocols of [[], ["shadowsocks"], ["vless", "vless"], ["hysteria2"], ["shadowsocks", "vless", "vless"]]) await reject(() => insert(protocols, {}, 60));
  await reject(() => insert(["vless"], { environment: "production" }, 61), ["23514", "23503"]);
  await reject(() => insert(["shadowsocks", "vless"]), ["23505"]);
  await reject(() => insert(["shadowsocks", "vless"], { ss_service_ids: [3] }, 62));
  await reject(() => insert(["vless"], { panel_identity: "other-panel" }, 63));
  await reject(() => insert(["vless"], { verified_at: "not-a-date" }, 64));
  await reject(() => insert(["vless"], { method: null }, 65));
  await reject(() => client.query("update server_access_pools set vless_service_id=999 where id=$1", [pool.id]));
  await client.query("set local role authenticated");
  await reject(() => client.query("select * from server_access_pools"), ["42501"]);
  await reject(() => client.query("update vpn_servers set lifecycle_protected=false where id=$1", [adopted.id]), ["42501"]);
  await reject(() => client.query("insert into server_access_pools(environment,name,panel_identity,vless_service_id) values('development','other','other',999)"), ["42501"]);
  await client.query("reset role");
  await client.query("set local role service_role");
  assert.equal((await client.query("select count(*)::int as n from server_access_pools")).rows[0].n, 1); checked++;
  await client.query("reset role");
  console.log(JSON.stringify({ sql_checks_passed: checked, database_changes_rolled_back: true, local_only: true }));
} finally {
  await client.query("rollback").catch(() => {});
  await client.end();
}
