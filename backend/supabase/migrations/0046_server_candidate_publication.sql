begin;

create function public.ensure_server_operation_candidate(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_fence bigint,p_server jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare op server_operations; candidate vpn_servers; provider_receipt jsonb; node_receipt jsonb; protocols text[]; ss_ids integer[]; public_service integer; receipt jsonb;
begin
  op:=require_server_operation_lease(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  if op.kind not in ('add','replace') then raise exception 'INVALID_OPERATION'; end if;
  select body into provider_receipt from server_infrastructure_resources where environment=p_environment and access_pool_id=p_pool_id and kind='provider'
    and provider=p_server->>'provider' and resource_id=p_server->>'provider_resource_id' and operation_id=p_operation_id;
  select body into node_receipt from server_infrastructure_resources where environment=p_environment and access_pool_id=p_pool_id and kind='node'
    and resource_id=p_server->>'panel_node_id' and operation_id=p_operation_id;
  if provider_receipt is null or node_receipt is null or node_receipt->>'provider_resource_id' is distinct from provider_receipt->>'id'
    or not (provider_receipt->'addresses' ? (p_server->>'host_ip')) or p_server->>'panel_url' is distinct from p_panel_identity
    or p_server->>'provider' is distinct from op.payload->>'provider' or p_server->>'region' is distinct from op.payload->>'region'
    or nullif(p_server->>'panel_password_encrypted','') is null then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  protocols:=array(select jsonb_array_elements_text(op.payload->'supported_protocols'));
  ss_ids:=array(select value::integer from jsonb_array_elements_text(coalesce(p_server->'marzneshin_service_ids','[]')) value);
  if not server_capabilities_valid(protocols) or ('shadowsocks'=any(protocols) and cardinality(ss_ids)<>1)
    or (not 'shadowsocks'=any(protocols) and cardinality(ss_ids)<>0) then raise exception 'SERVICE_CONFIGURATION_INVALID'; end if;
  if exists(select 1 from unnest(ss_ids) sid where not exists(select 1 from server_infrastructure_resources where environment=p_environment and access_pool_id=p_pool_id
    and kind='service' and resource_id=sid::text and operation_id=p_operation_id and body->>'protocol'='shadowsocks' and body->'node_ids' @> jsonb_build_array((p_server->>'panel_node_id')::integer))) then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  select vless_service_id into public_service from server_access_pools where id=p_pool_id and environment=p_environment;
  select * into candidate from vpn_servers where environment=p_environment and access_pool_id=p_pool_id and ownership_provenance->>'operation_id'=p_operation_id::text for update;
  if found then
    if candidate.provider_resource_id is distinct from p_server->>'provider_resource_id' or candidate.panel_node_id is distinct from (p_server->>'panel_node_id')::integer then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
    return to_jsonb(candidate);
  end if;
  if (p_server->>'max_active_keys')::integer not between 1 and 100000 then raise exception 'INVALID_OPERATION'; end if;
  perform begin_server_operation_write(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  insert into vpn_servers(name,provider,region,droplet_id,host_ip,status,is_active,is_default,max_active_keys,current_active_keys,sort_order,panel_type,panel_url,panel_public_url,panel_username,panel_password_encrypted,
    server_tier,environment,access_pool_id,panel_node_id,provider_resource_id,supported_protocols,marzneshin_service_ids,marzneshin_vless_service_ids,marzneshin_vless_trial_service_ids,lifecycle_protected,ownership_provenance)
  values(p_server->>'name',p_server->>'provider',p_server->>'region',case when p_server->>'provider'='digitalocean' then (p_server->>'provider_resource_id')::bigint else null end,
    p_server->>'host_ip','provisioning',false,false,(p_server->>'max_active_keys')::integer,0,0,'marzneshin',p_server->>'panel_url',p_server->>'panel_public_url',p_server->>'panel_username',p_server->>'panel_password_encrypted',
    'premium',p_environment,p_pool_id,(p_server->>'panel_node_id')::integer,p_server->>'provider_resource_id',protocols,ss_ids,array[public_service],array[]::integer[],false,
    jsonb_build_object('method','provisioned','environment',p_environment,'access_pool_id',p_pool_id,'panel_identity',p_panel_identity,'panel_node_id',(p_server->>'panel_node_id')::integer,
      'provider_resource_id',p_server->>'provider_resource_id','ss_service_ids',ss_ids,'verified_at',clock_timestamp(),'operation_id',p_operation_id,'addresses',provider_receipt->'addresses')) returning * into candidate;
  perform lock_server_operation_server(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence,candidate.id);
  receipt:=jsonb_build_object('id',candidate.id,'kind','server','provider',candidate.provider,'environment',p_environment,'poolId',p_pool_id,'databaseIdentity',p_database_identity,'panelIdentity',p_panel_identity,
    'operationId',p_operation_id,'protected',false,'panel_node_id',candidate.panel_node_id,'provider_resource_id',candidate.provider_resource_id,'supported_protocols',protocols,'addresses',provider_receipt->'addresses');
  insert into server_infrastructure_resources(environment,access_pool_id,database_identity,panel_identity,kind,provider,resource_id,operation_id,body)
    values(p_environment,p_pool_id,p_database_identity,p_panel_identity,'server',candidate.provider,candidate.id::text,p_operation_id,receipt);
  return to_jsonb(candidate);
end $$;

create function public.publish_server_operation_candidate(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_fence bigint,p_server_id uuid,p_node_id integer,p_provider_resource_id text,p_verified_at timestamptz)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare candidate vpn_servers;
begin
  perform begin_server_operation_write(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  if p_verified_at is null or p_verified_at>clock_timestamp()+interval '5 seconds' or p_verified_at<clock_timestamp()-interval '5 minutes' then raise exception 'CANDIDATE_VERIFICATION_FAILED'; end if;
  select * into candidate from vpn_servers where id=p_server_id and environment=p_environment and access_pool_id=p_pool_id and panel_node_id=p_node_id
    and provider_resource_id=p_provider_resource_id and ownership_provenance->>'operation_id'=p_operation_id::text for update;
  if not found or candidate.status not in ('provisioning','active') then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  if not exists(select 1 from server_operation_locks where operation_id=p_operation_id and resource_key='server:'||candidate.id::text) then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  update vpn_servers set status='active',is_active=true,last_error=null,updated_at=clock_timestamp() where id=candidate.id returning * into candidate;
  insert into server_health_status(server_id,outline_api_status,last_checked_at,last_success_at,last_error,consecutive_failures,updated_at)
    values(candidate.id,'healthy',p_verified_at,p_verified_at,null,0,clock_timestamp())
    on conflict(server_id) do update set outline_api_status='healthy',last_checked_at=p_verified_at,last_success_at=p_verified_at,last_error=null,consecutive_failures=0,updated_at=clock_timestamp();
  return to_jsonb(candidate);
end $$;

create function public.retire_server_operation_resource(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_fence bigint,p_server_id uuid,p_provider_resource_id text,p_node_id integer)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare op server_operations; candidate vpn_servers;
begin
  op:=require_server_operation_lease(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  perform begin_server_operation_write(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  select * into candidate from vpn_servers where id=p_server_id and environment=p_environment and access_pool_id=p_pool_id and provider_resource_id=p_provider_resource_id and panel_node_id=p_node_id for update;
  if not found or candidate.lifecycle_protected is distinct from false or
    not coalesce((candidate.ownership_provenance->>'operation_id'=p_operation_id::text or (op.kind in ('replace','move_retire') and op.payload->>'source_server_id'=candidate.id::text and op.payload->'confirmations'->>'delete_source'='true')),false) then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  if exists(select 1 from vpn_keys where server_id=candidate.id and status in ('active','pending') and deleted_at is null)
    or exists(select 1 from token_server_assignments where server_id=candidate.id and is_active=true) then raise exception 'RETIREMENT_BLOCKED'; end if;
  update vpn_servers set status='decommissioned',is_active=false,updated_at=clock_timestamp() where id=candidate.id;
  return true;
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and p.proname=any(array['ensure_server_operation_candidate','publish_server_operation_candidate','retire_server_operation_resource']) loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
notify pgrst,'reload schema';
commit;
