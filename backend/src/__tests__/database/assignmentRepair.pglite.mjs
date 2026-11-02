import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const { PGlite } = await import(process.env.PGLITE_MODULE_PATH || './pglite-runtime/node_modules/@electric-sql/pglite/dist/index.js');
const db = new PGlite();
const root = new URL('../../../supabase/migrations/', import.meta.url);
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table vpn_servers(id uuid primary key,name text,panel_type text default 'marzneshin',marzneshin_service_ids integer[],
      status text default 'active',is_active boolean default true,current_active_keys integer default 0,max_active_keys integer default 100,updated_at timestamptz);
    create table vpn_orders(id uuid primary key,reseller_id uuid,customer_id uuid,status text,expiry_date date,quota_limit_bytes bigint,usage_baseline_bytes bigint,payment_status text,review_status text);
    create table vpn_keys(id uuid primary key default gen_random_uuid(),server_id uuid,order_id uuid,customer_id uuid,reseller_id uuid,key_name text,
      data_limit_bytes bigint,used_bytes bigint,status text,protocol text,outline_key_id text,access_url text,key_credentials jsonb,is_used boolean,used_at timestamptz,deleted_at timestamptz,updated_at timestamptz);
    create table access_tokens(id uuid primary key,customer_id uuid,reseller_id uuid);
    create table token_server_assignments(id uuid primary key,token_id uuid not null references access_tokens(id),
      vpn_key_id uuid references vpn_keys(id),server_id uuid references vpn_servers(id),is_active boolean,created_at timestamptz default now(),
      unique(token_id,server_id));
    create unique index uq_token_server_assignments_token_server on token_server_assignments(token_id,server_id);`);
  for(const name of ['0020_acid_purchase_rpcs.sql','0021_server_counter_trigger.sql','0040_public_server_access.sql',
    '0041_server_operations.sql','0042_server_operation_coordination.sql','0043_server_operation_access_moves.sql']) {
    await db.exec(await fs.readFile(new URL(name,root),'utf8'));
  }
  const followup=new URL('0054_assignment_repair_conflicts.sql',root);
  try{await db.exec(await fs.readFile(followup,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  async function fixture({existing=true,oldStatus='deleted',foreignToken=false,foreignKey=false,nullKey=false,lateConflict=false}={}){
    const pool=randomUUID(),source=randomUUID(),destination=randomUUID(),customer=randomUUID(),reseller=randomUUID(),order=randomUUID();
    const key=randomUUID(),oldKey=randomUUID(),token=randomUUID(),sourceRow=randomUUID(),destinationRow=randomUUID(),owner=randomUUID();
    const scope=['development',pool,'fixture-db','fixture-panel-'+pool];
    await db.query("insert into server_access_pools(id,environment,name,panel_identity,vless_service_id) values($1,'development','DEV',$2,14)",[pool,scope[3]]);
    await db.query("insert into server_operation_runtime_bindings values('development',$1,'fixture-db',$2)",[pool,scope[3]]);
    for(const [id,node] of [[source,51],[destination,52]]){
      await db.query(`insert into vpn_servers(id,name,environment,access_pool_id,panel_node_id,supported_protocols,marzneshin_service_ids,ownership_provenance)
        values($1,'fixture','development',$2,$3,array['vless'],array[]::integer[],$4)`,[id,pool,node,
        {method:'adopted',environment:'development',access_pool_id:pool,panel_node_id:node,panel_identity:scope[3],verified_at:new Date().toISOString()}]);
    }
    await db.query("insert into vpn_orders values($1,$2,$3,'active','2099-01-01',1000,0,'confirmed','approved')",[order,reseller,customer]);
    for(const [id,status,cust] of [[key,'active',customer],[oldKey,oldStatus==='pending'?'active':oldStatus,foreignKey?randomUUID():customer]]){
      await db.query(`insert into vpn_keys(id,server_id,order_id,customer_id,reseller_id,status,protocol,outline_key_id,access_url,data_limit_bytes,used_bytes)
        values($1,$2,$3,$4,$5,$6,'vless','unchanged-user','unchanged-link',1000,42)`,[id,destination,order,cust,reseller,status]);
    }
    await db.query('insert into access_tokens values($1,$2,$3)',[token,foreignToken?randomUUID():customer,reseller]);
    await db.query('insert into token_server_assignments(id,token_id,vpn_key_id,server_id,is_active) values($1,$2,$3,$4,true)',[sourceRow,token,key,source]);
    if(existing)await db.query('insert into token_server_assignments(id,token_id,vpn_key_id,server_id,is_active) values($1,$2,$3,$4,true)',[destinationRow,token,nullKey?null:oldKey,destination]);
    const tokenIds=[token];
    if(lateConflict){
      const extraToken='ffffffff-ffff-ffff-ffff-ffffffffffff',liveKey=randomUUID();tokenIds.push(extraToken);
      await db.query('insert into access_tokens values($1,$2,$3)',[extraToken,customer,reseller]);
      await db.query("insert into vpn_keys(id,server_id,order_id,customer_id,reseller_id,status,protocol,used_bytes) values($1,$2,$3,$4,$5,'active','vless',0)",[liveKey,destination,order,customer,reseller]);
      await db.query('insert into token_server_assignments(id,token_id,vpn_key_id,server_id,is_active) values($1,$2,$3,$4,true),($5,$2,$6,$7,true)',
        [randomUUID(),extraToken,key,source,randomUUID(),liveKey,destination]);
    }
    const {rows:[op]}=await db.query('select * from create_server_operation($1,$2,$3,$4,$5,$6,$7,$8)',[...scope,'move_retire',randomUUID(),{source_server_id:source,destination_server_id:destination},'a'.repeat(64)]);
    const {rows:[lease]}=await db.query('select * from claim_server_operation($1,$2,$3,$4,$5,$6,$7)',[...scope,op.id,owner,120]);
    if(oldStatus==='pending'){
      await db.exec('begin');
      await db.query('select begin_server_operation_write($1,$2,$3,$4,$5,$6,$7)',[...scope,op.id,owner,lease.fence]);
      await db.query("update vpn_keys set status='pending' where id=$1",[oldKey]);
      await db.exec('commit');
    }
    const args=[...scope,op.id,owner,lease.fence,key,order,reseller,customer,destination];
    return {source,destination,key,oldKey,sourceRow,destinationRow,args,
      repair:(values=args)=>db.query('select repair_server_operation_assignments($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',values),
      rows:async()=> (await db.query('select id,server_id,vpn_key_id,is_active from token_server_assignments where token_id=any($1::uuid[]) order by id',[tokenIds])).rows};
  }
  const f=await fixture();
  await f.repair();
  const repaired=await f.rows();
  assert.deepEqual(repaired.find(r=>r.id===f.sourceRow),{id:f.sourceRow,server_id:f.source,vpn_key_id:f.key,is_active:false});
  assert.deepEqual(repaired.find(r=>r.id===f.destinationRow),{id:f.destinationRow,server_id:f.destination,vpn_key_id:f.key,is_active:true});
  await f.repair();assert.deepEqual(await f.rows(),repaired,'Retry must be idempotent');
  const key=(await db.query('select access_url,used_bytes,data_limit_bytes from vpn_keys where id=$1',[f.key])).rows[0];
  assert.equal(key.access_url,'unchanged-link');assert.equal(Number(key.used_bytes),42);assert.equal(Number(key.data_limit_bytes),1000);
  for(const options of [{existing:false},{nullKey:true}]){
    const test=await fixture(options);await test.repair();
    const active=(await test.rows()).filter(r=>r.is_active);
    assert.equal(active.length,1);assert.equal(active[0].server_id,test.destination);assert.equal(active[0].vpn_key_id,test.key);
  }
  for(const options of [{oldStatus:'active'},{oldStatus:'pending'},{foreignToken:true},{foreignKey:true},{lateConflict:true}]){
    const test=await fixture(options),before=await test.rows();
    await assert.rejects(test.repair(),/ASSIGNMENT_STATE_CHANGED|RESOURCE_SCOPE_MISMATCH/);
    assert.deepEqual(await test.rows(),before,'Rejected repair must roll back every assignment change');
  }
  await assert.rejects(f.repair(f.args.map((v,i)=>i===6?Number(v)+1:v)),/STALE_FENCE/);
  await assert.rejects(f.repair(f.args.map((v,i)=>i===0?'production':v)),/RESOURCE_SCOPE_MISMATCH/);
  await db.exec('set role authenticated');
  await assert.rejects(f.repair(),/permission denied/);
  await db.exec('reset role');
  console.log('PASS: historical destination collisions, idempotency, normal move, empty destination, live-key/tenant rejection, scope/fence/grants and unchanged quota/link. Single-connection PostgreSQL WASM; not multi-connection concurrency proof.');
}finally{await db.close();}
