-- A customer may have one active purchase and at most one queued purchase.
-- Stop if historical duplicates exist; decide which paid order to keep before
-- applying this migration. Never silently discard a scheduled sale.
begin;

do $$
begin
  if exists (
    select 1
    from vpn_orders
    where status = 'scheduled' and order_type = 'purchase'
    group by reseller_id, customer_id
    having count(*) > 1
  ) then
    raise exception 'Duplicate scheduled purchases exist. Review them before applying 0024.';
  end if;
end $$;

create unique index if not exists idx_vpn_orders_one_scheduled_purchase
  on vpn_orders (reseller_id, customer_id)
  where status = 'scheduled' and order_type = 'purchase';

commit;
