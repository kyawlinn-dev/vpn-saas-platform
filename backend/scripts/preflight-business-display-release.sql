-- Run in the PRODUCTION Supabase SQL editor (daenwuszqdfkbjiatsjs).
-- Read-only catalogue inspection. This does NOT apply migrations.
begin transaction read only;
select jsonb_build_object(
  'database', current_database(),
  'column_types', (select jsonb_agg(jsonb_build_object('table',table_name,'column',column_name,'type',data_type))
    from information_schema.columns where table_schema='public' and
      ((table_name='vpn_plans' and column_name='data_limit_gb') or
       (table_name='vpn_orders' and column_name='quota_limit_bytes'))),
  'constraints', (select jsonb_agg(jsonb_build_object('table',c.conrelid::regclass::text,'name',c.conname,'validated',c.convalidated,'definition',pg_get_constraintdef(c.oid)))
    from pg_constraint c join pg_namespace n on n.oid=c.connamespace
    where n.nspname='public' and c.conrelid in
      (to_regclass('public.vpn_customers'),to_regclass('public.vpn_orders'),to_regclass('public.order_payments'),to_regclass('public.vpn_keys'))),
  'indexes', (select jsonb_agg(jsonb_build_object('table',tablename,'name',indexname,'definition',indexdef))
    from pg_indexes where schemaname='public' and tablename in ('vpn_customers','vpn_orders','order_payments','vpn_keys')),
  'triggers', (select jsonb_agg(jsonb_build_object('table',t.tgrelid::regclass::text,'definition',pg_get_triggerdef(t.oid),'function',pg_get_functiondef(t.tgfoid)))
    from pg_trigger t where not t.tgisinternal and t.tgrelid in
      (to_regclass('public.vpn_keys'),to_regclass('public.vpn_servers'),to_regclass('public.vpn_orders'),to_regclass('public.order_payments'))),
  'functions', (select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),
      'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),
      'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
      'service_role_execute',has_function_privilege('service_role',p.oid,'EXECUTE')))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('apply_confirmed_payment','reserve_pending_key','activate_vpn_key','fail_pending_key',
      'prepare_dashboard_purchase','ensure_dashboard_purchase_operation','claim_dashboard_purchase_setup','finish_dashboard_purchase_setup')),
  'setup_table_exists', to_regclass('public.dashboard_purchase_operations') is not null
) as release_preflight;
rollback;
