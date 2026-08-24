-- Monitoring query performance helpers.
--
-- The admin monitoring dashboard should aggregate in Postgres and page raw
-- events, rather than loading a large event set into the backend.

create index if not exists idx_app_events_session_created
  on app_events (session_id, created_at desc)
  where session_id is not null;

create index if not exists idx_app_events_status_created
  on app_events (status, created_at desc);

create index if not exists idx_app_events_telegram_created
  on app_events (telegram_user_id, created_at desc)
  where telegram_user_id is not null;

create or replace function public.admin_monitoring_summary(
  p_start timestamptz,
  p_end timestamptz,
  p_reseller_id uuid default null
)
returns table (
  raw_events bigint,
  total_events bigint,
  unique_customers bigint,
  unique_telegram_users bigint,
  unique_miniapp_opens bigint,
  miniapp_opens bigint,
  miniapp_config_loads bigint,
  packages_viewed bigint,
  server_page_views bigint,
  server_selected bigint,
  server_blocked bigint,
  order_submitted bigint,
  screenshots_uploaded bigint,
  trials_created bigint,
  keys_provisioned bigint,
  failures bigint
)
language sql
stable
as $$
  with scoped as (
    select *
    from app_events
    where created_at >= p_start
      and created_at <= p_end
      and (p_reseller_id is null or reseller_id = p_reseller_id)
  ),
  open_events as (
    select distinct coalesce(
      customer_id::text,
      telegram_user_id::text,
      session_id,
      ip_hash,
      id::text
    ) as actor_key
    from scoped
    where event_name = 'miniapp_authenticated'
  )
  select
    count(*) as raw_events,
    count(*) as total_events,
    count(distinct customer_id) filter (where customer_id is not null) as unique_customers,
    count(distinct telegram_user_id) filter (where telegram_user_id is not null) as unique_telegram_users,
    (select count(*) from open_events) as unique_miniapp_opens,
    (select count(*) from open_events) as miniapp_opens,
    count(*) filter (where event_name = 'miniapp_config_loaded') as miniapp_config_loads,
    count(*) filter (where event_name = 'packages_viewed') as packages_viewed,
    count(*) filter (where event_name = 'server_page_viewed') as server_page_views,
    count(*) filter (where event_name = 'server_selected') as server_selected,
    count(*) filter (where event_name = 'server_select_blocked') as server_blocked,
    count(*) filter (where event_name = 'order_submitted') as order_submitted,
    count(*) filter (where event_name = 'payment_screenshot_uploaded') as screenshots_uploaded,
    count(*) filter (where event_name = 'trial_created') as trials_created,
    count(*) filter (where event_name = 'key_provisioned') as keys_provisioned,
    count(*) filter (where status = 'failed') as failures
  from scoped;
$$;

create or replace function public.admin_monitoring_funnel(
  p_start timestamptz,
  p_end timestamptz,
  p_reseller_id uuid default null
)
returns table (
  event_name text,
  count bigint
)
language sql
stable
as $$
  with event_names(event_name) as (
    values
      ('miniapp_authenticated'),
      ('packages_viewed'),
      ('order_submitted'),
      ('payment_screenshot_uploaded'),
      ('server_page_viewed'),
      ('server_selected'),
      ('server_select_blocked'),
      ('trial_created'),
      ('key_provisioned')
  )
  select event_names.event_name, count(app_events.id) as count
  from event_names
  left join app_events
    on app_events.event_name = event_names.event_name
   and app_events.created_at >= p_start
   and app_events.created_at <= p_end
   and (p_reseller_id is null or app_events.reseller_id = p_reseller_id)
  group by event_names.event_name
  order by array_position(array[
    'miniapp_authenticated',
    'packages_viewed',
    'order_submitted',
    'payment_screenshot_uploaded',
    'server_page_viewed',
    'server_selected',
    'server_select_blocked',
    'trial_created',
    'key_provisioned'
  ], event_names.event_name);
$$;

create or replace function public.admin_monitoring_daily(
  p_start timestamptz,
  p_end timestamptz,
  p_reseller_id uuid default null
)
returns table (
  date text,
  total bigint,
  raw_events bigint,
  miniapp_config_loads bigint,
  unique_miniapp_opens bigint,
  packages_viewed bigint,
  order_submitted bigint,
  server_selected bigint,
  failures bigint
)
language sql
stable
as $$
  with days as (
    select generate_series(
      date_trunc('day', p_start),
      date_trunc('day', p_end),
      interval '1 day'
    ) as day_start
  ),
  scoped as (
    select *
    from app_events
    where created_at >= p_start
      and created_at <= p_end
      and (p_reseller_id is null or reseller_id = p_reseller_id)
  )
  select
    days.day_start::date::text as date,
    count(scoped.id) as total,
    count(scoped.id) as raw_events,
    count(scoped.id) filter (where scoped.event_name = 'miniapp_config_loaded') as miniapp_config_loads,
    count(distinct coalesce(
      scoped.customer_id::text,
      scoped.telegram_user_id::text,
      scoped.session_id,
      scoped.ip_hash,
      scoped.id::text
    )) filter (where scoped.event_name = 'miniapp_authenticated') as unique_miniapp_opens,
    count(scoped.id) filter (where scoped.event_name = 'packages_viewed') as packages_viewed,
    count(scoped.id) filter (where scoped.event_name = 'order_submitted') as order_submitted,
    count(scoped.id) filter (where scoped.event_name = 'server_selected') as server_selected,
    count(scoped.id) filter (where scoped.status = 'failed') as failures
  from days
  left join scoped
    on scoped.created_at >= days.day_start
   and scoped.created_at < days.day_start + interval '1 day'
  group by days.day_start
  order by days.day_start;
$$;

create or replace function public.admin_monitoring_server_events(
  p_start timestamptz,
  p_end timestamptz,
  p_reseller_id uuid default null
)
returns table (
  server_id uuid,
  server_name text,
  region text,
  server_tier text,
  selected bigint,
  key_provisioned bigint,
  blocked bigint,
  failed bigint
)
language sql
stable
as $$
  select
    app_events.server_id,
    coalesce(vpn_servers.name, 'Unknown server') as server_name,
    vpn_servers.region,
    vpn_servers.server_tier,
    count(app_events.id) filter (where app_events.event_name = 'server_selected') as selected,
    count(app_events.id) filter (where app_events.event_name = 'key_provisioned') as key_provisioned,
    count(app_events.id) filter (where app_events.status = 'blocked') as blocked,
    count(app_events.id) filter (where app_events.status = 'failed') as failed
  from app_events
  left join vpn_servers on vpn_servers.id = app_events.server_id
  where app_events.created_at >= p_start
    and app_events.created_at <= p_end
    and app_events.server_id is not null
    and (p_reseller_id is null or app_events.reseller_id = p_reseller_id)
  group by app_events.server_id, vpn_servers.name, vpn_servers.region, vpn_servers.server_tier
  order by
    count(app_events.id) filter (where app_events.event_name = 'server_selected') +
    count(app_events.id) filter (where app_events.event_name = 'key_provisioned') +
    count(app_events.id) filter (where app_events.status = 'blocked') +
    count(app_events.id) filter (where app_events.status = 'failed') desc;
$$;

revoke execute on function public.admin_monitoring_summary(timestamptz, timestamptz, uuid) from anon, authenticated;
revoke execute on function public.admin_monitoring_funnel(timestamptz, timestamptz, uuid) from anon, authenticated;
revoke execute on function public.admin_monitoring_daily(timestamptz, timestamptz, uuid) from anon, authenticated;
revoke execute on function public.admin_monitoring_server_events(timestamptz, timestamptz, uuid) from anon, authenticated;

grant execute on function public.admin_monitoring_summary(timestamptz, timestamptz, uuid) to service_role;
grant execute on function public.admin_monitoring_funnel(timestamptz, timestamptz, uuid) to service_role;
grant execute on function public.admin_monitoring_daily(timestamptz, timestamptz, uuid) to service_role;
grant execute on function public.admin_monitoring_server_events(timestamptz, timestamptz, uuid) to service_role;
