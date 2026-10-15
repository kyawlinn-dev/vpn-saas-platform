-- Independent production prerequisite after 0026. Does not depend on 0027–0036.
-- No backfill or automatic activation. Apply only through a separately authorized release.
begin;
create table dashboard_purchase_operations (
  id uuid primary key default gen_random_uuid(),
  reseller_id uuid not null references resellers(id),
  request_key uuid not null,
  request_hash text not null,
  customer_id uuid not null,
  order_id uuid not null unique,
  plan_snapshot jsonb not null,
  state text not null check (state in ('not_started','awaiting_payment','queued','ready','failed','running')),
  setup_owner uuid,
  claimed_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(reseller_id,request_key),
  foreign key(customer_id,reseller_id) references vpn_customers(id,reseller_id) on delete cascade,
  foreign key(order_id,reseller_id) references vpn_orders(id,reseller_id) on delete cascade,
  check ((state='running') = (setup_owner is not null))
);
create unique index dashboard_one_running_customer
  on dashboard_purchase_operations(reseller_id,customer_id) where state='running';
alter table dashboard_purchase_operations enable row level security;
revoke all on dashboard_purchase_operations from public,anon,authenticated;
grant select,insert,update,delete on dashboard_purchase_operations to service_role;

create function prepare_dashboard_purchase(p_reseller_id uuid,p_request_key uuid,p_request_hash text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  op dashboard_purchase_operations%rowtype;
  c vpn_customers%rowtype;
  pl vpn_plans%rowtype;
  active_order vpn_orders%rowtype;
  ord vpn_orders%rowtype;
  rate numeric;
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
  values(p_reseller_id,c.id,pl.id,case when active_order.id is not null then 'scheduled' else 'pending' end,'unpaid','pending_review','purchase',sale_source,pl.price_mmk,0,coalesce(rate,0),0,p_payload->>'payment_note',p_payload->>'payment_screenshot_url',case when pl.data_limit_gb is null then null else floor(pl.data_limit_gb*1073741824)::bigint end,0) returning * into ord;
  if paid then
    insert into order_payments(order_id,customer_id,reseller_id,plan_id,amount_mmk,commission_percent,commission_amount_mmk,platform_due_mmk,review_status,apply_status,payment_type,source,package_duration_days,package_data_limit_gb,payment_note,payment_screenshot_url,idempotency_key)
    values(ord.id,c.id,p_reseller_id,pl.id,pl.price_mmk,coalesce(rate,0),0,0,'pending_review','pending',case when sale_type in ('renew','extend') then sale_type when ord.status='scheduled' then 'extend' else 'initial' end,sale_source,pl.duration_days,pl.data_limit_gb,p_payload->>'payment_note',p_payload->>'payment_screenshot_url','dashboard:'||p_request_key::text);
    perform apply_confirmed_payment(ord.id,p_reseller_id,p_reseller_id,null);
  end if;
  insert into dashboard_purchase_operations(reseller_id,request_key,request_hash,customer_id,order_id,plan_snapshot,state)
  values(p_reseller_id,p_request_key,p_request_hash,c.id,ord.id,to_jsonb(pl),case when not paid then 'awaiting_payment' when ord.status='scheduled' then 'queued' else 'not_started' end) returning * into op;
  return to_jsonb(op);
end $$;

create function ensure_dashboard_purchase_operation(p_reseller_id uuid,p_order_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare ord vpn_orders%rowtype; op dashboard_purchase_operations%rowtype; snapshot jsonb;
begin
 select * into ord from vpn_orders where id=p_order_id and reseller_id=p_reseller_id;
 if not found or ord.source not in ('dashboard','admin') or ord.order_type<>'purchase' then raise exception 'ORDER_NOT_FOUND'; end if;
 perform 1 from vpn_customers where id=ord.customer_id and reseller_id=p_reseller_id for update;
 select * into op from dashboard_purchase_operations where order_id=p_order_id and reseller_id=p_reseller_id;
 if found then return to_jsonb(op); end if;
 select to_jsonb(p) into snapshot from vpn_plans p where id=ord.plan_id;
 select snapshot || jsonb_build_object('price_mmk',ord.price_mmk,
   'duration_days',coalesce(p.package_duration_days,(snapshot->>'duration_days')::int),
   'data_limit_gb',p.package_data_limit_gb)
 into snapshot from order_payments p where p.order_id=ord.id and p.reseller_id=p_reseller_id and p.plan_id=ord.plan_id and p.package_duration_days is not null order by p.created_at desc limit 1;
 if snapshot is null then select to_jsonb(p) into snapshot from vpn_plans p where id=ord.plan_id; end if;
 insert into dashboard_purchase_operations(reseller_id,request_key,request_hash,customer_id,order_id,plan_snapshot,state)
 values(p_reseller_id,p_order_id,'legacy:'||p_order_id::text,ord.customer_id,ord.id,snapshot,'not_started') returning * into op;
 return to_jsonb(op);
end $$;

create function claim_dashboard_purchase_setup(p_reseller_id uuid,p_order_id uuid,p_owner uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare op dashboard_purchase_operations%rowtype; ord vpn_orders%rowtype; active_order vpn_orders%rowtype;
begin
  if p_owner is null then raise exception 'OWNER_REQUIRED'; end if;
  select * into ord from vpn_orders where id=p_order_id and reseller_id=p_reseller_id;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  perform 1 from vpn_customers where id=ord.customer_id and reseller_id=p_reseller_id for update;
  select * into op from dashboard_purchase_operations where order_id=p_order_id and reseller_id=p_reseller_id for update;
  if not found then raise exception 'SETUP_NOT_FOUND'; end if;
  -- Re-read after the ownership locks: another attempt may have completed since
  -- the initial customer lookup. Never reset an already active order to pending.
  select * into ord from vpn_orders where id=p_order_id and reseller_id=p_reseller_id for update;
  if ord.source not in ('dashboard','admin') or ord.order_type<>'purchase' then raise exception 'INVALID_SOURCE'; end if;
  if ord.status='active' then return jsonb_build_object('claimed',false,'state','ready'); end if;
  if ord.status not in ('pending','scheduled') or ord.review_status='rejected' then raise exception 'INVALID_STATUS'; end if;
  if ord.payment_status<>'paid' or ord.review_status<>'confirmed' then return jsonb_build_object('claimed',false,'state','awaiting_payment'); end if;
  select * into active_order from vpn_orders where reseller_id=p_reseller_id and customer_id=ord.customer_id and order_type='purchase' and id<>ord.id
    and (status='active' or (status='pending' and source in ('dashboard','admin') and payment_status='paid' and review_status='confirmed'
      and (ord.status='scheduled' or (created_at,id)<(ord.created_at,ord.id))))
    order by created_at,id limit 1;
  if found then
    if active_order.review_status is distinct from 'confirmed' then raise exception 'PURCHASE_UNDER_REVIEW'; end if;
    if exists(select 1 from vpn_orders where reseller_id=p_reseller_id and customer_id=ord.customer_id and status='scheduled' and order_type='purchase' and id<>ord.id) then raise exception 'QUEUED_PACKAGE_EXISTS'; end if;
    update vpn_orders set status='scheduled',start_date=null,expiry_date=null where id=ord.id and reseller_id=p_reseller_id;
    update dashboard_purchase_operations set state='queued',last_error_code=null,updated_at=now() where id=op.id;
    return jsonb_build_object('claimed',false,'state','queued');
  end if;
  if exists(select 1 from dashboard_purchase_operations where reseller_id=p_reseller_id and customer_id=ord.customer_id and state='running') then
    return jsonb_build_object('claimed',false,'state','running');
  end if;
  -- Reuse the guarded initial activation path; dates start only after successful setup.
  update vpn_orders set status='pending' where id=ord.id and reseller_id=p_reseller_id;
  update dashboard_purchase_operations set state='running',setup_owner=p_owner,claimed_at=now(),last_error_code=null,updated_at=now() where id=op.id;
  return jsonb_build_object('claimed',true,'state','running','plan_snapshot',op.plan_snapshot);
end $$;

create function finish_dashboard_purchase_setup(p_reseller_id uuid,p_order_id uuid,p_owner uuid,p_state text,p_error_code text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if p_state not in ('ready','failed') then raise exception 'INVALID_SETUP_STATE'; end if;
  update dashboard_purchase_operations set state=p_state,setup_owner=null,last_error_code=left(p_error_code,80),updated_at=now()
  where reseller_id=p_reseller_id and order_id=p_order_id and setup_owner=p_owner and state='running';
  if not found then raise exception 'SETUP_OWNER_NOT_FOUND'; end if;
end $$;

revoke all on function ensure_dashboard_purchase_operation(uuid,uuid),prepare_dashboard_purchase(uuid,uuid,text,jsonb),claim_dashboard_purchase_setup(uuid,uuid,uuid),finish_dashboard_purchase_setup(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function ensure_dashboard_purchase_operation(uuid,uuid),prepare_dashboard_purchase(uuid,uuid,text,jsonb),claim_dashboard_purchase_setup(uuid,uuid,uuid),finish_dashboard_purchase_setup(uuid,uuid,uuid,text,text) to service_role;
commit;
