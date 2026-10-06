-- Read-only release checks. Run before and after the coexistence migration.
select 'active_orders' as metric, count(*) as value
from public.vpn_orders where status = 'active'
union all select 'active_keys', count(*)
from public.vpn_keys where status = 'active' and deleted_at is null
union all select 'pending_keys', count(*)
from public.vpn_keys where status = 'pending' and deleted_at is null
union all select 'scheduled_purchase_duplicates', count(*)
from (
  select reseller_id, customer_id from public.vpn_orders
  where status = 'scheduled' and order_type = 'purchase'
  group by reseller_id, customer_id having count(*) > 1
) duplicates
union all select 'paid_keys_on_trial_tier', count(*)
from public.vpn_keys k
join public.vpn_orders o on o.id = k.order_id
join public.vpn_servers s on s.id = k.server_id
where k.status = 'active' and k.deleted_at is null
  and o.order_type = 'purchase' and s.server_tier = 'trial'
order by metric;

select s.name, s.current_active_keys,
       count(k.id) filter (where k.status in ('active', 'pending')) as trigger_count
from public.vpn_servers s
left join public.vpn_keys k on k.server_id = s.id
group by s.id, s.name, s.current_active_keys
order by s.name;

select coalesce(to_jsonb(s)->>'panel_type', 'missing') as panel_type, count(*)
from public.vpn_servers s
group by 1 order by 1;
