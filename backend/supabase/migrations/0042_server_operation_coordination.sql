begin;

-- Explicit owner-installed binding. Do not infer it from NODE_ENV or seed live IDs.
create table public.server_operation_runtime_bindings (
  environment text not null,
  access_pool_id uuid not null,
  database_identity text not null,
  panel_identity text not null,
  primary key(environment,access_pool_id),
  foreign key(access_pool_id,environment) references public.server_access_pools(id,environment)
);
alter table public.server_operation_runtime_bindings enable row level security;
revoke all on public.server_operation_runtime_bindings from public,anon,authenticated,service_role;
grant select on public.server_operation_runtime_bindings to service_role;

-- Expiry is evidence of uncertainty, never permission to retire an in-flight VPS.
create table public.server_customer_mutation_guards (
  guard_id uuid primary key,
  environment text not null,
  access_pool_id uuid not null,
  resource_keys text[] not null,
  lease_until timestamptz not null,
  status text not null default 'running' check(status in ('running','uncertain')),
  foreign key(access_pool_id,environment) references public.server_access_pools(id,environment)
);
alter table public.server_customer_mutation_guards enable row level security;
revoke all on public.server_customer_mutation_guards from public,anon,authenticated,service_role;
grant select on public.server_customer_mutation_guards to service_role;

create function public.require_server_operation_scope(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from server_operation_runtime_bindings b join server_access_pools p
    on p.id=b.access_pool_id and p.environment=b.environment
    where b.environment=p_environment and b.access_pool_id=p_pool_id
    and b.database_identity=p_database_identity and b.panel_identity=p_panel_identity
    and p.panel_identity=p_panel_identity) then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
end $$;

create function public.require_server_operation_lease(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_fence bigint)
returns public.server_operations language plpgsql security definer set search_path=public,pg_temp as $$
declare o server_operations;
begin
  perform require_server_operation_scope(p_environment,p_pool_id,p_database_identity,p_panel_identity);
  select * into o from server_operations where id=p_operation_id and environment=p_environment and access_pool_id=p_pool_id for update;
  if not found then raise exception 'OPERATION_NOT_FOUND'; end if;
  if o.lease_owner is distinct from p_owner or o.fence is distinct from p_fence then raise exception 'STALE_FENCE'; end if;
  if o.lease_until is null or o.lease_until<=clock_timestamp() then raise exception 'LEASE_EXPIRED'; end if;
  if o.status in ('completed','cancelled','failed') then raise exception 'INVALID_OPERATION'; end if;
  return o;
end $$;

create function public.create_server_operation(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_kind text,p_idempotency_key text,p_payload jsonb,p_payload_hash text)
returns public.server_operations language plpgsql security definer set search_path=public,pg_temp as $$
declare o server_operations; sid uuid; resource text;
begin
  perform require_server_operation_scope(p_environment,p_pool_id,p_database_identity,p_panel_identity);
  -- Scope/idempotency serialization makes a concurrent identical request return one row.
  perform pg_advisory_xact_lock(hashtextextended(p_environment||p_pool_id::text||p_idempotency_key,0));
  select * into o from server_operations where environment=p_environment and access_pool_id=p_pool_id and idempotency_key=p_idempotency_key;
  if found then
    if o.payload_hash<>p_payload_hash or o.payload<>p_payload or o.kind<>p_kind then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return o;
  end if;
  if p_kind not in ('add','replace','move_retire') or
    (p_kind<>'add' and nullif(p_payload->>'source_server_id','') is null) or
    (p_kind='move_retire' and nullif(p_payload->>'destination_server_id','') is null) or
    (p_kind='add' and nullif(p_payload->>'source_server_id','') is not null) or
    (p_kind<>'move_retire' and nullif(p_payload->>'destination_server_id','') is not null) or
    (p_payload->>'source_server_id'=p_payload->>'destination_server_id') then raise exception 'INVALID_OPERATION'; end if;
  insert into server_operations(environment,access_pool_id,database_identity,panel_identity,kind,idempotency_key,payload_hash,payload)
    values(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_kind,p_idempotency_key,p_payload_hash,p_payload) returning * into o;
  for resource in
    with servers as (select distinct value::uuid id from jsonb_array_elements_text(jsonb_build_array(p_payload->>'source_server_id',p_payload->>'destination_server_id')) where value is not null)
    select 'server:'||id::text from servers union
    select 'order:'||k.order_id::text from vpn_keys k join servers s on s.id=k.server_id where k.status in ('active','pending')
    order by 1
  loop
    perform pg_advisory_xact_lock(hashtextextended(p_environment||p_pool_id::text||resource,0));
    if resource like 'server:%' then
      sid:=substring(resource from 8)::uuid;
      if not exists(select 1 from vpn_servers s where s.id=sid and s.environment=p_environment and s.access_pool_id=p_pool_id) then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
      -- Pending reservations are in-flight external work, not spare capacity.
      if exists(select 1 from vpn_keys k where k.server_id=sid and k.status='pending') then raise exception 'SERVER_MIGRATION_IN_PROGRESS'; end if;
    end if;
    if exists(select 1 from server_operation_locks l where l.environment=p_environment and l.access_pool_id=p_pool_id and l.resource_key=resource)
      or exists(select 1 from server_customer_mutation_guards g where g.environment=p_environment and g.access_pool_id=p_pool_id and resource=any(g.resource_keys)) then raise exception 'SERVER_MIGRATION_IN_PROGRESS'; end if;
    insert into server_operation_locks(environment,access_pool_id,resource_key,operation_id) values(p_environment,p_pool_id,resource,o.id);
  end loop;
  return o;
end $$;

create function public.claim_server_operation(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_ttl_seconds integer)
returns public.server_operations language plpgsql security definer set search_path=public,pg_temp as $$
declare o server_operations;
begin
  perform require_server_operation_scope(p_environment,p_pool_id,p_database_identity,p_panel_identity);
  if p_owner is null or p_ttl_seconds is null or p_ttl_seconds not between 10 and 300 then raise exception 'INVALID_OPERATION'; end if;
  select * into o from server_operations where id=p_operation_id and environment=p_environment and access_pool_id=p_pool_id for update;
  if not found then raise exception 'OPERATION_NOT_FOUND'; end if;
  if o.status in ('completed','cancelled','failed') then raise exception 'INVALID_OPERATION'; end if;
  if o.lease_until>clock_timestamp() then
    if o.lease_owner=p_owner then return o; end if;
    raise exception 'LEASE_BUSY';
  end if;
  update server_operations set lease_owner=p_owner,lease_until=clock_timestamp()+make_interval(secs=>p_ttl_seconds),
    fence=fence+1,status='running',updated_at=clock_timestamp() where id=o.id returning * into o;
  return o;
end $$;

create function public.renew_server_operation_lease(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_fence bigint,p_ttl_seconds integer)
returns public.server_operations language plpgsql security definer set search_path=public,pg_temp as $$
declare o server_operations;
begin
  o:=require_server_operation_lease(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  if p_ttl_seconds is null or p_ttl_seconds not between 10 and 300 then raise exception 'INVALID_OPERATION'; end if;
  update server_operations set lease_until=clock_timestamp()+make_interval(secs=>p_ttl_seconds),updated_at=clock_timestamp() where id=o.id returning * into o;
  return o;
end $$;

create function public.checkpoint_server_operation(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_fence bigint,p_stage text,p_status text,p_checkpoint jsonb)
returns public.server_operations language plpgsql security definer set search_path=public,pg_temp as $$
declare o server_operations;
begin
  o:=require_server_operation_lease(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  if p_status not in ('running','blocked','paused','partial') then raise exception 'INVALID_OPERATION'; end if;
  update server_operations set stage=p_stage,status=p_status,checkpoint=p_checkpoint,updated_at=clock_timestamp() where id=o.id returning * into o;
  return o;
end $$;

create function public.claim_server_operation_item(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_fence bigint,p_item_key text,p_expected jsonb)
returns public.server_operation_items language plpgsql security definer set search_path=public,pg_temp as $$
declare item server_operation_items;
begin
  perform require_server_operation_lease(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  select * into item from server_operation_items where operation_id=p_operation_id and item_key=p_item_key for update;
  if found then
    if item.expected<>p_expected then raise exception 'ITEM_STATE_CONFLICT'; end if;
    update server_operation_items set fence=p_fence,updated_at=clock_timestamp() where operation_id=p_operation_id and item_key=p_item_key returning * into item;
  else
    insert into server_operation_items(operation_id,item_key,expected,fence) values(p_operation_id,p_item_key,p_expected,p_fence) returning * into item;
  end if;
  return item;
end $$;

create function public.finish_server_operation_item(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_fence bigint,p_item_key text,p_status text,p_checkpoint jsonb)
returns public.server_operation_items language plpgsql security definer set search_path=public,pg_temp as $$
declare item server_operation_items;
begin
  perform require_server_operation_lease(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  update server_operation_items set status=p_status,checkpoint=p_checkpoint,updated_at=clock_timestamp()
    where operation_id=p_operation_id and item_key=p_item_key and fence=p_fence returning * into item;
  if not found then raise exception 'STALE_FENCE'; end if;
  return item;
end $$;

create function public.release_server_operation(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_fence bigint,p_status text)
returns public.server_operations language plpgsql security definer set search_path=public,pg_temp as $$
declare o server_operations;
begin
  o:=require_server_operation_lease(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  if p_status not in ('completed','cancelled','failed') then raise exception 'OPERATION_NOT_TERMINAL'; end if;
  -- Terminal status does not itself authorize dropping uncertain dependencies.
  if exists(select 1 from server_operation_items where operation_id=o.id and status<>'verified') then raise exception 'ITEM_STATE_CONFLICT'; end if;
  delete from server_operation_locks where operation_id=o.id;
  update server_operations set status=p_status,lease_owner=null,lease_until=null,updated_at=clock_timestamp() where id=o.id returning * into o;
  return o;
end $$;

create function public.read_server_operation(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid)
returns public.server_operations language plpgsql security definer set search_path=public,pg_temp as $$
declare o server_operations;
begin
  perform require_server_operation_scope(p_environment,p_pool_id,p_database_identity,p_panel_identity);
  select * into o from server_operations where id=p_operation_id and environment=p_environment and access_pool_id=p_pool_id;
  if not found then raise exception 'OPERATION_NOT_FOUND'; end if;
  return o;
end $$;

create function public.acquire_server_customer_mutation(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_guard_id uuid,p_resource_keys text[],p_reseller_id uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare resource text; prior server_customer_mutation_guards; sid uuid;
begin
  perform require_server_operation_scope(p_environment,p_pool_id,p_database_identity,p_panel_identity);
  if p_guard_id is null or cardinality(p_resource_keys) not between 1 and 100 or array_position(p_resource_keys,null) is not null then raise exception 'INVALID_OPERATION'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_guard_id::text,0));
  select * into prior from server_customer_mutation_guards where guard_id=p_guard_id;
  if found and (prior.environment<>p_environment or prior.access_pool_id<>p_pool_id or prior.status<>'running' or prior.lease_until<=clock_timestamp() or not p_resource_keys @> prior.resource_keys) then raise exception 'STALE_FENCE'; end if;
  for resource in select distinct value from unnest(p_resource_keys) value order by value loop
    if resource !~ '^(server|order):[a-f0-9-]{36}$' then raise exception 'INVALID_OPERATION'; end if;
    perform pg_advisory_xact_lock(hashtextextended(p_environment||p_pool_id::text||resource,0));
    if resource like 'server:%' then
      sid:=substring(resource from 8)::uuid;
      if not exists(select 1 from vpn_servers where id=sid and environment=p_environment and access_pool_id=p_pool_id) then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
    else
      if not exists(select 1 from vpn_orders where id=substring(resource from 7)::uuid and (p_reseller_id is null or reseller_id=p_reseller_id)) then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
    end if;
    if exists(select 1 from server_operation_locks where environment=p_environment and access_pool_id=p_pool_id and resource_key=resource)
      or exists(select 1 from server_customer_mutation_guards where environment=p_environment and access_pool_id=p_pool_id and guard_id<>p_guard_id and resource=any(resource_keys)) then raise exception 'SERVER_MIGRATION_IN_PROGRESS'; end if;
  end loop;
  insert into server_customer_mutation_guards(guard_id,environment,access_pool_id,resource_keys,lease_until)
    values(p_guard_id,p_environment,p_pool_id,p_resource_keys,clock_timestamp()+interval '5 minutes')
    on conflict(guard_id) do update set resource_keys=excluded.resource_keys,lease_until=excluded.lease_until;
  return p_guard_id;
end $$;

create function public.finish_server_customer_mutation(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_guard_id uuid,p_uncertain boolean)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare g server_customer_mutation_guards;
begin
  perform require_server_operation_scope(p_environment,p_pool_id,p_database_identity,p_panel_identity);
  select * into g from server_customer_mutation_guards where guard_id=p_guard_id and environment=p_environment and access_pool_id=p_pool_id for update;
  if not found then raise exception 'STALE_FENCE'; end if;
  if p_uncertain is true or g.lease_until<=clock_timestamp() then
    update server_customer_mutation_guards set status='uncertain' where guard_id=p_guard_id;
    return false;
  end if;
  delete from server_customer_mutation_guards where guard_id=p_guard_id;
  return true;
end $$;

-- SQL mutations cannot bypass drains, including legacy reserve/activate RPCs.
-- The original RPCs/counters are unchanged: rejection rolls their transaction back.
create function public.guard_server_lifecycle_mutation() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare sid uuid; oid uuid; s record; resource text;
begin
  if tg_table_name='vpn_keys' then
    if tg_op='DELETE' then sid:=old.server_id; oid:=old.order_id; else sid:=new.server_id; oid:=new.order_id; end if;
  elsif tg_table_name='vpn_orders' then
    if tg_op='DELETE' then oid:=old.id; else oid:=new.id; end if;
  else
    if tg_op='DELETE' then sid:=old.id; else sid:=new.id; end if;
  end if;
  for s in select distinct v.environment,v.access_pool_id,v.id from vpn_servers v
    where v.environment is not null and (v.id=sid or v.id in (select k.server_id from vpn_keys k where k.order_id=oid)) order by v.id loop
    for resource in select value from unnest(array['server:'||s.id::text,case when oid is not null then 'order:'||oid::text end]) value where value is not null order by value loop
      perform pg_advisory_xact_lock(hashtextextended(s.environment||s.access_pool_id::text||resource,0));
      if exists(select 1 from server_operation_locks l where l.environment=s.environment and l.access_pool_id=s.access_pool_id and l.resource_key=resource) then
        raise exception 'SERVER_MIGRATION_IN_PROGRESS';
      end if;
    end loop;
  end loop;
  if tg_op='DELETE' then return old; end if; return new;
end $$;
create trigger vpn_keys_lifecycle_guard before insert or update or delete on public.vpn_keys for each row execute function public.guard_server_lifecycle_mutation();
create trigger vpn_orders_lifecycle_guard before update or delete on public.vpn_orders for each row execute function public.guard_server_lifecycle_mutation();
create trigger vpn_servers_lifecycle_guard before update or delete on public.vpn_servers for each row execute function public.guard_server_lifecycle_mutation();

-- Helpers are private even to service_role; only the reviewed RPC entry points run them.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=any(array['require_server_operation_scope','require_server_operation_lease',
      'create_server_operation','claim_server_operation','renew_server_operation_lease','checkpoint_server_operation',
      'claim_server_operation_item','finish_server_operation_item','release_server_operation','read_server_operation','guard_server_lifecycle_mutation',
      'acquire_server_customer_mutation','finish_server_customer_mutation']) loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
    if f.proname not like 'require_%' and f.proname<>'guard_server_lifecycle_mutation' then
      execute format('grant execute on function %s to service_role',f.signature);
    end if;
  end loop;
end $$;

commit;
