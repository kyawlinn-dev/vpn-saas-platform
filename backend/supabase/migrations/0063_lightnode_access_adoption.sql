-- Release-only extension: protected access adoption; no live metadata is changed.
begin;
create or replace function public.adopt_existing_node(
  p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,
  p_document text,p_approved_hash text,p_credentials jsonb default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp set lock_timeout='5s' as $$
declare d jsonb; s vpn_servers; sid uuid; lifecycle boolean; resource jsonb; node jsonb; receipt jsonb; prior server_infrastructure_resources;
  saved existing_node_adoptions; snapshot jsonb; provenance jsonb; protocols text[]; ss_ids integer[]; binding jsonb; public_service integer;
  expected_receipts jsonb; r jsonb; result jsonb; body jsonb; token text;
begin
  if p_document is null or octet_length(p_document)>65536 or p_approved_hash is null
    or p_approved_hash !~ '^[a-f0-9]{64}$' or encode(sha256(convert_to(p_document,'UTF8')),'hex')<>p_approved_hash then
    raise exception 'ADOPTION_APPROVAL_REQUIRED'; end if;
  d:=p_document::jsonb; sid:=(d->>'serverId')::uuid; lifecycle:=(d->>'lifecycle')::boolean;
  if d->>'version' is distinct from '1' or sid is null or lifecycle is null or d->'scope' is distinct from jsonb_build_object(
    'environment',p_environment,'poolId',p_pool_id,'databaseIdentity',p_database_identity,'panelIdentity',p_panel_identity) then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  -- Operator-only, short metadata transaction. Table locks also cover legacy rows
  -- without lifecycle coordination and serialize against the existing fenced RPCs.
  lock table server_operation_runtime_bindings,server_access_pools,server_operations,server_operation_locks,
    server_customer_mutation_guards,server_service_operation_locks,vpn_servers,vpn_keys,server_infrastructure_resources,existing_node_adoptions in share row exclusive mode;
  perform require_server_operation_scope(p_environment,p_pool_id,p_database_identity,p_panel_identity);
  select * into saved from existing_node_adoptions where manifest_hash=p_approved_hash;
  if found then
    select md5(existing_node_adoption_identity(t)::text) into token from vpn_servers t where id=sid;
    if saved.server_id<>sid or saved.document<>d or saved.server_token is distinct from token then raise exception 'ADOPTION_STATE_CHANGED'; end if;
    for receipt in select value from jsonb_array_elements(d->'receipts') loop
      if not exists(select 1 from server_infrastructure_resources t where t.environment=p_environment and t.access_pool_id=p_pool_id
        and t.kind=receipt->>'kind' and t.provider=coalesce(receipt->>'provider','') and t.resource_id=receipt->>'id'
        and t.body=receipt||jsonb_build_object('manifestHash',p_approved_hash,'serverId',sid)) then raise exception 'ADOPTION_STATE_CHANGED'; end if;
    end loop;
    return saved.result;
  end if;
  snapshot:=inspect_existing_node_adoption(p_environment,p_pool_id,p_database_identity,p_panel_identity,sid);
  if (snapshot->>'busy')::boolean then raise exception 'ADOPTION_BUSY'; end if;
  if snapshot is distinct from d->'expected' then raise exception 'ADOPTION_STATE_CHANGED'; end if;
  select * into s from vpn_servers where id=sid;
  if not lifecycle and s.lifecycle_protected is false then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  resource:=d->'provider'; node:=d->'node';
  select provider_accounts into binding from server_operation_runtime_bindings where environment=p_environment and access_pool_id=p_pool_id;
  select vless_service_id into public_service from server_access_pools where id=p_pool_id;
  select array_agg(value order by value) into protocols from jsonb_array_elements_text(d->'supportedProtocols');
  select coalesce(array_agg(value::integer order by value::integer),'{}'::integer[]) into ss_ids from jsonb_array_elements_text(d->'ssServiceIds');
  if not server_capabilities_valid(protocols) or resource->>'provider' is null or resource->>'provider' not in ('digitalocean','vultr','lightnode')
    or (resource->>'provider'='lightnode' and lifecycle)
    or nullif(resource->>'id','') is null or nullif(resource->>'createdAt','') is null
    or not isfinite((resource->>'createdAt')::timestamptz) or jsonb_array_length(resource->'addresses')<1
    or not (resource->'addresses' ? (node->>'address')) or (node->>'id')::integer<=0
    or resource->>'accountId' is distinct from binding->>(resource->>'provider')
    or nullif(binding->>(resource->>'provider'),'') is null or (d->>'publicServiceId')::integer is distinct from public_service then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  if lifecycle and (d->>'sshHostKeySha256' is null or d->>'sshHostKeySha256' !~ '^SHA256:[A-Za-z0-9+/]{43}=?$'
    or s.ownership_provenance->>'purpose'='owner_authorized_shared_node_customer_access') then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  if s.id is not null and (s.panel_type is distinct from 'marzneshin' or s.provider is distinct from resource->>'provider'
    or rtrim(s.panel_url,'/') is distinct from p_panel_identity or s.host_ip is distinct from node->>'address'
    or (s.environment is not null and s.environment<>p_environment) or (s.access_pool_id is not null and s.access_pool_id<>p_pool_id)
    or (s.panel_node_id is not null and s.panel_node_id<>(node->>'id')::integer)
    or (s.provider_resource_id is not null and s.provider_resource_id<>resource->>'id')
    or (s.droplet_id is not null and (resource->>'provider'<>'digitalocean' or s.droplet_id::text<>resource->>'id'))
    or coalesce(s.marzneshin_service_ids,'{}') is distinct from ss_ids
    or s.marzneshin_vless_service_ids is distinct from array[public_service]) then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  if exists(select 1 from vpn_servers t where t.id<>sid
      and (not lifecycle and t.status='decommissioned' and t.is_active is false and t.panel_type='outline'
        and t.environment is null and t.access_pool_id is null and t.panel_node_id is null
        and t.provider_resource_id is null and t.ownership_provenance is null and t.lifecycle_protected is true
        and not exists(select 1 from vpn_keys k where k.server_id=t.id and (k.status in ('active','pending') or k.status is null))) is not true
      and (t.host_ip=node->>'address'
      or (t.provider=resource->>'provider' and (t.provider_resource_id=resource->>'id' or t.droplet_id::text=resource->>'id'))
      or (rtrim(t.panel_url,'/')=p_panel_identity and t.panel_node_id=(node->>'id')::integer)))
    or exists(select 1 from server_infrastructure_resources t where t.kind='provider' and t.provider=resource->>'provider'
      and t.resource_id=resource->>'id' and (t.body->>'serverId' is distinct from sid::text or t.environment<>p_environment or t.access_pool_id<>p_pool_id)) then
    raise exception 'ADOPTION_RESOURCE_COLLISION'; end if;
  -- Reconstruct receipt identities instead of accepting arbitrary registry grants.
  body:=d->'scope'||jsonb_build_object('protected',not lifecycle,'method',case when lifecycle then 'owner_authorized_lifecycle_adoption' else 'owner_authorized_access_adoption' end);
  expected_receipts:=jsonb_build_array(body||(case when lifecycle then jsonb_build_object('provider',resource->'provider') else '{}'::jsonb end)||jsonb_build_object('id',sid,'kind','server','panel_node_id',node->'id',
    'provider_resource_id',case when lifecycle then resource->'id' else 'null'::jsonb end,'addresses',jsonb_build_array(node->>'address'),'supported_protocols',to_jsonb(protocols)));
  if lifecycle then
    expected_receipts:=expected_receipts||jsonb_build_array(body||resource||jsonb_build_object('kind','provider','sshHostKeySha256',d->'sshHostKeySha256'),
      body||jsonb_build_object('id',node->>'id','kind','node','provider_resource_id',resource->'id','address',node->'address','addresses',jsonb_build_array(node->>'address')));
    for r in select value from jsonb_array_elements(d->'inbounds') loop
      expected_receipts:=expected_receipts||jsonb_build_array(body||jsonb_build_object('id',r->>'id','kind','inbound','panel_node_id',node->'id','protocol',r->'protocol'));
    end loop;
    for r in select value from jsonb_array_elements(d->'hosts') loop
      expected_receipts:=expected_receipts||jsonb_build_array(body||jsonb_build_object('id',r->>'id','kind','host','node_id',node->'id','inbound_id',r->'inboundId','address',node->'address'));
    end loop;
    for r in select value from jsonb_array_elements(d->'services') where (value->>'id')::integer<>public_service loop
      if jsonb_array_length(r->'inboundIds')<>1 then raise exception 'ADOPTION_RECEIPTS_INVALID'; end if;
      expected_receipts:=expected_receipts||jsonb_build_array(body||jsonb_build_object('id',r->>'id','kind','service','node_ids',jsonb_build_array(node->'id'),'inbound_ids',r->'inboundIds',
        'protocol',(select value->'protocol' from jsonb_array_elements(d->'inbounds') where value->'id'=r->'inboundIds'->0)));
    end loop;
  end if;
  if d->'receipts' is distinct from expected_receipts then raise exception 'ADOPTION_RECEIPTS_INVALID'; end if;
  for receipt in select value from jsonb_array_elements(expected_receipts) loop
    select * into prior from server_infrastructure_resources t where t.panel_identity=p_panel_identity and t.kind=receipt->>'kind'
      and t.provider=coalesce(receipt->>'provider','') and t.resource_id=receipt->>'id';
    if found and (prior.environment<>p_environment or prior.access_pool_id<>p_pool_id or prior.database_identity<>p_database_identity
      or prior.body->>'serverId' is distinct from sid::text or (prior.body-'manifestHash'-'serverId')<>receipt) then raise exception 'ADOPTION_RESOURCE_COLLISION'; end if;
  end loop;
  provenance:=jsonb_build_object('method','adopted','environment',p_environment,'access_pool_id',p_pool_id,'panel_identity',p_panel_identity,
    'panel_node_id',node->'id','provider_resource_id',case when lifecycle then resource->'id' else 'null'::jsonb end,
    'ss_service_ids',to_jsonb(ss_ids),'verified_at',clock_timestamp(),'manifest_hash',p_approved_hash,
    'purpose',case when lifecycle then 'owner_authorized_existing_node_lifecycle' else 'owner_authorized_shared_node_customer_access' end);
  if s.id is null then
    r:=d->'registration';
    if r is null or r='null'::jsonb or nullif(btrim(r->>'name'),'') is null or length(r->>'name')>100
      or r->>'region' is distinct from resource->>'region' or (r->>'maxActiveKeys')::integer not between 1 and 100000
      or r->>'serverTier' not in ('trial','premium') or nullif(p_credentials->>'username','') is null or nullif(p_credentials->>'passwordEncrypted','') is null then
      raise exception 'ADOPTION_REGISTRATION_REQUIRED'; end if;
    insert into vpn_servers(id,name,provider,region,droplet_id,host_ip,status,is_active,is_default,max_active_keys,current_active_keys,sort_order,
      panel_type,panel_url,panel_public_url,panel_username,panel_password_encrypted,server_tier,marzneshin_service_ids,marzneshin_vless_service_ids,
      marzneshin_vless_trial_service_ids,environment,access_pool_id,panel_node_id,provider_resource_id,supported_protocols,lifecycle_protected,ownership_provenance)
    values(sid,r->>'name',resource->>'provider',r->>'region',case when resource->>'provider'='digitalocean' then (resource->>'id')::bigint end,
      node->>'address','active',true,false,(r->>'maxActiveKeys')::integer,0,0,'marzneshin',p_panel_identity,p_panel_identity,p_credentials->>'username',
      p_credentials->>'passwordEncrypted',r->>'serverTier',ss_ids,array[public_service],'{}',p_environment,p_pool_id,(node->>'id')::integer,
      case when lifecycle then resource->>'id' end,protocols,not lifecycle,provenance);
  else
    -- No customer/key/counter/service/trial/credential changes on existing rows.
    update vpn_servers set environment=p_environment,access_pool_id=p_pool_id,panel_node_id=(node->>'id')::integer,
      provider_resource_id=case when lifecycle then resource->>'id' end,supported_protocols=protocols,lifecycle_protected=not lifecycle,
      ownership_provenance=provenance where id=sid;
  end if;
  for receipt in select value from jsonb_array_elements(expected_receipts) loop
    insert into server_infrastructure_resources(environment,access_pool_id,database_identity,panel_identity,kind,provider,resource_id,body)
      values(p_environment,p_pool_id,p_database_identity,p_panel_identity,receipt->>'kind',coalesce(receipt->>'provider',''),receipt->>'id',
        receipt||jsonb_build_object('manifestHash',p_approved_hash,'serverId',sid))
      on conflict(environment,access_pool_id,kind,provider,resource_id) do update set body=excluded.body;
  end loop;
  result:=jsonb_build_object('adopted',true,'serverId',sid,'manifestHash',p_approved_hash,'lifecycle',lifecycle);
  select md5(existing_node_adoption_identity(t)::text) into token from vpn_servers t where id=sid;
  insert into existing_node_adoptions(manifest_hash,server_id,document,result,server_token) values(p_approved_hash,sid,d,result,token);
  return result;
end $$;

revoke all on function public.adopt_existing_node(text,uuid,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.adopt_existing_node(text,uuid,text,text,text,text,jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
