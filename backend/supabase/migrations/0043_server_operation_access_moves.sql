begin;

-- Preserve the existing database-owned recomputation and capacity enforcement.
do $$ begin
  if not exists(select 1 from pg_trigger t join pg_proc p on p.oid=t.tgfoid
    where t.tgrelid='public.vpn_keys'::regclass and t.tgname='trg_sync_server_active_keys'
      and t.tgenabled<>'D' and p.proname='sync_server_active_keys') then
    raise exception 'SERVER_COUNTER_TRIGGER_REQUIRED';
  end if;
end $$;

create function public.begin_server_operation_write(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_fence bigint)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform require_server_operation_lease(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  perform set_config('novanet.operation_id',p_operation_id::text,true);
  perform set_config('novanet.operation_owner',p_owner::text,true);
  perform set_config('novanet.operation_fence',p_fence::text,true);
end $$;

-- Only a currently fenced definer RPC can write through its own drain locks.
create or replace function public.guard_server_lifecycle_mutation() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare sid uuid; oid uuid; s record; resource text; lock_row record; op server_operations;
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
      for lock_row in select * from server_operation_locks where environment=s.environment and access_pool_id=s.access_pool_id and resource_key=resource loop
        if current_setting('novanet.operation_id',true) is distinct from lock_row.operation_id::text then raise exception 'SERVER_MIGRATION_IN_PROGRESS'; end if;
        select * into op from server_operations where id=lock_row.operation_id;
        if op.lease_owner::text is distinct from current_setting('novanet.operation_owner',true)
          or op.fence::text is distinct from current_setting('novanet.operation_fence',true)
          or op.lease_until is null or op.lease_until<=clock_timestamp() or op.status in ('completed','cancelled','failed') then raise exception 'STALE_FENCE'; end if;
      end loop;
    end loop;
  end loop;
  if tg_op='DELETE' then return old; end if; return new;
end $$;

create function public.lock_server_operation_server(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_fence bigint,p_server_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare resource text:='server:'||p_server_id::text;
begin
  perform require_server_operation_lease(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  perform pg_advisory_xact_lock(hashtextextended(p_environment||p_pool_id::text||resource,0));
  if not exists(select 1 from vpn_servers where id=p_server_id and environment=p_environment and access_pool_id=p_pool_id) then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  if exists(select 1 from server_operation_locks where environment=p_environment and access_pool_id=p_pool_id and resource_key=resource and operation_id<>p_operation_id)
    or exists(select 1 from server_customer_mutation_guards where environment=p_environment and access_pool_id=p_pool_id and resource=any(resource_keys)) then raise exception 'SERVER_MIGRATION_IN_PROGRESS'; end if;
  insert into server_operation_locks(environment,access_pool_id,resource_key,operation_id) values(p_environment,p_pool_id,resource,p_operation_id) on conflict do nothing;
  return true;
end $$;

create function public.read_server_operation_access(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_fence bigint,p_key_id uuid,p_order_id uuid,p_reseller_id uuid,p_customer_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare k vpn_keys; o vpn_orders;
begin
  perform require_server_operation_lease(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  select * into k from vpn_keys where id=p_key_id and order_id=p_order_id and reseller_id=p_reseller_id and customer_id=p_customer_id;
  select * into o from vpn_orders where id=p_order_id and reseller_id=p_reseller_id and customer_id=p_customer_id;
  if k.id is null or o.id is null or not exists(select 1 from vpn_servers where id=k.server_id and environment=p_environment and access_pool_id=p_pool_id) then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  return jsonb_build_object('key',to_jsonb(k),'order',to_jsonb(o));
end $$;

create function public.read_server_operation_item(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_fence bigint,p_item_key text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare value jsonb;
begin
  perform require_server_operation_lease(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  select checkpoint into value from server_operation_items where operation_id=p_operation_id and item_key=p_item_key;
  return value;
end $$;

create function public.drain_server_operation_source(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_fence bigint,p_server_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare o server_operations;
begin
  perform begin_server_operation_write(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  select * into o from server_operations where id=p_operation_id;
  if o.kind not in ('replace','move_retire') or (o.payload->>'source_server_id')::uuid is distinct from p_server_id or
    not exists(select 1 from server_operation_locks where operation_id=p_operation_id and resource_key='server:'||p_server_id::text) then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  update vpn_servers set is_active=false where id=p_server_id and environment=p_environment and access_pool_id=p_pool_id;
  if not found then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  return true;
end $$;

create function public.move_server_operation_key(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_fence bigint,p_key_id uuid,p_order_id uuid,p_reseller_id uuid,p_customer_id uuid,p_source_id uuid,p_destination_id uuid,p_expected_key jsonb,p_expected_order jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare k vpn_keys; o vpn_orders; field text; actual_key jsonb; actual_order jsonb;
begin
  perform begin_server_operation_write(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  if p_source_id=p_destination_id or (select count(*) from server_operation_locks where operation_id=p_operation_id
    and resource_key=any(array['server:'||p_source_id::text,'server:'||p_destination_id::text]))<>2 then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  if not exists(select 1 from vpn_servers where id=p_destination_id and environment=p_environment and access_pool_id=p_pool_id) then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  perform 1 from vpn_servers where id in (p_source_id,p_destination_id) order by id for update;
  if not exists(select 1 from vpn_servers where id=p_destination_id and is_active=true and status='active') then raise exception 'DESTINATION_NOT_READY'; end if;
  select * into o from vpn_orders where id=p_order_id and reseller_id=p_reseller_id and customer_id=p_customer_id for update;
  select * into k from vpn_keys where id=p_key_id and order_id=p_order_id and reseller_id=p_reseller_id and customer_id=p_customer_id for update;
  if o.id is null or k.id is null or k.status<>'active' or k.deleted_at is not null or o.status<>'active'
    or o.expiry_date is null or o.expiry_date<(clock_timestamp() at time zone 'Asia/Bangkok')::date
    or k.server_id not in (p_source_id,p_destination_id) then raise exception 'ACCESS_STATE_CHANGED'; end if;
  actual_key:=to_jsonb(k); actual_order:=to_jsonb(o);
  if not exists(select 1 from vpn_servers where id=p_destination_id and supported_protocols @> array[k.protocol]) then raise exception 'DESTINATION_PROTOCOL_MISMATCH'; end if;
  foreach field in array array['id','order_id','customer_id','reseller_id','outline_key_id','protocol','status','deleted_at','access_url','data_limit_bytes'] loop
    if (actual_key->field) is distinct from (p_expected_key->field) then raise exception 'ACCESS_STATE_CHANGED'; end if;
  end loop;
  foreach field in array array['id','customer_id','reseller_id','status','expiry_date','quota_limit_bytes','usage_baseline_bytes','payment_status','review_status'] loop
    if (actual_order->field) is distinct from (p_expected_order->field) then raise exception 'ACCESS_STATE_CHANGED'; end if;
  end loop;
  if k.server_id=p_source_id then
    update vpn_keys set server_id=p_destination_id where id=k.id returning * into k;
  end if;
  return to_jsonb(k);
end $$;

create function public.repair_server_operation_assignments(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_fence bigint,p_key_id uuid,p_order_id uuid,p_reseller_id uuid,p_customer_id uuid,p_destination_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform begin_server_operation_write(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  if not exists(select 1 from vpn_keys where id=p_key_id and order_id=p_order_id and reseller_id=p_reseller_id and customer_id=p_customer_id
    and server_id=p_destination_id and status='active' and deleted_at is null)
    or not exists(select 1 from server_operation_locks where operation_id=p_operation_id and resource_key='server:'||p_destination_id::text) then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  update token_server_assignments set server_id=p_destination_id where vpn_key_id=p_key_id and is_active=true;
  return true;
end $$;

create function public.verify_server_operation_assignments(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_fence bigint,p_key_id uuid,p_order_id uuid,p_reseller_id uuid,p_customer_id uuid,p_destination_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform read_server_operation_access(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence,p_key_id,p_order_id,p_reseller_id,p_customer_id);
  return not exists(select 1 from token_server_assignments where vpn_key_id=p_key_id and is_active=true and server_id<>p_destination_id);
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and p.proname=any(array['begin_server_operation_write','guard_server_lifecycle_mutation','lock_server_operation_server','read_server_operation_access',
      'read_server_operation_item','drain_server_operation_source','move_server_operation_key',
      'repair_server_operation_assignments','verify_server_operation_assignments']) loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
    if f.proname not in ('begin_server_operation_write','guard_server_lifecycle_mutation') then execute format('grant execute on function %s to service_role',f.signature); end if;
  end loop;
end $$;

commit;
