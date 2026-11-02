begin;
create table public.server_operation_quotes (
  id uuid primary key, environment text not null, access_pool_id uuid not null,
  body jsonb not null check(jsonb_typeof(body)='object' and octet_length(body::text)<=65536),
  expires_at timestamptz not null, used_operation_id uuid references public.server_operations(id),
  created_at timestamptz not null default clock_timestamp(),
  foreign key(access_pool_id,environment) references public.server_access_pools(id,environment)
);
alter table public.server_operation_quotes enable row level security;
revoke all on public.server_operation_quotes from public,anon,authenticated,service_role;
grant select on public.server_operation_quotes to service_role;
alter table public.server_operations add column quote_id uuid unique references public.server_operation_quotes(id),
  add column control_requested text check(control_requested is null or control_requested='cancel');

create function public.store_server_operation_quote(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_quote_id uuid,p_body jsonb,p_expires_at timestamptz)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform require_server_operation_scope(p_environment,p_pool_id,p_database_identity,p_panel_identity);
  if p_expires_at<=clock_timestamp() or p_expires_at>clock_timestamp()+interval '15 minutes' or
    p_body->>'environment' is distinct from p_environment or p_body->>'poolId' is distinct from p_pool_id::text or
    p_body->>'databaseIdentity' is distinct from p_database_identity or p_body->>'panelIdentity' is distinct from p_panel_identity then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  insert into server_operation_quotes(id,environment,access_pool_id,body,expires_at) values(p_quote_id,p_environment,p_pool_id,p_body,p_expires_at);
  return p_body;
end $$;
create function public.read_server_operation_quote(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_quote_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare value jsonb;
begin
  perform require_server_operation_scope(p_environment,p_pool_id,p_database_identity,p_panel_identity);
  select body into value from server_operation_quotes where id=p_quote_id and environment=p_environment and access_pool_id=p_pool_id;
  return value;
end $$;
create function public.find_server_operation_request(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare o server_operations;
begin
  perform require_server_operation_scope(p_environment,p_pool_id,p_database_identity,p_panel_identity);
  select * into o from server_operations where environment=p_environment and access_pool_id=p_pool_id and idempotency_key=p_idempotency_key;
  if not found then return null; end if; return to_jsonb(o);
end $$;
create function public.create_quoted_server_operation(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_quote_id uuid,p_kind text,p_idempotency_key text,p_payload jsonb,p_payload_hash text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare q server_operation_quotes; o server_operations;
begin
  perform require_server_operation_scope(p_environment,p_pool_id,p_database_identity,p_panel_identity);
  perform pg_advisory_xact_lock(hashtextextended(p_environment||p_pool_id::text||p_idempotency_key,0));
  select * into o from server_operations where environment=p_environment and access_pool_id=p_pool_id and idempotency_key=p_idempotency_key;
  if found then
    if o.payload_hash<>p_payload_hash or o.payload<>p_payload or o.kind<>p_kind then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return to_jsonb(o);
  end if;
  select * into q from server_operation_quotes where id=p_quote_id and environment=p_environment and access_pool_id=p_pool_id for update;
  if not found or q.expires_at<=clock_timestamp() then raise exception 'QUOTE_EXPIRED'; end if;
  if q.used_operation_id is not null then raise exception 'QUOTE_ALREADY_USED'; end if;
  if q.body->>'kind' is distinct from p_kind or p_payload->>'quote_id' is distinct from p_quote_id::text or
    (q.body->'choice'->>'source_server_id') is distinct from (p_payload->>'source_server_id') or
    (q.body->'choice'->>'destination_server_id') is distinct from (p_payload->>'destination_server_id') or
    (q.body->'price') is distinct from (p_payload->'quote') or (q.body->'deletionScope') is distinct from (p_payload->'delete_scope') then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  if (q.body->'price'<>'null'::jsonb and p_payload->'confirmations'->>'cost' is distinct from 'true') or
    (p_kind='replace' and p_payload->'confirmations'->>'temporary_billing' is distinct from 'true') or
    (p_kind<>'add' and p_payload->'confirmations'->>'delete_source' is distinct from 'true') then raise exception 'CONFIRMATION_REQUIRED'; end if;
  o:=create_server_operation(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_kind,p_idempotency_key,p_payload,p_payload_hash);
  update server_operations set quote_id=p_quote_id where id=o.id returning * into o;
  update server_operation_quotes set used_operation_id=o.id where id=q.id;
  return to_jsonb(o);
end $$;
create function public.list_server_operations(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_limit integer,p_runnable_only boolean,p_owner uuid default null)
returns setof jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform require_server_operation_scope(p_environment,p_pool_id,p_database_identity,p_panel_identity);
  return query select to_jsonb(o)||jsonb_build_object('item_counts',jsonb_build_object(
    'total',(select count(*) from server_operation_items i where i.operation_id=o.id),
    'verified',(select count(*) from server_operation_items i where i.operation_id=o.id and i.status='verified')))
    from server_operations o where o.environment=p_environment and o.access_pool_id=p_pool_id
      and (not p_runnable_only or (o.status in ('queued','running') and (o.lease_until is null or o.lease_until<=clock_timestamp() or o.lease_owner=p_owner)))
      and (not p_runnable_only or o.checkpoint->>'nextAttemptAt' is null or (o.checkpoint->>'nextAttemptAt')::timestamptz<=clock_timestamp())
    order by o.created_at desc limit greatest(1,least(coalesce(p_limit,50),100));
end $$;
create function public.read_server_operation_summary(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare o server_operations;
begin
  o:=read_server_operation(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id);
  return to_jsonb(o)||jsonb_build_object('item_counts',jsonb_build_object(
    'total',(select count(*) from server_operation_items where operation_id=o.id),
    'verified',(select count(*) from server_operation_items where operation_id=o.id and status='verified')));
end $$;
create function public.request_server_operation_control(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_action text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare o server_operations;
begin
  perform require_server_operation_scope(p_environment,p_pool_id,p_database_identity,p_panel_identity);
  select * into o from server_operations where id=p_operation_id and environment=p_environment and access_pool_id=p_pool_id for update;
  if not found then raise exception 'OPERATION_NOT_FOUND'; end if;
  if p_action='resume' and o.status in ('blocked','paused','partial') then
    update server_operations set status='queued',control_requested=null,lease_owner=null,lease_until=null,fence=fence+1,
      checkpoint=(checkpoint-'nextAttemptAt'-'error_code')||jsonb_build_object('attempts',0),updated_at=clock_timestamp() where id=o.id returning * into o;
  elsif p_action='cancel' and o.status in ('queued','running') and o.stage not in ('cleanup_pending','finalizing') then
    update server_operations set control_requested='cancel',updated_at=clock_timestamp() where id=o.id returning * into o;
  else raise exception 'CONTROL_CONFLICT'; end if;
  return to_jsonb(o);
end $$;
create or replace function public.release_server_operation(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_fence bigint,p_status text)
returns public.server_operations language plpgsql security definer set search_path=public,pg_temp as $$
declare o server_operations;
begin
  o:=require_server_operation_lease(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  if p_status not in ('completed','cancelled','failed') then raise exception 'OPERATION_NOT_TERMINAL'; end if;
  if p_status='cancelled' and o.stage in ('queued','provisioning','configuring','registering','verifying','inventory','publishing')
    and o.checkpoint->>'cancellationReconciled'='true' then
    if exists(select 1 from server_operation_items where operation_id=o.id and status not in ('claimed','verified')) then raise exception 'ITEM_STATE_CONFLICT'; end if;
    update server_operation_items set status='verified',checkpoint=checkpoint||jsonb_build_object('abandoned_before_migration',true)
      where operation_id=o.id and status='claimed';
  elsif exists(select 1 from server_operation_items where operation_id=o.id and status<>'verified') then raise exception 'ITEM_STATE_CONFLICT'; end if;
  delete from server_operation_locks where operation_id=o.id;
  update server_operations set status=p_status,lease_owner=null,lease_until=null,updated_at=clock_timestamp() where id=o.id returning * into o;
  return o;
end $$;
do $$ declare f record; begin
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(array[
    'store_server_operation_quote','read_server_operation_quote','find_server_operation_request','create_quoted_server_operation','list_server_operations','read_server_operation_summary','request_server_operation_control']) loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
commit;
