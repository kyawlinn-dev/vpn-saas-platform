import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
const {PGlite}=await import(process.env.PGLITE_MODULE_PATH||'./pglite-runtime/node_modules/@electric-sql/pglite/dist/index.js');
const db=new PGlite({database:'postgres'});
const release=new URL('../../../supabase/releases/2026-11-core/',import.meta.url);
const migrations=new URL('../../../supabase/migrations/',import.meta.url);
const call=async(name,args)=>(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args)).rows[0].value;
let passed=0;
const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
const tenant=randomUUID(),otherTenant=randomUUID(),paidPlan=randomUUID(),trialPlan=randomUUID(),keptServer=randomUUID();
let telegramId=900000;
async function customer(reseller=tenant,{status='active',telegram=false,used=false}={}){
 const id=randomUUID(),link=randomUUID();
 await db.query('insert into vpn_customers(id,reseller_id,full_name,status,customer_type) values($1,$2,$3,$4,$5)',[id,reseller,'Synthetic customer',status,telegram?'telegram':'normal']);
 if(telegram)await db.query('insert into telegram_links(id,telegram_user_id,customer_id,reseller_id,trial_used_at) values($1,$2,$3,$4,$5)',[link,++telegramId,id,reseller,used?new Date('2025-01-01'):null]);
 return {id,link,reseller};
}
const orderFor=async(op)=>(await db.query('select * from vpn_orders where id=(select order_id from purchase_operations where id=$1)',[op.operation_id])).rows[0];
const submit=(c,{channel='bot',policy='customer',plan=paidPlan,key=randomUUID(),screenshot='fixture-only',payment='unpaid',protocol='vless'}={})=>call('submit_purchase',[c.reseller,c.id,plan,channel,policy,protocol,screenshot,null,payment,key]);
async function snapshotOriginal(){
 const result={};const tables=(await db.query("select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name")).rows;
 for(const {table_name:name} of tables){
  const cols=(await db.query("select column_name from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position",[name])).rows.map(c=>c.column_name);
  result[name]={cols,rows:(await db.query(`select coalesce(jsonb_agg(r order by r::text),'[]'::jsonb) rows from(select jsonb_build_array(${cols.map(c=>'"'+c+'"').join(',')}) r from "${name}") s`)).rows[0].rows};
 }return result;
}
try{
 await db.exec(await fs.readFile(new URL('../fixtures/production-20261102.sql',import.meta.url),'utf8'));
 console.log('Production-shaped schema fixture loaded without customer data.');
 await db.query("insert into resellers(id,name,status,commission_percent) values($1,'Synthetic zero','active',0),($2,'Synthetic twenty','active',20)",[tenant,otherTenant]);
 await db.query("insert into vpn_plans(id,name,price_mmk,data_limit_gb,duration_days,max_devices,is_active,is_trial,sort_order) values($1,'Paid',5000,3000,30,5,true,false,1),($2,'Trial',0,5,1,1,true,true,0)",[paidPlan,trialPlan]);
 for(const [reseller,slug] of [[tenant,'fixture-zero'],[otherTenant,'fixture-twenty']])await db.query("insert into reseller_miniapps(reseller_id,miniapp_slug,brand_name,trial_enabled,trial_duration_days,trial_data_limit_gb,is_enabled,admin_telegram_user_id,bot_token_encrypted) values($1,$2,'Synthetic',true,1,2,true,12345,'fixture-only')",[reseller,slug]);
 const historical=await customer(tenant,{telegram:true,used:true}),oldTrial=randomUUID();
 await db.query("insert into vpn_orders(id,customer_id,reseller_id,plan_id,status,price_mmk,commission_percent,commission_amount_mmk,total_paid_mmk,payment_status,order_type,review_status,source,expiry_date,quota_limit_bytes) values($1,$2,$3,$4,'expired',0,0,0,0,'paid','trial','confirmed','bot','2025-01-01',2147483648)",[oldTrial,historical.id,tenant,trialPlan]);
 await db.query('update telegram_links set trial_order_id=$1 where id=$2',[oldTrial,historical.link]);
 await db.query("insert into vpn_servers(id,name,provider,region,status,is_active,is_default,max_active_keys,current_active_keys,sort_order,panel_type,marzneshin_service_ids) values($1,'Existing synthetic','digitalocean','sgp1','active',true,false,100,0,0,'marzneshin',array[99])",[keptServer]);
 const existing=await customer(),existingOrder=randomUUID();
 await db.query("insert into vpn_orders(id,customer_id,reseller_id,plan_id,status,price_mmk,commission_percent,commission_amount_mmk,total_paid_mmk,payment_status,order_type,review_status,source,expiry_date,usage_baseline_bytes) values($1,$2,$3,$4,'active',5000,0,0,5000,'paid','purchase','confirmed','admin','2099-01-01',123)",[existingOrder,existing.id,tenant,paidPlan]);
 await db.query("insert into order_payments(order_id,customer_id,reseller_id,amount_mmk,commission_percent,commission_amount_mmk,platform_due_mmk,review_status,apply_status,source) values($1,$2,$3,5000,0,0,5000,'confirmed','applied','admin')",[existingOrder,existing.id,tenant]);
 await db.query("insert into vpn_keys(order_id,customer_id,reseller_id,server_id,key_name,outline_key_id,access_url,data_limit_bytes,used_bytes,status,protocol) values($1,$2,$3,$4,'Existing key','fixture-existing','https://fixture.invalid/key',3221225472000,11,'active','vless')",[existingOrder,existing.id,tenant,keptServer]);
 const original=await snapshotOriginal();
 const beforeFunctions=(await db.query("select proname,pg_get_functiondef(p.oid) definition,proacl::text acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by p.oid")).rows;
 const manifest=JSON.parse(await fs.readFile(new URL('manifest.json',release),'utf8'));
 assert.equal(manifest.productionProject,'daenwuszqdfkbjiatsjs');
 for(const entry of manifest.migrations){
  const sql=await fs.readFile(new URL(entry.file,migrations),'utf8');
  assert.equal(createHash('sha256').update(sql).digest('hex'),entry.sha256,entry.file);
  assert(!/messenger|announcement/i.test(sql),entry.file+' contains excluded schema');
 }
 const bundle=await fs.readFile(new URL(manifest.bundle.file,release),'utf8');
 assert.equal(createHash('sha256').update(bundle).digest('hex'),manifest.bundle.sha256);
 await db.exec(bundle);
 await check('migration preserves every original row/column, existing function definition and grant',async()=>{
  for(const [name,before] of Object.entries(original)){
   const rows=(await db.query(`select coalesce(jsonb_agg(r order by r::text),'[]'::jsonb) rows from(select jsonb_build_array(${before.cols.map(c=>'"'+c+'"').join(',')}) r from "${name}") s`)).rows[0].rows;assert.deepEqual(rows,before.rows,name);
  }
  for(const f of beforeFunctions){const actual=(await db.query('select pg_get_functiondef(oid) definition,proacl::text acl from pg_proc where pronamespace=\'public\'::regnamespace and proname=$1',[f.proname])).rows[0];assert.equal(actual.definition,f.definition,f.proname);assert.equal(actual.acl,f.acl,f.proname);}
 });
 await check('ordered production migration chain creates core objects without deferred tables',async()=>{
  for(const name of ['purchase_operations','customer_trial_claims','notification_deliveries','server_operations','reseller_bot_content'])assert((await db.query('select to_regclass($1) value',['public.'+name])).rows[0].value);
  assert.equal((await db.query("select count(*)::int n from pg_tables where schemaname='public' and (tablename like 'messenger%' or tablename like 'announcement%')")).rows[0].n,0);
 });
 await check('new private tables and mutating RPCs deny anon/authenticated and grant service_role only',async()=>{
  for(const table of ['purchase_operations','customer_trial_claims','notification_deliveries','server_operations','reseller_bot_content'])for(const role of ['anon','authenticated'])assert.equal((await db.query("select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') allowed",[role,'public.'+table])).rows[0].allowed,false,table+'/'+role);
  const secured=(await db.query("select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and p.proname not like 'admin_monitoring%' ")).rows;
  for(const f of secured.filter(f=>!beforeFunctions.some(old=>old.proname===f.proname)))for(const role of ['anon','authenticated'])assert.equal((await db.query("select has_function_privilege($1,$2,'EXECUTE') allowed",[role,f.oid])).rows[0].allowed,false,f.proname+'/'+role);
 });
 await check('excluded/null caller policies cannot create a purchase',async()=>{
  const c=await customer();for(const spec of [{channel:'messenger'},{channel:null},{policy:null}])await assert.rejects(submit(c,spec),/INVALID_CALLER/);
  assert.equal((await db.query('select count(*)::int n from purchase_operations where customer_id=$1',[c.id])).rows[0].n,0);
 });
 await check('zero and positive staff commission receipts preserve the production money invariant',async()=>{
  for(const [reseller,rate] of [[tenant,0],[otherTenant,20]]){
   const c=await customer(reseller,{status:'inactive'}),op=await submit(c,{channel:'dashboard',policy:'staff',payment:'paid'});const ord=await orderFor(op);
   const pay=(await db.query('select * from order_payments where order_id=$1',[ord.id])).rows[0];assert.equal(Number(pay.commission_percent),rate);assert.equal(pay.commission_amount_mmk,5000*rate/100);assert.equal(pay.amount_mmk,pay.commission_amount_mmk+pay.platform_due_mmk);assert.equal(String(ord.quota_limit_bytes),String(3000*1024**3));assert.equal(ord.status,'pending');
  }
 });
 await check('deployed0039 still prepares paid staff receipts with zero/positive commission',async()=>{
  for(const reseller of [tenant,otherTenant]){const c=await customer(reseller);const op=await call('prepare_dashboard_purchase',[reseller,randomUUID(),'fixture-hash',{customer_id:c.id,full_name:'Synthetic',plan_id:paidPlan,payment_status:'paid',protocol_preference:'vless'}]);const p=(await db.query('select * from order_payments where order_id=$1',[op.order_id])).rows[0];assert.equal(p.amount_mmk,p.commission_amount_mmk+p.platform_due_mmk);assert.equal(Number(p.commission_percent),reseller===tenant?0:20);}
 });
 const buyer=await customer(tenant,{telegram:true}),requestKey=randomUUID();let purchase,activeOrder;
 await check('customer submission replays once, rejects conflicts and blocks inactive customers',async()=>{
  const inactive=await customer(tenant,{status:'inactive'});await assert.rejects(submit(inactive),/INACTIVE_CUSTOMER/);
  purchase=await submit(buyer,{key:requestKey});const replay=await submit(buyer,{key:requestKey});assert.equal(replay.operation_id,purchase.operation_id);assert.equal(replay.replayed,true);
  await assert.rejects(submit(buyer,{key:requestKey,protocol:'shadowsocks'}),/IDEMPOTENCY_CONFLICT/);await assert.rejects(submit(buyer),/PURCHASE_PROCESSING/);
  activeOrder=await orderFor(purchase);assert.equal(activeOrder.status,'pending');assert.equal(activeOrder.review_status,'pending_review');
 });
 await check('purchase lease and completion are tenant/owner fenced and durably enqueue one admin alert',async()=>{
  const owner=randomUUID();assert.equal(await call('claim_purchase_execution',[purchase.operation_id,otherTenant,owner]),false);
  await assert.rejects(call('claim_purchase_execution',[purchase.operation_id,tenant,null]),/INVALID_CALLER/);
  assert.equal(await call('claim_purchase_execution',[purchase.operation_id,tenant,owner]),true);assert.equal(await call('claim_purchase_execution',[purchase.operation_id,tenant,randomUUID()]),false);
  await assert.rejects(call('finish_purchase_execution',[purchase.operation_id,tenant,randomUUID(),'completed']),/PURCHASE_PROCESSING/);
  await call('finish_purchase_execution',[purchase.operation_id,tenant,owner,'completed']);await call('finish_purchase_execution',[purchase.operation_id,tenant,null,'completed']);
  assert.equal((await db.query("select count(*)::int n from notification_deliveries where record_id=$1 and event_type='purchase_submitted'",[activeOrder.id])).rows[0].n,1);
 });
 await check('queued purchase preserves active entitlement and the existing payment-confirmation RPC',async()=>{
  await call('apply_confirmed_payment',[activeOrder.id,tenant,tenant,null]);await db.query("update vpn_orders set status='active',start_date=current_date,expiry_date=current_date+30 where id=$1",[activeOrder.id]);
  const before=(await db.query('select * from vpn_orders where id=$1',[activeOrder.id])).rows[0];const queued=await submit(buyer,{channel:'miniapp'});const after=(await db.query('select * from vpn_orders where id=$1',[activeOrder.id])).rows[0];assert.deepEqual(after,before);
  const order=await orderFor(queued);assert.equal(order.status,'scheduled');assert.equal((await db.query('select status from purchase_operations where id=$1',[queued.operation_id])).rows[0].status,'completed');await assert.rejects(submit(buyer,{channel:'miniapp'}),/QUEUED_PACKAGE_EXISTS/);
 });
 await check('counter reservation/failure still uses database-owned capacity and tenant guards',async()=>{
  const c=await customer(),op=await submit(c),ord=await orderFor(op);const reserved=await call('reserve_pending_key',[ord.id,c.id,tenant,keptServer,'Synthetic reserved',1000,'vless']);
  const id=typeof reserved==='string'?reserved:reserved.id||reserved.key_id;assert(id);assert.equal((await db.query('select current_active_keys from vpn_servers where id=$1',[keptServer])).rows[0].current_active_keys,2);
  await call('fail_pending_key',[id,tenant]);assert.equal((await db.query('select current_active_keys from vpn_servers where id=$1',[keptServer])).rows[0].current_active_keys,1);
 });
 await check('notification delivery isolates channels, owners, retries and separate payment identities',async()=>{
  const owner=randomUUID(),key=randomUUID();const args=[tenant,'payment_confirmed',activeOrder.id,'telegram','123',owner,key];
  await assert.rejects(call('claim_notification_delivery',[...args.slice(0,3),'messenger',...args.slice(4)]),/INVALID_DELIVERY/);
  const d=await call('claim_notification_delivery',args);assert(d.id);assert.equal(await call('finish_notification_delivery',[d.id,otherTenant,owner,'sent','fixture',null]),false);
  assert.equal(await call('finish_notification_delivery',[d.id,tenant,owner,'sent','fixture',null]),true);assert.equal(await call('claim_notification_delivery',args),null);
  const second=await call('claim_notification_delivery',[...args.slice(0,6),randomUUID()]);assert.notEqual(second.id,d.id);
  await db.query("update notification_deliveries set lease_until=now()-interval '1 second' where id=$1",[second.id]);assert.equal(await call('claim_notification_delivery',[...args.slice(0,6),(await db.query('select event_key from notification_deliveries where id=$1',[second.id])).rows[0].event_key]),null);assert.equal((await db.query('select status from notification_deliveries where id=$1',[second.id])).rows[0].status,'uncertain');
 });
 let trialCustomer,trial;
 await check('trial history remains consumed and new trials snapshot reseller quota with fenced recovery',async()=>{
  assert.equal((await call('customer_trial_eligibility',[tenant,historical.id])).eligible,false);assert.equal((await db.query('select provision_status from customer_trial_claims where customer_id=$1',[historical.id])).rows[0].provision_status,'uncertain');
  trialCustomer=await customer(tenant,{telegram:true});for(const source of ['messenger',null])await assert.rejects(call('create_customer_trial',[tenant,trialCustomer.id,source,trialCustomer.link,null]),/INVALID_TRIAL_SOURCE/);
  trial=await call('create_customer_trial',[tenant,trialCustomer.id,'bot',trialCustomer.link,'fixture']);assert.equal(trial.created,true);assert.equal(String(trial.order.quota_limit_bytes),String(2*1024**3));assert.equal(trial.plan.data_limit_gb,2);
  const replay=await call('create_customer_trial',[tenant,trialCustomer.id,'bot',trialCustomer.link,'fixture']);assert.equal(replay.created,false);assert.equal(replay.order.id,trial.order.id);
  const owner=randomUUID();assert.equal(await call('claim_trial_provisioning',[tenant,trialCustomer.id,trial.order.id,owner]),true);assert.equal(await call('claim_trial_provisioning',[tenant,trialCustomer.id,trial.order.id,randomUUID()]),false);assert.equal(await call('finish_trial_provisioning',[tenant,trialCustomer.id,trial.order.id,randomUUID(),'completed']),false);assert.equal(await call('finish_trial_provisioning',[tenant,trialCustomer.id,trial.order.id,owner,'completed']),true);
 });
 await check('cleanup requires explicit confirmation, exact tenant/order selection and resets only selected test history',async()=>{
  const args=[tenant,[trialCustomer.id],[trial.order.id],'DELETE TEST CUSTOMERS',false,true];await assert.rejects(call('cleanup_test_customers',[...args.slice(0,3),'wrong',false,true]),/INVALID_CUSTOMER_CLEANUP/);await assert.rejects(call('cleanup_test_customers',[otherTenant,...args.slice(1)]),/CUSTOMER_CLEANUP_SCOPE_MISMATCH/);
  assert.equal((await call('cleanup_test_customers',args)).ready,true);const result=await call('cleanup_test_customers',[...args.slice(0,5),false]);assert.equal(result.vpn_customers,1);assert.equal((await db.query('select count(*)::int n from customer_trial_claims where customer_id=$1',[trialCustomer.id])).rows[0].n,0);assert.equal((await call('customer_trial_eligibility',[tenant,historical.id])).eligible,false);
 });
 await check('cutoff recovery stays valid until exactly04:00 Myanmar across month/year/leap boundaries',async()=>{
  await db.exec("create function public.release_test_now() returns timestamptz language sql stable as $$ select current_setting('release_test.clock')::timestamptz $$");
  const originals=(await db.query("select pg_get_functiondef(oid) definition from pg_proc where pronamespace='public'::regnamespace and proname in ('customer_trial_eligibility','create_customer_trial','claim_trial_provisioning')")).rows;
  try{
   for(const row of originals)await db.exec(row.definition.replace(/\bnow\(\)/g,'public.release_test_now()'));
   const c=await customer(tenant,{telegram:true});await db.query("select set_config('release_test.clock','2026-11-01T00:00:00Z',false)");
   const trial=await call('create_customer_trial',[tenant,c.id,'bot',c.link,null]);
   for(const day of ['2026-11-02','2026-12-31','2028-02-29']){
    await db.query('update vpn_orders set expiry_date=$1 where id=$2',[day,trial.order.id]);
    await db.query("select set_config('release_test.clock',$1,false)",[day+'T21:29:59.999Z']);
    assert.equal((await call('customer_trial_eligibility',[tenant,c.id])).recoverable,true);
    assert.equal((await call('create_customer_trial',[tenant,c.id,'bot',c.link,null])).order.id,trial.order.id);
    const owner=randomUUID();assert.equal(await call('claim_trial_provisioning',[tenant,c.id,trial.order.id,owner]),true);await call('finish_trial_provisioning',[tenant,c.id,trial.order.id,owner,'ready']);
    await db.query("select set_config('release_test.clock',$1,false)",[day+'T21:30:00Z']);
    assert.equal((await call('customer_trial_eligibility',[tenant,c.id])).recoverable,false);
    await assert.rejects(call('claim_trial_provisioning',[tenant,c.id,trial.order.id,randomUUID()]),/TRIAL_NOT_AUTHORIZED/);
    const row=(await db.query('select expiry_date,quota_limit_bytes,status from vpn_orders where id=$1',[trial.order.id])).rows[0];assert.equal(String(row.quota_limit_bytes),String(2*1024**3));assert.equal(row.status,'active');
   }
  }finally{for(const row of originals)await db.exec(row.definition);await db.exec('drop function public.release_test_now()');}
 });
 await check('a repeated package cannot overwrite installed state',async()=>{
  const count=(await db.query('select count(*)::int n from purchase_operations')).rows[0].n;
  await assert.rejects(db.exec(bundle),/RELEASE_ALREADY_INSTALLED_OR_PARTIAL/);await db.exec('rollback');
  assert.equal((await db.query('select count(*)::int n from purchase_operations')).rows[0].n,count);
 });
 await check('the reviewed bundle rolls back all DDL on failure and rejects baseline function drift',async()=>{
  const isolated=new PGlite({database:'postgres'});
  try{
   await isolated.exec(await fs.readFile(new URL('../fixtures/production-20261102.sql',import.meta.url),'utf8'));
   await assert.rejects(isolated.exec(bundle.replace(/commit;\s*$/i,'select 1/0;\ncommit;')),/division by zero/);await isolated.exec('rollback');
   assert.equal((await isolated.query("select to_regclass('public.purchase_operations') value")).rows[0].value,null);
   await isolated.exec('create or replace function public.sync_server_active_keys() returns trigger language plpgsql as $$ begin return null; end $$');
   await assert.rejects(isolated.exec(bundle),/RELEASE_BASELINE_DRIFT/);await isolated.exec('rollback');
   assert.equal((await isolated.query("select to_regclass('public.purchase_operations') value")).rows[0].value,null);
  }finally{await isolated.close();}
 });
 console.log(`${passed} production SQL checks passed (embedded single-engine evidence; no live mutation).`);
}catch(error){console.error(JSON.stringify({failed:true,code:error.code||'ASSERTION_FAILED',message:String(error.message).slice(0,260)}));process.exitCode=1;}
finally{await db.close();}
