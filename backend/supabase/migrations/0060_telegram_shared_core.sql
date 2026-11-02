-- Telegram-only release core. Apply only through the reviewed dependency manifest.
-- Includes durable used-trial history backfill; never resets claims or provisions keys.
begin;

create table public.purchase_operations (
  id uuid primary key default gen_random_uuid(),
  reseller_id uuid not null references public.resellers(id),
  customer_id uuid not null,
  order_id uuid not null,
  request_key text not null,
  command jsonb not null,
  policy text not null check (policy in ('customer','staff')),
  is_queued boolean not null default false,
  status text not null default 'created' check (status in ('created','processing','completed','recovery_required')),
  lease_owner uuid,
  lease_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(reseller_id,request_key),
  foreign key(customer_id,reseller_id) references public.vpn_customers(id,reseller_id),
  foreign key(order_id,reseller_id) references public.vpn_orders(id,reseller_id)
);
alter table public.purchase_operations enable row level security;
revoke all on public.purchase_operations from public, anon, authenticated;
grant all on public.purchase_operations to service_role;



create or replace function public.submit_purchase(
  p_reseller_id uuid, p_customer_id uuid, p_plan_id uuid, p_channel text, p_policy text,
  p_protocol text, p_screenshot text, p_note text, p_payment_status text, p_request_key text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  c vpn_customers%rowtype; r resellers%rowtype; p vpn_plans%rowtype; a vpn_orders%rowtype;
  op purchase_operations%rowtype; v_order uuid; v_queued boolean:=false; v_type text; v_payment text;
  v_review text; v_commission numeric; v_amount integer; v_commission_amount integer; v_protocol text;
  v_command jsonb; v_completed boolean;
begin
  if ((p_policy='customer' and p_channel in ('bot','miniapp')) or (p_policy='staff' and p_channel='dashboard')) is not true then raise exception 'INVALID_CALLER'; end if;
  if p_request_key is null or length(p_request_key)=0 or length(p_request_key)>500 then raise exception 'INVALID_CALLER'; end if;
  select * into c from vpn_customers where id=p_customer_id and reseller_id=p_reseller_id for update;
  if not found then raise exception 'INVALID_CUSTOMER'; end if;
  if p_policy='customer' and c.status <> 'active' then raise exception 'INACTIVE_CUSTOMER'; end if;
  select * into r from resellers where id=p_reseller_id;
  if not found or r.status <> 'active' then raise exception 'INACTIVE_RESELLER'; end if;
  v_command=jsonb_build_object('customer',p_customer_id,'plan',p_plan_id,'channel',p_channel,'policy',p_policy,'protocol',p_protocol,'screenshot',p_screenshot,'note',p_note,'payment',p_payment_status);
  select * into op from purchase_operations where reseller_id=p_reseller_id and request_key=p_request_key;
  if found then
    if op.command <> v_command then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('operation_id',op.id,'replayed',true);
  end if;
  select * into p from vpn_plans where id=p_plan_id and is_active;
  if not found then raise exception 'INVALID_PLAN'; end if;
  if p_policy='customer' and (p.is_trial or p.price_mmk<=0 or p_screenshot is null or length(p_screenshot)=0) then raise exception 'INVALID_PLAN'; end if;
  if p_protocol is null or p_protocol not in ('shadowsocks','vless','hysteria2') then raise exception 'INVALID_CALLER'; end if;
  select * into a from vpn_orders where reseller_id=p_reseller_id and customer_id=p_customer_id and status='active' and order_type='purchase' limit 1;
  if p_policy='customer' then
    if exists(select 1 from purchase_operations where reseller_id=p_reseller_id and customer_id=p_customer_id and policy='customer' and status<>'completed') then raise exception 'PURCHASE_PROCESSING'; end if;
    if a.id is not null and a.review_status is distinct from 'confirmed' then raise exception 'PURCHASE_UNDER_REVIEW'; end if;
    if exists(select 1 from vpn_orders where reseller_id=p_reseller_id and customer_id=p_customer_id and status='scheduled') then raise exception 'QUEUED_PACKAGE_EXISTS'; end if;
    v_queued=a.id is not null;
    v_type='purchase'; v_payment='unpaid'; v_review='pending_review';
    v_commission=coalesce(r.commission_percent,0);
  else
    v_type=case when p.is_trial then 'trial' else 'purchase' end;
    if v_type='purchase' and a.id is not null then raise exception 'ACTIVE_PACKAGE_EXISTS'; end if;
    v_payment=case when p.is_trial or p_payment_status='paid' then 'paid' else 'unpaid' end;
    v_review=case when v_payment='paid' then 'confirmed' else 'pending_review' end;
    v_commission=least(100,greatest(0,coalesce(r.commission_percent,0)));
  end if;
  v_protocol=p_protocol;
  if v_queued then
    select protocol into v_protocol from vpn_keys where order_id=a.id and reseller_id=p_reseller_id and status='active' order by created_at desc limit 1;
    v_protocol=coalesce(v_protocol,c.protocol_preference,'shadowsocks');
  else
    update vpn_customers set protocol_preference=v_protocol where id=c.id and reseller_id=p_reseller_id;
  end if;
  v_amount=case when p_policy='staff' and v_type='purchase' and v_payment='paid' then p.price_mmk else 0 end;
  v_commission_amount=case when p_channel='bot' then round(p.price_mmk*v_commission/100) else floor(p.price_mmk*v_commission/100) end;
  insert into vpn_orders(customer_id,reseller_id,plan_id,status,price_mmk,commission_percent,commission_amount_mmk,payment_status,total_paid_mmk,order_type,review_status,source,payment_screenshot_url,payment_note)
  values(c.id,p_reseller_id,p.id,case when v_queued then 'scheduled' else 'pending' end,p.price_mmk,v_commission,
    case when p_policy='staff' then floor(v_amount*v_commission/100) else v_commission_amount end,v_payment,v_amount,v_type,v_review,p_channel,p_screenshot,p_note)
  returning id into v_order;
  if v_type='purchase' and p.price_mmk>0 and (p_policy='customer' or v_payment='paid') then
    insert into order_payments(order_id,customer_id,reseller_id,amount_mmk,commission_percent,commission_amount_mmk,platform_due_mmk,
      payment_note,payment_screenshot_url,review_status,payment_type,apply_status,plan_id,package_duration_days,package_data_limit_gb,
      applied_at,idempotency_key,source,reviewed_at,reviewed_by_reseller_id)
    values(v_order,c.id,p_reseller_id,p.price_mmk,v_commission,floor(p.price_mmk*v_commission/100),p.price_mmk-floor(p.price_mmk*v_commission/100),
      p_note,p_screenshot,v_review,case when v_queued then 'extend' else 'initial' end,case when v_review='confirmed' then 'applied' else 'pending' end,
      p.id,p.duration_days,p.data_limit_gb,case when v_review='confirmed' then now() end,'purchase:'||p_request_key,p_channel,
      case when v_review='confirmed' then now() end,case when v_review='confirmed' then p_reseller_id end);
  end if;
  v_completed=p_policy='staff' or v_queued;
  insert into purchase_operations(reseller_id,customer_id,order_id,request_key,command,policy,is_queued,status)
  values(p_reseller_id,c.id,v_order,p_request_key,v_command,p_policy,v_queued,case when v_completed then 'completed' else 'created' end) returning * into op;
  return jsonb_build_object('operation_id',op.id,'replayed',false);
end $$;

create or replace function public.claim_purchase_execution(p_id uuid,p_reseller_id uuid,p_owner uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare n integer; begin
  if p_owner is null then raise exception 'INVALID_CALLER'; end if;
  update purchase_operations set status='processing',lease_owner=p_owner,lease_until=now()+interval '15 minutes',updated_at=now()
  where id=p_id and reseller_id=p_reseller_id and (status='created' or (status='processing' and lease_until<now()));
  get diagnostics n=row_count; return n=1;
end $$;

create or replace function public.finish_purchase_execution(p_id uuid,p_reseller_id uuid,p_owner uuid,p_status text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if p_status not in ('created','completed','recovery_required') then raise exception 'INVALID_CALLER'; end if;
  update purchase_operations set status=p_status,lease_owner=null,lease_until=null,updated_at=now()
  where id=p_id and reseller_id=p_reseller_id and ((p_owner is not null and lease_owner=p_owner) or (p_owner is null and status='completed'));
  if not found then raise exception 'PURCHASE_PROCESSING'; end if;
end $$;

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  reseller_id uuid not null references public.resellers(id),
  record_id uuid not null,
  event_key text not null default '',
  event_type text not null,
  channel text not null check (channel='telegram'),
  recipient_id text not null,
  status text not null default 'pending' check (status in ('pending','sending','sent','retryable','uncertain','skipped')),
  owner_token uuid,
  lease_until timestamptz,
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  provider_message_id text,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_deliveries_event_identity unique(reseller_id,event_type,record_id,channel,recipient_id,event_key),
  foreign key(record_id,reseller_id) references public.vpn_orders(id,reseller_id) on delete cascade
);
alter table public.notification_deliveries enable row level security;
revoke all on public.notification_deliveries from public,anon,authenticated;
grant all on public.notification_deliveries to service_role;
create index notification_deliveries_retry on public.notification_deliveries(next_attempt_at) where status in ('pending','retryable');



create function public.claim_notification_delivery(p_reseller_id uuid,p_event_type text,p_record_id uuid,p_channel text,p_recipient_id text,p_owner uuid,p_event_key text default '')
returns jsonb language plpgsql security definer set search_path=public as $$
declare d notification_deliveries%rowtype;
begin
  if p_channel is distinct from 'telegram' or p_owner is null or p_event_type not in ('purchase_submitted','payment_confirmed','payment_rejected','trial_ending_24h','trial_expired','subscription_expiring_3d','subscription_expired','data_limit_warning','data_limit_reached')
    or p_recipient_id is null or length(p_recipient_id)=0 or length(p_recipient_id)>200 then raise exception 'INVALID_DELIVERY'; end if;
  if not exists(select 1 from vpn_orders where id=p_record_id and reseller_id=p_reseller_id) then raise exception 'INVALID_ORDER'; end if;
  insert into notification_deliveries(reseller_id,event_type,record_id,channel,recipient_id,event_key)
    values(p_reseller_id,p_event_type,p_record_id,p_channel,p_recipient_id,coalesce(p_event_key,'')) on conflict do nothing;
  select * into d from notification_deliveries where reseller_id=p_reseller_id and event_type=p_event_type
    and record_id=p_record_id and channel=p_channel and recipient_id=p_recipient_id and event_key=coalesce(p_event_key,'') for update;
  if d.status='sending' and d.lease_until<=now() then
    update notification_deliveries set status='uncertain',owner_token=null,lease_until=null,error_code='lease_expired',updated_at=now() where id=d.id;
    return null;
  end if;
  if d.status not in ('pending','retryable') or d.next_attempt_at>now() or d.attempt_count>=3 then return null; end if;
  update notification_deliveries set status='sending',owner_token=p_owner,lease_until=now()+interval '60 seconds',
    attempt_count=attempt_count+1,updated_at=now() where id=d.id returning * into d;
  return jsonb_build_object('id',d.id,'attempt_count',d.attempt_count);
end $$;

create function public.finish_notification_delivery(p_id uuid,p_reseller_id uuid,p_owner uuid,p_status text,p_provider_message_id text,p_error_code text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if p_status not in ('sent','retryable','uncertain','skipped') then raise exception 'INVALID_DELIVERY_STATUS'; end if;
  update notification_deliveries set status=case when p_status='retryable' and attempt_count>=3 then 'skipped' else p_status end,
    provider_message_id=p_provider_message_id,error_code=p_error_code,owner_token=null,lease_until=null,
    next_attempt_at=now()+case when attempt_count=1 then interval '30 seconds' else interval '2 minutes' end,updated_at=now()
    where id=p_id and reseller_id=p_reseller_id and owner_token=p_owner and status='sending' and lease_until>now();
  return found;
end $$;

create function public.enqueue_purchase_admin_notification()
returns trigger language plpgsql security definer set search_path=public as $$
declare recipient text;
begin
  if new.policy='customer' and new.status='completed' and new.order_id is not null then
    select admin_telegram_user_id::text into recipient from reseller_miniapps
      where reseller_id=new.reseller_id and admin_telegram_user_id is not null and bot_token_encrypted is not null;
    if recipient is not null then
      insert into notification_deliveries(reseller_id,event_type,record_id,channel,recipient_id)
        values(new.reseller_id,'purchase_submitted',new.order_id,'telegram',recipient) on conflict do nothing;
    end if;
  end if;
  return new;
end $$;

create trigger purchase_admin_notification_outbox after insert or update of status on public.purchase_operations
  for each row execute function public.enqueue_purchase_admin_notification();

create table public.customer_trial_claims (
  reseller_id uuid not null references public.resellers(id),
  customer_id uuid not null,
  used_at timestamptz not null default now(),
  order_id uuid,
  plan_snapshot jsonb,
  protocol text,
  provision_status text not null default 'ready' check (provision_status in ('ready','processing','completed','uncertain')),
  provision_owner uuid,
  primary key(reseller_id,customer_id),
  foreign key(customer_id,reseller_id) references public.vpn_customers(id,reseller_id),
  foreign key(order_id,reseller_id) references public.vpn_orders(id,reseller_id) on delete set null (order_id)
);
alter table public.customer_trial_claims enable row level security;
revoke all on public.customer_trial_claims from public,anon,authenticated;
grant all on public.customer_trial_claims to service_role;

-- Consumed history survives even when the original trial order was deleted.
insert into customer_trial_claims(reseller_id,customer_id,used_at,order_id,provision_status)
select reseller_id,customer_id,min(used_at),
  (array_agg(order_id order by used_at) filter(where order_id is not null))[1], 'uncertain'
from (
  select l.reseller_id,l.customer_id,l.trial_used_at used_at,o.id order_id
  from telegram_links l left join vpn_orders o on o.id=l.trial_order_id and o.reseller_id=l.reseller_id and o.customer_id=l.customer_id
  where l.trial_used_at is not null
  union all
  select reseller_id,customer_id,created_at,id from vpn_orders where order_type='trial'
) history group by reseller_id,customer_id;



create or replace function public.customer_trial_eligibility(p_reseller_id uuid,p_customer_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from vpn_customers c join resellers r on r.id=c.reseller_id
    where c.id=p_customer_id and c.reseller_id=p_reseller_id and c.status='active' and r.status='active') then
    return jsonb_build_object('eligible',false,'reason','inactive_account'); end if;
  if not exists(select 1 from reseller_miniapps where reseller_id=p_reseller_id and is_enabled and trial_enabled) then
    return jsonb_build_object('eligible',false,'reason','trial_disabled'); end if;
  if exists(select 1 from customer_trial_claims where customer_id=p_customer_id and reseller_id=p_reseller_id)
    or exists(select 1 from telegram_links where customer_id=p_customer_id and reseller_id=p_reseller_id and trial_used_at is not null)
    or exists(select 1 from vpn_orders where customer_id=p_customer_id and reseller_id=p_reseller_id and order_type='trial') then
    return jsonb_build_object('eligible',false,'reason','already_used','recoverable',exists(
      select 1 from customer_trial_claims cl join vpn_orders o on o.id=cl.order_id and o.reseller_id=cl.reseller_id
      where cl.customer_id=p_customer_id and cl.reseller_id=p_reseller_id and o.status='active'
        and o.order_type='trial' and o.expiry_date>=((now() at time zone 'Asia/Bangkok') - interval '4 hours 30 minutes')::date
    )); end if;
  if exists(select 1 from vpn_orders where customer_id=p_customer_id and reseller_id=p_reseller_id
    and order_type<>'trial' and status in ('active','pending','scheduled')) then
    return jsonb_build_object('eligible',false,'reason','paid_package_exists'); end if;
  return jsonb_build_object('eligible',true,'reason',null);
end $$;

create or replace function public.create_customer_trial(p_reseller_id uuid,p_customer_id uuid,p_source text,p_telegram_link_id uuid default null,p_telegram_username text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare trial_claim customer_trial_claims%rowtype; o vpn_orders%rowtype; p vpn_plans%rowtype; m reseller_miniapps%rowtype;
  eligibility jsonb; snapshot jsonb; start_day date := (now() at time zone 'Asia/Bangkok')::date;
begin
  if p_source is null or p_source not in ('bot','miniapp') then raise exception 'INVALID_TRIAL_SOURCE'; end if;
  perform 1 from vpn_customers where id=p_customer_id and reseller_id=p_reseller_id for update;
  if not found then raise exception 'INVALID_CUSTOMER'; end if;
  if not exists(select 1 from vpn_customers c join resellers r on r.id=c.reseller_id
    where c.id=p_customer_id and c.reseller_id=p_reseller_id and c.status='active' and r.status='active') then raise exception 'INACTIVE_ACCOUNT'; end if;
  if not exists(select 1 from reseller_miniapps where reseller_id=p_reseller_id and is_enabled and trial_enabled) then raise exception 'TRIAL_DISABLED'; end if;
  if p_source in ('bot','miniapp') and not exists(select 1 from telegram_links where id=p_telegram_link_id
    and reseller_id=p_reseller_id and customer_id=p_customer_id) then raise exception 'INVALID_TELEGRAM_LINK'; end if;
  select * into trial_claim from customer_trial_claims where reseller_id=p_reseller_id and customer_id=p_customer_id;
  if found then
    select * into o from vpn_orders where id=trial_claim.order_id and reseller_id=p_reseller_id and customer_id=p_customer_id
      and status='active' and order_type='trial' and expiry_date>=((now() at time zone 'Asia/Bangkok') - interval '4 hours 30 minutes')::date;
    if not found then return jsonb_build_object('order',null,'plan',null,'created',false,'reason','already_used'); end if;
    select * into p from vpn_plans where id=o.plan_id;
    snapshot=coalesce(trial_claim.plan_snapshot,to_jsonb(p)||jsonb_build_object('data_limit_gb',coalesce(o.quota_limit_bytes/1073741824.0,p.data_limit_gb)));
    return jsonb_build_object('order',to_jsonb(o),'plan',snapshot,'created',false,'protocol',trial_claim.protocol);
  end if;
  eligibility=customer_trial_eligibility(p_reseller_id,p_customer_id);
  if not (eligibility->>'eligible')::boolean then return jsonb_build_object('order',null,'plan',null,'created',false,'reason',eligibility->>'reason'); end if;
  select * into m from reseller_miniapps where reseller_id=p_reseller_id;
  select * into p from vpn_plans where is_trial and is_active order by sort_order,id limit 1;
  if not found then raise exception 'TRIAL_PLAN_NOT_CONFIGURED'; end if;
  if m.trial_duration_days<=0 or m.trial_data_limit_gb<=0 then raise exception 'INVALID_TRIAL_SETTINGS'; end if;
  snapshot=to_jsonb(p)||jsonb_build_object('duration_days',m.trial_duration_days,'data_limit_gb',m.trial_data_limit_gb);
  insert into vpn_orders(customer_id,reseller_id,plan_id,status,price_mmk,commission_percent,commission_amount_mmk,
    start_date,expiry_date,payment_status,activated_at,total_paid_mmk,order_type,review_status,source,quota_limit_bytes)
  values(p_customer_id,p_reseller_id,p.id,'active',0,0,0,start_day,start_day+m.trial_duration_days,
    'paid',now(),0,'trial','confirmed',p_source,m.trial_data_limit_gb::bigint*1073741824) returning * into o;
  insert into customer_trial_claims(reseller_id,customer_id,order_id,plan_snapshot,protocol)
    values(p_reseller_id,p_customer_id,o.id,snapshot,coalesce(m.trial_protocol,'shadowsocks'));
  update telegram_links set trial_used_at=now(),trial_order_id=o.id,updated_at=now(),
    telegram_username=case when id=p_telegram_link_id then p_telegram_username else telegram_username end
    where reseller_id=p_reseller_id and customer_id=p_customer_id;
  return jsonb_build_object('order',to_jsonb(o),'plan',snapshot,'created',true,'protocol',coalesce(m.trial_protocol,'shadowsocks'));
end $$;

create or replace function public.claim_trial_provisioning(p_reseller_id uuid,p_customer_id uuid,p_order_id uuid,p_owner uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if p_owner is null then raise exception 'INVALID_OWNER'; end if;
  if not exists(select 1 from vpn_orders o join vpn_customers c on c.id=o.customer_id and c.reseller_id=o.reseller_id
      join resellers r on r.id=o.reseller_id join reseller_miniapps m on m.reseller_id=o.reseller_id
    where o.id=p_order_id and o.reseller_id=p_reseller_id and o.customer_id=p_customer_id and o.order_type='trial'
      and o.status='active' and o.expiry_date>=((now() at time zone 'Asia/Bangkok') - interval '4 hours 30 minutes')::date
      and c.status='active' and r.status='active' and m.is_enabled and m.trial_enabled) then raise exception 'TRIAL_NOT_AUTHORIZED'; end if;
  update customer_trial_claims set provision_status='processing',provision_owner=p_owner
    where reseller_id=p_reseller_id and customer_id=p_customer_id and order_id=p_order_id and provision_status='ready';
  return found;
end $$;

create function public.finish_trial_provisioning(p_reseller_id uuid,p_customer_id uuid,p_order_id uuid,p_owner uuid,p_status text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if p_status not in ('completed','uncertain','ready') then raise exception 'INVALID_STATUS'; end if;
  update customer_trial_claims set provision_status=p_status,provision_owner=null
    where reseller_id=p_reseller_id and customer_id=p_customer_id and order_id=p_order_id
      and provision_owner=p_owner and provision_status='processing';
  return found;
end $$;
revoke all on function public.enqueue_purchase_admin_notification() from public,anon,authenticated;
revoke all on function public.submit_purchase(uuid,uuid,uuid,text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.submit_purchase(uuid,uuid,uuid,text,text,text,text,text,text,text) to service_role;
revoke all on function public.claim_purchase_execution(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_purchase_execution(uuid,uuid,uuid) to service_role;
revoke all on function public.finish_purchase_execution(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.finish_purchase_execution(uuid,uuid,uuid,text) to service_role;
revoke all on function public.claim_notification_delivery(uuid,text,uuid,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_notification_delivery(uuid,text,uuid,text,text,uuid,text) to service_role;
revoke all on function public.finish_notification_delivery(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.finish_notification_delivery(uuid,uuid,uuid,text,text,text) to service_role;
revoke all on function public.customer_trial_eligibility(uuid,uuid) from public,anon,authenticated;
grant execute on function public.customer_trial_eligibility(uuid,uuid) to service_role;
revoke all on function public.create_customer_trial(uuid,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.create_customer_trial(uuid,uuid,text,uuid,text) to service_role;
revoke all on function public.claim_trial_provisioning(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_trial_provisioning(uuid,uuid,uuid,uuid) to service_role;
revoke all on function public.finish_trial_provisioning(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.finish_trial_provisioning(uuid,uuid,uuid,uuid,text) to service_role;
notify pgrst,'reload schema';
commit;
