-- OPERATOR TEMPLATE, not a migration. Use only the existing development project.
-- First create a dedicated EMPTY service in Marzneshin and verify its identity.
-- Replace every placeholder. No existing node, user, VM or customer is adopted.
begin;
do $$
declare
  pool uuid := 'REPLACE_DEVELOPMENT_POOL_UUID';
  service_id integer := REPLACE_EMPTY_DEV_SERVICE_ID;
  panel text := 'https://panel.novanetmm.com';
  database_host text := 'huqmzvlzfcexycdrsxpn.supabase.co';
  accounts jsonb := '{"digitalocean":"REPLACE_VERIFIED_ACCOUNT_UUID"}';
begin
  if exists(select 1 from server_access_pools where environment='development' and panel_identity=panel)
    then raise exception 'A development pool already exists; inspect it instead of creating or relabelling another'; end if;
  insert into server_access_pools(id,environment,name,panel_identity,vless_service_id)
    values(pool,'development','DEV Public',panel,service_id);
  insert into server_operation_runtime_bindings(environment,access_pool_id,database_identity,panel_identity,provider_accounts)
    values('development',pool,database_host,panel,accounts);
  insert into server_infrastructure_resources(environment,access_pool_id,database_identity,panel_identity,kind,resource_id,body)
    values('development',pool,database_host,panel,'service',service_id::text,
      jsonb_build_object('id',service_id::text,'kind','service','environment','development','poolId',pool,
        'databaseIdentity',database_host,'panelIdentity',panel,'protected',false,'method','owner_verified_empty_service'));
end $$;
commit;
notify pgrst,'reload schema';
