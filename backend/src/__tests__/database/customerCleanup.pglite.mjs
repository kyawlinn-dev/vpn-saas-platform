import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const {PGlite} = await import(process.env.PGLITE_MODULE_PATH || './pglite-runtime/node_modules/@electric-sql/pglite/dist/index.js');
const db = new PGlite();
const reseller = randomUUID(), otherReseller = randomUUID();
try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table resellers(id uuid primary key);
    create table vpn_customers(id uuid primary key,reseller_id uuid not null references resellers(id),unique(id,reseller_id));
    create table vpn_orders(id uuid primary key,customer_id uuid not null,reseller_id uuid not null,
      foreign key(customer_id,reseller_id) references vpn_customers(id,reseller_id),unique(id,reseller_id));
    create table vpn_keys(id uuid primary key,customer_id uuid,reseller_id uuid,order_id uuid references vpn_orders(id),status text,deleted_at timestamptz,
      foreign key(customer_id,reseller_id) references vpn_customers(id,reseller_id));
    create table access_tokens(id uuid primary key,customer_id uuid,reseller_id uuid,order_id uuid references vpn_orders(id),
      foreign key(customer_id,reseller_id) references vpn_customers(id,reseller_id));
    create table token_server_assignments(id uuid primary key,token_id uuid references access_tokens(id),vpn_key_id uuid references vpn_keys(id));
    create table telegram_links(id uuid primary key,customer_id uuid,reseller_id uuid,trial_order_id uuid references vpn_orders(id),
      foreign key(customer_id,reseller_id) references vpn_customers(id,reseller_id));
    create table commission_ledger(id uuid primary key,reseller_id uuid,order_id uuid references vpn_orders(id));
    create table order_payments(id uuid primary key,customer_id uuid,reseller_id uuid,order_id uuid references vpn_orders(id),review_status text,apply_status text,
      foreign key(customer_id,reseller_id) references vpn_customers(id,reseller_id));
    create table purchase_operations(id uuid primary key,customer_id uuid,reseller_id uuid,order_id uuid references vpn_orders(id),status text,
      foreign key(customer_id,reseller_id) references vpn_customers(id,reseller_id));
    create table dashboard_purchase_operations(id uuid primary key,customer_id uuid,reseller_id uuid,order_id uuid references vpn_orders(id),state text,
      foreign key(customer_id,reseller_id) references vpn_customers(id,reseller_id));
    create table notification_deliveries(id uuid primary key,reseller_id uuid,record_id uuid references vpn_orders(id));
    create table notifications_sent(id uuid primary key,customer_id uuid references vpn_customers(id),order_id uuid references vpn_orders(id));
    create table server_customer_mutation_guards(guard_id uuid primary key,status text,resource_keys text[]);`);
  const trialSql = await fs.readFile(new URL('../../../supabase/migrations/0060_telegram_shared_core.sql', import.meta.url), 'utf8');
  await db.exec(trialSql.slice(trialSql.indexOf('create table public.customer_trial_claims'), trialSql.indexOf('alter table public.customer_trial_claims')));
  await db.query('insert into resellers values($1),($2)', [reseller,otherReseller]);
  async function fixture(tenant = reseller, {order = true} = {}) {
    const customer = randomUUID(), orderId = order ? randomUUID() : null;
    await db.query('insert into vpn_customers values($1,$2)', [customer,tenant]);
    if (orderId) await db.query('insert into vpn_orders values($1,$2,$3)', [orderId,customer,tenant]);
    await db.query("insert into customer_trial_claims(reseller_id,customer_id,order_id,provision_status) values($1,$2,$3,'completed')", [tenant,customer,orderId]);
    await db.query('insert into telegram_links values($1,$2,$3,$4)', [randomUUID(),customer,tenant,orderId]);
    if (orderId) {
      for (const [table,stateColumn,state] of [['purchase_operations','status','completed'],['dashboard_purchase_operations','state','ready']]) {
        await db.query(`insert into ${table}(id,customer_id,reseller_id,order_id,${stateColumn}) values($1,$2,$3,$4,$5)`, [randomUUID(),customer,tenant,orderId,state]);
      }
      const key = randomUUID(), token = randomUUID();
      await db.query("insert into vpn_keys values($1,$2,$3,$4,'deleted',now())", [key,customer,tenant,orderId]);
      await db.query('insert into access_tokens values($1,$2,$3,$4)', [token,customer,tenant,orderId]);
      await db.query('insert into token_server_assignments values($1,$2,$3)', [randomUUID(),token,key]);
      await db.query("insert into order_payments values($1,$2,$3,$4,'pending_review','pending')", [randomUUID(),customer,tenant,orderId]);
      await db.query('insert into commission_ledger values($1,$2,$3)', [randomUUID(),tenant,orderId]);
      await db.query('insert into notification_deliveries values($1,$2,$3)', [randomUUID(),tenant,orderId]);
      await db.query('insert into notifications_sent values($1,$2,$3)', [randomUUID(),customer,orderId]);
    }
    return {customer,order:orderId,tenant};
  }
  const orphan = {customer:randomUUID(),tenant:reseller,order:null};
  await db.query('insert into vpn_customers values($1,$2)',[orphan.customer,reseller]);
  await db.query("insert into customer_trial_claims(reseller_id,customer_id,provision_status) values($1,$2,'completed')",[reseller,orphan.customer]);
  await assert.rejects(db.query('delete from vpn_customers where id=$1',[orphan.customer]), /customer_trial_claims/);
  const migration = await fs.readFile(new URL('../../../supabase/migrations/0061_telegram_customer_cleanup.sql', import.meta.url), 'utf8');
  await db.exec(migration); await db.exec(migration);
  const cleanup = async (f, overrides = {}) => (await db.query('select cleanup_test_customers($1,$2,$3,$4,$5,$6) as deleted',
    [overrides.tenant || f.tenant,overrides.customers || [f.customer],overrides.orders || (f.order?[f.order]:[]),
      overrides.confirmation ?? 'DELETE TEST CUSTOMERS',overrides.allowPaid ?? false,overrides.dryRun ?? false])).rows[0].deleted;
  const remains = async f => (await db.query('select count(*)::int n from vpn_customers where id=$1',[f.customer])).rows[0].n;
  const untouched = await fixture(otherReseller);
  const f = await fixture();
  assert.deepEqual(await cleanup(f,{dryRun:true}),{ready:true}); assert.equal(await remains(f),1);
  const deleted = await cleanup(f);
  for (const table of ['vpn_customers','customer_trial_claims','purchase_operations','dashboard_purchase_operations','vpn_orders','vpn_keys','order_payments','token_server_assignments','notifications_sent']) {
    assert.equal(deleted[table],1,table);
  }
  assert.equal(await remains(untouched),1);
  assert.equal((await cleanup(orphan)).customer_trial_claims,1,'Trial-only customers left by the old partial cleanup can be reset');
  const wrong = await fixture();
  await assert.rejects(cleanup(wrong,{tenant:otherReseller}),/CUSTOMER_CLEANUP_SCOPE_MISMATCH/);
  await assert.rejects(cleanup(wrong,{confirmation:'wrong'}),/INVALID_CUSTOMER_CLEANUP/);
  await assert.rejects(cleanup(wrong,{orders:[]}),/CUSTOMER_CLEANUP_CHANGED/);
  await db.query("update purchase_operations set status='processing' where customer_id=$1",[wrong.customer]);
  await assert.rejects(cleanup(wrong,{dryRun:true}),/CUSTOMER_CLEANUP_BUSY/);
  await db.query("update purchase_operations set status='completed' where customer_id=$1",[wrong.customer]);
  await db.query("update order_payments set review_status='confirmed',apply_status='applied' where customer_id=$1",[wrong.customer]);
  await assert.rejects(cleanup(wrong),/CUSTOMER_CLEANUP_PAID_CONFIRMATION_REQUIRED/);
  await db.query("update vpn_keys set status='active',deleted_at=null where customer_id=$1",[wrong.customer]);
  await assert.rejects(cleanup(wrong,{allowPaid:true}),/CUSTOMER_CLEANUP_ACCESS_NOT_STOPPED/);
  await db.query("update vpn_keys set status='deleted',deleted_at=now() where customer_id=$1",[wrong.customer]);
  await db.query("update customer_trial_claims set provision_status='processing' where customer_id=$1",[wrong.customer]);
  await assert.rejects(cleanup(wrong,{allowPaid:true,dryRun:true}),/CUSTOMER_CLEANUP_BUSY/);
  await db.query("update customer_trial_claims set provision_status='completed' where customer_id=$1",[wrong.customer]);
  assert.equal((await cleanup(wrong,{allowPaid:true})).vpn_customers,1);
  const rollback = await fixture();
  await db.exec(`create table unexpected_reference(customer_id uuid references vpn_customers(id));`);
  await db.query('insert into unexpected_reference values($1)',[rollback.customer]);
  await assert.rejects(cleanup(rollback),/unexpected_reference/);
  assert.equal(await remains(rollback),1);
  for (const table of ['customer_trial_claims','purchase_operations','vpn_keys','telegram_links']) {
    assert.equal((await db.query(`select count(*)::int n from ${table} where customer_id=$1`,[rollback.customer])).rows[0].n,1,`${table} rolled back`);
  }
  await db.exec('set role authenticated');
  await assert.rejects(cleanup(untouched),/permission denied/);
  await db.exec('reset role; set role service_role');
  assert.equal((await cleanup(untouched)).vpn_customers,1);
  console.log('PASS: reproduced trial FK; atomic cleanup and fresh-account reset; tenant/confirmation/paid/active/busy guards; changed-preview rejection; partial-old-cleanup recovery; transaction rollback; service-role-only execution. Synthetic PostgreSQL, no shared database or panel mutations.');
} finally {await db.close();}
