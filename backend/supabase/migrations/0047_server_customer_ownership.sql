begin;
create function public.register_server_customer_user(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_guard_id uuid,p_server_id uuid,p_username text,p_subscription_key_hash text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare g server_customer_mutation_guards; receipt jsonb; prior server_infrastructure_resources;
begin
  perform require_server_operation_scope(p_environment,p_pool_id,p_database_identity,p_panel_identity);
  select * into g from server_customer_mutation_guards where guard_id=p_guard_id for update;
  if not found or g.environment is distinct from p_environment or g.access_pool_id is distinct from p_pool_id or g.status<>'running'
    or g.lease_until<=clock_timestamp() or not ('server:'||p_server_id::text)=any(g.resource_keys) then raise exception 'STALE_FENCE'; end if;
  if p_username is null or p_username !~ '^[A-Za-z0-9_]{1,100}$' or p_subscription_key_hash is null or p_subscription_key_hash !~ '^[a-f0-9]{64}$'
    or not exists(select 1 from server_infrastructure_resources where environment=p_environment and access_pool_id=p_pool_id and kind='server' and resource_id=p_server_id::text)
    then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  receipt:=jsonb_build_object('id',p_username,'kind','user','environment',p_environment,'poolId',p_pool_id,'databaseIdentity',p_database_identity,
    'panelIdentity',p_panel_identity,'protected',false,'customerGuardId',p_guard_id,'subscriptionKeyHash',p_subscription_key_hash);
  perform pg_advisory_xact_lock(hashtextextended(p_panel_identity||'user'||p_username,0));
  select * into prior from server_infrastructure_resources where panel_identity=p_panel_identity and kind='user' and provider='' and resource_id=p_username for update;
  if found then
    if prior.environment is distinct from p_environment or prior.access_pool_id is distinct from p_pool_id or prior.body is distinct from receipt then raise exception 'OWNERSHIP_REGISTRATION_CONFLICT'; end if;
    return prior.body;
  end if;
  insert into server_infrastructure_resources(environment,access_pool_id,database_identity,panel_identity,kind,resource_id,body)
    values(p_environment,p_pool_id,p_database_identity,p_panel_identity,'user',p_username,receipt);
  return receipt;
end $$;
revoke all on function public.register_server_customer_user(text,uuid,text,text,uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.register_server_customer_user(text,uuid,text,text,uuid,uuid,text,text) to service_role;
notify pgrst,'reload schema';
commit;
