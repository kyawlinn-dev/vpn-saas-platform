import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const { PGlite } = await import(process.env.PGLITE_MODULE_PATH || './pglite-runtime/node_modules/@electric-sql/pglite/dist/index.js');
const db = new PGlite();
const tenant = '00000000-0000-4000-8000-000000000001';
const customer = '00000000-0000-4000-8000-000000000002';
const plan = '00000000-0000-4000-8000-000000000003';
const owner = '00000000-0000-4000-8000-000000000004';
const otherTenant = '00000000-0000-4000-8000-000000000005';
const call = async (name, args) => (await db.query(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) as result`, args)).rows[0].result;
const clock = async value => db.query("select set_config('test.clock', $1, false)", [value]);

try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create function test_now() returns timestamptz language sql stable as $$ select current_setting('test.clock')::timestamptz $$;
    create table resellers(id uuid primary key,status text);
    create table vpn_customers(id uuid primary key,reseller_id uuid,status text);
    create table reseller_miniapps(reseller_id uuid,is_enabled boolean,trial_enabled boolean,trial_duration_days integer,trial_data_limit_gb integer,trial_protocol text);
    create table vpn_plans(id uuid primary key,is_trial boolean,is_active boolean,sort_order integer,duration_days integer,data_limit_gb numeric);
    create table vpn_orders(id uuid primary key default gen_random_uuid(),customer_id uuid,reseller_id uuid,plan_id uuid,status text,
      price_mmk integer,commission_percent numeric,commission_amount_mmk integer,start_date date,expiry_date date,payment_status text,
      activated_at timestamptz,total_paid_mmk integer,order_type text,review_status text,source text,quota_limit_bytes bigint);
    create table customer_trial_claims(reseller_id uuid,customer_id uuid,order_id uuid,plan_snapshot jsonb,protocol text,
      provision_status text default 'ready',provision_owner uuid,primary key(reseller_id,customer_id));
    create table telegram_links(id uuid,customer_id uuid,reseller_id uuid,trial_used_at timestamptz,trial_order_id uuid,updated_at timestamptz,telegram_username text);
    insert into resellers values ('${tenant}','active'),('${otherTenant}','active');
    insert into vpn_customers values ('${customer}','${tenant}','active');
    insert into reseller_miniapps values ('${tenant}',true,true,1,2,'shadowsocks');
    insert into vpn_plans values ('${plan}',true,true,1,99,99);`);
  const sql = await fs.readFile(new URL('../../../supabase/migrations/0056_myanmar_trial_cutoff.sql', import.meta.url), 'utf8');
  // Inject a clock only in this disposable database; production SQL retains now().
  await db.exec(sql.replaceAll('now()', 'test_now()'));

  for (const [now, grantDay, expiryDay] of [
    ['2026-10-28T18:00:00Z', '2026-10-29', '2026-10-30'],
    ['2026-12-31T18:00:00Z', '2027-01-01', '2027-01-02'],
    ['2028-02-28T18:00:00Z', '2028-02-29', '2028-03-01'],
  ]) {
    await db.exec('truncate customer_trial_claims,vpn_orders,telegram_links');
    await clock(now);
    const created = await call('create_customer_trial', [tenant, customer, 'messenger', null, null]);
    assert.equal(created.created, true);
    assert.equal(created.order.start_date, grantDay, 'Grant starts on the Bangkok calendar day during grace');
    assert.equal(created.order.expiry_date, expiryDay, 'Configured trial days retain calendar semantics');
    assert.equal(created.plan.duration_days, 1, 'Trial settings still override catalogue duration');
    assert.equal(created.order.quota_limit_bytes, 2 * 1024 ** 3);
    await db.query('update vpn_orders set expiry_date=$1 where id=$2', [now.slice(0, 10), created.order.id]);
    const base = now.slice(0, 10);
    await clock(`${base}T21:29:59.999Z`);
    assert.equal((await call('customer_trial_eligibility', [tenant, customer])).recoverable, true);
    const recovered = await call('create_customer_trial', [tenant, customer, 'messenger', null, null]);
    assert.equal(recovered.created, false);
    assert.equal(recovered.order.id, created.order.id, 'Recovery reuses the consumed trial');
    assert.equal(await call('claim_trial_provisioning', [tenant, customer, created.order.id, owner]), true);
    await db.exec("update customer_trial_claims set provision_status='ready',provision_owner=null");
    await clock(`${base}T21:30:00Z`);
    assert.equal((await call('customer_trial_eligibility', [tenant, customer])).recoverable, false);
    assert.deepEqual(await call('create_customer_trial', [tenant, customer, 'messenger', null, null]),
      { order: null, plan: null, created: false, reason: 'already_used' });
    await assert.rejects(call('claim_trial_provisioning', [tenant, customer, created.order.id, owner]), /TRIAL_NOT_AUTHORIZED/);
    assert.equal((await db.query('select count(*)::int as count from vpn_orders')).rows[0].count, 1);
  }
  await clock('2028-02-28T18:00:00Z');
  assert.equal((await call('customer_trial_eligibility', [otherTenant, customer])).reason, 'inactive_account');
  await assert.rejects(call('claim_trial_provisioning', [otherTenant, customer, (await db.query('select id from vpn_orders')).rows[0].id, owner]), /TRIAL_NOT_AUTHORIZED/);
  await db.exec('truncate customer_trial_claims,vpn_orders,telegram_links');
  await db.query('insert into telegram_links(customer_id,reseller_id,trial_used_at) values($1,$2,test_now())', [customer, tenant]);
  assert.equal((await call('customer_trial_eligibility', [tenant, customer])).reason, 'already_used', 'Telegram history still consumes the trial');
  assert.equal((await call('create_customer_trial', [tenant, customer, 'messenger', null, null])).created, false);
  for (const signature of ['customer_trial_eligibility(uuid,uuid)', 'create_customer_trial(uuid,uuid,text,uuid,text)', 'claim_trial_provisioning(uuid,uuid,uuid,uuid)']) {
    const result = await db.query("select has_function_privilege('anon',$1,'EXECUTE') as anon,has_function_privilege('authenticated',$1,'EXECUTE') as authenticated,has_function_privilege('service_role',$1,'EXECUTE') as service", [signature]);
    assert.deepEqual(result.rows[0], { anon: false, authenticated: false, service: true });
  }
  console.log('PASS: trial recovery/provisioning grace and exact cutoff, calendar grants, year/leap rollover, history, tenancy, permissions');
} finally { await db.close(); }
