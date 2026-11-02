const { PGlite } = await import(process.env.PGLITE_MODULE_PATH || './pglite-runtime/node_modules/@electric-sql/pglite/dist/index.js');
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const db = new PGlite();
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table vpn_servers(id uuid primary key default gen_random_uuid(),name text,provider text,region text,droplet_id bigint,host_ip text,
      status text default 'active',is_active boolean default true,is_default boolean default false,current_active_keys integer not null,sort_order integer not null,max_active_keys integer default 10,
      last_error text,updated_at timestamptz,panel_type text default 'marzneshin',panel_url text,panel_public_url text,panel_username text,panel_password_encrypted text,
      server_tier text,marzneshin_service_ids integer[],marzneshin_vless_service_ids integer[],marzneshin_vless_trial_service_ids integer[]);
    create table vpn_orders(id uuid primary key,reseller_id uuid,status text,customer_id uuid,expiry_date date,quota_limit_bytes bigint,usage_baseline_bytes bigint,payment_status text,review_status text);
    create table vpn_keys(id uuid primary key default gen_random_uuid(),server_id uuid,order_id uuid,customer_id uuid,reseller_id uuid,key_name text,data_limit_bytes bigint,
      used_bytes bigint,status text,protocol text,outline_key_id text,access_url text,key_credentials jsonb,is_used boolean,used_at timestamptz,deleted_at timestamptz,updated_at timestamptz);
    create table token_server_assignments(id uuid primary key,vpn_key_id uuid,server_id uuid,is_active boolean);
    create table server_health_status(server_id uuid primary key,outline_api_status text,last_checked_at timestamptz,last_success_at timestamptz,last_error text,consecutive_failures integer,updated_at timestamptz);`);
  const root = new URL('../../../supabase/migrations/', import.meta.url);
  const files = (await fs.readdir(root)).filter(name => /^(0020|0021|004[0-9])_/.test(name)).sort();
  for (const name of files) { await db.exec(await fs.readFile(new URL(name, root), 'utf8')); console.log('DDL OK', name); }
  const pool = randomUUID(), owner = randomUUID();
  await db.query("insert into server_access_pools(id,environment,name,panel_identity,vless_service_id) values($1,'development','Fixture','https://panel.example.test',502)", [pool]);
  await db.query("insert into server_operation_runtime_bindings(environment,access_pool_id,database_identity,panel_identity,provider_accounts) values('development',$1,'fixture-db','https://panel.example.test',$2)", [pool, {digitalocean:'account'}]);
  const scope = ['development', pool, 'fixture-db', 'https://panel.example.test'];
  const rpc = async (name, args) => (await db.query(`select * from ${name}(${args.map((_, i) => '$' + (i + 1)).join(',')})`, args)).rows[0];
  const op = await rpc('create_server_operation', [...scope, 'add', 'fixture-add', {provider:'digitalocean',region:'sgp1',supported_protocols:['vless']}, 'a'.repeat(64)]);
  const lease = await rpc('claim_server_operation', [...scope, op.id, owner, 120]);
  await assert.rejects(rpc('checkpoint_server_operation', [...scope, op.id, owner, Number(lease.fence) + 1, 'queued', 'running', {}]), /STALE_FENCE/);
  await assert.rejects(rpc('read_server_operation', ['production', ...scope.slice(1), op.id]), /RESOURCE_SCOPE_MISMATCH/);
  const identity={environment:scope[0],poolId:pool,databaseIdentity:scope[2],panelIdentity:scope[3],operationId:op.id,protected:false};
  const provider={...identity,id:'123',kind:'provider',provider:'digitalocean',accountId:'account',createdAt:new Date().toISOString(),addresses:['198.51.100.10'],region:'sgp1',planId:'s-1vcpu-1gb'};
  const node={...identity,id:'51',kind:'node',provider_resource_id:'123',address:'198.51.100.10'};
  for(const body of [provider,node]) await db.query('insert into server_infrastructure_resources(environment,access_pool_id,database_identity,panel_identity,kind,provider,resource_id,operation_id,body) values($1,$2,$3,$4,$5,$6,$7,$8,$9)',[...scope,body.kind,body.provider||'',body.id,op.id,body]);
  const candidate=(await rpc('ensure_server_operation_candidate',[...scope,op.id,owner,lease.fence,{name:'Fixture',provider:'digitalocean',region:'sgp1',provider_resource_id:'123',panel_node_id:51,host_ip:'198.51.100.10',panel_url:scope[3],panel_public_url:scope[3],panel_username:'fixture',panel_password_encrypted:'fixture-encrypted',max_active_keys:10,marzneshin_service_ids:[]}])).ensure_server_operation_candidate;
  assert.equal(candidate.current_active_keys,0);assert.equal(candidate.sort_order,0);assert.equal(candidate.is_active,false);
  await rpc('publish_server_operation_candidate',[...scope,op.id,owner,lease.fence,candidate.id,51,'123',new Date().toISOString()]);
  assert.equal((await db.query('select is_active from vpn_servers where id=$1',[candidate.id])).rows[0].is_active,true);
  const privateState=[...scope,op.id,owner,lease.fence,'fixture-state','encrypted',null];
  await rpc('write_server_infrastructure_state',privateState);
  await assert.rejects(rpc('write_server_infrastructure_state',privateState),/PRIVATE_STATE_CONFLICT/);
  const foreign=randomUUID();
  await db.query("insert into vpn_servers(id,name,provider,region,status,current_active_keys,sort_order,environment,access_pool_id,panel_node_id,provider_resource_id,supported_protocols,marzneshin_service_ids,lifecycle_protected,ownership_provenance) values($1,'foreign','digitalocean','sgp1','active',0,0,'development',$2,52,'456',array['vless'],array[]::integer[],false,$3)",[foreign,pool,{method:'adopted',environment:'development',access_pool_id:pool,panel_node_id:52,panel_identity:scope[3],provider_resource_id:'456',verified_at:new Date().toISOString()}]);
  await assert.rejects(rpc('retire_server_operation_resource',[...scope,op.id,owner,lease.fence,foreign,'456',52]),/RESOURCE_SCOPE_MISMATCH/);
  await db.exec('set role authenticated');
  await assert.rejects(db.query('select * from server_infrastructure_resources'),/permission denied/);
  await db.exec('reset role');
  await db.query("insert into server_infrastructure_resources(environment,access_pool_id,database_identity,panel_identity,kind,resource_id,body) values($1,$2,$3,$4,'service','502',$5)",[...scope,{...identity,id:'502',kind:'service'}]);
  await rpc('acquire_server_service_lock',[...scope,op.id,owner,lease.fence,'502']);
  assert.equal((await db.query('select count(*)::integer n from server_service_operation_locks')).rows[0].n,1);
  await rpc('release_server_operation',[...scope,op.id,owner,lease.fence,'cancelled']);
  assert.equal((await db.query('select count(*)::integer n from server_service_operation_locks')).rows[0].n,0,'Reconciled terminal release must not strand public service locks');
  const order=randomUUID(),customer=randomUUID(),reseller=randomUUID(),key=randomUUID(),assignment=randomUUID();
  await db.query("insert into vpn_orders(id,reseller_id,customer_id,status,expiry_date,quota_limit_bytes,usage_baseline_bytes) values($1,$2,$3,'active','2099-01-01',1000,0)",[order,reseller,customer]);
  await db.query("insert into vpn_keys(id,server_id,order_id,customer_id,reseller_id,status,protocol,outline_key_id,access_url,data_limit_bytes,used_bytes) values($1,$2,$3,$4,$5,'active','vless','same-user','same-link',1000,42)",[key,candidate.id,order,customer,reseller]);
  await db.query('insert into token_server_assignments values($1,$2,$3,true)',[assignment,key,candidate.id]);
  const move=await rpc('create_server_operation',[...scope,'move_retire','fixture-move',{source_server_id:candidate.id,destination_server_id:foreign},'b'.repeat(64)]);
  const moving=await rpc('claim_server_operation',[...scope,move.id,owner,120]);
  const access=(await rpc('read_server_operation_access',[...scope,move.id,owner,moving.fence,key,order,reseller,customer])).read_server_operation_access;
  await rpc('move_server_operation_key',[...scope,move.id,owner,moving.fence,key,order,reseller,customer,candidate.id,foreign,access.key,access.order]);
  await rpc('repair_server_operation_assignments',[...scope,move.id,owner,moving.fence,key,order,reseller,customer,foreign]);
  const moved=(await db.query('select * from vpn_keys where id=$1',[key])).rows[0];
  assert.equal(moved.server_id,foreign);assert.equal(moved.access_url,'same-link');assert.equal(Number(moved.used_bytes),42);assert.equal(Number(moved.data_limit_bytes),1000);
  const counters=(await db.query('select id,current_active_keys from vpn_servers')).rows;
  assert.equal(counters.find(row=>row.id===candidate.id).current_active_keys,0);assert.equal(counters.find(row=>row.id===foreign).current_active_keys,1);
  assert.equal((await db.query('select server_id from token_server_assignments where id=$1',[assignment])).rows[0].server_id,foreign);
  console.log('PASS: lifecycle DDL/RPCs, scope/fence/permission rejection, state CAS, terminal service locks, stable-key/assignment moves and single-owner counter transfer. Multi-connection concurrency NOT tested.');
} finally { await db.close(); }
