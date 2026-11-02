import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const { PGlite } = await import(process.env.PGLITE_MODULE_PATH || './pglite-runtime/node_modules/@electric-sql/pglite/dist/index.js');
const db = new PGlite();
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table vpn_servers(id uuid primary key, panel_type text, marzneshin_service_ids integer[]);
    create table vpn_keys(id uuid primary key, server_id uuid, status text);
    create table vpn_orders(id uuid primary key);`);
  const root = new URL('../../../supabase/migrations/', import.meta.url);
  for (const name of ['0040_public_server_access.sql', '0041_server_operations.sql',
    '0042_server_operation_coordination.sql', '0044_server_operation_commands.sql']) {
    await db.exec(await fs.readFile(new URL(name, root), 'utf8'));
  }
  const migration = await fs.readFile(new URL('0052_worker_runnable_pagination.sql', root), 'utf8');
  await db.exec(migration);
  await db.exec(migration); // The new migration can be reapplied locally.
  const poolId = randomUUID(), otherPool = randomUUID(), owner = randomUUID(), otherOwner = randomUUID();
  const scope = ['development', poolId, 'fixture-db', 'fixture-panel'];
  for (const [pool, environment] of [[poolId, 'development'], [otherPool, 'production']]) {
    await db.query('insert into server_access_pools(id,environment,name,panel_identity,vless_service_id) values($1,$2,$3,$4,502)',
      [pool, environment, 'Fixture', 'fixture-panel']);
    await db.query('insert into server_operation_runtime_bindings values($1,$2,$3,$4)', [environment, pool, 'fixture-db', 'fixture-panel']);
  }
  const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  const stamp = '2026-10-27T00:00:00.123456+00:00';
  for (let n = 1; n <= 145; n++) {
    await db.query(`insert into server_operations(id,environment,access_pool_id,database_identity,panel_identity,kind,idempotency_key,payload_hash,payload,created_at)
      values($1,$2,$3,$4,$5,'add',$6,$7,'{}',$8)`,
    [id(n), ...(n === 145 ? ['production', otherPool, ...scope.slice(2)] : scope), `op-${n}`, 'a'.repeat(64), stamp]);
  }
  await db.query("update server_operations set status='completed' where id=$1", [id(138)]);
  await db.query("update server_operations set checkpoint=jsonb_build_object('nextAttemptAt',(now()+interval '1 day')::text) where id=$1", [id(139)]);
  await db.query("update server_operations set lease_owner=$1,lease_until=now()+interval '1 day' where id=$2", [otherOwner, id(140)]);
  await db.query("update server_operations set lease_owner=$1,lease_until=now()+interval '1 day' where id=$2", [owner, id(141)]);
  await db.query("update server_operations set lease_owner=$1,lease_until=now()-interval '1 day' where id=$2", [otherOwner, id(142)]);
  await db.query("update server_operations set status='blocked' where id=$1", [id(143)]);
  await db.query("update server_operations set status='paused' where id=$1", [id(144)]);
  const page = async (cursor = null, args = scope, worker = owner, limit = 10) =>
    (await db.query('select value from list_runnable_server_operations($1,$2,$3,$4,$5,$6,$7,$8) value',
      [...args, limit, worker, cursor?.createdAt ?? null, cursor?.id ?? null])).rows.map(row => row.value);
  const all = []; let cursor;
  for (let n = 0; n < 20; n++) {
    const rows = await page(cursor);
    assert.ok(rows.length <= 10);
    if (!rows.length) break;
    all.push(...rows);
    cursor = { createdAt: rows.at(-1).created_at, id: rows.at(-1).id };
  }
  assert.deepEqual(all.map(row => row.id), [id(142), id(141), ...Array.from({ length: 137 }, (_, n) => id(137 - n))]);
  assert.ok(cursor.createdAt.includes('123456'), 'Cursor preserves PostgreSQL microseconds');
  assert.equal((await page())[0].id, id(142), 'Null cursor starts the next fair sweep');
  // Deleting a cursor row must not affect subsequent keyset pages.
  await db.query('delete from server_operations where id=$1', [id(128)]);
  assert.equal((await page({ createdAt: stamp, id: id(128) }))[0].id, id(127));
  await assert.rejects(page(null, ['production', ...scope.slice(1)]), /RESOURCE_SCOPE_MISMATCH/);
  await assert.rejects(page(null, [...scope.slice(0, 2), 'foreign-db', scope[3]]), /RESOURCE_SCOPE_MISMATCH/);
  await assert.rejects(page(null, [...scope.slice(0, 3), 'foreign-panel']), /RESOURCE_SCOPE_MISMATCH/);
  await assert.rejects(page({ id: id(1) }), /INVALID_OPERATION/);
  assert.ok((await page(null, scope, owner, 100000)).length <= 100, 'RPC bounds each page');
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(page(), /permission denied/);
    await db.exec('reset role');
  }
  await db.exec('set role service_role');
  assert.equal((await page())[0].id, id(142));
  await assert.rejects(page(null, [...scope.slice(0, 2), 'foreign-db', scope[3]]), /RESOURCE_SCOPE_MISMATCH/);
  console.log('PASS runnable keyset RPC: >100 rows, timestamp ties/microseconds, deleted cursor, scope isolation, leases/backoff/status filters, bounded pages and service-role-only execution. Single-connection PGlite only.');
} catch (error) {
  console.error(error.message, error.where || ''); process.exitCode = 1;
} finally { await db.close(); }
