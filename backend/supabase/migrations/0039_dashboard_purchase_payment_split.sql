-- Follow-up to 0037/0038: satisfy the core receipt money CHECK before confirmation.
-- Function-only correction; no order/payment backfill or activation.
begin;
create or replace function prepare_dashboard_purchase(p_reseller_id uuid,p_request_key uuid,p_request_hash text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  op dashboard_purchase_operations%rowtype;
  c vpn_customers%rowtype;
  pl vpn_plans%rowtype;
  active_order vpn_orders%rowtype;
  ord vpn_orders%rowtype;
  rate numeric;
  payment_commission integer;
  paid boolean := p_payload->>'payment_status'='paid';
  sale_source text := coalesce(p_payload->>'source','dashboard');
  sale_type text := p_payload->>'payment_type';
begin
  if p_request_key is null or coalesce(p_request_hash,'')='' then raise exception 'REQUEST_KEY_REQUIRED'; end if;
  if sale_source not in ('dashboard','admin') then raise exception 'INVALID_SOURCE'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_reseller_id::text||p_request_key::text,0));
  select * into op from dashboard_purchase_operations where reseller_id=p_reseller_id and request_key=p_request_key;
  if found then
    if op.request_hash<>p_request_hash then raise exception 'REQUEST_CONFLICT'; end if;
    return to_jsonb(op);
  end if;
  if coalesce(trim(p_payload->>'full_name'),'')='' then raise exception 'CUSTOMER_NAME_REQUIRED'; end if;
  select least(100,greatest(0,commission_percent)) into rate from resellers where id=p_reseller_id;
  if not found then raise exception 'RESELLER_NOT_FOUND'; end if;
  select * into pl from vpn_plans where id=(p_payload->>'plan_id')::uuid and is_active=true;
  if not found or pl.is_trial then raise exception 'PAID_PLAN_REQUIRED'; end if;
  if pl.price_mmk<=0 then raise exception 'PAID_PLAN_REQUIRED'; end if;
  payment_commission := floor(pl.price_mmk::numeric * coalesce(rate,0) / 100.0)::integer;
  if nullif(p_payload->>'customer_id','') is not null then
    select * into c from vpn_customers where id=(p_payload->>'customer_id')::uuid and reseller_id=p_reseller_id for update;
    if not found then raise exception 'CUSTOMER_NOT_FOUND'; end if;
  else
    -- Serialize contact lookup/creation as well as exact request replay.
    perform pg_advisory_xact_lock(hashtextextended(p_reseller_id::text||coalesce(nullif(p_payload->>'phone',''),nullif(p_payload->>'telegram_username',''),p_request_key::text),1));
    select * into c from vpn_customers where reseller_id=p_reseller_id and
      ((nullif(p_payload->>'phone','') is not null and phone=p_payload->>'phone') or
       (nullif(p_payload->>'telegram_username','') is not null and telegram_username=p_payload->>'telegram_username'))
      order by id limit 1 for update;
    if not found then
      insert into vpn_customers(reseller_id,full_name,phone,telegram_username,notes,status,customer_type,protocol_preference)
      values(p_reseller_id,trim(p_payload->>'full_name'),nullif(p_payload->>'phone',''),nullif(p_payload->>'telegram_username',''),nullif(p_payload->>'notes',''),'active','normal',
        case when p_payload->>'protocol_preference' in ('shadowsocks','vless','hysteria2') then p_payload->>'protocol_preference' else 'shadowsocks' end) returning * into c;
    end if;
  end if;
  -- Admin's existing follow-up actions may serve Telegram customers. Require a
  -- real, same-tenant/same-customer origin; reseller manual creation stays gated.
  if nullif(p_payload->>'origin_order_id','') is not null then
    perform 1 from vpn_orders where id=(p_payload->>'origin_order_id')::uuid and reseller_id=p_reseller_id and customer_id=c.id;
    if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  end if;
  if (c.customer_type is distinct from 'normal' or exists(select 1 from telegram_links where customer_id=c.id and reseller_id=p_reseller_id))
    and not (sale_source='admin' and nullif(p_payload->>'origin_order_id','') is not null) then raise exception 'TELEGRAM_CUSTOMER_ACTION'; end if;
  update vpn_customers set
    full_name=trim(p_payload->>'full_name'),
    phone=coalesce(nullif(p_payload->>'phone',''),phone),
    telegram_username=coalesce(nullif(p_payload->>'telegram_username',''),telegram_username),
    notes=coalesce(nullif(p_payload->>'notes',''),notes),
    protocol_preference=case when p_payload->>'protocol_preference' in ('shadowsocks','vless','hysteria2') then p_payload->>'protocol_preference' else protocol_preference end
  where id=c.id and reseller_id=p_reseller_id;
  select * into active_order from vpn_orders where reseller_id=p_reseller_id and customer_id=c.id and order_type='purchase'
    and (status='active' or (status='pending' and source in ('dashboard','admin') and payment_status='paid' and review_status='confirmed'))
    order by created_at,id limit 1;
  if found and active_order.review_status is distinct from 'confirmed' then raise exception 'PURCHASE_UNDER_REVIEW'; end if;
  if exists(select 1 from vpn_orders where reseller_id=p_reseller_id and customer_id=c.id and status='scheduled' and order_type='purchase') then raise exception 'QUEUED_PACKAGE_EXISTS'; end if;
  insert into vpn_orders(reseller_id,customer_id,plan_id,status,payment_status,review_status,order_type,source,price_mmk,total_paid_mmk,commission_percent,commission_amount_mmk,payment_note,payment_screenshot_url,quota_limit_bytes,usage_baseline_bytes)
  values(p_reseller_id,c.id,pl.id,case when active_order.id is not null then 'scheduled' else 'pending' end,'unpaid','pending_review','purchase',sale_source,pl.price_mmk,0,coalesce(rate,0),0,p_payload->>'payment_note',p_payload->>'payment_screenshot_url',case when pl.data_limit_gb is null then null else floor(pl.data_limit_gb::numeric * 1073741824::numeric)::bigint end,0) returning * into ord;
  if paid then
    insert into order_payments(order_id,customer_id,reseller_id,plan_id,amount_mmk,commission_percent,commission_amount_mmk,platform_due_mmk,review_status,apply_status,payment_type,source,package_duration_days,package_data_limit_gb,payment_note,payment_screenshot_url,idempotency_key)
    values(ord.id,c.id,p_reseller_id,pl.id,pl.price_mmk,coalesce(rate,0),payment_commission,pl.price_mmk-payment_commission,'pending_review','pending',case when sale_type in ('renew','extend') then sale_type when ord.status='scheduled' then 'extend' else 'initial' end,sale_source,pl.duration_days,pl.data_limit_gb,p_payload->>'payment_note',p_payload->>'payment_screenshot_url','dashboard:'||p_request_key::text);
    perform apply_confirmed_payment(ord.id,p_reseller_id,p_reseller_id,null);
  end if;
  insert into dashboard_purchase_operations(reseller_id,request_key,request_hash,customer_id,order_id,plan_snapshot,state)
  values(p_reseller_id,p_request_key,p_request_hash,c.id,ord.id,to_jsonb(pl),case when not paid then 'awaiting_payment' when ord.status='scheduled' then 'queued' else 'not_started' end) returning * into op;
  return to_jsonb(op);
end $$;

revoke all on function prepare_dashboard_purchase(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function prepare_dashboard_purchase(uuid,uuid,text,jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
