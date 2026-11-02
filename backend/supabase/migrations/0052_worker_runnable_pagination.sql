begin;

create index if not exists server_operations_runnable_cursor
  on public.server_operations(environment,access_pool_id,created_at desc,id desc)
  where status in ('queued','running');

-- Separate worker paging from the operator's existing summary listing. The
-- timestamp/UUID pair is exclusive, so timestamp ties and deleted cursor rows
-- do not cause repeats or skipped operations. New arrivals precede the cursor.
create or replace function public.list_runnable_server_operations(
  p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,
  p_limit integer,p_owner uuid,p_after_created_at timestamptz default null,p_after_id uuid default null)
returns setof jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform require_server_operation_scope(p_environment,p_pool_id,p_database_identity,p_panel_identity);
  if (p_after_created_at is null) <> (p_after_id is null) or
    (p_after_created_at is not null and not isfinite(p_after_created_at)) then
    raise exception 'INVALID_OPERATION';
  end if;
  return query select to_jsonb(o) from server_operations o
    where o.environment=p_environment and o.access_pool_id=p_pool_id
      and o.database_identity=p_database_identity and o.panel_identity=p_panel_identity
      and o.status in ('queued','running')
      and (o.lease_until is null or o.lease_until<=clock_timestamp() or o.lease_owner=p_owner)
      and (o.checkpoint->>'nextAttemptAt' is null or (o.checkpoint->>'nextAttemptAt')::timestamptz<=clock_timestamp())
      and (p_after_created_at is null or (o.created_at,o.id)<(p_after_created_at,p_after_id))
    order by o.created_at desc,o.id desc
    limit greatest(1,least(coalesce(p_limit,10),100));
end $$;

revoke all on function public.list_runnable_server_operations(text,uuid,text,text,integer,uuid,timestamptz,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.list_runnable_server_operations(text,uuid,text,text,integer,uuid,timestamptz,uuid)
  to service_role;

notify pgrst, 'reload schema';
commit;
