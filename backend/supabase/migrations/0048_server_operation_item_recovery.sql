begin;
create function public.next_server_operation_item(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_fence bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare value jsonb;
begin
  perform require_server_operation_lease(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  select jsonb_build_object('item_key',item_key,'status',status) into value from server_operation_items where operation_id=p_operation_id and status<>'verified' order by item_key limit 1;
  return value;
end $$;
create function public.cleanup_server_operation_assignment(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_fence bigint,p_assignment_id uuid,p_key_id uuid,p_source_id uuid,p_expected jsonb)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare op server_operations; a token_server_assignments; k vpn_keys;
begin
  op:=require_server_operation_lease(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  if op.payload->>'source_server_id' is distinct from p_source_id::text then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  perform begin_server_operation_write(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  select * into a from token_server_assignments where id=p_assignment_id and vpn_key_id=p_key_id and server_id=p_source_id for update;
  if not found then raise exception 'ACCESS_STATE_CHANGED'; end if;
  select * into k from vpn_keys where id=p_key_id for update;
  if not found or (k.status is distinct from 'deleted' and k.deleted_at is null) then raise exception 'ACCESS_STATE_CHANGED'; end if;
  if a.is_active is true and to_jsonb(a) is distinct from p_expected then raise exception 'ACCESS_STATE_CHANGED'; end if;
  update token_server_assignments set is_active=false where id=a.id;
  update server_operation_items set status='verified',checkpoint=jsonb_build_object('phase','verified'),fence=p_fence,updated_at=clock_timestamp()
    where operation_id=p_operation_id and item_key='assignment:'||p_assignment_id::text;
  if not found then raise exception 'ITEM_STATE_CONFLICT'; end if;
  return true;
end $$;
revoke all on function public.next_server_operation_item(text,uuid,text,text,uuid,uuid,bigint) from public,anon,authenticated,service_role;
revoke all on function public.cleanup_server_operation_assignment(text,uuid,text,text,uuid,uuid,bigint,uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.next_server_operation_item(text,uuid,text,text,uuid,uuid,bigint) to service_role;
grant execute on function public.cleanup_server_operation_assignment(text,uuid,text,text,uuid,uuid,bigint,uuid,uuid,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
