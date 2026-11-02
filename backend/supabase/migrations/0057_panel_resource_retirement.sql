begin;

-- Keep recovery reads/API intact until an explicitly retired numeric ID is reused.
-- No existing receipt is retired by this migration. Terminal historical receipts
-- require a separate owner-reviewed reconciliation, never an automatic backfill.
alter table public.server_infrastructure_resources
  add column if not exists retired_at timestamptz,
  add column if not exists deletion_operation_id uuid references public.server_operations(id);

-- Historical inactive/decommissioned rows retain their node ID for audit but
-- cannot reserve a recycled panel ID. Unknown state still reserves the ID.
alter table public.vpn_servers drop constraint if exists vpn_servers_registered_node_unique;
create unique index if not exists vpn_servers_registered_node_unique
  on public.vpn_servers(access_pool_id,panel_node_id)
  where status is distinct from 'decommissioned' or is_active is distinct from false;

create table if not exists public.server_panel_resource_archive (
  archive_id uuid primary key default gen_random_uuid(),
  environment text not null,
  access_pool_id uuid not null,
  database_identity text not null,
  panel_identity text not null,
  kind text not null check(kind in ('node','inbound','host','service')),
  provider text not null check(provider=''),
  resource_id text not null,
  operation_id uuid not null references public.server_operations(id),
  body jsonb not null check(jsonb_typeof(body)='object' and octet_length(body::text)<=65536),
  created_at timestamptz not null,
  deletion_operation_id uuid not null references public.server_operations(id),
  deletion_owner uuid not null,
  deletion_fence bigint not null check(deletion_fence>0),
  archived_at timestamptz not null default clock_timestamp(),
  foreign key(access_pool_id,environment) references public.server_access_pools(id,environment)
);
create index if not exists server_panel_resource_archive_receipt
  on public.server_panel_resource_archive(panel_identity,kind,resource_id,deletion_operation_id);
alter table public.server_panel_resource_archive enable row level security;
revoke all on public.server_panel_resource_archive from public,anon,authenticated,service_role;

create or replace function public.guard_server_panel_resource_archive()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  raise exception 'ARCHIVE_APPEND_ONLY';
end $$;
drop trigger if exists server_panel_resource_archive_immutable on public.server_panel_resource_archive;
create trigger server_panel_resource_archive_immutable before update or delete or truncate
  on public.server_panel_resource_archive for each statement execute function public.guard_server_panel_resource_archive();
revoke all on function public.guard_server_panel_resource_archive() from public,anon,authenticated,service_role;

create or replace function public.archive_server_panel_resource(
  p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,
  p_operation_id uuid,p_owner uuid,p_fence bigint,p_kind text,p_resource_id text,p_expected_body jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  op server_operations;
  receipt server_infrastructure_resources;
  parent_node server_infrastructure_resources;
  source vpn_servers;
  node_id text;
  inbound_id text;
  linked_id text;
begin
  op:=require_server_operation_lease(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  if p_owner is null or p_fence is null or p_fence<1
    or op.database_identity is distinct from p_database_identity or op.panel_identity is distinct from p_panel_identity
    or p_kind is null or p_kind not in ('node','inbound','host','service')
    or p_resource_id is null or p_resource_id !~ '^[1-9][0-9]*$'
    or jsonb_typeof(p_expected_body) is distinct from 'object'
    or p_expected_body->>'environment' is distinct from p_environment
    or p_expected_body->>'poolId' is distinct from p_pool_id::text
    or p_expected_body->>'databaseIdentity' is distinct from p_database_identity
    or p_expected_body->>'panelIdentity' is distinct from p_panel_identity
    or p_expected_body->>'kind' is distinct from p_kind or p_expected_body->>'id' is distinct from p_resource_id
    or coalesce(p_expected_body->>'provider','')<>'' then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  if p_expected_body->'protected' is distinct from 'false'::jsonb
    or (p_kind='service' and exists(select 1 from server_access_pools
      where panel_identity=p_panel_identity and vless_service_id::text=p_resource_id)) then raise exception 'PROTECTED_RESOURCE'; end if;

  -- Identical serialization key to 0045 registration (panel provider is '').
  perform pg_advisory_xact_lock(hashtextextended(p_panel_identity||p_kind||''||p_resource_id,0));
  select * into receipt from server_infrastructure_resources where panel_identity=p_panel_identity
    and kind=p_kind and provider='' and resource_id=p_resource_id for update;
  if found then
    if receipt.environment is distinct from p_environment or receipt.access_pool_id is distinct from p_pool_id
      or receipt.database_identity is distinct from p_database_identity then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
    -- Check the current incarnation BEFORE replay lookup. Old retries cannot
    -- retire a replacement, even if their expected body exists in the archive.
    if receipt.body is distinct from p_expected_body then raise exception 'OWNERSHIP_REGISTRATION_CONFLICT'; end if;
    if receipt.retired_at is null and receipt.deletion_operation_id is null then
      null;
    elsif receipt.retired_at is not null and receipt.deletion_operation_id=p_operation_id and exists(
      select 1 from server_panel_resource_archive a where a.environment=p_environment and a.access_pool_id=p_pool_id
        and a.database_identity=p_database_identity and a.panel_identity=p_panel_identity and a.kind=p_kind
        and a.resource_id=p_resource_id and a.deletion_operation_id=p_operation_id and a.body=p_expected_body
        and a.operation_id=receipt.operation_id and a.created_at=receipt.created_at and a.archived_at=receipt.retired_at)
    then return p_expected_body;
    else raise exception 'OWNERSHIP_REGISTRATION_CONFLICT'; end if;
  else
    if exists(select 1 from server_panel_resource_archive a where a.environment=p_environment and a.access_pool_id=p_pool_id
      and a.database_identity=p_database_identity and a.panel_identity=p_panel_identity and a.kind=p_kind
      and a.resource_id=p_resource_id and a.deletion_operation_id=p_operation_id and a.body=p_expected_body)
    then return p_expected_body; end if;
    raise exception 'OWNERSHIP_REGISTRATION_CONFLICT';
  end if;
  if receipt.operation_id is null or p_expected_body->>'operationId' is distinct from receipt.operation_id::text
    or not exists(select 1 from server_operations where id=receipt.operation_id and environment=p_environment
      and access_pool_id=p_pool_id and database_identity=p_database_identity and panel_identity=p_panel_identity)
    then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;

  case p_kind
    when 'node' then node_id:=p_resource_id;
    when 'inbound' then node_id:=p_expected_body->>'panel_node_id';
    when 'host' then node_id:=p_expected_body->>'node_id'; inbound_id:=p_expected_body->>'inbound_id';
    when 'service' then
      if jsonb_typeof(p_expected_body->'node_ids') is distinct from 'array'
        or jsonb_typeof(p_expected_body->'inbound_ids') is distinct from 'array' then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
      if jsonb_array_length(p_expected_body->'node_ids')<>1
        or jsonb_array_length(p_expected_body->'inbound_ids')<1 then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
      node_id:=p_expected_body->'node_ids'->>0;
  end case;
  if node_id is null or node_id !~ '^[1-9][0-9]*$' then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;

  -- Access adoption never grants deletion authority, including for an apparent
  -- own-operation receipt. Check all registrations on this panel, not just DEV.
  if exists(select 1 from vpn_servers s join server_access_pools p on p.id=s.access_pool_id and p.environment=s.environment
    where p.panel_identity=p_panel_identity and s.panel_node_id::text=node_id
      and (s.lifecycle_protected is distinct from false or s.ownership_provenance->>'method' is distinct from 'provisioned'))
    then raise exception 'PROTECTED_RESOURCE'; end if;

  if receipt.operation_id=p_operation_id then
    -- Candidate cancellation and private-service cleanup before publication.
    if op.kind not in ('add','replace') then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  else
    if op.kind not in ('move_retire','replace') or op.payload->'confirmations'->>'delete_source' is distinct from 'true'
      then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
    select * into source from vpn_servers where id::text=op.payload->>'source_server_id'
      and environment=p_environment and access_pool_id=p_pool_id for share;
    if not found or source.lifecycle_protected is distinct from false or source.panel_node_id::text is distinct from node_id
      or source.ownership_provenance->>'method' is distinct from 'provisioned'
      or source.ownership_provenance->>'operation_id' is distinct from receipt.operation_id::text
      or source.provider_resource_id is null
      or not exists(select 1 from server_operation_locks where environment=p_environment and access_pool_id=p_pool_id
        and resource_key='server:'||source.id::text and operation_id=p_operation_id) then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
    select * into parent_node from server_infrastructure_resources where environment=p_environment and access_pool_id=p_pool_id
      and database_identity=p_database_identity and panel_identity=p_panel_identity and kind='node' and provider=''
      and resource_id=node_id for share;
    if not found or parent_node.operation_id is distinct from receipt.operation_id
      or parent_node.body->'protected' is distinct from 'false'::jsonb
      or parent_node.body->>'operationId' is distinct from receipt.operation_id::text
      or parent_node.body->>'provider_resource_id' is distinct from source.provider_resource_id
      or parent_node.body->>'environment' is distinct from p_environment or parent_node.body->>'poolId' is distinct from p_pool_id::text
      or parent_node.body->>'databaseIdentity' is distinct from p_database_identity or parent_node.body->>'panelIdentity' is distinct from p_panel_identity
      or parent_node.body->>'kind' is distinct from 'node' or parent_node.body->>'id' is distinct from node_id
      then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
    for linked_id in select value from jsonb_array_elements_text(case p_kind
      when 'host' then jsonb_build_array(inbound_id)
      when 'service' then p_expected_body->'inbound_ids' else '[]'::jsonb end) value loop
      if linked_id is null or linked_id !~ '^[1-9][0-9]*$' or not exists(
        select 1 from server_infrastructure_resources r where r.environment=p_environment and r.access_pool_id=p_pool_id
          and r.database_identity=p_database_identity and r.panel_identity=p_panel_identity and r.kind='inbound' and r.provider=''
          and r.resource_id=linked_id and r.operation_id=receipt.operation_id and r.body->'protected'='false'::jsonb
          and r.body->>'panel_node_id'=node_id and r.body->>'operationId'=receipt.operation_id::text
          and r.body->>'kind'='inbound' and r.body->>'id'=linked_id
          and r.body->>'environment'=p_environment and r.body->>'poolId'=p_pool_id::text
          and r.body->>'databaseIdentity'=p_database_identity and r.body->>'panelIdentity'=p_panel_identity)
        then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
    end loop;
  end if;

  -- Caller MUST have verified DELETE followed by GET 404 for this exact receipt.
  -- Persist the subtree manifest before deletion; archive children first, node
  -- last. SQL authorizes receipts, not remote HTTP observations.
  with archived as (
    insert into server_panel_resource_archive(environment,access_pool_id,database_identity,panel_identity,kind,provider,
      resource_id,operation_id,body,created_at,deletion_operation_id,deletion_owner,deletion_fence)
    values(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_kind,'',p_resource_id,receipt.operation_id,
      p_expected_body,receipt.created_at,p_operation_id,p_owner,p_fence) returning archived_at
  ) update server_infrastructure_resources set retired_at=(select archived_at from archived),deletion_operation_id=p_operation_id
    where panel_identity=p_panel_identity and kind=p_kind and provider='' and resource_id=p_resource_id;
  return p_expected_body;
end $$;

-- Same API, immutable while current. Only an exact, explicitly archived
-- tombstone whose deletion completed/cancelled permits replacement. Until then
-- provider-deletion recovery must still be able to read the original proof.
create or replace function public.register_server_infrastructure_resource(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_fence bigint,p_kind text,p_resource_id text,p_provider text,p_body jsonb,p_expected_intent jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare prior server_infrastructure_resources; intent jsonb;
begin
  perform require_server_operation_lease(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  if p_body->>'environment' is distinct from p_environment or p_body->>'poolId' is distinct from p_pool_id::text
    or p_body->>'databaseIdentity' is distinct from p_database_identity or p_body->>'panelIdentity' is distinct from p_panel_identity
    or p_body->>'operationId' is distinct from p_operation_id::text or p_body->>'kind' is distinct from p_kind
    or p_body->>'id' is distinct from p_resource_id or coalesce(p_body->>'provider','') is distinct from p_provider then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  if p_kind='provider' then
    select body into intent from server_provider_create_intents where operation_id=p_operation_id and provider=p_provider;
    if intent is null or intent is distinct from p_expected_intent or p_body->>'accountId' is distinct from intent->>'accountId'
      or p_body->>'region' is distinct from intent->>'region' or p_body->>'planId' is distinct from intent->>'planId'
      or nullif(p_body->>'createdAt','') is null then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_panel_identity||p_kind||p_provider||p_resource_id,0));
  select * into prior from server_infrastructure_resources where panel_identity=p_panel_identity and kind=p_kind and provider=p_provider and resource_id=p_resource_id for update;
  if found then
    if prior.environment is distinct from p_environment or prior.access_pool_id is distinct from p_pool_id
      or prior.database_identity is distinct from p_database_identity then raise exception 'OWNERSHIP_REGISTRATION_CONFLICT'; end if;
    if prior.body=p_body then return prior.body; end if;
    if p_kind not in ('node','inbound','host','service') or p_provider<>''
      or prior.retired_at is null or prior.deletion_operation_id is null
      or prior.body->'protected' is distinct from 'false'::jsonb or p_body->'protected' is distinct from 'false'::jsonb
      or not exists(select 1 from server_panel_resource_archive a join server_operations d
        on d.id=a.deletion_operation_id and d.environment=a.environment and d.access_pool_id=a.access_pool_id
        and d.database_identity=a.database_identity and d.panel_identity=a.panel_identity
        and d.status in ('completed','cancelled')
        where a.environment=p_environment and a.access_pool_id=p_pool_id
        and a.database_identity=p_database_identity and a.panel_identity=p_panel_identity and a.kind=p_kind and a.provider=p_provider
        and a.resource_id=p_resource_id and a.operation_id=prior.operation_id and a.body=prior.body and a.created_at=prior.created_at
        and a.deletion_operation_id=prior.deletion_operation_id and a.archived_at=prior.retired_at)
      then raise exception 'OWNERSHIP_REGISTRATION_CONFLICT'; end if;
    update server_infrastructure_resources set operation_id=p_operation_id,body=p_body,created_at=clock_timestamp(),
      retired_at=null,deletion_operation_id=null where panel_identity=p_panel_identity and kind=p_kind and provider=p_provider and resource_id=p_resource_id;
    return p_body;
  end if;
  insert into server_infrastructure_resources(environment,access_pool_id,database_identity,panel_identity,kind,provider,resource_id,operation_id,body)
    values(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_kind,p_provider,p_resource_id,p_operation_id,p_body);
  return p_body;
end $$;

revoke all on function public.archive_server_panel_resource(text,uuid,text,text,uuid,uuid,bigint,text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.archive_server_panel_resource(text,uuid,text,text,uuid,uuid,bigint,text,text,jsonb) to service_role;
revoke all on function public.register_server_infrastructure_resource(text,uuid,text,text,uuid,uuid,bigint,text,text,text,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.register_server_infrastructure_resource(text,uuid,text,text,uuid,uuid,bigint,text,text,text,jsonb,jsonb) to service_role;

comment on table public.server_panel_resource_archive is 'Private append-only exact panel receipts and fenced deletion audit; no automatic historical reconciliation.';
comment on function public.archive_server_panel_resource(text,uuid,text,text,uuid,uuid,bigint,text,text,jsonb) is
  'Service-role fenced retirement after caller-verified DELETE/GET404. Returns exact body; retains readable tombstone until explicit registration reuse. Node last.';
notify pgrst,'reload schema';
commit;
