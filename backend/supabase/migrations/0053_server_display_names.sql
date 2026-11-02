begin;

create or replace function public.assign_server_operation_display(
  p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,
  p_operation_id uuid,p_owner uuid,p_fence bigint,p_server_id uuid,
  p_city text,p_country text,p_country_code text,p_flag text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare op server_operations; candidate vpn_servers; next_number integer;
begin
  op:=require_server_operation_lease(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  if op.kind not in ('add','replace') then raise exception 'INVALID_OPERATION'; end if;
  if p_city is null or length(trim(p_city)) not between 1 and 80 or p_city<>trim(p_city)
    or p_city ~ '[[:cntrl:]#]' or length(coalesce(p_country,''))>100 or coalesce(p_country,'') ~ '[[:cntrl:]]'
    or (p_country_code is not null and p_country_code !~ '^[A-Z]{2}$')
    or (p_flag is not null and length(p_flag)<>2) then raise exception 'SERVER_DISPLAY_INVALID'; end if;
  -- Serialize city allocation across operations, including retries and retired names.
  perform pg_advisory_xact_lock(hashtextextended(p_environment||p_pool_id::text||'display:'||lower(p_city),0));
  select * into candidate from vpn_servers where id=p_server_id and environment=p_environment and access_pool_id=p_pool_id
    and ownership_provenance->>'operation_id'=p_operation_id::text and lifecycle_protected=false for update;
  if not found or not exists(select 1 from server_operation_locks where operation_id=p_operation_id
    and resource_key='server:'||p_server_id::text) then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  if candidate.display_city is not null and candidate.name !~ '^NovaNet [a-z0-9_-]+ [a-f0-9-]+$'
    and candidate.name !~ '^nn-(development|production)-' then return to_jsonb(candidate); end if;
  select coalesce(max(value::integer),0)+1 into next_number from (
    select substring(s.name from length(p_city)+3) as value from vpn_servers s
    where (s.environment is null or (s.environment=p_environment and s.access_pool_id=p_pool_id))
      and left(lower(s.name),length(p_city)+2)=lower(p_city)||' #'
  ) names where value ~ '^[1-9][0-9]{0,5}$';
  if next_number>999999 then raise exception 'SERVER_DISPLAY_INVALID'; end if;
  perform begin_server_operation_write(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  update vpn_servers set name=p_city||' #'||next_number,display_city=p_city,display_country=p_country,
    region_code=p_country_code,flag_emoji=p_flag,updated_at=clock_timestamp() where id=candidate.id returning * into candidate;
  return to_jsonb(candidate);
end $$;

revoke all on function public.assign_server_operation_display(text,uuid,text,text,uuid,uuid,bigint,uuid,text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.assign_server_operation_display(text,uuid,text,text,uuid,uuid,bigint,uuid,text,text,text,text) to service_role;
notify pgrst, 'reload schema';
commit;
