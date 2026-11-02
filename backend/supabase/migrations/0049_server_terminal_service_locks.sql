begin;
create or replace function public.release_server_operation(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_fence bigint,p_status text)
returns public.server_operations language plpgsql security definer set search_path=public,pg_temp as $$
declare o server_operations;
begin
  o:=require_server_operation_lease(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  if p_status not in ('completed','cancelled','failed') then raise exception 'OPERATION_NOT_TERMINAL'; end if;
  if exists(select 1 from server_operation_items where operation_id=o.id and status<>'verified') then raise exception 'ITEM_STATE_CONFLICT'; end if;
  -- The worker requests these states only after positive reconciliation. Failed
  -- or uncertain work keeps service locks until the operation is recovered.
  if p_status in ('completed','cancelled') then
    delete from server_service_operation_locks where operation_id=o.id and environment=p_environment and access_pool_id=p_pool_id and fence<=p_fence;
  end if;
  delete from server_operation_locks where operation_id=o.id;
  update server_operations set status=p_status,lease_owner=null,lease_until=null,updated_at=clock_timestamp() where id=o.id returning * into o;
  return o;
end $$;
revoke all on function public.release_server_operation(text,uuid,text,text,uuid,uuid,bigint,text) from public,anon,authenticated,service_role;
grant execute on function public.release_server_operation(text,uuid,text,text,uuid,uuid,bigint,text) to service_role;
notify pgrst,'reload schema';
commit;
