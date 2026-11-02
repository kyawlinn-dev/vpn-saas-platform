-- Aggregate read-only checks only. No customer identifiers or records returned.
select jsonb_build_object(
 'trial_orders_with_invalid_scope',(select count(*) from vpn_orders o where o.order_type='trial' and
   (o.reseller_id is null or not exists(select 1 from vpn_customers c join resellers r on r.id=c.reseller_id where c.id=o.customer_id and c.reseller_id=o.reseller_id))),
 'used_trial_links_with_invalid_scope',(select count(*) from telegram_links l where l.trial_used_at is not null and
   not exists(select 1 from vpn_customers c join resellers r on r.id=c.reseller_id where c.id=l.customer_id and c.reseller_id=l.reseller_id)),
 'legacy_receipt_money_violations',(select count(*) from order_payments where
   amount_mmk<0 or commission_amount_mmk<0 or platform_due_mmk<0 or commission_percent<0 or commission_percent>100
   or amount_mmk<>commission_amount_mmk+platform_due_mmk),
 'active_purchase_duplicates',(select count(*) from(select reseller_id,customer_id from vpn_orders where status='active' and order_type='purchase' group by reseller_id,customer_id having count(*)>1) d),
 'queued_purchase_duplicates',(select count(*) from(select reseller_id,customer_id from vpn_orders where status='scheduled' and order_type='purchase' group by reseller_id,customer_id having count(*)>1) d)
) as integrity;
