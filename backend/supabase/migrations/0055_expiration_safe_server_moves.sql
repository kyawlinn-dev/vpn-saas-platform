begin;

create or replace function public.move_server_operation_key(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_fence bigint,p_key_id uuid,p_order_id uuid,p_reseller_id uuid,p_customer_id uuid,p_source_id uuid,p_destination_id uuid,p_expected_key jsonb,p_expected_order jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare k vpn_keys; o vpn_orders; field text; actual_key jsonb; actual_order jsonb;
begin
  perform begin_server_operation_write(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  if p_source_id=p_destination_id or (select count(*) from server_operation_locks where operation_id=p_operation_id
    and resource_key=any(array['server:'||p_source_id::text,'server:'||p_destination_id::text]))<>2 then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  if not exists(select 1 from vpn_servers where id=p_destination_id and environment=p_environment and access_pool_id=p_pool_id) then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  perform 1 from vpn_servers where id in (p_source_id,p_destination_id) order by id for update;
  if not exists(select 1 from vpn_servers where id=p_destination_id and is_active=true and status='active') then raise exception 'DESTINATION_NOT_READY'; end if;
  select * into o from vpn_orders where id=p_order_id and reseller_id=p_reseller_id and customer_id=p_customer_id for update;
  select * into k from vpn_keys where id=p_key_id and order_id=p_order_id and reseller_id=p_reseller_id and customer_id=p_customer_id for update;
  if o.id is null or k.id is null or k.status<>'active' or k.deleted_at is not null or o.status<>'active'
    or o.expiry_date is null
    or k.server_id not in (p_source_id,p_destination_id) then raise exception 'ACCESS_STATE_CHANGED'; end if;
  actual_key:=to_jsonb(k); actual_order:=to_jsonb(o);
  if not exists(select 1 from vpn_servers where id=p_destination_id and supported_protocols @> array[k.protocol]) then raise exception 'DESTINATION_PROTOCOL_MISMATCH'; end if;
  foreach field in array array['id','order_id','customer_id','reseller_id','outline_key_id','protocol','status','deleted_at','access_url','data_limit_bytes'] loop
    if (actual_key->field) is distinct from (p_expected_key->field) then raise exception 'ACCESS_STATE_CHANGED'; end if;
  end loop;
  foreach field in array array['id','customer_id','reseller_id','status','expiry_date','quota_limit_bytes','usage_baseline_bytes','payment_status','review_status'] loop
    if (actual_order->field) is distinct from (p_expected_order->field) then raise exception 'ACCESS_STATE_CHANGED'; end if;
  end loop;
  if k.server_id=p_source_id then
    update vpn_keys set server_id=p_destination_id where id=k.id returning * into k;
  end if;
  return to_jsonb(k);
end $$;

comment on function public.move_server_operation_key(text,uuid,text,text,uuid,uuid,bigint,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,jsonb) is
  'Relocation is not renewal: unchanged active records may move after expiry without extending expiry, resetting quota/traffic, or changing status, credentials or links. Null expiry and changed snapshots remain rejected; fenced scope/lease/locks and destination checks remain required. The existing vpn_keys trigger owns counter transfer and capacity enforcement.';

revoke all on function public.move_server_operation_key(text,uuid,text,text,uuid,uuid,bigint,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.move_server_operation_key(text,uuid,text,text,uuid,uuid,bigint,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,jsonb) to service_role;

notify pgrst, 'reload schema';
commit;
