begin;
-- Reapply reviewed trial recovery and authorization rules even if 0033 was
-- applied while local implementation was still under review.
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
        and o.order_type='trial' and o.expiry_date>=(now() at time zone 'Asia/Bangkok')::date
    )); end if;
  if exists(select 1 from vpn_orders where customer_id=p_customer_id and reseller_id=p_reseller_id
    and order_type<>'trial' and status in ('active','pending','scheduled')) then
    return jsonb_build_object('eligible',false,'reason','paid_package_exists'); end if;
  return jsonb_build_object('eligible',true,'reason',null);
end $$;

create or replace function public.create_customer_trial(p_reseller_id uuid,p_customer_id uuid,p_source text,p_telegram_link_id uuid default null,p_telegram_username text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c customer_trial_claims%rowtype; o vpn_orders%rowtype; p vpn_plans%rowtype; m reseller_miniapps%rowtype;
  eligibility jsonb; snapshot jsonb; start_day date := (now() at time zone 'Asia/Bangkok')::date;
begin
  if p_source not in ('bot','miniapp','messenger') then raise exception 'INVALID_TRIAL_SOURCE'; end if;
  perform 1 from vpn_customers where id=p_customer_id and reseller_id=p_reseller_id for update;
  if not found then raise exception 'INVALID_CUSTOMER'; end if;
  if not exists(select 1 from vpn_customers c join resellers r on r.id=c.reseller_id
    where c.id=p_customer_id and c.reseller_id=p_reseller_id and c.status='active' and r.status='active') then raise exception 'INACTIVE_ACCOUNT'; end if;
  if not exists(select 1 from reseller_miniapps where reseller_id=p_reseller_id and is_enabled and trial_enabled) then raise exception 'TRIAL_DISABLED'; end if;
  if p_source in ('bot','miniapp') and not exists(select 1 from telegram_links where id=p_telegram_link_id
    and reseller_id=p_reseller_id and customer_id=p_customer_id) then raise exception 'INVALID_TELEGRAM_LINK'; end if;
  select * into c from customer_trial_claims where reseller_id=p_reseller_id and customer_id=p_customer_id;
  if found then
    select * into o from vpn_orders where id=c.order_id and reseller_id=p_reseller_id and customer_id=p_customer_id
      and status='active' and order_type='trial' and expiry_date>=start_day;
    if not found then return jsonb_build_object('order',null,'plan',null,'created',false,'reason','already_used'); end if;
    select * into p from vpn_plans where id=o.plan_id;
    snapshot=coalesce(c.plan_snapshot,to_jsonb(p)||jsonb_build_object('data_limit_gb',coalesce(o.quota_limit_bytes/1073741824.0,p.data_limit_gb)));
    return jsonb_build_object('order',to_jsonb(o),'plan',snapshot,'created',false,'protocol',c.protocol);
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
      and o.status='active' and o.expiry_date>=(now() at time zone 'Asia/Bangkok')::date
      and c.status='active' and r.status='active' and m.is_enabled and m.trial_enabled) then raise exception 'TRIAL_NOT_AUTHORIZED'; end if;
  update customer_trial_claims set provision_status='processing',provision_owner=p_owner
    where reseller_id=p_reseller_id and customer_id=p_customer_id and order_id=p_order_id and provision_status='ready';
  return found;
end $$;
notify pgrst,'reload schema';
commit;
