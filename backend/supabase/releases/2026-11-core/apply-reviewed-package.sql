-- REVIEW ARTIFACT ONLY: production application requires owner approval.
-- Atomic dependency order from manifest.json; do not sort filenames.
begin;
do $release_guard$ begin
 if to_regclass('public.purchase_operations') is not null or to_regclass('public.server_operations') is not null
   or to_regclass('public.customer_trial_claims') is not null or to_regclass('public.notification_deliveries') is not null
 then raise exception 'RELEASE_ALREADY_INSTALLED_OR_PARTIAL'; end if;
 if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='activate_vpn_key')<>1
 or (select md5(pg_get_functiondef(oid)) from pg_proc where pronamespace='public'::regnamespace and proname='activate_vpn_key')
 is distinct from 'b8b915848d7585dcc35acf7f07447df0' then raise exception 'RELEASE_BASELINE_DRIFT: activate_vpn_key'; end if;
 if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='apply_confirmed_payment')<>1
 or (select md5(pg_get_functiondef(oid)) from pg_proc where pronamespace='public'::regnamespace and proname='apply_confirmed_payment')
 is distinct from '894dcc13621e85e2c28c455678316b9e' then raise exception 'RELEASE_BASELINE_DRIFT: apply_confirmed_payment'; end if;
 if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='prepare_dashboard_purchase')<>1
 or (select md5(pg_get_functiondef(oid)) from pg_proc where pronamespace='public'::regnamespace and proname='prepare_dashboard_purchase')
 is distinct from '3e54d60f5c61f1fedb4885f7cb35340b' then raise exception 'RELEASE_BASELINE_DRIFT: prepare_dashboard_purchase'; end if;
 if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='reserve_pending_key')<>1
 or (select md5(pg_get_functiondef(oid)) from pg_proc where pronamespace='public'::regnamespace and proname='reserve_pending_key')
 is distinct from 'b95eefcd0bd687894f2a716860186011' then raise exception 'RELEASE_BASELINE_DRIFT: reserve_pending_key'; end if;
 if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='sync_server_active_keys')<>1
 or (select md5(pg_get_functiondef(oid)) from pg_proc where pronamespace='public'::regnamespace and proname='sync_server_active_keys')
 is distinct from '1e53f02b19dae49560046f942e51d3aa' then raise exception 'RELEASE_BASELINE_DRIFT: sync_server_active_keys'; end if;
end $release_guard$;
-- File: 0060_telegram_shared_core.sql; SHA256: 7d1225ffeabd261ad3cf88a9d1bb0db3f6b7131f6c4e35431b5637e2d19e28b1
-- Telegram-only release core. Apply only through the reviewed dependency manifest.
-- Includes durable used-trial history backfill; never resets claims or provisions keys.

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

-- File: 0040_public_server_access.sql; SHA256: 6802218c0da826f71c49605dce383f4831c6f53c9974408d4d86266d583ac8ce

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

-- File: 0041_server_operations.sql; SHA256: 3346d6cdf6a0602487f0bfad3e19a7e71f8df6fc1d4d8df4bec8905f47435549

-- Private records: checkpoints may contain account snapshots. Never expose raw rows.
create table public.server_operations (
  id uuid primary key default gen_random_uuid(),
  environment text not null check(environment in ('development','production')),
  access_pool_id uuid not null,
  database_identity text not null check(length(database_identity) between 1 and 200),
  panel_identity text not null check(length(panel_identity) between 1 and 200),
  kind text not null check(kind in ('add','replace','move_retire')),
  idempotency_key text not null check(length(idempotency_key) between 1 and 200),
  payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
  payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=65536),
  status text not null default 'queued' check(status in ('queued','running','blocked','paused','completed','cancelled','failed','partial')),
  stage text not null default 'queued' check(length(stage) between 1 and 100),
  checkpoint jsonb not null default '{}' check(jsonb_typeof(checkpoint)='object' and octet_length(checkpoint::text)<=65536),
  lease_owner uuid,
  lease_until timestamptz,
  fence bigint not null default 0 check(fence>=0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(environment,access_pool_id,idempotency_key),
  unique(id,environment,access_pool_id),
  foreign key(access_pool_id,environment) references public.server_access_pools(id,environment)
);
create table public.server_operation_items (
  operation_id uuid not null references public.server_operations(id),
  item_key text not null check(length(item_key) between 1 and 200),
  expected jsonb not null check(jsonb_typeof(expected)='object' and octet_length(expected::text)<=65536),
  checkpoint jsonb not null default '{}' check(jsonb_typeof(checkpoint)='object' and octet_length(checkpoint::text)<=65536),
  status text not null default 'claimed' check(status in ('claimed','prepared','applied','verified','blocked','uncertain')),
  fence bigint not null,
  updated_at timestamptz not null default clock_timestamp(),
  primary key(operation_id,item_key)
);
create table public.server_operation_locks (
  environment text not null,
  access_pool_id uuid not null,
  resource_key text not null check(resource_key ~ '^(server|order):[a-f0-9-]{36}$'),
  operation_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(environment,access_pool_id,resource_key),
  foreign key(operation_id,environment,access_pool_id) references public.server_operations(id,environment,access_pool_id)
);
create index server_operations_claimable on public.server_operations(environment,access_pool_id,status,lease_until);
create index server_operation_locks_operation on public.server_operation_locks(operation_id);
alter table public.server_operations enable row level security;
alter table public.server_operation_items enable row level security;
alter table public.server_operation_locks enable row level security;
revoke all on public.server_operations,public.server_operation_items,public.server_operation_locks from public,anon,authenticated,service_role;
grant select on public.server_operations,public.server_operation_items,public.server_operation_locks to service_role;

-- File: 0042_server_operation_coordination.sql; SHA256: 5965065ed57f3166f13f9cbed647416e0c8f7203680dd746b2216b474f8bdf3b

-- Explicit owner-installed binding. Do not infer it from NODE_ENV or seed live IDs.
create table public.server_operation_runtime_bindings (
  environment text not null,
  access_pool_id uuid not null,
  database_identity text not null,
  panel_identity text not null,
  primary key(environment,access_pool_id),
  foreign key(access_pool_id,environment) references public.server_access_pools(id,environment)
);
alter table public.server_operation_runtime_bindings enable row level security;
revoke all on public.server_operation_runtime_bindings from public,anon,authenticated,service_role;
grant select on public.server_operation_runtime_bindings to service_role;

-- Expiry is evidence of uncertainty, never permission to retire an in-flight VPS.
create table public.server_customer_mutation_guards (
  guard_id uuid primary key,
  environment text not null,
  access_pool_id uuid not null,
  resource_keys text[] not null,
  lease_until timestamptz not null,
  status text not null default 'running' check(status in ('running','uncertain')),
  foreign key(access_pool_id,environment) references public.server_access_pools(id,environment)
);
alter table public.server_customer_mutation_guards enable row level security;
revoke all on public.server_customer_mutation_guards from public,anon,authenticated,service_role;
grant select on public.server_customer_mutation_guards to service_role;

create function public.require_server_operation_scope(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from server_operation_runtime_bindings b join server_access_pools p
    on p.id=b.access_pool_id and p.environment=b.environment
    where b.environment=p_environment and b.access_pool_id=p_pool_id
    and b.database_identity=p_database_identity and b.panel_identity=p_panel_identity
    and p.panel_identity=p_panel_identity) then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
end $$;

create function public.require_server_operation_lease(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_fence bigint)
returns public.server_operations language plpgsql security definer set search_path=public,pg_temp as $$
declare o server_operations;
begin
  perform require_server_operation_scope(p_environment,p_pool_id,p_database_identity,p_panel_identity);
  select * into o from server_operations where id=p_operation_id and environment=p_environment and access_pool_id=p_pool_id for update;
  if not found then raise exception 'OPERATION_NOT_FOUND'; end if;
  if o.lease_owner is distinct from p_owner or o.fence is distinct from p_fence then raise exception 'STALE_FENCE'; end if;
  if o.lease_until is null or o.lease_until<=clock_timestamp() then raise exception 'LEASE_EXPIRED'; end if;
  if o.status in ('completed','cancelled','failed') then raise exception 'INVALID_OPERATION'; end if;
  return o;
end $$;

create function public.create_server_operation(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_kind text,p_idempotency_key text,p_payload jsonb,p_payload_hash text)
returns public.server_operations language plpgsql security definer set search_path=public,pg_temp as $$
declare o server_operations; sid uuid; resource text;
begin
  perform require_server_operation_scope(p_environment,p_pool_id,p_database_identity,p_panel_identity);
  -- Scope/idempotency serialization makes a concurrent identical request return one row.
  perform pg_advisory_xact_lock(hashtextextended(p_environment||p_pool_id::text||p_idempotency_key,0));
  select * into o from server_operations where environment=p_environment and access_pool_id=p_pool_id and idempotency_key=p_idempotency_key;
  if found then
    if o.payload_hash<>p_payload_hash or o.payload<>p_payload or o.kind<>p_kind then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return o;
  end if;
  if p_kind not in ('add','replace','move_retire') or
    (p_kind<>'add' and nullif(p_payload->>'source_server_id','') is null) or
    (p_kind='move_retire' and nullif(p_payload->>'destination_server_id','') is null) or
    (p_kind='add' and nullif(p_payload->>'source_server_id','') is not null) or
    (p_kind<>'move_retire' and nullif(p_payload->>'destination_server_id','') is not null) or
    (p_payload->>'source_server_id'=p_payload->>'destination_server_id') then raise exception 'INVALID_OPERATION'; end if;
  insert into server_operations(environment,access_pool_id,database_identity,panel_identity,kind,idempotency_key,payload_hash,payload)
    values(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_kind,p_idempotency_key,p_payload_hash,p_payload) returning * into o;
  for resource in
    with servers as (select distinct value::uuid id from jsonb_array_elements_text(jsonb_build_array(p_payload->>'source_server_id',p_payload->>'destination_server_id')) where value is not null)
    select 'server:'||id::text from servers union
    select 'order:'||k.order_id::text from vpn_keys k join servers s on s.id=k.server_id where k.status in ('active','pending')
    order by 1
  loop
    perform pg_advisory_xact_lock(hashtextextended(p_environment||p_pool_id::text||resource,0));
    if resource like 'server:%' then
      sid:=substring(resource from 8)::uuid;
      if not exists(select 1 from vpn_servers s where s.id=sid and s.environment=p_environment and s.access_pool_id=p_pool_id) then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
      -- Pending reservations are in-flight external work, not spare capacity.
      if exists(select 1 from vpn_keys k where k.server_id=sid and k.status='pending') then raise exception 'SERVER_MIGRATION_IN_PROGRESS'; end if;
    end if;
    if exists(select 1 from server_operation_locks l where l.environment=p_environment and l.access_pool_id=p_pool_id and l.resource_key=resource)
      or exists(select 1 from server_customer_mutation_guards g where g.environment=p_environment and g.access_pool_id=p_pool_id and resource=any(g.resource_keys)) then raise exception 'SERVER_MIGRATION_IN_PROGRESS'; end if;
    insert into server_operation_locks(environment,access_pool_id,resource_key,operation_id) values(p_environment,p_pool_id,resource,o.id);
  end loop;
  return o;
end $$;

create function public.claim_server_operation(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_ttl_seconds integer)
returns public.server_operations language plpgsql security definer set search_path=public,pg_temp as $$
declare o server_operations;
begin
  perform require_server_operation_scope(p_environment,p_pool_id,p_database_identity,p_panel_identity);
  if p_owner is null or p_ttl_seconds is null or p_ttl_seconds not between 10 and 300 then raise exception 'INVALID_OPERATION'; end if;
  select * into o from server_operations where id=p_operation_id and environment=p_environment and access_pool_id=p_pool_id for update;
  if not found then raise exception 'OPERATION_NOT_FOUND'; end if;
  if o.status in ('completed','cancelled','failed') then raise exception 'INVALID_OPERATION'; end if;
  if o.lease_until>clock_timestamp() then
    if o.lease_owner=p_owner then return o; end if;
    raise exception 'LEASE_BUSY';
  end if;
  update server_operations set lease_owner=p_owner,lease_until=clock_timestamp()+make_interval(secs=>p_ttl_seconds),
    fence=fence+1,status='running',updated_at=clock_timestamp() where id=o.id returning * into o;
  return o;
end $$;

create function public.renew_server_operation_lease(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_fence bigint,p_ttl_seconds integer)
returns public.server_operations language plpgsql security definer set search_path=public,pg_temp as $$
declare o server_operations;
begin
  o:=require_server_operation_lease(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  if p_ttl_seconds is null or p_ttl_seconds not between 10 and 300 then raise exception 'INVALID_OPERATION'; end if;
  update server_operations set lease_until=clock_timestamp()+make_interval(secs=>p_ttl_seconds),updated_at=clock_timestamp() where id=o.id returning * into o;
  return o;
end $$;

create function public.checkpoint_server_operation(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_fence bigint,p_stage text,p_status text,p_checkpoint jsonb)
returns public.server_operations language plpgsql security definer set search_path=public,pg_temp as $$
declare o server_operations;
begin
  o:=require_server_operation_lease(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  if p_status not in ('running','blocked','paused','partial') then raise exception 'INVALID_OPERATION'; end if;
  update server_operations set stage=p_stage,status=p_status,checkpoint=p_checkpoint,updated_at=clock_timestamp() where id=o.id returning * into o;
  return o;
end $$;

create function public.claim_server_operation_item(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_fence bigint,p_item_key text,p_expected jsonb)
returns public.server_operation_items language plpgsql security definer set search_path=public,pg_temp as $$
declare item server_operation_items;
begin
  perform require_server_operation_lease(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  select * into item from server_operation_items where operation_id=p_operation_id and item_key=p_item_key for update;
  if found then
    if item.expected<>p_expected then raise exception 'ITEM_STATE_CONFLICT'; end if;
    update server_operation_items set fence=p_fence,updated_at=clock_timestamp() where operation_id=p_operation_id and item_key=p_item_key returning * into item;
  else
    insert into server_operation_items(operation_id,item_key,expected,fence) values(p_operation_id,p_item_key,p_expected,p_fence) returning * into item;
  end if;
  return item;
end $$;

create function public.finish_server_operation_item(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_fence bigint,p_item_key text,p_status text,p_checkpoint jsonb)
returns public.server_operation_items language plpgsql security definer set search_path=public,pg_temp as $$
declare item server_operation_items;
begin
  perform require_server_operation_lease(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  update server_operation_items set status=p_status,checkpoint=p_checkpoint,updated_at=clock_timestamp()
    where operation_id=p_operation_id and item_key=p_item_key and fence=p_fence returning * into item;
  if not found then raise exception 'STALE_FENCE'; end if;
  return item;
end $$;

create function public.release_server_operation(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_fence bigint,p_status text)
returns public.server_operations language plpgsql security definer set search_path=public,pg_temp as $$
declare o server_operations;
begin
  o:=require_server_operation_lease(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  if p_status not in ('completed','cancelled','failed') then raise exception 'OPERATION_NOT_TERMINAL'; end if;
  -- Terminal status does not itself authorize dropping uncertain dependencies.
  if exists(select 1 from server_operation_items where operation_id=o.id and status<>'verified') then raise exception 'ITEM_STATE_CONFLICT'; end if;
  delete from server_operation_locks where operation_id=o.id;
  update server_operations set status=p_status,lease_owner=null,lease_until=null,updated_at=clock_timestamp() where id=o.id returning * into o;
  return o;
end $$;

create function public.read_server_operation(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid)
returns public.server_operations language plpgsql security definer set search_path=public,pg_temp as $$
declare o server_operations;
begin
  perform require_server_operation_scope(p_environment,p_pool_id,p_database_identity,p_panel_identity);
  select * into o from server_operations where id=p_operation_id and environment=p_environment and access_pool_id=p_pool_id;
  if not found then raise exception 'OPERATION_NOT_FOUND'; end if;
  return o;
end $$;

create function public.acquire_server_customer_mutation(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_guard_id uuid,p_resource_keys text[],p_reseller_id uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare resource text; prior server_customer_mutation_guards; sid uuid;
begin
  perform require_server_operation_scope(p_environment,p_pool_id,p_database_identity,p_panel_identity);
  if p_guard_id is null or cardinality(p_resource_keys) not between 1 and 100 or array_position(p_resource_keys,null) is not null then raise exception 'INVALID_OPERATION'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_guard_id::text,0));
  select * into prior from server_customer_mutation_guards where guard_id=p_guard_id;
  if found and (prior.environment<>p_environment or prior.access_pool_id<>p_pool_id or prior.status<>'running' or prior.lease_until<=clock_timestamp() or not p_resource_keys @> prior.resource_keys) then raise exception 'STALE_FENCE'; end if;
  for resource in select distinct value from unnest(p_resource_keys) value order by value loop
    if resource !~ '^(server|order):[a-f0-9-]{36}$' then raise exception 'INVALID_OPERATION'; end if;
    perform pg_advisory_xact_lock(hashtextextended(p_environment||p_pool_id::text||resource,0));
    if resource like 'server:%' then
      sid:=substring(resource from 8)::uuid;
      if not exists(select 1 from vpn_servers where id=sid and environment=p_environment and access_pool_id=p_pool_id) then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
    else
      if not exists(select 1 from vpn_orders where id=substring(resource from 7)::uuid and (p_reseller_id is null or reseller_id=p_reseller_id)) then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
    end if;
    if exists(select 1 from server_operation_locks where environment=p_environment and access_pool_id=p_pool_id and resource_key=resource)
      or exists(select 1 from server_customer_mutation_guards where environment=p_environment and access_pool_id=p_pool_id and guard_id<>p_guard_id and resource=any(resource_keys)) then raise exception 'SERVER_MIGRATION_IN_PROGRESS'; end if;
  end loop;
  insert into server_customer_mutation_guards(guard_id,environment,access_pool_id,resource_keys,lease_until)
    values(p_guard_id,p_environment,p_pool_id,p_resource_keys,clock_timestamp()+interval '5 minutes')
    on conflict(guard_id) do update set resource_keys=excluded.resource_keys,lease_until=excluded.lease_until;
  return p_guard_id;
end $$;

create function public.finish_server_customer_mutation(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_guard_id uuid,p_uncertain boolean)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare g server_customer_mutation_guards;
begin
  perform require_server_operation_scope(p_environment,p_pool_id,p_database_identity,p_panel_identity);
  select * into g from server_customer_mutation_guards where guard_id=p_guard_id and environment=p_environment and access_pool_id=p_pool_id for update;
  if not found then raise exception 'STALE_FENCE'; end if;
  if p_uncertain is true or g.lease_until<=clock_timestamp() then
    update server_customer_mutation_guards set status='uncertain' where guard_id=p_guard_id;
    return false;
  end if;
  delete from server_customer_mutation_guards where guard_id=p_guard_id;
  return true;
end $$;

-- SQL mutations cannot bypass drains, including legacy reserve/activate RPCs.
-- The original RPCs/counters are unchanged: rejection rolls their transaction back.
create function public.guard_server_lifecycle_mutation() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare sid uuid; oid uuid; s record; resource text;
begin
  if tg_table_name='vpn_keys' then
    if tg_op='DELETE' then sid:=old.server_id; oid:=old.order_id; else sid:=new.server_id; oid:=new.order_id; end if;
  elsif tg_table_name='vpn_orders' then
    if tg_op='DELETE' then oid:=old.id; else oid:=new.id; end if;
  else
    if tg_op='DELETE' then sid:=old.id; else sid:=new.id; end if;
  end if;
  for s in select distinct v.environment,v.access_pool_id,v.id from vpn_servers v
    where v.environment is not null and (v.id=sid or v.id in (select k.server_id from vpn_keys k where k.order_id=oid)) order by v.id loop
    for resource in select value from unnest(array['server:'||s.id::text,case when oid is not null then 'order:'||oid::text end]) value where value is not null order by value loop
      perform pg_advisory_xact_lock(hashtextextended(s.environment||s.access_pool_id::text||resource,0));
      if exists(select 1 from server_operation_locks l where l.environment=s.environment and l.access_pool_id=s.access_pool_id and l.resource_key=resource) then
        raise exception 'SERVER_MIGRATION_IN_PROGRESS';
      end if;
    end loop;
  end loop;
  if tg_op='DELETE' then return old; end if; return new;
end $$;
create trigger vpn_keys_lifecycle_guard before insert or update or delete on public.vpn_keys for each row execute function public.guard_server_lifecycle_mutation();
create trigger vpn_orders_lifecycle_guard before update or delete on public.vpn_orders for each row execute function public.guard_server_lifecycle_mutation();
create trigger vpn_servers_lifecycle_guard before update or delete on public.vpn_servers for each row execute function public.guard_server_lifecycle_mutation();

-- Helpers are private even to service_role; only the reviewed RPC entry points run them.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=any(array['require_server_operation_scope','require_server_operation_lease',
      'create_server_operation','claim_server_operation','renew_server_operation_lease','checkpoint_server_operation',
      'claim_server_operation_item','finish_server_operation_item','release_server_operation','read_server_operation','guard_server_lifecycle_mutation',
      'acquire_server_customer_mutation','finish_server_customer_mutation']) loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
    if f.proname not like 'require_%' and f.proname<>'guard_server_lifecycle_mutation' then
      execute format('grant execute on function %s to service_role',f.signature);
    end if;
  end loop;
end $$;

-- File: 0043_server_operation_access_moves.sql; SHA256: fa27f90a5bc193c2ec988d25e7fdb2210b62da70edfa48fbc5f9c6f0c3315920

-- Preserve the existing database-owned recomputation and capacity enforcement.
do $$ begin
  if not exists(select 1 from pg_trigger t join pg_proc p on p.oid=t.tgfoid
    where t.tgrelid='public.vpn_keys'::regclass and t.tgname='trg_sync_server_active_keys'
      and t.tgenabled<>'D' and p.proname='sync_server_active_keys') then
    raise exception 'SERVER_COUNTER_TRIGGER_REQUIRED';
  end if;
end $$;

create function public.begin_server_operation_write(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_fence bigint)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform require_server_operation_lease(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  perform set_config('novanet.operation_id',p_operation_id::text,true);
  perform set_config('novanet.operation_owner',p_owner::text,true);
  perform set_config('novanet.operation_fence',p_fence::text,true);
end $$;

-- Only a currently fenced definer RPC can write through its own drain locks.
create or replace function public.guard_server_lifecycle_mutation() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare sid uuid; oid uuid; s record; resource text; lock_row record; op server_operations;
begin
  if tg_table_name='vpn_keys' then
    if tg_op='DELETE' then sid:=old.server_id; oid:=old.order_id; else sid:=new.server_id; oid:=new.order_id; end if;
  elsif tg_table_name='vpn_orders' then
    if tg_op='DELETE' then oid:=old.id; else oid:=new.id; end if;
  else
    if tg_op='DELETE' then sid:=old.id; else sid:=new.id; end if;
  end if;
  for s in select distinct v.environment,v.access_pool_id,v.id from vpn_servers v
    where v.environment is not null and (v.id=sid or v.id in (select k.server_id from vpn_keys k where k.order_id=oid)) order by v.id loop
    for resource in select value from unnest(array['server:'||s.id::text,case when oid is not null then 'order:'||oid::text end]) value where value is not null order by value loop
      perform pg_advisory_xact_lock(hashtextextended(s.environment||s.access_pool_id::text||resource,0));
      for lock_row in select * from server_operation_locks where environment=s.environment and access_pool_id=s.access_pool_id and resource_key=resource loop
        if current_setting('novanet.operation_id',true) is distinct from lock_row.operation_id::text then raise exception 'SERVER_MIGRATION_IN_PROGRESS'; end if;
        select * into op from server_operations where id=lock_row.operation_id;
        if op.lease_owner::text is distinct from current_setting('novanet.operation_owner',true)
          or op.fence::text is distinct from current_setting('novanet.operation_fence',true)
          or op.lease_until is null or op.lease_until<=clock_timestamp() or op.status in ('completed','cancelled','failed') then raise exception 'STALE_FENCE'; end if;
      end loop;
    end loop;
  end loop;
  if tg_op='DELETE' then return old; end if; return new;
end $$;

create function public.lock_server_operation_server(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_fence bigint,p_server_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare resource text:='server:'||p_server_id::text;
begin
  perform require_server_operation_lease(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  perform pg_advisory_xact_lock(hashtextextended(p_environment||p_pool_id::text||resource,0));
  if not exists(select 1 from vpn_servers where id=p_server_id and environment=p_environment and access_pool_id=p_pool_id) then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  if exists(select 1 from server_operation_locks where environment=p_environment and access_pool_id=p_pool_id and resource_key=resource and operation_id<>p_operation_id)
    or exists(select 1 from server_customer_mutation_guards where environment=p_environment and access_pool_id=p_pool_id and resource=any(resource_keys)) then raise exception 'SERVER_MIGRATION_IN_PROGRESS'; end if;
  insert into server_operation_locks(environment,access_pool_id,resource_key,operation_id) values(p_environment,p_pool_id,resource,p_operation_id) on conflict do nothing;
  return true;
end $$;

create function public.read_server_operation_access(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_fence bigint,p_key_id uuid,p_order_id uuid,p_reseller_id uuid,p_customer_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare k vpn_keys; o vpn_orders;
begin
  perform require_server_operation_lease(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  select * into k from vpn_keys where id=p_key_id and order_id=p_order_id and reseller_id=p_reseller_id and customer_id=p_customer_id;
  select * into o from vpn_orders where id=p_order_id and reseller_id=p_reseller_id and customer_id=p_customer_id;
  if k.id is null or o.id is null or not exists(select 1 from vpn_servers where id=k.server_id and environment=p_environment and access_pool_id=p_pool_id) then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  return jsonb_build_object('key',to_jsonb(k),'order',to_jsonb(o));
end $$;

create function public.read_server_operation_item(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_fence bigint,p_item_key text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare value jsonb;
begin
  perform require_server_operation_lease(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  select checkpoint into value from server_operation_items where operation_id=p_operation_id and item_key=p_item_key;
  return value;
end $$;

create function public.drain_server_operation_source(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_fence bigint,p_server_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare o server_operations;
begin
  perform begin_server_operation_write(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  select * into o from server_operations where id=p_operation_id;
  if o.kind not in ('replace','move_retire') or (o.payload->>'source_server_id')::uuid is distinct from p_server_id or
    not exists(select 1 from server_operation_locks where operation_id=p_operation_id and resource_key='server:'||p_server_id::text) then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  update vpn_servers set is_active=false where id=p_server_id and environment=p_environment and access_pool_id=p_pool_id;
  if not found then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  return true;
end $$;

create function public.move_server_operation_key(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_fence bigint,p_key_id uuid,p_order_id uuid,p_reseller_id uuid,p_customer_id uuid,p_source_id uuid,p_destination_id uuid,p_expected_key jsonb,p_expected_order jsonb)
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
    or o.expiry_date is null or o.expiry_date<(clock_timestamp() at time zone 'Asia/Bangkok')::date
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

create function public.repair_server_operation_assignments(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_fence bigint,p_key_id uuid,p_order_id uuid,p_reseller_id uuid,p_customer_id uuid,p_destination_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform begin_server_operation_write(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  if not exists(select 1 from vpn_keys where id=p_key_id and order_id=p_order_id and reseller_id=p_reseller_id and customer_id=p_customer_id
    and server_id=p_destination_id and status='active' and deleted_at is null)
    or not exists(select 1 from server_operation_locks where operation_id=p_operation_id and resource_key='server:'||p_destination_id::text) then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  update token_server_assignments set server_id=p_destination_id where vpn_key_id=p_key_id and is_active=true;
  return true;
end $$;

create function public.verify_server_operation_assignments(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_fence bigint,p_key_id uuid,p_order_id uuid,p_reseller_id uuid,p_customer_id uuid,p_destination_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform read_server_operation_access(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence,p_key_id,p_order_id,p_reseller_id,p_customer_id);
  return not exists(select 1 from token_server_assignments where vpn_key_id=p_key_id and is_active=true and server_id<>p_destination_id);
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and p.proname=any(array['begin_server_operation_write','guard_server_lifecycle_mutation','lock_server_operation_server','read_server_operation_access',
      'read_server_operation_item','drain_server_operation_source','move_server_operation_key',
      'repair_server_operation_assignments','verify_server_operation_assignments']) loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
    if f.proname not in ('begin_server_operation_write','guard_server_lifecycle_mutation') then execute format('grant execute on function %s to service_role',f.signature); end if;
  end loop;
end $$;

-- File: 0044_server_operation_commands.sql; SHA256: a764641961a54ef2821abbe360fd950b632d32407e732bc12439bf60cbff63d8

create table public.server_operation_quotes (
  id uuid primary key, environment text not null, access_pool_id uuid not null,
  body jsonb not null check(jsonb_typeof(body)='object' and octet_length(body::text)<=65536),
  expires_at timestamptz not null, used_operation_id uuid references public.server_operations(id),
  created_at timestamptz not null default clock_timestamp(),
  foreign key(access_pool_id,environment) references public.server_access_pools(id,environment)
);
alter table public.server_operation_quotes enable row level security;
revoke all on public.server_operation_quotes from public,anon,authenticated,service_role;
grant select on public.server_operation_quotes to service_role;
alter table public.server_operations add column quote_id uuid unique references public.server_operation_quotes(id),
  add column control_requested text check(control_requested is null or control_requested='cancel');

create function public.store_server_operation_quote(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_quote_id uuid,p_body jsonb,p_expires_at timestamptz)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform require_server_operation_scope(p_environment,p_pool_id,p_database_identity,p_panel_identity);
  if p_expires_at<=clock_timestamp() or p_expires_at>clock_timestamp()+interval '15 minutes' or
    p_body->>'environment' is distinct from p_environment or p_body->>'poolId' is distinct from p_pool_id::text or
    p_body->>'databaseIdentity' is distinct from p_database_identity or p_body->>'panelIdentity' is distinct from p_panel_identity then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  insert into server_operation_quotes(id,environment,access_pool_id,body,expires_at) values(p_quote_id,p_environment,p_pool_id,p_body,p_expires_at);
  return p_body;
end $$;
create function public.read_server_operation_quote(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_quote_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare value jsonb;
begin
  perform require_server_operation_scope(p_environment,p_pool_id,p_database_identity,p_panel_identity);
  select body into value from server_operation_quotes where id=p_quote_id and environment=p_environment and access_pool_id=p_pool_id;
  return value;
end $$;
create function public.find_server_operation_request(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare o server_operations;
begin
  perform require_server_operation_scope(p_environment,p_pool_id,p_database_identity,p_panel_identity);
  select * into o from server_operations where environment=p_environment and access_pool_id=p_pool_id and idempotency_key=p_idempotency_key;
  if not found then return null; end if; return to_jsonb(o);
end $$;
create function public.create_quoted_server_operation(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_quote_id uuid,p_kind text,p_idempotency_key text,p_payload jsonb,p_payload_hash text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare q server_operation_quotes; o server_operations;
begin
  perform require_server_operation_scope(p_environment,p_pool_id,p_database_identity,p_panel_identity);
  perform pg_advisory_xact_lock(hashtextextended(p_environment||p_pool_id::text||p_idempotency_key,0));
  select * into o from server_operations where environment=p_environment and access_pool_id=p_pool_id and idempotency_key=p_idempotency_key;
  if found then
    if o.payload_hash<>p_payload_hash or o.payload<>p_payload or o.kind<>p_kind then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return to_jsonb(o);
  end if;
  select * into q from server_operation_quotes where id=p_quote_id and environment=p_environment and access_pool_id=p_pool_id for update;
  if not found or q.expires_at<=clock_timestamp() then raise exception 'QUOTE_EXPIRED'; end if;
  if q.used_operation_id is not null then raise exception 'QUOTE_ALREADY_USED'; end if;
  if q.body->>'kind' is distinct from p_kind or p_payload->>'quote_id' is distinct from p_quote_id::text or
    (q.body->'choice'->>'source_server_id') is distinct from (p_payload->>'source_server_id') or
    (q.body->'choice'->>'destination_server_id') is distinct from (p_payload->>'destination_server_id') or
    (q.body->'price') is distinct from (p_payload->'quote') or (q.body->'deletionScope') is distinct from (p_payload->'delete_scope') then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  if (q.body->'price'<>'null'::jsonb and p_payload->'confirmations'->>'cost' is distinct from 'true') or
    (p_kind='replace' and p_payload->'confirmations'->>'temporary_billing' is distinct from 'true') or
    (p_kind<>'add' and p_payload->'confirmations'->>'delete_source' is distinct from 'true') then raise exception 'CONFIRMATION_REQUIRED'; end if;
  o:=create_server_operation(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_kind,p_idempotency_key,p_payload,p_payload_hash);
  update server_operations set quote_id=p_quote_id where id=o.id returning * into o;
  update server_operation_quotes set used_operation_id=o.id where id=q.id;
  return to_jsonb(o);
end $$;
create function public.list_server_operations(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_limit integer,p_runnable_only boolean,p_owner uuid default null)
returns setof jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform require_server_operation_scope(p_environment,p_pool_id,p_database_identity,p_panel_identity);
  return query select to_jsonb(o)||jsonb_build_object('item_counts',jsonb_build_object(
    'total',(select count(*) from server_operation_items i where i.operation_id=o.id),
    'verified',(select count(*) from server_operation_items i where i.operation_id=o.id and i.status='verified')))
    from server_operations o where o.environment=p_environment and o.access_pool_id=p_pool_id
      and (not p_runnable_only or (o.status in ('queued','running') and (o.lease_until is null or o.lease_until<=clock_timestamp() or o.lease_owner=p_owner)))
      and (not p_runnable_only or o.checkpoint->>'nextAttemptAt' is null or (o.checkpoint->>'nextAttemptAt')::timestamptz<=clock_timestamp())
    order by o.created_at desc limit greatest(1,least(coalesce(p_limit,50),100));
end $$;
create function public.read_server_operation_summary(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare o server_operations;
begin
  o:=read_server_operation(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id);
  return to_jsonb(o)||jsonb_build_object('item_counts',jsonb_build_object(
    'total',(select count(*) from server_operation_items where operation_id=o.id),
    'verified',(select count(*) from server_operation_items where operation_id=o.id and status='verified')));
end $$;
create function public.request_server_operation_control(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_action text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare o server_operations;
begin
  perform require_server_operation_scope(p_environment,p_pool_id,p_database_identity,p_panel_identity);
  select * into o from server_operations where id=p_operation_id and environment=p_environment and access_pool_id=p_pool_id for update;
  if not found then raise exception 'OPERATION_NOT_FOUND'; end if;
  if p_action='resume' and o.status in ('blocked','paused','partial') then
    update server_operations set status='queued',control_requested=null,lease_owner=null,lease_until=null,fence=fence+1,
      checkpoint=(checkpoint-'nextAttemptAt'-'error_code')||jsonb_build_object('attempts',0),updated_at=clock_timestamp() where id=o.id returning * into o;
  elsif p_action='cancel' and o.status in ('queued','running') and o.stage not in ('cleanup_pending','finalizing') then
    update server_operations set control_requested='cancel',updated_at=clock_timestamp() where id=o.id returning * into o;
  else raise exception 'CONTROL_CONFLICT'; end if;
  return to_jsonb(o);
end $$;
create or replace function public.release_server_operation(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_fence bigint,p_status text)
returns public.server_operations language plpgsql security definer set search_path=public,pg_temp as $$
declare o server_operations;
begin
  o:=require_server_operation_lease(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  if p_status not in ('completed','cancelled','failed') then raise exception 'OPERATION_NOT_TERMINAL'; end if;
  if p_status='cancelled' and o.stage in ('queued','provisioning','configuring','registering','verifying','inventory','publishing')
    and o.checkpoint->>'cancellationReconciled'='true' then
    if exists(select 1 from server_operation_items where operation_id=o.id and status not in ('claimed','verified')) then raise exception 'ITEM_STATE_CONFLICT'; end if;
    update server_operation_items set status='verified',checkpoint=checkpoint||jsonb_build_object('abandoned_before_migration',true)
      where operation_id=o.id and status='claimed';
  elsif exists(select 1 from server_operation_items where operation_id=o.id and status<>'verified') then raise exception 'ITEM_STATE_CONFLICT'; end if;
  delete from server_operation_locks where operation_id=o.id;
  update server_operations set status=p_status,lease_owner=null,lease_until=null,updated_at=clock_timestamp() where id=o.id returning * into o;
  return o;
end $$;
do $$ declare f record; begin
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(array[
    'store_server_operation_quote','read_server_operation_quote','find_server_operation_request','create_quoted_server_operation','list_server_operations','read_server_operation_summary','request_server_operation_control']) loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;

-- File: 0045_server_infrastructure_runtime.sql; SHA256: 43e97a473981f64c0e66e1f5b3a8d199084c2ab592a146f66667720ed7dcecd6

alter table public.server_operation_runtime_bindings
  add column provider_accounts jsonb not null default '{}' check(jsonb_typeof(provider_accounts)='object');

create table public.server_infrastructure_resources (
  environment text not null,
  access_pool_id uuid not null,
  database_identity text not null,
  panel_identity text not null,
  kind text not null check(length(kind) between 1 and 100),
  provider text not null default '' check(provider in ('','digitalocean','vultr')),
  resource_id text not null check(length(resource_id) between 1 and 200),
  operation_id uuid references public.server_operations(id),
  body jsonb not null check(jsonb_typeof(body)='object' and octet_length(body::text)<=65536),
  created_at timestamptz not null default clock_timestamp(),
  primary key(environment,access_pool_id,kind,provider,resource_id),
  unique(panel_identity,kind,provider,resource_id),
  foreign key(access_pool_id,environment) references public.server_access_pools(id,environment)
);
create table public.server_provider_create_intents (
  operation_id uuid not null references public.server_operations(id),
  provider text not null check(provider in ('digitalocean','vultr')),
  nonce uuid not null unique,
  body jsonb not null check(jsonb_typeof(body)='object' and octet_length(body::text)<=65536),
  created_at timestamptz not null default clock_timestamp(),
  primary key(operation_id,provider)
);
create table public.server_infrastructure_state (
  operation_id uuid not null references public.server_operations(id),
  state_key text not null check(state_key ~ '^[A-Za-z0-9:_-]{1,200}$'),
  ciphertext text not null check(length(ciphertext) between 1 and 1100000),
  version bigint not null default 1 check(version>0),
  updated_at timestamptz not null default clock_timestamp(),
  primary key(operation_id,state_key)
);
create table public.server_service_operation_locks (
  environment text not null,
  access_pool_id uuid not null,
  service_id text not null check(service_id ~ '^[1-9][0-9]*$'),
  operation_id uuid not null references public.server_operations(id),
  fence bigint not null,
  primary key(environment,access_pool_id,service_id),
  foreign key(access_pool_id,environment) references public.server_access_pools(id,environment)
);
alter table public.server_infrastructure_resources enable row level security;
alter table public.server_provider_create_intents enable row level security;
alter table public.server_infrastructure_state enable row level security;
alter table public.server_service_operation_locks enable row level security;
revoke all on public.server_infrastructure_resources,public.server_provider_create_intents,
  public.server_infrastructure_state,public.server_service_operation_locks from public,anon,authenticated,service_role;

create function public.read_server_infrastructure_resource(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_kind text,p_resource_id text,p_provider text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare value jsonb;
begin
  perform require_server_operation_scope(p_environment,p_pool_id,p_database_identity,p_panel_identity);
  select body into value from server_infrastructure_resources where environment=p_environment and access_pool_id=p_pool_id
    and database_identity=p_database_identity and panel_identity=p_panel_identity and kind=p_kind and resource_id=p_resource_id and provider=p_provider;
  return value;
end $$;

create function public.read_server_provider_intent(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_provider text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare value jsonb;
begin
  perform require_server_operation_scope(p_environment,p_pool_id,p_database_identity,p_panel_identity);
  if not exists(select 1 from server_operations where id=p_operation_id and environment=p_environment and access_pool_id=p_pool_id) then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  select body into value from server_provider_create_intents where operation_id=p_operation_id and provider=p_provider;
  return value;
end $$;

create function public.claim_server_provider_intent(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_fence bigint,p_provider text,p_body jsonb)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare op server_operations; accounts jsonb;
begin
  op:=require_server_operation_lease(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  select provider_accounts into accounts from server_operation_runtime_bindings where environment=p_environment and access_pool_id=p_pool_id;
  if op.kind not in ('add','replace') or op.payload->>'provider' is distinct from p_provider
    or p_body->>'operationId' is distinct from p_operation_id::text
    or p_body->>'environment' is distinct from p_environment or p_body->>'poolId' is distinct from p_pool_id::text
    or p_body->>'databaseIdentity' is distinct from p_database_identity or p_body->>'panelIdentity' is distinct from p_panel_identity
    or p_body->>'provider' is distinct from p_provider or p_body->>'accountId' is distinct from accounts->>p_provider
    or nullif(accounts->>p_provider,'') is null or p_body->>'quoteHash' is distinct from op.payload->'quote'->>'hash'
    or p_body->>'region' is distinct from op.payload->>'region' or p_body->>'planId' is distinct from op.payload->>'plan_id'
    or p_body->>'profile' is distinct from (case when op.payload->'supported_protocols' ? 'shadowsocks' then 'dual' else 'vless_only' end)
    or nullif(p_body->>'nonce','') is null then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  insert into server_provider_create_intents(operation_id,provider,nonce,body)
    values(p_operation_id,p_provider,(p_body->>'nonce')::uuid,p_body) on conflict(operation_id,provider) do nothing;
  return found;
end $$;

create function public.register_server_infrastructure_resource(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_fence bigint,p_kind text,p_resource_id text,p_provider text,p_body jsonb,p_expected_intent jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare prior server_infrastructure_resources; intent jsonb;
begin
  perform require_server_operation_lease(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  if p_body->>'environment' is distinct from p_environment or p_body->>'poolId' is distinct from p_pool_id::text
    or p_body->>'databaseIdentity' is distinct from p_database_identity or p_body->>'panelIdentity' is distinct from p_panel_identity
    or p_body->>'operationId' is distinct from p_operation_id::text or p_body->>'kind' is distinct from p_kind
    or p_body->>'id' is distinct from p_resource_id or coalesce(p_body->>'provider','') is distinct from p_provider then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  if p_kind='provider' then
    select body into intent from server_provider_create_intents where operation_id=p_operation_id and provider=p_provider;
    if intent is null or intent is distinct from p_expected_intent or p_body->>'accountId' is distinct from intent->>'accountId'
      or p_body->>'region' is distinct from intent->>'region' or p_body->>'planId' is distinct from intent->>'planId'
      or nullif(p_body->>'createdAt','') is null then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_panel_identity||p_kind||p_provider||p_resource_id,0));
  select * into prior from server_infrastructure_resources where panel_identity=p_panel_identity and kind=p_kind and provider=p_provider and resource_id=p_resource_id for update;
  if found then
    if prior.environment is distinct from p_environment or prior.access_pool_id is distinct from p_pool_id or prior.body is distinct from p_body then raise exception 'OWNERSHIP_REGISTRATION_CONFLICT'; end if;
    return prior.body;
  end if;
  insert into server_infrastructure_resources(environment,access_pool_id,database_identity,panel_identity,kind,provider,resource_id,operation_id,body)
    values(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_kind,p_provider,p_resource_id,p_operation_id,p_body);
  return p_body;
end $$;

create function public.read_server_infrastructure_state(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_fence bigint,p_state_key text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare value jsonb;
begin
  perform require_server_operation_lease(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  select jsonb_build_object('ciphertext',ciphertext,'version',version) into value from server_infrastructure_state where operation_id=p_operation_id and state_key=p_state_key;
  return value;
end $$;

create function public.write_server_infrastructure_state(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_fence bigint,p_state_key text,p_ciphertext text,p_expected_version bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare row_value server_infrastructure_state;
begin
  perform require_server_operation_lease(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  if p_expected_version is null then
    insert into server_infrastructure_state(operation_id,state_key,ciphertext) values(p_operation_id,p_state_key,p_ciphertext) on conflict do nothing returning * into row_value;
  else
    update server_infrastructure_state set ciphertext=p_ciphertext,version=version+1,updated_at=clock_timestamp()
      where operation_id=p_operation_id and state_key=p_state_key and version=p_expected_version returning * into row_value;
  end if;
  if not found then raise exception 'PRIVATE_STATE_CONFLICT'; end if;
  return jsonb_build_object('ciphertext',row_value.ciphertext,'version',row_value.version);
end $$;

create function public.acquire_server_service_lock(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_fence bigint,p_service_id text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare lock_row server_service_operation_locks;
begin
  perform require_server_operation_lease(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  if not exists(select 1 from server_infrastructure_resources where environment=p_environment and access_pool_id=p_pool_id and kind='service' and resource_id=p_service_id) then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_environment||p_pool_id::text||'service:'||p_service_id,0));
  select * into lock_row from server_service_operation_locks where environment=p_environment and access_pool_id=p_pool_id and service_id=p_service_id for update;
  if found and lock_row.operation_id<>p_operation_id then raise exception 'SERVICE_MEMBERSHIP_CHANGED'; end if;
  insert into server_service_operation_locks(environment,access_pool_id,service_id,operation_id,fence) values(p_environment,p_pool_id,p_service_id,p_operation_id,p_fence)
    on conflict(environment,access_pool_id,service_id) do update set fence=excluded.fence;
  return true;
end $$;

create function public.release_server_service_lock(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_fence bigint,p_service_id text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform require_server_operation_lease(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  delete from server_service_operation_locks where environment=p_environment and access_pool_id=p_pool_id and service_id=p_service_id and operation_id=p_operation_id and fence=p_fence;
  return found;
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and p.proname=any(array['read_server_infrastructure_resource','read_server_provider_intent','claim_server_provider_intent',
      'register_server_infrastructure_resource','read_server_infrastructure_state','write_server_infrastructure_state','acquire_server_service_lock','release_server_service_lock']) loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;

notify pgrst,'reload schema';

-- File: 0046_server_candidate_publication.sql; SHA256: 6ed6abeee6ad4f9a08e4bc783a9a78e4487afc20c1b498734e21a252e5d8faa0

create function public.ensure_server_operation_candidate(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_fence bigint,p_server jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare op server_operations; candidate vpn_servers; provider_receipt jsonb; node_receipt jsonb; protocols text[]; ss_ids integer[]; public_service integer; receipt jsonb;
begin
  op:=require_server_operation_lease(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  if op.kind not in ('add','replace') then raise exception 'INVALID_OPERATION'; end if;
  select body into provider_receipt from server_infrastructure_resources where environment=p_environment and access_pool_id=p_pool_id and kind='provider'
    and provider=p_server->>'provider' and resource_id=p_server->>'provider_resource_id' and operation_id=p_operation_id;
  select body into node_receipt from server_infrastructure_resources where environment=p_environment and access_pool_id=p_pool_id and kind='node'
    and resource_id=p_server->>'panel_node_id' and operation_id=p_operation_id;
  if provider_receipt is null or node_receipt is null or node_receipt->>'provider_resource_id' is distinct from provider_receipt->>'id'
    or not (provider_receipt->'addresses' ? (p_server->>'host_ip')) or p_server->>'panel_url' is distinct from p_panel_identity
    or p_server->>'provider' is distinct from op.payload->>'provider' or p_server->>'region' is distinct from op.payload->>'region'
    or nullif(p_server->>'panel_password_encrypted','') is null then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  protocols:=array(select jsonb_array_elements_text(op.payload->'supported_protocols'));
  ss_ids:=array(select value::integer from jsonb_array_elements_text(coalesce(p_server->'marzneshin_service_ids','[]')) value);
  if not server_capabilities_valid(protocols) or ('shadowsocks'=any(protocols) and cardinality(ss_ids)<>1)
    or (not 'shadowsocks'=any(protocols) and cardinality(ss_ids)<>0) then raise exception 'SERVICE_CONFIGURATION_INVALID'; end if;
  if exists(select 1 from unnest(ss_ids) sid where not exists(select 1 from server_infrastructure_resources where environment=p_environment and access_pool_id=p_pool_id
    and kind='service' and resource_id=sid::text and operation_id=p_operation_id and body->>'protocol'='shadowsocks' and body->'node_ids' @> jsonb_build_array((p_server->>'panel_node_id')::integer))) then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  select vless_service_id into public_service from server_access_pools where id=p_pool_id and environment=p_environment;
  select * into candidate from vpn_servers where environment=p_environment and access_pool_id=p_pool_id and ownership_provenance->>'operation_id'=p_operation_id::text for update;
  if found then
    if candidate.provider_resource_id is distinct from p_server->>'provider_resource_id' or candidate.panel_node_id is distinct from (p_server->>'panel_node_id')::integer then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
    return to_jsonb(candidate);
  end if;
  if (p_server->>'max_active_keys')::integer not between 1 and 100000 then raise exception 'INVALID_OPERATION'; end if;
  perform begin_server_operation_write(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  insert into vpn_servers(name,provider,region,droplet_id,host_ip,status,is_active,is_default,max_active_keys,current_active_keys,sort_order,panel_type,panel_url,panel_public_url,panel_username,panel_password_encrypted,
    server_tier,environment,access_pool_id,panel_node_id,provider_resource_id,supported_protocols,marzneshin_service_ids,marzneshin_vless_service_ids,marzneshin_vless_trial_service_ids,lifecycle_protected,ownership_provenance)
  values(p_server->>'name',p_server->>'provider',p_server->>'region',case when p_server->>'provider'='digitalocean' then (p_server->>'provider_resource_id')::bigint else null end,
    p_server->>'host_ip','provisioning',false,false,(p_server->>'max_active_keys')::integer,0,0,'marzneshin',p_server->>'panel_url',p_server->>'panel_public_url',p_server->>'panel_username',p_server->>'panel_password_encrypted',
    'premium',p_environment,p_pool_id,(p_server->>'panel_node_id')::integer,p_server->>'provider_resource_id',protocols,ss_ids,array[public_service],array[]::integer[],false,
    jsonb_build_object('method','provisioned','environment',p_environment,'access_pool_id',p_pool_id,'panel_identity',p_panel_identity,'panel_node_id',(p_server->>'panel_node_id')::integer,
      'provider_resource_id',p_server->>'provider_resource_id','ss_service_ids',ss_ids,'verified_at',clock_timestamp(),'operation_id',p_operation_id,'addresses',provider_receipt->'addresses')) returning * into candidate;
  perform lock_server_operation_server(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence,candidate.id);
  receipt:=jsonb_build_object('id',candidate.id,'kind','server','provider',candidate.provider,'environment',p_environment,'poolId',p_pool_id,'databaseIdentity',p_database_identity,'panelIdentity',p_panel_identity,
    'operationId',p_operation_id,'protected',false,'panel_node_id',candidate.panel_node_id,'provider_resource_id',candidate.provider_resource_id,'supported_protocols',protocols,'addresses',provider_receipt->'addresses');
  insert into server_infrastructure_resources(environment,access_pool_id,database_identity,panel_identity,kind,provider,resource_id,operation_id,body)
    values(p_environment,p_pool_id,p_database_identity,p_panel_identity,'server',candidate.provider,candidate.id::text,p_operation_id,receipt);
  return to_jsonb(candidate);
end $$;

create function public.publish_server_operation_candidate(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_fence bigint,p_server_id uuid,p_node_id integer,p_provider_resource_id text,p_verified_at timestamptz)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare candidate vpn_servers;
begin
  perform begin_server_operation_write(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  if p_verified_at is null or p_verified_at>clock_timestamp()+interval '5 seconds' or p_verified_at<clock_timestamp()-interval '5 minutes' then raise exception 'CANDIDATE_VERIFICATION_FAILED'; end if;
  select * into candidate from vpn_servers where id=p_server_id and environment=p_environment and access_pool_id=p_pool_id and panel_node_id=p_node_id
    and provider_resource_id=p_provider_resource_id and ownership_provenance->>'operation_id'=p_operation_id::text for update;
  if not found or candidate.status not in ('provisioning','active') then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  if not exists(select 1 from server_operation_locks where operation_id=p_operation_id and resource_key='server:'||candidate.id::text) then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  update vpn_servers set status='active',is_active=true,last_error=null,updated_at=clock_timestamp() where id=candidate.id returning * into candidate;
  insert into server_health_status(server_id,outline_api_status,last_checked_at,last_success_at,last_error,consecutive_failures,updated_at)
    values(candidate.id,'healthy',p_verified_at,p_verified_at,null,0,clock_timestamp())
    on conflict(server_id) do update set outline_api_status='healthy',last_checked_at=p_verified_at,last_success_at=p_verified_at,last_error=null,consecutive_failures=0,updated_at=clock_timestamp();
  return to_jsonb(candidate);
end $$;

create function public.retire_server_operation_resource(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_fence bigint,p_server_id uuid,p_provider_resource_id text,p_node_id integer)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare op server_operations; candidate vpn_servers;
begin
  op:=require_server_operation_lease(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  perform begin_server_operation_write(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  select * into candidate from vpn_servers where id=p_server_id and environment=p_environment and access_pool_id=p_pool_id and provider_resource_id=p_provider_resource_id and panel_node_id=p_node_id for update;
  if not found or candidate.lifecycle_protected is distinct from false or
    not coalesce((candidate.ownership_provenance->>'operation_id'=p_operation_id::text or (op.kind in ('replace','move_retire') and op.payload->>'source_server_id'=candidate.id::text and op.payload->'confirmations'->>'delete_source'='true')),false) then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  if exists(select 1 from vpn_keys where server_id=candidate.id and status in ('active','pending') and deleted_at is null)
    or exists(select 1 from token_server_assignments where server_id=candidate.id and is_active=true) then raise exception 'RETIREMENT_BLOCKED'; end if;
  update vpn_servers set status='decommissioned',is_active=false,updated_at=clock_timestamp() where id=candidate.id;
  return true;
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and p.proname=any(array['ensure_server_operation_candidate','publish_server_operation_candidate','retire_server_operation_resource']) loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
notify pgrst,'reload schema';

-- File: 0047_server_customer_ownership.sql; SHA256: 8bb6f60b244dc722a34262c3635747bd3208ec85fb4a9052f3ade248d69afe00

create function public.register_server_customer_user(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_guard_id uuid,p_server_id uuid,p_username text,p_subscription_key_hash text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare g server_customer_mutation_guards; receipt jsonb; prior server_infrastructure_resources;
begin
  perform require_server_operation_scope(p_environment,p_pool_id,p_database_identity,p_panel_identity);
  select * into g from server_customer_mutation_guards where guard_id=p_guard_id for update;
  if not found or g.environment is distinct from p_environment or g.access_pool_id is distinct from p_pool_id or g.status<>'running'
    or g.lease_until<=clock_timestamp() or not ('server:'||p_server_id::text)=any(g.resource_keys) then raise exception 'STALE_FENCE'; end if;
  if p_username is null or p_username !~ '^[A-Za-z0-9_]{1,100}$' or p_subscription_key_hash is null or p_subscription_key_hash !~ '^[a-f0-9]{64}$'
    or not exists(select 1 from server_infrastructure_resources where environment=p_environment and access_pool_id=p_pool_id and kind='server' and resource_id=p_server_id::text)
    then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  receipt:=jsonb_build_object('id',p_username,'kind','user','environment',p_environment,'poolId',p_pool_id,'databaseIdentity',p_database_identity,
    'panelIdentity',p_panel_identity,'protected',false,'customerGuardId',p_guard_id,'subscriptionKeyHash',p_subscription_key_hash);
  perform pg_advisory_xact_lock(hashtextextended(p_panel_identity||'user'||p_username,0));
  select * into prior from server_infrastructure_resources where panel_identity=p_panel_identity and kind='user' and provider='' and resource_id=p_username for update;
  if found then
    if prior.environment is distinct from p_environment or prior.access_pool_id is distinct from p_pool_id or prior.body is distinct from receipt then raise exception 'OWNERSHIP_REGISTRATION_CONFLICT'; end if;
    return prior.body;
  end if;
  insert into server_infrastructure_resources(environment,access_pool_id,database_identity,panel_identity,kind,resource_id,body)
    values(p_environment,p_pool_id,p_database_identity,p_panel_identity,'user',p_username,receipt);
  return receipt;
end $$;
revoke all on function public.register_server_customer_user(text,uuid,text,text,uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.register_server_customer_user(text,uuid,text,text,uuid,uuid,text,text) to service_role;
notify pgrst,'reload schema';

-- File: 0048_server_operation_item_recovery.sql; SHA256: 2513e1d2ab7c24fba301a8745716accd9050f2520fb5edaface5d93a22c51a38

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

-- File: 0049_server_terminal_service_locks.sql; SHA256: 92b8d044d256ecf33a34742d7e0d90326bed7566882ba1f0b0ab90e1feef69bd

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

-- File: 0051_existing_node_adoption.sql; SHA256: e41c738ddea314d31f0412d952b871011fba5ff94eee8fcdf48fc242111725f7

-- Explicit operator registrations, never seeded from existing names, IPs or tags.
create table if not exists public.existing_node_adoptions (
  manifest_hash text primary key check(manifest_hash ~ '^[a-f0-9]{64}$'),
  server_id uuid not null references public.vpn_servers(id),
  document jsonb not null,
  result jsonb not null,
  server_token text not null,
  created_at timestamptz not null default clock_timestamp()
);
alter table public.existing_node_adoptions enable row level security;
revoke all on public.existing_node_adoptions from public,anon,authenticated,service_role;

-- Committed replay compares infrastructure identity, not counters, health,
-- capacity, credentials or display metadata maintained by normal operations.
create or replace function public.existing_node_adoption_identity(s public.vpn_servers)
returns jsonb language sql immutable set search_path=public,pg_temp as $$
  select jsonb_build_object('id',s.id,'provider',s.provider,'droplet_id',s.droplet_id,'host_ip',s.host_ip,
    'panel_type',s.panel_type,'panel_url',s.panel_url,'environment',s.environment,'access_pool_id',s.access_pool_id,
    'panel_node_id',s.panel_node_id,'provider_resource_id',s.provider_resource_id,'supported_protocols',s.supported_protocols,
    'marzneshin_service_ids',s.marzneshin_service_ids,'marzneshin_vless_service_ids',s.marzneshin_vless_service_ids,
    'lifecycle_protected',s.lifecycle_protected,'ownership_provenance',s.ownership_provenance);
$$;
revoke all on function public.existing_node_adoption_identity(public.vpn_servers) from public,anon,authenticated;
grant execute on function public.existing_node_adoption_identity(public.vpn_servers) to service_role;

create or replace function public.read_existing_node_adoption_approval(
  p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_approved_hash text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare value jsonb;
begin
  perform require_server_operation_scope(p_environment,p_pool_id,p_database_identity,p_panel_identity);
  select jsonb_build_object('document',document) into value from existing_node_adoptions
    where manifest_hash=p_approved_hash and document->'scope'=jsonb_build_object('environment',p_environment,'poolId',p_pool_id,
      'databaseIdentity',p_database_identity,'panelIdentity',p_panel_identity);
  return value;
end $$;

create or replace function public.inspect_existing_node_adoption(
  p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_server_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s vpn_servers; b jsonb; p jsonb; resources jsonb; busy boolean;
begin
  perform require_server_operation_scope(p_environment,p_pool_id,p_database_identity,p_panel_identity);
  select * into s from vpn_servers where id=p_server_id;
  select to_jsonb(t) into b from server_operation_runtime_bindings t where environment=p_environment and access_pool_id=p_pool_id;
  select to_jsonb(t) into p from server_access_pools t where id=p_pool_id;
  if exists(select 1 from server_access_pools where id<>p_pool_id and panel_identity=p_panel_identity and vless_service_id=(p->>'vless_service_id')::integer) then
    raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('kind',t.kind,'provider',t.provider,'id',t.resource_id,'token',md5(to_jsonb(t)::text))
    order by t.kind,t.provider,t.resource_id),'[]'::jsonb) into resources from server_infrastructure_resources t
    where t.panel_identity=p_panel_identity;
  busy := exists(select 1 from server_operations where environment=p_environment and access_pool_id=p_pool_id and status not in ('completed','cancelled','failed'))
    or exists(select 1 from server_operation_locks where (environment=p_environment and access_pool_id=p_pool_id) or resource_key='server:'||p_server_id::text)
    or exists(select 1 from server_customer_mutation_guards where (environment=p_environment and access_pool_id=p_pool_id) or ('server:'||p_server_id::text)=any(resource_keys))
    or exists(select 1 from server_service_operation_locks where environment=p_environment and access_pool_id=p_pool_id)
    or exists(select 1 from vpn_keys where server_id=p_server_id and status='pending');
  return jsonb_build_object('server',case when s.id is null then null else jsonb_build_object(
    'id',s.id,'provider',s.provider,'droplet_id',s.droplet_id,'host_ip',s.host_ip,'panel_type',s.panel_type,'panel_url',s.panel_url,
    'environment',s.environment,'access_pool_id',s.access_pool_id,'panel_node_id',s.panel_node_id,'provider_resource_id',s.provider_resource_id,
    'supported_protocols',s.supported_protocols,'marzneshin_service_ids',s.marzneshin_service_ids,'marzneshin_vless_service_ids',s.marzneshin_vless_service_ids,
    'lifecycle_protected',s.lifecycle_protected,'ownership_provenance',jsonb_build_object('purpose',s.ownership_provenance->>'purpose')) end,
    'serverToken',case when s.id is null then null else md5(to_jsonb(s)::text) end,
    'bindingToken',md5(b::text),'poolToken',md5(p::text),'resources',resources,'busy',busy);
end $$;

create or replace function public.adopt_existing_node(
  p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,
  p_document text,p_approved_hash text,p_credentials jsonb default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp set lock_timeout='5s' as $$
declare d jsonb; s vpn_servers; sid uuid; lifecycle boolean; resource jsonb; node jsonb; receipt jsonb; prior server_infrastructure_resources;
  saved existing_node_adoptions; snapshot jsonb; provenance jsonb; protocols text[]; ss_ids integer[]; binding jsonb; public_service integer;
  expected_receipts jsonb; r jsonb; result jsonb; body jsonb; token text;
begin
  if p_document is null or octet_length(p_document)>65536 or p_approved_hash is null
    or p_approved_hash !~ '^[a-f0-9]{64}$' or encode(sha256(convert_to(p_document,'UTF8')),'hex')<>p_approved_hash then
    raise exception 'ADOPTION_APPROVAL_REQUIRED'; end if;
  d:=p_document::jsonb; sid:=(d->>'serverId')::uuid; lifecycle:=(d->>'lifecycle')::boolean;
  if d->>'version' is distinct from '1' or sid is null or lifecycle is null or d->'scope' is distinct from jsonb_build_object(
    'environment',p_environment,'poolId',p_pool_id,'databaseIdentity',p_database_identity,'panelIdentity',p_panel_identity) then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  -- Operator-only, short metadata transaction. Table locks also cover legacy rows
  -- without lifecycle coordination and serialize against the existing fenced RPCs.
  lock table server_operation_runtime_bindings,server_access_pools,server_operations,server_operation_locks,
    server_customer_mutation_guards,server_service_operation_locks,vpn_servers,vpn_keys,server_infrastructure_resources,existing_node_adoptions in share row exclusive mode;
  perform require_server_operation_scope(p_environment,p_pool_id,p_database_identity,p_panel_identity);
  select * into saved from existing_node_adoptions where manifest_hash=p_approved_hash;
  if found then
    select md5(existing_node_adoption_identity(t)::text) into token from vpn_servers t where id=sid;
    if saved.server_id<>sid or saved.document<>d or saved.server_token is distinct from token then raise exception 'ADOPTION_STATE_CHANGED'; end if;
    for receipt in select value from jsonb_array_elements(d->'receipts') loop
      if not exists(select 1 from server_infrastructure_resources t where t.environment=p_environment and t.access_pool_id=p_pool_id
        and t.kind=receipt->>'kind' and t.provider=coalesce(receipt->>'provider','') and t.resource_id=receipt->>'id'
        and t.body=receipt||jsonb_build_object('manifestHash',p_approved_hash,'serverId',sid)) then raise exception 'ADOPTION_STATE_CHANGED'; end if;
    end loop;
    return saved.result;
  end if;
  snapshot:=inspect_existing_node_adoption(p_environment,p_pool_id,p_database_identity,p_panel_identity,sid);
  if (snapshot->>'busy')::boolean then raise exception 'ADOPTION_BUSY'; end if;
  if snapshot is distinct from d->'expected' then raise exception 'ADOPTION_STATE_CHANGED'; end if;
  select * into s from vpn_servers where id=sid;
  if not lifecycle and s.lifecycle_protected is false then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  resource:=d->'provider'; node:=d->'node';
  select provider_accounts into binding from server_operation_runtime_bindings where environment=p_environment and access_pool_id=p_pool_id;
  select vless_service_id into public_service from server_access_pools where id=p_pool_id;
  select array_agg(value order by value) into protocols from jsonb_array_elements_text(d->'supportedProtocols');
  select coalesce(array_agg(value::integer order by value::integer),'{}'::integer[]) into ss_ids from jsonb_array_elements_text(d->'ssServiceIds');
  if not server_capabilities_valid(protocols) or resource->>'provider' not in ('digitalocean','vultr')
    or nullif(resource->>'id','') is null or nullif(resource->>'createdAt','') is null
    or not isfinite((resource->>'createdAt')::timestamptz) or jsonb_array_length(resource->'addresses')<1
    or not (resource->'addresses' ? (node->>'address')) or (node->>'id')::integer<=0
    or resource->>'accountId' is distinct from binding->>(resource->>'provider')
    or nullif(binding->>(resource->>'provider'),'') is null or (d->>'publicServiceId')::integer is distinct from public_service then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  if lifecycle and (d->>'sshHostKeySha256' is null or d->>'sshHostKeySha256' !~ '^SHA256:[A-Za-z0-9+/]{43}=?$'
    or s.ownership_provenance->>'purpose'='owner_authorized_shared_node_customer_access') then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  if s.id is not null and (s.panel_type is distinct from 'marzneshin' or s.provider is distinct from resource->>'provider'
    or rtrim(s.panel_url,'/') is distinct from p_panel_identity or s.host_ip is distinct from node->>'address'
    or (s.environment is not null and s.environment<>p_environment) or (s.access_pool_id is not null and s.access_pool_id<>p_pool_id)
    or (s.panel_node_id is not null and s.panel_node_id<>(node->>'id')::integer)
    or (s.provider_resource_id is not null and s.provider_resource_id<>resource->>'id')
    or (s.droplet_id is not null and (resource->>'provider'<>'digitalocean' or s.droplet_id::text<>resource->>'id'))
    or coalesce(s.marzneshin_service_ids,'{}') is distinct from ss_ids
    or s.marzneshin_vless_service_ids is distinct from array[public_service]) then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  if exists(select 1 from vpn_servers t where t.id<>sid and (t.host_ip=node->>'address'
      or (t.provider=resource->>'provider' and (t.provider_resource_id=resource->>'id' or t.droplet_id::text=resource->>'id'))
      or (rtrim(t.panel_url,'/')=p_panel_identity and t.panel_node_id=(node->>'id')::integer)))
    or exists(select 1 from server_infrastructure_resources t where t.kind='provider' and t.provider=resource->>'provider'
      and t.resource_id=resource->>'id' and (t.body->>'serverId' is distinct from sid::text or t.environment<>p_environment or t.access_pool_id<>p_pool_id)) then
    raise exception 'ADOPTION_RESOURCE_COLLISION'; end if;
  -- Reconstruct receipt identities instead of accepting arbitrary registry grants.
  body:=d->'scope'||jsonb_build_object('protected',not lifecycle,'method',case when lifecycle then 'owner_authorized_lifecycle_adoption' else 'owner_authorized_access_adoption' end);
  expected_receipts:=jsonb_build_array(body||(case when lifecycle then jsonb_build_object('provider',resource->'provider') else '{}'::jsonb end)||jsonb_build_object('id',sid,'kind','server','panel_node_id',node->'id',
    'provider_resource_id',case when lifecycle then resource->'id' else 'null'::jsonb end,'addresses',jsonb_build_array(node->>'address'),'supported_protocols',to_jsonb(protocols)));
  if lifecycle then
    expected_receipts:=expected_receipts||jsonb_build_array(body||resource||jsonb_build_object('kind','provider','sshHostKeySha256',d->'sshHostKeySha256'),
      body||jsonb_build_object('id',node->>'id','kind','node','provider_resource_id',resource->'id','address',node->'address','addresses',jsonb_build_array(node->>'address')));
    for r in select value from jsonb_array_elements(d->'inbounds') loop
      expected_receipts:=expected_receipts||jsonb_build_array(body||jsonb_build_object('id',r->>'id','kind','inbound','panel_node_id',node->'id','protocol',r->'protocol'));
    end loop;
    for r in select value from jsonb_array_elements(d->'hosts') loop
      expected_receipts:=expected_receipts||jsonb_build_array(body||jsonb_build_object('id',r->>'id','kind','host','node_id',node->'id','inbound_id',r->'inboundId','address',node->'address'));
    end loop;
    for r in select value from jsonb_array_elements(d->'services') where (value->>'id')::integer<>public_service loop
      if jsonb_array_length(r->'inboundIds')<>1 then raise exception 'ADOPTION_RECEIPTS_INVALID'; end if;
      expected_receipts:=expected_receipts||jsonb_build_array(body||jsonb_build_object('id',r->>'id','kind','service','node_ids',jsonb_build_array(node->'id'),'inbound_ids',r->'inboundIds',
        'protocol',(select value->'protocol' from jsonb_array_elements(d->'inbounds') where value->'id'=r->'inboundIds'->0)));
    end loop;
  end if;
  if d->'receipts' is distinct from expected_receipts then raise exception 'ADOPTION_RECEIPTS_INVALID'; end if;
  for receipt in select value from jsonb_array_elements(expected_receipts) loop
    select * into prior from server_infrastructure_resources t where t.panel_identity=p_panel_identity and t.kind=receipt->>'kind'
      and t.provider=coalesce(receipt->>'provider','') and t.resource_id=receipt->>'id';
    if found and (prior.environment<>p_environment or prior.access_pool_id<>p_pool_id or prior.database_identity<>p_database_identity
      or prior.body->>'serverId' is distinct from sid::text or (prior.body-'manifestHash'-'serverId')<>receipt) then raise exception 'ADOPTION_RESOURCE_COLLISION'; end if;
  end loop;
  provenance:=jsonb_build_object('method','adopted','environment',p_environment,'access_pool_id',p_pool_id,'panel_identity',p_panel_identity,
    'panel_node_id',node->'id','provider_resource_id',case when lifecycle then resource->'id' else 'null'::jsonb end,
    'ss_service_ids',to_jsonb(ss_ids),'verified_at',clock_timestamp(),'manifest_hash',p_approved_hash,
    'purpose',case when lifecycle then 'owner_authorized_existing_node_lifecycle' else 'owner_authorized_shared_node_customer_access' end);
  if s.id is null then
    r:=d->'registration';
    if r is null or r='null'::jsonb or nullif(btrim(r->>'name'),'') is null or length(r->>'name')>100
      or r->>'region' is distinct from resource->>'region' or (r->>'maxActiveKeys')::integer not between 1 and 100000
      or r->>'serverTier' not in ('trial','premium') or nullif(p_credentials->>'username','') is null or nullif(p_credentials->>'passwordEncrypted','') is null then
      raise exception 'ADOPTION_REGISTRATION_REQUIRED'; end if;
    insert into vpn_servers(id,name,provider,region,droplet_id,host_ip,status,is_active,is_default,max_active_keys,current_active_keys,sort_order,
      panel_type,panel_url,panel_public_url,panel_username,panel_password_encrypted,server_tier,marzneshin_service_ids,marzneshin_vless_service_ids,
      marzneshin_vless_trial_service_ids,environment,access_pool_id,panel_node_id,provider_resource_id,supported_protocols,lifecycle_protected,ownership_provenance)
    values(sid,r->>'name',resource->>'provider',r->>'region',case when resource->>'provider'='digitalocean' then (resource->>'id')::bigint end,
      node->>'address','active',true,false,(r->>'maxActiveKeys')::integer,0,0,'marzneshin',p_panel_identity,p_panel_identity,p_credentials->>'username',
      p_credentials->>'passwordEncrypted',r->>'serverTier',ss_ids,array[public_service],'{}',p_environment,p_pool_id,(node->>'id')::integer,
      case when lifecycle then resource->>'id' end,protocols,not lifecycle,provenance);
  else
    -- No customer/key/counter/service/trial/credential changes on existing rows.
    update vpn_servers set environment=p_environment,access_pool_id=p_pool_id,panel_node_id=(node->>'id')::integer,
      provider_resource_id=case when lifecycle then resource->>'id' end,supported_protocols=protocols,lifecycle_protected=not lifecycle,
      ownership_provenance=provenance where id=sid;
  end if;
  for receipt in select value from jsonb_array_elements(expected_receipts) loop
    insert into server_infrastructure_resources(environment,access_pool_id,database_identity,panel_identity,kind,provider,resource_id,body)
      values(p_environment,p_pool_id,p_database_identity,p_panel_identity,receipt->>'kind',coalesce(receipt->>'provider',''),receipt->>'id',
        receipt||jsonb_build_object('manifestHash',p_approved_hash,'serverId',sid))
      on conflict(environment,access_pool_id,kind,provider,resource_id) do update set body=excluded.body;
  end loop;
  result:=jsonb_build_object('adopted',true,'serverId',sid,'manifestHash',p_approved_hash,'lifecycle',lifecycle);
  select md5(existing_node_adoption_identity(t)::text) into token from vpn_servers t where id=sid;
  insert into existing_node_adoptions(manifest_hash,server_id,document,result,server_token) values(p_approved_hash,sid,d,result,token);
  return result;
end $$;

revoke all on function public.inspect_existing_node_adoption(text,uuid,text,text,uuid) from public,anon,authenticated;
revoke all on function public.read_existing_node_adoption_approval(text,uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.adopt_existing_node(text,uuid,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.inspect_existing_node_adoption(text,uuid,text,text,uuid) to service_role;
grant execute on function public.read_existing_node_adoption_approval(text,uuid,text,text,text) to service_role;
grant execute on function public.adopt_existing_node(text,uuid,text,text,text,text,jsonb) to service_role;
notify pgrst, 'reload schema';

-- File: 0052_worker_runnable_pagination.sql; SHA256: 75d700a80eae9be79888888621c659ba0480f05bbe19c0974499d31fcdb95bf4

create index if not exists server_operations_runnable_cursor
  on public.server_operations(environment,access_pool_id,created_at desc,id desc)
  where status in ('queued','running');

-- Separate worker paging from the operator's existing summary listing. The
-- timestamp/UUID pair is exclusive, so timestamp ties and deleted cursor rows
-- do not cause repeats or skipped operations. New arrivals precede the cursor.
create or replace function public.list_runnable_server_operations(
  p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,
  p_limit integer,p_owner uuid,p_after_created_at timestamptz default null,p_after_id uuid default null)
returns setof jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform require_server_operation_scope(p_environment,p_pool_id,p_database_identity,p_panel_identity);
  if (p_after_created_at is null) <> (p_after_id is null) or
    (p_after_created_at is not null and not isfinite(p_after_created_at)) then
    raise exception 'INVALID_OPERATION';
  end if;
  return query select to_jsonb(o) from server_operations o
    where o.environment=p_environment and o.access_pool_id=p_pool_id
      and o.database_identity=p_database_identity and o.panel_identity=p_panel_identity
      and o.status in ('queued','running')
      and (o.lease_until is null or o.lease_until<=clock_timestamp() or o.lease_owner=p_owner)
      and (o.checkpoint->>'nextAttemptAt' is null or (o.checkpoint->>'nextAttemptAt')::timestamptz<=clock_timestamp())
      and (p_after_created_at is null or (o.created_at,o.id)<(p_after_created_at,p_after_id))
    order by o.created_at desc,o.id desc
    limit greatest(1,least(coalesce(p_limit,10),100));
end $$;

revoke all on function public.list_runnable_server_operations(text,uuid,text,text,integer,uuid,timestamptz,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.list_runnable_server_operations(text,uuid,text,text,integer,uuid,timestamptz,uuid)
  to service_role;

notify pgrst, 'reload schema';

-- File: 0053_server_display_names.sql; SHA256: 8e3deff5d850fcd40cdd6f74400a9bbf7f9cfc996a9da8eabc9914fa4ab027a7

create or replace function public.assign_server_operation_display(
  p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,
  p_operation_id uuid,p_owner uuid,p_fence bigint,p_server_id uuid,
  p_city text,p_country text,p_country_code text,p_flag text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare op server_operations; candidate vpn_servers; next_number integer;
begin
  op:=require_server_operation_lease(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  if op.kind not in ('add','replace') then raise exception 'INVALID_OPERATION'; end if;
  if p_city is null or length(trim(p_city)) not between 1 and 80 or p_city<>trim(p_city)
    or p_city ~ '[[:cntrl:]#]' or length(coalesce(p_country,''))>100 or coalesce(p_country,'') ~ '[[:cntrl:]]'
    or (p_country_code is not null and p_country_code !~ '^[A-Z]{2}$')
    or (p_flag is not null and length(p_flag)<>2) then raise exception 'SERVER_DISPLAY_INVALID'; end if;
  -- Serialize city allocation across operations, including retries and retired names.
  perform pg_advisory_xact_lock(hashtextextended(p_environment||p_pool_id::text||'display:'||lower(p_city),0));
  select * into candidate from vpn_servers where id=p_server_id and environment=p_environment and access_pool_id=p_pool_id
    and ownership_provenance->>'operation_id'=p_operation_id::text and lifecycle_protected=false for update;
  if not found or not exists(select 1 from server_operation_locks where operation_id=p_operation_id
    and resource_key='server:'||p_server_id::text) then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  if candidate.display_city is not null and candidate.name !~ '^NovaNet [a-z0-9_-]+ [a-f0-9-]+$'
    and candidate.name !~ '^nn-(development|production)-' then return to_jsonb(candidate); end if;
  select coalesce(max(value::integer),0)+1 into next_number from (
    select substring(s.name from length(p_city)+3) as value from vpn_servers s
    where (s.environment is null or (s.environment=p_environment and s.access_pool_id=p_pool_id))
      and left(lower(s.name),length(p_city)+2)=lower(p_city)||' #'
  ) names where value ~ '^[1-9][0-9]{0,5}$';
  if next_number>999999 then raise exception 'SERVER_DISPLAY_INVALID'; end if;
  perform begin_server_operation_write(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  update vpn_servers set name=p_city||' #'||next_number,display_city=p_city,display_country=p_country,
    region_code=p_country_code,flag_emoji=p_flag,updated_at=clock_timestamp() where id=candidate.id returning * into candidate;
  return to_jsonb(candidate);
end $$;

revoke all on function public.assign_server_operation_display(text,uuid,text,text,uuid,uuid,bigint,uuid,text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.assign_server_operation_display(text,uuid,text,text,uuid,uuid,bigint,uuid,text,text,text,text) to service_role;
notify pgrst, 'reload schema';

-- File: 0054_assignment_repair_conflicts.sql; SHA256: 81006e5d931c6f9c1573f7ccb887e5a7b8d5dcf8cd677390bf7f53eff8248e95

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

-- File: 0055_expiration_safe_server_moves.sql; SHA256: c38dba395e30b927214feac79af4aa2e775357f1688473f1a5e980ffda737c49

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

-- File: 0057_panel_resource_retirement.sql; SHA256: c1bf3e02719d35bae312f25a9a98c63c274c0e82821fd4c50f69d066b119c054

-- Keep recovery reads/API intact until an explicitly retired numeric ID is reused.
-- No existing receipt is retired by this migration. Terminal historical receipts
-- require a separate owner-reviewed reconciliation, never an automatic backfill.
alter table public.server_infrastructure_resources
  add column if not exists retired_at timestamptz,
  add column if not exists deletion_operation_id uuid references public.server_operations(id);

-- Historical inactive/decommissioned rows retain their node ID for audit but
-- cannot reserve a recycled panel ID. Unknown state still reserves the ID.
alter table public.vpn_servers drop constraint if exists vpn_servers_registered_node_unique;
create unique index if not exists vpn_servers_registered_node_unique
  on public.vpn_servers(access_pool_id,panel_node_id)
  where status is distinct from 'decommissioned' or is_active is distinct from false;

create table if not exists public.server_panel_resource_archive (
  archive_id uuid primary key default gen_random_uuid(),
  environment text not null,
  access_pool_id uuid not null,
  database_identity text not null,
  panel_identity text not null,
  kind text not null check(kind in ('node','inbound','host','service')),
  provider text not null check(provider=''),
  resource_id text not null,
  operation_id uuid not null references public.server_operations(id),
  body jsonb not null check(jsonb_typeof(body)='object' and octet_length(body::text)<=65536),
  created_at timestamptz not null,
  deletion_operation_id uuid not null references public.server_operations(id),
  deletion_owner uuid not null,
  deletion_fence bigint not null check(deletion_fence>0),
  archived_at timestamptz not null default clock_timestamp(),
  foreign key(access_pool_id,environment) references public.server_access_pools(id,environment)
);
create index if not exists server_panel_resource_archive_receipt
  on public.server_panel_resource_archive(panel_identity,kind,resource_id,deletion_operation_id);
alter table public.server_panel_resource_archive enable row level security;
revoke all on public.server_panel_resource_archive from public,anon,authenticated,service_role;

create or replace function public.guard_server_panel_resource_archive()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  raise exception 'ARCHIVE_APPEND_ONLY';
end $$;
drop trigger if exists server_panel_resource_archive_immutable on public.server_panel_resource_archive;
create trigger server_panel_resource_archive_immutable before update or delete or truncate
  on public.server_panel_resource_archive for each statement execute function public.guard_server_panel_resource_archive();
revoke all on function public.guard_server_panel_resource_archive() from public,anon,authenticated,service_role;

create or replace function public.archive_server_panel_resource(
  p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,
  p_operation_id uuid,p_owner uuid,p_fence bigint,p_kind text,p_resource_id text,p_expected_body jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  op server_operations;
  receipt server_infrastructure_resources;
  parent_node server_infrastructure_resources;
  source vpn_servers;
  node_id text;
  inbound_id text;
  linked_id text;
begin
  op:=require_server_operation_lease(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  if p_owner is null or p_fence is null or p_fence<1
    or op.database_identity is distinct from p_database_identity or op.panel_identity is distinct from p_panel_identity
    or p_kind is null or p_kind not in ('node','inbound','host','service')
    or p_resource_id is null or p_resource_id !~ '^[1-9][0-9]*$'
    or jsonb_typeof(p_expected_body) is distinct from 'object'
    or p_expected_body->>'environment' is distinct from p_environment
    or p_expected_body->>'poolId' is distinct from p_pool_id::text
    or p_expected_body->>'databaseIdentity' is distinct from p_database_identity
    or p_expected_body->>'panelIdentity' is distinct from p_panel_identity
    or p_expected_body->>'kind' is distinct from p_kind or p_expected_body->>'id' is distinct from p_resource_id
    or coalesce(p_expected_body->>'provider','')<>'' then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  if p_expected_body->'protected' is distinct from 'false'::jsonb
    or (p_kind='service' and exists(select 1 from server_access_pools
      where panel_identity=p_panel_identity and vless_service_id::text=p_resource_id)) then raise exception 'PROTECTED_RESOURCE'; end if;

  -- Identical serialization key to 0045 registration (panel provider is '').
  perform pg_advisory_xact_lock(hashtextextended(p_panel_identity||p_kind||''||p_resource_id,0));
  select * into receipt from server_infrastructure_resources where panel_identity=p_panel_identity
    and kind=p_kind and provider='' and resource_id=p_resource_id for update;
  if found then
    if receipt.environment is distinct from p_environment or receipt.access_pool_id is distinct from p_pool_id
      or receipt.database_identity is distinct from p_database_identity then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
    -- Check the current incarnation BEFORE replay lookup. Old retries cannot
    -- retire a replacement, even if their expected body exists in the archive.
    if receipt.body is distinct from p_expected_body then raise exception 'OWNERSHIP_REGISTRATION_CONFLICT'; end if;
    if receipt.retired_at is null and receipt.deletion_operation_id is null then
      null;
    elsif receipt.retired_at is not null and receipt.deletion_operation_id=p_operation_id and exists(
      select 1 from server_panel_resource_archive a where a.environment=p_environment and a.access_pool_id=p_pool_id
        and a.database_identity=p_database_identity and a.panel_identity=p_panel_identity and a.kind=p_kind
        and a.resource_id=p_resource_id and a.deletion_operation_id=p_operation_id and a.body=p_expected_body
        and a.operation_id=receipt.operation_id and a.created_at=receipt.created_at and a.archived_at=receipt.retired_at)
    then return p_expected_body;
    else raise exception 'OWNERSHIP_REGISTRATION_CONFLICT'; end if;
  else
    if exists(select 1 from server_panel_resource_archive a where a.environment=p_environment and a.access_pool_id=p_pool_id
      and a.database_identity=p_database_identity and a.panel_identity=p_panel_identity and a.kind=p_kind
      and a.resource_id=p_resource_id and a.deletion_operation_id=p_operation_id and a.body=p_expected_body)
    then return p_expected_body; end if;
    raise exception 'OWNERSHIP_REGISTRATION_CONFLICT';
  end if;
  if receipt.operation_id is null or p_expected_body->>'operationId' is distinct from receipt.operation_id::text
    or not exists(select 1 from server_operations where id=receipt.operation_id and environment=p_environment
      and access_pool_id=p_pool_id and database_identity=p_database_identity and panel_identity=p_panel_identity)
    then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;

  case p_kind
    when 'node' then node_id:=p_resource_id;
    when 'inbound' then node_id:=p_expected_body->>'panel_node_id';
    when 'host' then node_id:=p_expected_body->>'node_id'; inbound_id:=p_expected_body->>'inbound_id';
    when 'service' then
      if jsonb_typeof(p_expected_body->'node_ids') is distinct from 'array'
        or jsonb_typeof(p_expected_body->'inbound_ids') is distinct from 'array' then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
      if jsonb_array_length(p_expected_body->'node_ids')<>1
        or jsonb_array_length(p_expected_body->'inbound_ids')<1 then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
      node_id:=p_expected_body->'node_ids'->>0;
  end case;
  if node_id is null or node_id !~ '^[1-9][0-9]*$' then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;

  -- Access adoption never grants deletion authority, including for an apparent
  -- own-operation receipt. Check all registrations on this panel, not just DEV.
  if exists(select 1 from vpn_servers s join server_access_pools p on p.id=s.access_pool_id and p.environment=s.environment
    where p.panel_identity=p_panel_identity and s.panel_node_id::text=node_id
      and (s.lifecycle_protected is distinct from false or s.ownership_provenance->>'method' is distinct from 'provisioned'))
    then raise exception 'PROTECTED_RESOURCE'; end if;

  if receipt.operation_id=p_operation_id then
    -- Candidate cancellation and private-service cleanup before publication.
    if op.kind not in ('add','replace') then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  else
    if op.kind not in ('move_retire','replace') or op.payload->'confirmations'->>'delete_source' is distinct from 'true'
      then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
    select * into source from vpn_servers where id::text=op.payload->>'source_server_id'
      and environment=p_environment and access_pool_id=p_pool_id for share;
    if not found or source.lifecycle_protected is distinct from false or source.panel_node_id::text is distinct from node_id
      or source.ownership_provenance->>'method' is distinct from 'provisioned'
      or source.ownership_provenance->>'operation_id' is distinct from receipt.operation_id::text
      or source.provider_resource_id is null
      or not exists(select 1 from server_operation_locks where environment=p_environment and access_pool_id=p_pool_id
        and resource_key='server:'||source.id::text and operation_id=p_operation_id) then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
    select * into parent_node from server_infrastructure_resources where environment=p_environment and access_pool_id=p_pool_id
      and database_identity=p_database_identity and panel_identity=p_panel_identity and kind='node' and provider=''
      and resource_id=node_id for share;
    if not found or parent_node.operation_id is distinct from receipt.operation_id
      or parent_node.body->'protected' is distinct from 'false'::jsonb
      or parent_node.body->>'operationId' is distinct from receipt.operation_id::text
      or parent_node.body->>'provider_resource_id' is distinct from source.provider_resource_id
      or parent_node.body->>'environment' is distinct from p_environment or parent_node.body->>'poolId' is distinct from p_pool_id::text
      or parent_node.body->>'databaseIdentity' is distinct from p_database_identity or parent_node.body->>'panelIdentity' is distinct from p_panel_identity
      or parent_node.body->>'kind' is distinct from 'node' or parent_node.body->>'id' is distinct from node_id
      then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
    for linked_id in select value from jsonb_array_elements_text(case p_kind
      when 'host' then jsonb_build_array(inbound_id)
      when 'service' then p_expected_body->'inbound_ids' else '[]'::jsonb end) value loop
      if linked_id is null or linked_id !~ '^[1-9][0-9]*$' or not exists(
        select 1 from server_infrastructure_resources r where r.environment=p_environment and r.access_pool_id=p_pool_id
          and r.database_identity=p_database_identity and r.panel_identity=p_panel_identity and r.kind='inbound' and r.provider=''
          and r.resource_id=linked_id and r.operation_id=receipt.operation_id and r.body->'protected'='false'::jsonb
          and r.body->>'panel_node_id'=node_id and r.body->>'operationId'=receipt.operation_id::text
          and r.body->>'kind'='inbound' and r.body->>'id'=linked_id
          and r.body->>'environment'=p_environment and r.body->>'poolId'=p_pool_id::text
          and r.body->>'databaseIdentity'=p_database_identity and r.body->>'panelIdentity'=p_panel_identity)
        then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
    end loop;
  end if;

  -- Caller MUST have verified DELETE followed by GET 404 for this exact receipt.
  -- Persist the subtree manifest before deletion; archive children first, node
  -- last. SQL authorizes receipts, not remote HTTP observations.
  with archived as (
    insert into server_panel_resource_archive(environment,access_pool_id,database_identity,panel_identity,kind,provider,
      resource_id,operation_id,body,created_at,deletion_operation_id,deletion_owner,deletion_fence)
    values(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_kind,'',p_resource_id,receipt.operation_id,
      p_expected_body,receipt.created_at,p_operation_id,p_owner,p_fence) returning archived_at
  ) update server_infrastructure_resources set retired_at=(select archived_at from archived),deletion_operation_id=p_operation_id
    where panel_identity=p_panel_identity and kind=p_kind and provider='' and resource_id=p_resource_id;
  return p_expected_body;
end $$;

-- Same API, immutable while current. Only an exact, explicitly archived
-- tombstone whose deletion completed/cancelled permits replacement. Until then
-- provider-deletion recovery must still be able to read the original proof.
create or replace function public.register_server_infrastructure_resource(p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,p_operation_id uuid,p_owner uuid,p_fence bigint,p_kind text,p_resource_id text,p_provider text,p_body jsonb,p_expected_intent jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare prior server_infrastructure_resources; intent jsonb;
begin
  perform require_server_operation_lease(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_operation_id,p_owner,p_fence);
  if p_body->>'environment' is distinct from p_environment or p_body->>'poolId' is distinct from p_pool_id::text
    or p_body->>'databaseIdentity' is distinct from p_database_identity or p_body->>'panelIdentity' is distinct from p_panel_identity
    or p_body->>'operationId' is distinct from p_operation_id::text or p_body->>'kind' is distinct from p_kind
    or p_body->>'id' is distinct from p_resource_id or coalesce(p_body->>'provider','') is distinct from p_provider then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  if p_kind='provider' then
    select body into intent from server_provider_create_intents where operation_id=p_operation_id and provider=p_provider;
    if intent is null or intent is distinct from p_expected_intent or p_body->>'accountId' is distinct from intent->>'accountId'
      or p_body->>'region' is distinct from intent->>'region' or p_body->>'planId' is distinct from intent->>'planId'
      or nullif(p_body->>'createdAt','') is null then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_panel_identity||p_kind||p_provider||p_resource_id,0));
  select * into prior from server_infrastructure_resources where panel_identity=p_panel_identity and kind=p_kind and provider=p_provider and resource_id=p_resource_id for update;
  if found then
    if prior.environment is distinct from p_environment or prior.access_pool_id is distinct from p_pool_id
      or prior.database_identity is distinct from p_database_identity then raise exception 'OWNERSHIP_REGISTRATION_CONFLICT'; end if;
    if prior.body=p_body then return prior.body; end if;
    if p_kind not in ('node','inbound','host','service') or p_provider<>''
      or prior.retired_at is null or prior.deletion_operation_id is null
      or prior.body->'protected' is distinct from 'false'::jsonb or p_body->'protected' is distinct from 'false'::jsonb
      or not exists(select 1 from server_panel_resource_archive a join server_operations d
        on d.id=a.deletion_operation_id and d.environment=a.environment and d.access_pool_id=a.access_pool_id
        and d.database_identity=a.database_identity and d.panel_identity=a.panel_identity
        and d.status in ('completed','cancelled')
        where a.environment=p_environment and a.access_pool_id=p_pool_id
        and a.database_identity=p_database_identity and a.panel_identity=p_panel_identity and a.kind=p_kind and a.provider=p_provider
        and a.resource_id=p_resource_id and a.operation_id=prior.operation_id and a.body=prior.body and a.created_at=prior.created_at
        and a.deletion_operation_id=prior.deletion_operation_id and a.archived_at=prior.retired_at)
      then raise exception 'OWNERSHIP_REGISTRATION_CONFLICT'; end if;
    update server_infrastructure_resources set operation_id=p_operation_id,body=p_body,created_at=clock_timestamp(),
      retired_at=null,deletion_operation_id=null where panel_identity=p_panel_identity and kind=p_kind and provider=p_provider and resource_id=p_resource_id;
    return p_body;
  end if;
  insert into server_infrastructure_resources(environment,access_pool_id,database_identity,panel_identity,kind,provider,resource_id,operation_id,body)
    values(p_environment,p_pool_id,p_database_identity,p_panel_identity,p_kind,p_provider,p_resource_id,p_operation_id,p_body);
  return p_body;
end $$;

revoke all on function public.archive_server_panel_resource(text,uuid,text,text,uuid,uuid,bigint,text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.archive_server_panel_resource(text,uuid,text,text,uuid,uuid,bigint,text,text,jsonb) to service_role;
revoke all on function public.register_server_infrastructure_resource(text,uuid,text,text,uuid,uuid,bigint,text,text,text,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.register_server_infrastructure_resource(text,uuid,text,text,uuid,uuid,bigint,text,text,text,jsonb,jsonb) to service_role;

comment on table public.server_panel_resource_archive is 'Private append-only exact panel receipts and fenced deletion audit; no automatic historical reconciliation.';
comment on function public.archive_server_panel_resource(text,uuid,text,text,uuid,uuid,bigint,text,text,jsonb) is
  'Service-role fenced retirement after caller-verified DELETE/GET404. Returns exact body; retains readable tombstone until explicit registration reuse. Node last.';
notify pgrst,'reload schema';

-- File: 0058_telegram_bot_content.sql; SHA256: 6183e57fa721df832c20713148a2101bfd83f2adf6e24eeae960ad4ff9edede7
-- Telegram content only. No bot credentials, customer data or business rules.

create table if not exists public.reseller_bot_content (
  reseller_id uuid not null references public.resellers(id) on delete cascade,
  content_key text not null check (char_length(content_key) between 1 and 160 and content_key ~ '^[A-Za-z][A-Za-z0-9_.]*$'),
  custom_text text not null check (char_length(custom_text) <= 3000),
  updated_at timestamptz not null default now(),
  primary key (reseller_id, content_key)
);
alter table public.reseller_bot_content enable row level security;
revoke all on table public.reseller_bot_content from public, anon, authenticated;
grant select, insert, update, delete on table public.reseller_bot_content to service_role;
comment on table public.reseller_bot_content is 'Backend-only, reseller-scoped Telegram presentation overrides; code owns allowed keys, actions and defaults.';
notify pgrst, 'reload schema';

-- File: 0061_telegram_customer_cleanup.sql; SHA256: 4028fbf850cef98b8f8c36aff1c97e77a9d8eb221587e957e0de16f143eac753
-- Explicit selected test-customer reset only. Normal trial claims remain durable.

create or replace function public.cleanup_test_customers(
  p_reseller_id uuid, p_customer_ids uuid[], p_expected_order_ids uuid[],
  p_confirmation text, p_allow_paid_customers boolean default false, p_dry_run boolean default false
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  selected_ids uuid[]; order_ids uuid[]; key_ids uuid[]; token_ids uuid[];
  n integer; deleted jsonb := '{}'::jsonb;
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
  if exists(select 1 from purchase_operations where reseller_id=p_reseller_id and customer_id=any(selected_ids) and status='processing')
    or exists(select 1 from customer_trial_claims where reseller_id=p_reseller_id and customer_id=any(selected_ids) and provision_status='processing')
    or exists(select 1 from dashboard_purchase_operations where reseller_id=p_reseller_id and customer_id=any(selected_ids) and state='running')
    or exists(select 1 from server_customer_mutation_guards g where g.status in ('running','uncertain')
      and exists(select 1 from unnest(order_ids) oid where ('order:'||oid::text)=any(g.resource_keys)))
    then raise exception 'CUSTOMER_CLEANUP_BUSY'; end if;
  if p_dry_run then return jsonb_build_object('ready',true); end if;

  select coalesce(array_agg(id),array[]::uuid[]) into key_ids from vpn_keys where reseller_id=p_reseller_id and customer_id=any(selected_ids);
  select coalesce(array_agg(id),array[]::uuid[]) into token_ids from access_tokens where reseller_id=p_reseller_id and customer_id=any(selected_ids);
  delete from token_server_assignments where token_id=any(token_ids) or vpn_key_id=any(key_ids);
  get diagnostics n=row_count; deleted:=deleted||jsonb_build_object('token_server_assignments',n);
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

-- File: 0062_lightnode_infrastructure.sql; SHA256: 3e64c2e3ca638f53d7f64c8cfec43bbaa0a16b5f14309066ba7240ee6a5869f7

-- 0045 inline CHECKs have these PostgreSQL-generated constraint names.
-- Expand lifecycle-owned provider receipts/intents only; retain the empty
-- provider used by panel receipts. No data, bindings or ownership are changed.
alter table public.server_infrastructure_resources
  drop constraint server_infrastructure_resources_provider_check;
alter table public.server_infrastructure_resources
  add constraint server_infrastructure_resources_provider_check
  check (provider in ('', 'digitalocean', 'vultr', 'lightnode'));

alter table public.server_provider_create_intents
  drop constraint server_provider_create_intents_provider_check;
alter table public.server_provider_create_intents
  add constraint server_provider_create_intents_provider_check
  check (provider in ('digitalocean', 'vultr', 'lightnode'));

-- claim_server_provider_intent and register_server_infrastructure_resource
-- already validate scoped account/intent/lease evidence without provider enums.
-- ensure_server_operation_candidate accepts non-DO immutable text UUIDs, leaving
-- droplet_id NULL. Do not replace these RPCs or their ownership/replay guards.
-- 0051 adopt_existing_node intentionally remains DO/Vultr-only: adding a fresh
-- lifecycle provider does not authorize adoption of protected LightNode mirrors.

notify pgrst, 'reload schema';

-- File: 0063_lightnode_access_adoption.sql; SHA256: 3d0fb7a7c0ba09b2f72ed734f1f59377404997cde9efb7c50b8d71872ac790e3
-- Release-only extension: protected access adoption; no live metadata is changed.

create or replace function public.adopt_existing_node(
  p_environment text,p_pool_id uuid,p_database_identity text,p_panel_identity text,
  p_document text,p_approved_hash text,p_credentials jsonb default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp set lock_timeout='5s' as $$
declare d jsonb; s vpn_servers; sid uuid; lifecycle boolean; resource jsonb; node jsonb; receipt jsonb; prior server_infrastructure_resources;
  saved existing_node_adoptions; snapshot jsonb; provenance jsonb; protocols text[]; ss_ids integer[]; binding jsonb; public_service integer;
  expected_receipts jsonb; r jsonb; result jsonb; body jsonb; token text;
begin
  if p_document is null or octet_length(p_document)>65536 or p_approved_hash is null
    or p_approved_hash !~ '^[a-f0-9]{64}$' or encode(sha256(convert_to(p_document,'UTF8')),'hex')<>p_approved_hash then
    raise exception 'ADOPTION_APPROVAL_REQUIRED'; end if;
  d:=p_document::jsonb; sid:=(d->>'serverId')::uuid; lifecycle:=(d->>'lifecycle')::boolean;
  if d->>'version' is distinct from '1' or sid is null or lifecycle is null or d->'scope' is distinct from jsonb_build_object(
    'environment',p_environment,'poolId',p_pool_id,'databaseIdentity',p_database_identity,'panelIdentity',p_panel_identity) then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  -- Operator-only, short metadata transaction. Table locks also cover legacy rows
  -- without lifecycle coordination and serialize against the existing fenced RPCs.
  lock table server_operation_runtime_bindings,server_access_pools,server_operations,server_operation_locks,
    server_customer_mutation_guards,server_service_operation_locks,vpn_servers,vpn_keys,server_infrastructure_resources,existing_node_adoptions in share row exclusive mode;
  perform require_server_operation_scope(p_environment,p_pool_id,p_database_identity,p_panel_identity);
  select * into saved from existing_node_adoptions where manifest_hash=p_approved_hash;
  if found then
    select md5(existing_node_adoption_identity(t)::text) into token from vpn_servers t where id=sid;
    if saved.server_id<>sid or saved.document<>d or saved.server_token is distinct from token then raise exception 'ADOPTION_STATE_CHANGED'; end if;
    for receipt in select value from jsonb_array_elements(d->'receipts') loop
      if not exists(select 1 from server_infrastructure_resources t where t.environment=p_environment and t.access_pool_id=p_pool_id
        and t.kind=receipt->>'kind' and t.provider=coalesce(receipt->>'provider','') and t.resource_id=receipt->>'id'
        and t.body=receipt||jsonb_build_object('manifestHash',p_approved_hash,'serverId',sid)) then raise exception 'ADOPTION_STATE_CHANGED'; end if;
    end loop;
    return saved.result;
  end if;
  snapshot:=inspect_existing_node_adoption(p_environment,p_pool_id,p_database_identity,p_panel_identity,sid);
  if (snapshot->>'busy')::boolean then raise exception 'ADOPTION_BUSY'; end if;
  if snapshot is distinct from d->'expected' then raise exception 'ADOPTION_STATE_CHANGED'; end if;
  select * into s from vpn_servers where id=sid;
  if not lifecycle and s.lifecycle_protected is false then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  resource:=d->'provider'; node:=d->'node';
  select provider_accounts into binding from server_operation_runtime_bindings where environment=p_environment and access_pool_id=p_pool_id;
  select vless_service_id into public_service from server_access_pools where id=p_pool_id;
  select array_agg(value order by value) into protocols from jsonb_array_elements_text(d->'supportedProtocols');
  select coalesce(array_agg(value::integer order by value::integer),'{}'::integer[]) into ss_ids from jsonb_array_elements_text(d->'ssServiceIds');
  if not server_capabilities_valid(protocols) or resource->>'provider' is null or resource->>'provider' not in ('digitalocean','vultr','lightnode')
    or (resource->>'provider'='lightnode' and lifecycle)
    or nullif(resource->>'id','') is null or nullif(resource->>'createdAt','') is null
    or not isfinite((resource->>'createdAt')::timestamptz) or jsonb_array_length(resource->'addresses')<1
    or not (resource->'addresses' ? (node->>'address')) or (node->>'id')::integer<=0
    or resource->>'accountId' is distinct from binding->>(resource->>'provider')
    or nullif(binding->>(resource->>'provider'),'') is null or (d->>'publicServiceId')::integer is distinct from public_service then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  if lifecycle and (d->>'sshHostKeySha256' is null or d->>'sshHostKeySha256' !~ '^SHA256:[A-Za-z0-9+/]{43}=?$'
    or s.ownership_provenance->>'purpose'='owner_authorized_shared_node_customer_access') then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  if s.id is not null and (s.panel_type is distinct from 'marzneshin' or s.provider is distinct from resource->>'provider'
    or rtrim(s.panel_url,'/') is distinct from p_panel_identity or s.host_ip is distinct from node->>'address'
    or (s.environment is not null and s.environment<>p_environment) or (s.access_pool_id is not null and s.access_pool_id<>p_pool_id)
    or (s.panel_node_id is not null and s.panel_node_id<>(node->>'id')::integer)
    or (s.provider_resource_id is not null and s.provider_resource_id<>resource->>'id')
    or (s.droplet_id is not null and (resource->>'provider'<>'digitalocean' or s.droplet_id::text<>resource->>'id'))
    or coalesce(s.marzneshin_service_ids,'{}') is distinct from ss_ids
    or s.marzneshin_vless_service_ids is distinct from array[public_service]) then raise exception 'RESOURCE_SCOPE_MISMATCH'; end if;
  if exists(select 1 from vpn_servers t where t.id<>sid
      and (not lifecycle and t.status='decommissioned' and t.is_active is false and t.panel_type='outline'
        and t.environment is null and t.access_pool_id is null and t.panel_node_id is null
        and t.provider_resource_id is null and t.ownership_provenance is null and t.lifecycle_protected is true
        and not exists(select 1 from vpn_keys k where k.server_id=t.id and (k.status in ('active','pending') or k.status is null))) is not true
      and (t.host_ip=node->>'address'
      or (t.provider=resource->>'provider' and (t.provider_resource_id=resource->>'id' or t.droplet_id::text=resource->>'id'))
      or (rtrim(t.panel_url,'/')=p_panel_identity and t.panel_node_id=(node->>'id')::integer)))
    or exists(select 1 from server_infrastructure_resources t where t.kind='provider' and t.provider=resource->>'provider'
      and t.resource_id=resource->>'id' and (t.body->>'serverId' is distinct from sid::text or t.environment<>p_environment or t.access_pool_id<>p_pool_id)) then
    raise exception 'ADOPTION_RESOURCE_COLLISION'; end if;
  -- Reconstruct receipt identities instead of accepting arbitrary registry grants.
  body:=d->'scope'||jsonb_build_object('protected',not lifecycle,'method',case when lifecycle then 'owner_authorized_lifecycle_adoption' else 'owner_authorized_access_adoption' end);
  expected_receipts:=jsonb_build_array(body||(case when lifecycle then jsonb_build_object('provider',resource->'provider') else '{}'::jsonb end)||jsonb_build_object('id',sid,'kind','server','panel_node_id',node->'id',
    'provider_resource_id',case when lifecycle then resource->'id' else 'null'::jsonb end,'addresses',jsonb_build_array(node->>'address'),'supported_protocols',to_jsonb(protocols)));
  if lifecycle then
    expected_receipts:=expected_receipts||jsonb_build_array(body||resource||jsonb_build_object('kind','provider','sshHostKeySha256',d->'sshHostKeySha256'),
      body||jsonb_build_object('id',node->>'id','kind','node','provider_resource_id',resource->'id','address',node->'address','addresses',jsonb_build_array(node->>'address')));
    for r in select value from jsonb_array_elements(d->'inbounds') loop
      expected_receipts:=expected_receipts||jsonb_build_array(body||jsonb_build_object('id',r->>'id','kind','inbound','panel_node_id',node->'id','protocol',r->'protocol'));
    end loop;
    for r in select value from jsonb_array_elements(d->'hosts') loop
      expected_receipts:=expected_receipts||jsonb_build_array(body||jsonb_build_object('id',r->>'id','kind','host','node_id',node->'id','inbound_id',r->'inboundId','address',node->'address'));
    end loop;
    for r in select value from jsonb_array_elements(d->'services') where (value->>'id')::integer<>public_service loop
      if jsonb_array_length(r->'inboundIds')<>1 then raise exception 'ADOPTION_RECEIPTS_INVALID'; end if;
      expected_receipts:=expected_receipts||jsonb_build_array(body||jsonb_build_object('id',r->>'id','kind','service','node_ids',jsonb_build_array(node->'id'),'inbound_ids',r->'inboundIds',
        'protocol',(select value->'protocol' from jsonb_array_elements(d->'inbounds') where value->'id'=r->'inboundIds'->0)));
    end loop;
  end if;
  if d->'receipts' is distinct from expected_receipts then raise exception 'ADOPTION_RECEIPTS_INVALID'; end if;
  for receipt in select value from jsonb_array_elements(expected_receipts) loop
    select * into prior from server_infrastructure_resources t where t.panel_identity=p_panel_identity and t.kind=receipt->>'kind'
      and t.provider=coalesce(receipt->>'provider','') and t.resource_id=receipt->>'id';
    if found and (prior.environment<>p_environment or prior.access_pool_id<>p_pool_id or prior.database_identity<>p_database_identity
      or prior.body->>'serverId' is distinct from sid::text or (prior.body-'manifestHash'-'serverId')<>receipt) then raise exception 'ADOPTION_RESOURCE_COLLISION'; end if;
  end loop;
  provenance:=jsonb_build_object('method','adopted','environment',p_environment,'access_pool_id',p_pool_id,'panel_identity',p_panel_identity,
    'panel_node_id',node->'id','provider_resource_id',case when lifecycle then resource->'id' else 'null'::jsonb end,
    'ss_service_ids',to_jsonb(ss_ids),'verified_at',clock_timestamp(),'manifest_hash',p_approved_hash,
    'purpose',case when lifecycle then 'owner_authorized_existing_node_lifecycle' else 'owner_authorized_shared_node_customer_access' end);
  if s.id is null then
    r:=d->'registration';
    if r is null or r='null'::jsonb or nullif(btrim(r->>'name'),'') is null or length(r->>'name')>100
      or r->>'region' is distinct from resource->>'region' or (r->>'maxActiveKeys')::integer not between 1 and 100000
      or r->>'serverTier' not in ('trial','premium') or nullif(p_credentials->>'username','') is null or nullif(p_credentials->>'passwordEncrypted','') is null then
      raise exception 'ADOPTION_REGISTRATION_REQUIRED'; end if;
    insert into vpn_servers(id,name,provider,region,droplet_id,host_ip,status,is_active,is_default,max_active_keys,current_active_keys,sort_order,
      panel_type,panel_url,panel_public_url,panel_username,panel_password_encrypted,server_tier,marzneshin_service_ids,marzneshin_vless_service_ids,
      marzneshin_vless_trial_service_ids,environment,access_pool_id,panel_node_id,provider_resource_id,supported_protocols,lifecycle_protected,ownership_provenance)
    values(sid,r->>'name',resource->>'provider',r->>'region',case when resource->>'provider'='digitalocean' then (resource->>'id')::bigint end,
      node->>'address','active',true,false,(r->>'maxActiveKeys')::integer,0,0,'marzneshin',p_panel_identity,p_panel_identity,p_credentials->>'username',
      p_credentials->>'passwordEncrypted',r->>'serverTier',ss_ids,array[public_service],'{}',p_environment,p_pool_id,(node->>'id')::integer,
      case when lifecycle then resource->>'id' end,protocols,not lifecycle,provenance);
  else
    -- No customer/key/counter/service/trial/credential changes on existing rows.
    update vpn_servers set environment=p_environment,access_pool_id=p_pool_id,panel_node_id=(node->>'id')::integer,
      provider_resource_id=case when lifecycle then resource->>'id' end,supported_protocols=protocols,lifecycle_protected=not lifecycle,
      ownership_provenance=provenance where id=sid;
  end if;
  for receipt in select value from jsonb_array_elements(expected_receipts) loop
    insert into server_infrastructure_resources(environment,access_pool_id,database_identity,panel_identity,kind,provider,resource_id,body)
      values(p_environment,p_pool_id,p_database_identity,p_panel_identity,receipt->>'kind',coalesce(receipt->>'provider',''),receipt->>'id',
        receipt||jsonb_build_object('manifestHash',p_approved_hash,'serverId',sid))
      on conflict(environment,access_pool_id,kind,provider,resource_id) do update set body=excluded.body;
  end loop;
  result:=jsonb_build_object('adopted',true,'serverId',sid,'manifestHash',p_approved_hash,'lifecycle',lifecycle);
  select md5(existing_node_adoption_identity(t)::text) into token from vpn_servers t where id=sid;
  insert into existing_node_adoptions(manifest_hash,server_id,document,result,server_token) values(p_approved_hash,sid,d,result,token);
  return result;
end $$;

revoke all on function public.adopt_existing_node(text,uuid,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.adopt_existing_node(text,uuid,text,text,text,text,jsonb) to service_role;
notify pgrst, 'reload schema';

commit;
