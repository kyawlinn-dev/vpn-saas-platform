-- Explicit selected test-customer reset only. Normal trial claims remain durable.
begin;

create or replace function public.cleanup_test_customers(
  p_reseller_id uuid, p_customer_ids uuid[], p_expected_order_ids uuid[],
  p_confirmation text, p_allow_paid_customers boolean default false, p_dry_run boolean default false
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  selected_ids uuid[]; order_ids uuid[]; key_ids uuid[]; token_ids uuid[];
  n integer; page text; deleted jsonb := '{}'::jsonb;
begin
  if p_confirmation is distinct from 'DELETE TEST CUSTOMERS' or p_reseller_id is null
    or p_customer_ids is null or cardinality(p_customer_ids) not between 1 and 100
    or array_position(p_customer_ids,null) is not null or p_expected_order_ids is null
    or p_dry_run is null then raise exception 'INVALID_CUSTOMER_CLEANUP'; end if;
  select array_agg(distinct x order by x) into selected_ids from unnest(p_customer_ids) x;
  if cardinality(selected_ids)<>cardinality(p_customer_ids) then raise exception 'INVALID_CUSTOMER_CLEANUP'; end if;
  perform 1 from vpn_customers where reseller_id=p_reseller_id and id=any(selected_ids) order by id for update;
  if (select count(*) from vpn_customers where reseller_id=p_reseller_id and id=any(selected_ids))<>cardinality(selected_ids)
    then raise exception 'CUSTOMER_CLEANUP_SCOPE_MISMATCH'; end if;
  perform 1 from vpn_orders where reseller_id=p_reseller_id and customer_id=any(selected_ids) order by id for update;
  select coalesce(array_agg(id order by id),array[]::uuid[]) into order_ids
    from vpn_orders where reseller_id=p_reseller_id and customer_id=any(selected_ids);
  if exists(select unnest(order_ids) except select unnest(p_expected_order_ids))
    or exists(select unnest(p_expected_order_ids) except select unnest(order_ids))
    then raise exception 'CUSTOMER_CLEANUP_CHANGED'; end if;
  perform 1 from vpn_keys where reseller_id=p_reseller_id and customer_id=any(selected_ids) order by id for update;
  perform 1 from order_payments where reseller_id=p_reseller_id and customer_id=any(selected_ids) order by id for update;
  if not coalesce(p_allow_paid_customers,false) and exists(select 1 from order_payments
    where reseller_id=p_reseller_id and customer_id=any(selected_ids) and review_status='confirmed' and apply_status='applied')
    then raise exception 'CUSTOMER_CLEANUP_PAID_CONFIRMATION_REQUIRED'; end if;
  if exists(select 1 from vpn_keys where reseller_id=p_reseller_id and customer_id=any(selected_ids)
    and (status='pending' or (status='active' and deleted_at is null and
      (not p_dry_run or order_id is null or not order_id=any(order_ids)))))
    then raise exception 'CUSTOMER_CLEANUP_ACCESS_NOT_STOPPED'; end if;
  perform 1 from purchase_operations where reseller_id=p_reseller_id and customer_id=any(selected_ids) order by id for update;
  perform 1 from customer_trial_claims where reseller_id=p_reseller_id and customer_id=any(selected_ids) order by customer_id for update;
  perform 1 from dashboard_purchase_operations where reseller_id=p_reseller_id and customer_id=any(selected_ids) order by id for update;
  perform 1 from messenger_links where reseller_id=p_reseller_id and customer_id=any(selected_ids) order by id for update;
  -- Match claim_messenger_event's page lock, including events inserted mid-cleanup.
  for page in select distinct page_id from messenger_links
    where reseller_id=p_reseller_id and customer_id=any(selected_ids) order by page_id loop
    perform pg_advisory_xact_lock(hashtextextended(p_reseller_id::text||':'||page,0));
  end loop;
  perform 1 from messenger_events e join messenger_links l
    on l.reseller_id=e.reseller_id and l.page_id=e.page_id and l.sender_id=e.sender_id
    where l.reseller_id=p_reseller_id and l.customer_id=any(selected_ids) order by e.id for update of e;
  if exists(select 1 from purchase_operations where reseller_id=p_reseller_id and customer_id=any(selected_ids) and status='processing')
    or exists(select 1 from customer_trial_claims where reseller_id=p_reseller_id and customer_id=any(selected_ids) and provision_status='processing')
    or exists(select 1 from dashboard_purchase_operations where reseller_id=p_reseller_id and customer_id=any(selected_ids) and state='running')
    or exists(select 1 from messenger_events e join messenger_links l
      on l.reseller_id=e.reseller_id and l.page_id=e.page_id and l.sender_id=e.sender_id
      where l.reseller_id=p_reseller_id and l.customer_id=any(selected_ids) and e.status='processing')
    or exists(select 1 from server_customer_mutation_guards g where g.status in ('running','uncertain')
      and exists(select 1 from unnest(order_ids) oid where ('order:'||oid::text)=any(g.resource_keys)))
    then raise exception 'CUSTOMER_CLEANUP_BUSY'; end if;
  if p_dry_run then return jsonb_build_object('ready',true); end if;

  select coalesce(array_agg(id),array[]::uuid[]) into key_ids from vpn_keys where reseller_id=p_reseller_id and customer_id=any(selected_ids);
  select coalesce(array_agg(id),array[]::uuid[]) into token_ids from access_tokens where reseller_id=p_reseller_id and customer_id=any(selected_ids);
  delete from token_server_assignments where token_id=any(token_ids) or vpn_key_id=any(key_ids);
  get diagnostics n=row_count; deleted:=deleted||jsonb_build_object('token_server_assignments',n);
  delete from messenger_events e using messenger_links l where e.reseller_id=p_reseller_id and l.reseller_id=p_reseller_id
    and l.customer_id=any(selected_ids) and e.page_id=l.page_id and e.sender_id=l.sender_id;
  get diagnostics n=row_count; deleted:=deleted||jsonb_build_object('messenger_events',n);
  delete from messenger_links where reseller_id=p_reseller_id and customer_id=any(selected_ids);
  get diagnostics n=row_count; deleted:=deleted||jsonb_build_object('messenger_links',n);
  delete from customer_trial_claims where reseller_id=p_reseller_id and customer_id=any(selected_ids);
  get diagnostics n=row_count; deleted:=deleted||jsonb_build_object('customer_trial_claims',n);
  delete from purchase_operations where reseller_id=p_reseller_id and customer_id=any(selected_ids);
  get diagnostics n=row_count; deleted:=deleted||jsonb_build_object('purchase_operations',n);
  delete from dashboard_purchase_operations where reseller_id=p_reseller_id and customer_id=any(selected_ids);
  get diagnostics n=row_count; deleted:=deleted||jsonb_build_object('dashboard_purchase_operations',n);
  delete from notification_deliveries where reseller_id=p_reseller_id and record_id=any(order_ids);
  get diagnostics n=row_count; deleted:=deleted||jsonb_build_object('notification_deliveries',n);
  delete from notifications_sent where customer_id=any(selected_ids);
  get diagnostics n=row_count; deleted:=deleted||jsonb_build_object('notifications_sent',n);
  delete from commission_ledger where reseller_id=p_reseller_id and order_id=any(order_ids);
  get diagnostics n=row_count; deleted:=deleted||jsonb_build_object('commission_ledger',n);
  delete from order_payments where reseller_id=p_reseller_id and customer_id=any(selected_ids);
  get diagnostics n=row_count; deleted:=deleted||jsonb_build_object('order_payments',n);
  delete from vpn_keys where reseller_id=p_reseller_id and customer_id=any(selected_ids);
  get diagnostics n=row_count; deleted:=deleted||jsonb_build_object('vpn_keys',n);
  delete from access_tokens where reseller_id=p_reseller_id and customer_id=any(selected_ids);
  get diagnostics n=row_count; deleted:=deleted||jsonb_build_object('access_tokens',n);
  delete from telegram_links where reseller_id=p_reseller_id and customer_id=any(selected_ids);
  get diagnostics n=row_count; deleted:=deleted||jsonb_build_object('telegram_links',n);
  delete from vpn_orders where reseller_id=p_reseller_id and customer_id=any(selected_ids);
  get diagnostics n=row_count; deleted:=deleted||jsonb_build_object('vpn_orders',n);
  delete from vpn_customers where reseller_id=p_reseller_id and id=any(selected_ids);
  get diagnostics n=row_count; deleted:=deleted||jsonb_build_object('vpn_customers',n);
  return deleted;
end;
$$;

revoke all on function public.cleanup_test_customers(uuid,uuid[],uuid[],text,boolean,boolean) from public,anon,authenticated;
grant execute on function public.cleanup_test_customers(uuid,uuid[],uuid[],text,boolean,boolean) to service_role;
notify pgrst,'reload schema';
commit;
