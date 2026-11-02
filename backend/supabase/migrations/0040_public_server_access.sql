begin;

create table public.server_access_pools (
  id uuid primary key default gen_random_uuid(),
  environment text not null check (environment in ('development', 'production')),
  name text not null check (length(btrim(name)) between 1 and 100),
  panel_identity text not null check (length(btrim(panel_identity)) between 1 and 200),
  vless_service_id integer not null check (vless_service_id > 0),
  created_at timestamptz not null default now(),
  unique (id, environment),
  unique (environment, panel_identity)
);
alter table public.server_access_pools enable row level security;
revoke all on public.server_access_pools from public, anon, authenticated;
grant all on public.server_access_pools to service_role;

create function public.server_capabilities_valid(protocols text[])
returns boolean language sql immutable parallel safe as $$
  select coalesce(
    (cardinality(protocols) = 1 and protocols = array['vless']::text[])
    or (cardinality(protocols) = 2
      and protocols @> array['shadowsocks', 'vless']::text[]
      and protocols <@ array['shadowsocks', 'vless']::text[]
      and array_position(protocols, null) is null), false);
$$;

alter table public.vpn_servers
  add column supported_protocols text[],
  add column environment text check (environment in ('development', 'production')),
  add column access_pool_id uuid,
  add column panel_node_id integer check (panel_node_id > 0),
  add column provider_resource_id text check (length(btrim(provider_resource_id)) between 1 and 200),
  add column ownership_provenance jsonb,
  add column lifecycle_protected boolean not null default true,
  add constraint vpn_servers_supported_protocols_check check (
    supported_protocols is null or public.server_capabilities_valid(supported_protocols)),
  add constraint vpn_servers_access_registration_complete check (
    (environment is null and access_pool_id is null and panel_node_id is null
      and ownership_provenance is null and supported_protocols is null and provider_resource_id is null)
    or (environment is not null and access_pool_id is not null and panel_node_id is not null
      and ownership_provenance is not null and supported_protocols is not null
      and jsonb_typeof(ownership_provenance) = 'object' and panel_type = 'marzneshin')),
  add constraint vpn_servers_access_pool_scope_fk foreign key (access_pool_id, environment)
    references public.server_access_pools(id, environment),
  add constraint vpn_servers_registered_node_unique unique (access_pool_id, panel_node_id);

create function public.validate_server_access_registration()
returns trigger language plpgsql set search_path = public as $$
declare
  p public.server_access_pools%rowtype;
  changed boolean;
  verified timestamptz;
begin
  if tg_op = 'INSERT' then
    changed := new.environment is not null or new.access_pool_id is not null
      or new.panel_node_id is not null or new.supported_protocols is not null
      or new.ownership_provenance is not null or new.provider_resource_id is not null
      or new.lifecycle_protected is distinct from true;
  else
    changed := row(new.environment, new.access_pool_id, new.panel_node_id, new.supported_protocols,
      new.ownership_provenance, new.provider_resource_id, new.lifecycle_protected)
      is distinct from row(old.environment, old.access_pool_id, old.panel_node_id, old.supported_protocols,
        old.ownership_provenance, old.provider_resource_id, old.lifecycle_protected);
  end if;
  if changed and not pg_has_role(current_user, 'service_role', 'member') then
    raise exception 'SERVER_OWNERSHIP_BACKEND_ONLY' using errcode = '42501';
  end if;
  if new.environment is null then return new; end if;

  select * into p from public.server_access_pools where id = new.access_pool_id;
  if not found or p.environment is distinct from new.environment
    or new.ownership_provenance->>'environment' is distinct from new.environment
    or new.ownership_provenance->>'access_pool_id' is distinct from new.access_pool_id::text
    or new.ownership_provenance->>'panel_node_id' is distinct from new.panel_node_id::text
    or new.ownership_provenance->>'panel_identity' is distinct from p.panel_identity
    or not coalesce(new.ownership_provenance->>'method' in ('adopted', 'provisioned'), false)
    or (new.provider_resource_id is not null and
      new.ownership_provenance->>'provider_resource_id' is distinct from new.provider_resource_id) then
    raise exception 'RESOURCE_SCOPE_MISMATCH' using errcode = '23514';
  end if;
  begin
    verified := (new.ownership_provenance->>'verified_at')::timestamptz;
    if verified is null or not isfinite(verified) then
      raise exception 'OWNERSHIP_VERIFICATION_REQUIRED' using errcode = '23514';
    end if;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception 'OWNERSHIP_VERIFICATION_REQUIRED' using errcode = '23514';
  end;

  if 'shadowsocks' = any(new.supported_protocols) then
    if cardinality(new.marzneshin_service_ids) is distinct from 1
      or not coalesce(new.marzneshin_service_ids[1] > 0, false)
      or new.ownership_provenance->'ss_service_ids' is distinct from to_jsonb(new.marzneshin_service_ids) then
      raise exception 'SERVICE_CONFIGURATION_INVALID' using errcode = '23514';
    end if;
  elsif coalesce(cardinality(new.marzneshin_service_ids), 0) <> 0 then
    raise exception 'VLESS_ONLY_SS_SERVICE_FORBIDDEN' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger validate_server_access_registration
  before insert or update on public.vpn_servers
  for each row execute function public.validate_server_access_registration();

create function public.guard_registered_pool_identity()
returns trigger language plpgsql set search_path = public as $$
begin
  if row(new.id, new.environment, new.panel_identity, new.vless_service_id)
    is distinct from row(old.id, old.environment, old.panel_identity, old.vless_service_id)
    and exists(select 1 from public.vpn_servers where access_pool_id = old.id) then
    raise exception 'REGISTERED_POOL_IDENTITY_IMMUTABLE' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger guard_registered_pool_identity before update on public.server_access_pools
  for each row execute function public.guard_registered_pool_identity();

revoke all on function public.validate_server_access_registration() from public, anon, authenticated;
revoke all on function public.guard_registered_pool_identity() from public, anon, authenticated;
grant execute on function public.validate_server_access_registration() to service_role;
grant execute on function public.guard_registered_pool_identity() to service_role;

comment on column public.vpn_servers.environment is
  'Explicit adoption/provisioning scope; NULL legacy rows are not lifecycle-owned.';
comment on column public.vpn_servers.lifecycle_protected is
  'Default protected. Public access adoption does not authorize cloud deletion.';
comment on table public.server_access_pools is
  'One public VLESS pool per environment/panel identity; backend-only configuration.';

notify pgrst, 'reload schema';
commit;
