-- Queued-plan (prepaid queue) model.
--
-- Extending an ACTIVE subscription no longer tops up the current plan in place.
-- Instead it creates a NEW, independent order that waits in a "scheduled" state
-- and activates automatically when the current plan ends (by time OR data,
-- whichever comes first). No usage/data carries over — each plan is fresh.
--
-- This adds 'scheduled' to the vpn_orders status set. A scheduled order holds
-- no keys and no server capacity until it activates. The existing
-- idx_vpn_orders_one_active_purchase index is unaffected (it filters on
-- status = 'active', so any number of scheduled orders may queue per customer).

alter table vpn_orders
  drop constraint if exists vpn_orders_status_check;

alter table vpn_orders
  add constraint vpn_orders_status_check
  check (status in ('pending', 'active', 'expired', 'stopped', 'scheduled')) not valid;

-- Speeds up the lifecycle job's FIFO lookup of the next queued plan per customer.
create index if not exists idx_vpn_orders_scheduled_queue
  on vpn_orders (customer_id, created_at)
  where status = 'scheduled';
