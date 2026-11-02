begin;

alter table public.server_operation_runtime_bindings
  add column provider_accounts jsonb not null default '{}' check(jsonb_typeof(provider_accounts)='object');

create table public.server_infrastructure_resources (
  environment text not null,
  access_pool_id uuid not null,
  database_identity text not null,
  panel_identity text not null,
  kind text not null check(length(kind) between 1 and 100),
  provider text not null default '' check(provider in ('','digitalocean','vultr')),
  resource_id text not null check(length(resource_id) between 1 and 200),
  operation_id uuid references public.server_operations(id),
  body jsonb not null check(jsonb_typeof(body)='object' and octet_length(body::text)<=65536),
  created_at timestamptz not null default clock_timestamp(),
  primary key(environment,access_pool_id,kind,provider,resource_id),
  unique(panel_identity,kind,provider,resource_id),
  foreign key(access_pool_id,environment) references public.server_access_pools(id,environment)
);
create table public.server_provider_create_intents (
  operation_id uuid not null references public.server_operations(id),
  provider text not null check(provider in ('digitalocean','vultr')),
  nonce uuid not null unique,
  body jsonb not null check(jsonb_typeof(body)='object' and octet_length(body::text)<=65536),
  created_at timestamptz not null default clock_timestamp(),
  primary key(operation_id,provider)
);
create table public.server_infrastructure_state (
  operation_id uuid not null references public.server_operations(id),
  state_key text not null check(state_key ~ '^[A-Za-z0-9:_-]{1,200}$'),
  ciphertext text not null check(length(ciphertext) between 1 and 1100000),
  version bigint not null default 1 check(version>0),
  updated_at timestamptz not null default clock_timestamp(),
  primary key(operation_id,state_key)
);
create table public.server_service_operation_locks (
  environment text not null,
  access_pool_id uuid not null,
  service_id text not null check(service_id ~ '^[1-9][0-9]*$'),
  operation_id uuid not null references public.server_operations(id),
  fence bigint not null,
  primary key(environment,access_pool_id,service_id),
  foreign key(access_pool_id,environment) references public.server_access_pools(id,environment)
);
alter table public.server_infrastructure_resources enable row level security;
alter table public.server_provider_create_intents enable row level security;
alter table public.server_infrastructure_state enable row level security;
alter table public.server_service_operation_locks enable row level security;
revoke all on public.server_infrastructure_resources,public.server_provider_create_intents,
  public.server_infrastructure_state,public.server_service_operation_locks from public,anon,authenticated,service_role;

create function public.read_server_infrastructure_resource(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_kind text,p_resource_id text,p_provider text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare value jsonb;
begin
  perform require_server_operation_scope(p_environment,p_pool_id,p_database_identity,p_panel_identity);
  select body into value from server_infrastructure_resources where environment=p_environment and access_pool_id=p_pool_id
    and database_identity=p_database_identity and panel_identity=p_panel_identity and kind=p_kind and resource_id=p_resource_id and provider=p_provider;
  return value;
end $$;

create function public.read_server_provider_intent(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_provider text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare value jsonb;
begin
  perform require_server_operation_scope(p_environment,p_pool_id,p_database_identity,p_panel_identity);
  if not exists(select 1 from server_operations where id=p_operation_id and environment=p_environment and access_pool_id=p_pool_id) then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  select body into value from server_provider_create_intents where operation_id=p_operation_id and provider=p_provider;
  return value;
end $$;

create function public.claim_server_provider_intent(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_fence bigint,p_provider text,p_body jsonb)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare op server_operations; accounts jsonb;
begin
  op:=require_server_operation_lease(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  select provider_accounts into accounts from server_operation_runtime_bindings where environment=p_environment and access_pool_id=p_pool_id;
  if op.kind not in ('add','replace') or op.payload->>'provider' is distinct from p_provider
    or p_body->>'operationId' is distinct from p_operation_id::text
    or p_body->>'environment' is distinct from p_environment or p_body->>'poolId' is distinct from p_pool_id::text
    or p_body->>'databaseIdentity' is distinct from p_database_identity or p_body->>'panelIdentity' is distinct from p_panel_identity
    or p_body->>'provider' is distinct from p_provider or p_body->>'accountId' is distinct from accounts->>p_provider
    or nullif(accounts->>p_provider,'') is null or p_body->>'quoteHash' is distinct from op.payload->'quote'->>'hash'
    or p_body->>'region' is distinct from op.payload->>'region' or p_body->>'planId' is distinct from op.payload->>'plan_id'
    or p_body->>'profile' is distinct from (case when op.payload->'supported_protocols' ? 'shadowsocks' then 'dual' else 'vless_only' end)
    or nullif(p_body->>'nonce','') is null then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  insert into server_provider_create_intents(operation_id,provider,nonce,body)
    values(p_operation_id,p_provider,(p_body->>'nonce')::uuid,p_body) on conflict(operation_id,provider) do nothing;
  return found;
end $$;

create function public.register_server_infrastructure_resource(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_fence bigint,p_kind text,p_resource_id text,p_provider text,p_body jsonb,p_expected_intent jsonb)
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
    if prior.environment is distinct from p_environment or prior.access_pool_id is distinct from p_pool_id or prior.body is distinct from p_body then raise exception 'OWNERSHIP_REGISTRATION_CONFLICT'; end if;
    return prior.body;
  end if;
  insert into server_infrastructure_resources(environment,access_pool_id,database_identity,panel_identity,kind,provider,resource_id,operation_id,body)
    values(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_kind,p_provider,p_resource_id,p_operation_id,p_body);
  return p_body;
end $$;

create function public.read_server_infrastructure_state(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_fence bigint,p_state_key text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare value jsonb;
begin
  perform require_server_operation_lease(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  select jsonb_build_object('ciphertext',ciphertext,'version',version) into value from server_infrastructure_state where operation_id=p_operation_id and state_key=p_state_key;
  return value;
end $$;

create function public.write_server_infrastructure_state(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_fence bigint,p_state_key text,p_ciphertext text,p_expected_version bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare row_value server_infrastructure_state;
begin
  perform require_server_operation_lease(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  if p_expected_version is null then
    insert into server_infrastructure_state(operation_id,state_key,ciphertext) values(p_operation_id,p_state_key,p_ciphertext) on conflict do nothing returning * into row_value;
  else
    update server_infrastructure_state set ciphertext=p_ciphertext,version=version+1,updated_at=clock_timestamp()
      where operation_id=p_operation_id and state_key=p_state_key and version=p_expected_version returning * into row_value;
  end if;
  if not found then raise exception 'PRIVATE_STATE_CONFLICT'; end if;
  return jsonb_build_object('ciphertext',row_value.ciphertext,'version',row_value.version);
end $$;

create function public.acquire_server_service_lock(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_fence bigint,p_service_id text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare lock_row server_service_operation_locks;
begin
  perform require_server_operation_lease(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  if not exists(select 1 from server_infrastructure_resources where environment=p_environment and access_pool_id=p_pool_id and kind='service' and resource_id=p_service_id) then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_environment||p_pool_id::text||'service:'||p_service_id,0));
  select * into lock_row from server_service_operation_locks where environment=p_environment and access_pool_id=p_pool_id and service_id=p_service_id for update;
  if found and lock_row.operation_id<>p_operation_id then raise exception 'SERVICE_MEMBERSHIP_CHANGED'; end if;
  insert into server_service_operation_locks(environment,access_pool_id,service_id,operation_id,fence) values(p_environment,p_pool_id,p_service_id,p_operation_id,p_fence)
    on conflict(environment,access_pool_id,service_id) do update set fence=excluded.fence;
  return true;
end $$;

create function public.release_server_service_lock(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_fence bigint,p_service_id text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform require_server_operation_lease(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  delete from server_service_operation_locks where environment=p_environment and access_pool_id=p_pool_id and service_id=p_service_id and operation_id=p_operation_id and fence=p_fence;
  return found;
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and p.proname=any(array['read_server_infrastructure_resource','read_server_provider_intent','claim_server_provider_intent',
      'register_server_infrastructure_resource','read_server_infrastructure_state','write_server_infrastructure_state','acquire_server_service_lock','release_server_service_lock']) loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;

notify pgrst,'reload schema';
commit;
