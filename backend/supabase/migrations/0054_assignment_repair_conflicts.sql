begin;

-- Preserve one row per token/server, including historical destination rows.
create or replace function public.repair_server_operation_assignments(
  p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,
  p_operation_id uuid,p_owner uuid,p_fence bigint,p_key_id uuid,p_order_id uuid,
  p_reseller_id uuid,p_customer_id uuid,p_destination_id uuid
) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare
  op server_operations;
  source_id uuid;
  source_row token_server_assignments;
  destination_row token_server_assignments;
  previous_key vpn_keys;
  token_row access_tokens;
begin
  perform begin_server_operation_write(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  select * into op from server_operations where id=p_operation_id;
  source_id:=(op.payload->>'source_server_id')::uuid;
  if op.kind not in ('replace','move_retire') or source_id is null or source_id=p_destination_id
    or (select count(*) from server_operation_locks where operation_id=p_operation_id
      and resource_key=any(array['server:'||source_id::text,'server:'||p_destination_id::text]))<>2
    or (select count(*) from vpn_servers where id in (source_id,p_destination_id)
      and environment=p_environment and access_pool_id=p_pool_id)<>2 then
    raise exception 'RESOURCE_SCOPE_MISMATCH';
  end if;
  perform 1 from vpn_servers where id in (source_id,p_destination_id) order by id for update;
  perform 1 from vpn_orders where id=p_order_id and reseller_id=p_reseller_id and customer_id=p_customer_id for update;
  if not found then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  perform 1 from vpn_keys where id=p_key_id and order_id=p_order_id and reseller_id=p_reseller_id and customer_id=p_customer_id
    and server_id=p_destination_id and status='active' and deleted_at is null for update;
  if not found then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  if exists(select 1 from token_server_assignments where vpn_key_id=p_key_id and is_active=true
    and server_id not in (source_id,p_destination_id)) then raise exception 'ASSIGNMENT_STATE_CHANGED'; end if;
  if exists(select 1 from token_server_assignments a left join access_tokens t on t.id=a.token_id
    and t.reseller_id=p_reseller_id and t.customer_id=p_customer_id
    where a.vpn_key_id=p_key_id and a.is_active=true and t.id is null) then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;

  for source_row in select * from token_server_assignments where vpn_key_id=p_key_id and is_active=true
    and server_id=source_id order by token_id,id for update
  loop
    select * into token_row from access_tokens where id=source_row.token_id for update;
    if not found or token_row.reseller_id is distinct from p_reseller_id or token_row.customer_id is distinct from p_customer_id then
      raise exception 'RESOURCE_SCOPE_MISMATCH';
    end if;
    select * into destination_row from token_server_assignments
      where token_id=source_row.token_id and server_id=p_destination_id for update;
    if found then
      if destination_row.vpn_key_id is not null and destination_row.vpn_key_id<>p_key_id then
        select * into previous_key from vpn_keys where id=destination_row.vpn_key_id for update;
        if not found or previous_key.reseller_id is distinct from p_reseller_id
          or previous_key.customer_id is distinct from p_customer_id or previous_key.status is distinct from 'deleted' then
          raise exception 'ASSIGNMENT_STATE_CHANGED';
        end if;
      end if;
      update token_server_assignments set is_active=false where id=source_row.id;
      update token_server_assignments set vpn_key_id=p_key_id,is_active=true where id=destination_row.id;
    else
      update token_server_assignments set server_id=p_destination_id where id=source_row.id;
    end if;
  end loop;
  return true;
end $$;

revoke all on function public.repair_server_operation_assignments(text,uuid,text,text,uuid,uuid,bigint,uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.repair_server_operation_assignments(text,uuid,text,text,uuid,uuid,bigint,uuid,uuid,uuid,uuid,uuid) to service_role;

commit;
