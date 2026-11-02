import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { payloadHash } from '../../services/infrastructure/repository.js';
const { PGlite } = await import(process.env.PGLITE_MODULE_PATH || './pglite-runtime/node_modules/@electric-sql/pglite/dist/index.js');
const db = new PGlite();
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table vpn_servers(id uuid primary key,panel_type text,marzneshin_service_ids integer[]);
    create table vpn_keys(id uuid primary key,server_id uuid,order_id uuid,status text);
    create table vpn_orders(id uuid primary key);`);
  const root = new URL('../../../supabase/migrations/', import.meta.url);
  for (const name of ['0040_public_server_access.sql', '0041_server_operations.sql',
    '0042_server_operation_coordination.sql', '0044_server_operation_commands.sql']) {
    await db.exec(await fs.readFile(new URL(name, root), 'utf8'));
  }
  const pool = randomUUID(), quoteId = randomUUID();
  const scope = ['development', pool, 'fixture-db', 'fixture-panel'];
  await db.query("insert into server_access_pools(id,environment,name,panel_identity,vless_service_id) values($1,'development','DEV','fixture-panel',502)", [pool]);
  await db.query("insert into server_operation_runtime_bindings values('development',$1,'fixture-db','fixture-panel')", [pool]);
  const expiresAt = new Date(Date.now() + 600000).toISOString();
  const choice = { kind: 'add', provider: 'digitalocean', region: 'sgp1', plan_id: 's-1vcpu-1gb', supported_protocols: ['shadowsocks', 'vless'] };
  const price = { provider: 'digitalocean', currency: 'USD', recurringAmount: 6 };
  const quote = { id: quoteId, environment: scope[0], poolId: pool, databaseIdentity: scope[2], panelIdentity: scope[3],
    kind: 'add', choice, price, deletionScope: null, expiresAt };
  await db.query('select store_server_operation_quote($1,$2,$3,$4,$5,$6::jsonb,$7)', [...scope, quoteId, quote, expiresAt]);
  const payload = { ...choice, quote_id: quoteId, quote: price, supported_protocols: choice.supported_protocols,
    delete_scope: null, request_hash: 'a'.repeat(64), confirmations: { cost: true, temporary_billing: false, delete_source: false } };
  const args = [...scope, quoteId, 'add', 'same-request', payload, payloadHash({ kind: 'add', payload })];
  const create = () => db.query('select create_quoted_server_operation($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9) value', args);
  const first = (await create()).rows[0].value;
  const second = (await create()).rows[0].value;
  assert.equal(first.id, second.id);
  assert.equal(first.status, 'queued');
  assert.equal((await db.query('select count(*)::int n from server_operations')).rows[0].n, 1);
  assert.equal((await db.query('select used_operation_id from server_operation_quotes where id=$1', [quoteId])).rows[0].used_operation_id, first.id);
  console.log('PASS quoted Add admission and same-request replay with actual lifecycle DDL. No external actions.');
  const lightId = randomUUID();
  const lightChoice = { ...choice, provider: 'lightnode', region: 'tha-bangkok-1', plan_id: 'intel-c1m2-bgp-t1000-s50-d0' };
  const lightPrice = { provider: 'lightnode', currency: 'USD', recurringAmount: null,
    trafficTerms: { included: 1000, unit: 'GB', billing: { kind: 'provider_pricing',
      source: 'https://doc.lightnode.com/Instance/Billingdescription.html' } } };
  const lightQuote = { ...quote, id: lightId, choice: lightChoice, price: lightPrice };
  await db.query('select store_server_operation_quote($1,$2,$3,$4,$5,$6::jsonb,$7)', [...scope, lightId, lightQuote, expiresAt]);
  const lightPayload = { ...payload, ...lightChoice, quote_id: lightId, quote: lightPrice };
  const admitLight = body => db.query('select create_quoted_server_operation($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9) value',
    [...scope, lightId, 'add', 'light-provider-pricing', body, payloadHash({ kind: 'add', payload: body })]);
  await assert.rejects(admitLight({ ...lightPayload, confirmations: { ...lightPayload.confirmations, cost: false } }), /CONFIRMATION_REQUIRED/);
  const light = (await admitLight(lightPayload)).rows[0].value;
  assert.equal(light.payload.quote.recurringAmount, null);
  assert.equal(light.payload.quote.trafficTerms.billing.kind, 'provider_pricing');
  assert.equal((await admitLight(lightPayload)).rows[0].value.id, light.id);
  console.log('PASS null monetary amount retains a real price object, mandatory billing confirmation and idempotent replay.');
} finally { await db.close(); }
