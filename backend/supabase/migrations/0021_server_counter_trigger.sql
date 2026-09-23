-- 0021_server_counter_trigger.sql
--
-- Phase 2 of the Final Data Model (FINAL_DATA_MODEL.md §5.1): kill counter drift.
--
-- vpn_servers.current_active_keys was maintained by hand in ~13 places via an
-- app-side optimistic loop (incrementServerUsage/decrementServerUsage) plus the
-- reserve/fail RPCs. Any missed increment/decrement drifts the count.
--
-- This migration makes the DATABASE the sole owner of that counter:
--   * An AFTER trigger on vpn_keys recomputes current_active_keys =
--     count(status in ('active','pending')) for every affected server, so it can
--     never drift regardless of which code path writes a key.
--   * The SAME trigger enforces capacity: it locks the server row (serializing
--     concurrent key writes) and RAISES if the count would exceed
--     max_active_keys. This is a race-free, DB-level guarantee that replaces the
--     scattered app-side SERVER_FULL checks.
--
-- Because the trigger now owns the counter, the reserve/fail RPCs (0020) no
-- longer touch it, and the app-side increment/decrement helpers become no-ops
-- (done in serverService.js). A one-time reconcile fixes any existing drift.

begin;

-- 1. Counter maintenance + capacity enforcement, in one AFTER trigger.
create or replace function sync_server_active_keys()
returns trigger
language plpgsql
as $$
declare
  v_servers uuid[];
  s uuid;
  v_count int;
  v_max int;
begin
  -- Every server touched by this row change (covers server moves on UPDATE).
  v_servers := array_remove(array[
    case when tg_op in ('UPDATE','DELETE') then old.server_id end,
    case when tg_op in ('INSERT','UPDATE') then new.server_id end
  ], null);

  foreach s in array v_servers loop
    -- Serialize concurrent key writes for this server so the capacity check
    -- below is race-free.
    perform 1 from vpn_servers where id = s for update;

    select count(*) into v_count
      from vpn_keys
     where server_id = s and status in ('active', 'pending');

    select max_active_keys into v_max from vpn_servers where id = s;

    if v_max is not null and v_max > 0 and v_count > v_max then
      raise exception 'server % capacity exceeded (% > %)', s, v_count, v_max
        using errcode = 'check_violation';
    end if;

    update vpn_servers
       set current_active_keys = v_count,
           updated_at = now()
     where id = s;
  end loop;

  return null;
end $$;

drop trigger if exists trg_sync_server_active_keys on vpn_keys;
create trigger trg_sync_server_active_keys
  after insert or update or delete on vpn_keys
  for each row execute function sync_server_active_keys();

-- 2. Redefine the 0020 saga RPCs so they no longer touch the counter — the
--    trigger owns it now. reserve_pending_key becomes: tenant-validate + insert
--    (the trigger enforces capacity on the insert). fail_pending_key becomes:
--    soft-delete (the trigger releases the reservation).

create or replace function reserve_pending_key(
  p_order_id         uuid,
  p_customer_id      uuid,
  p_reseller_id      uuid,
  p_server_id        uuid,
  p_key_name         text,
  p_data_limit_bytes bigint,
  p_protocol         text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key_id uuid;
begin
  -- Tenant guard (P2/P5): the order must belong to this reseller.
  if not exists (
    select 1 from vpn_orders
    where id = p_order_id and reseller_id = p_reseller_id
  ) then
    raise exception 'order % does not belong to reseller %', p_order_id, p_reseller_id
      using errcode = 'check_violation';
  end if;

  -- Capacity is enforced by trg_sync_server_active_keys on this insert; if the
  -- server is full it raises 'capacity exceeded' and the insert rolls back.
  insert into vpn_keys (
    order_id, customer_id, reseller_id, server_id,
    key_name, data_limit_bytes, used_bytes, status, protocol
  ) values (
    p_order_id, p_customer_id, p_reseller_id, p_server_id,
    p_key_name, p_data_limit_bytes, 0, 'pending', p_protocol
  )
  returning id into v_key_id;

  return v_key_id;
end $$;

create or replace function fail_pending_key(
  p_key_id      uuid,
  p_reseller_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select status into v_status
    from vpn_keys
   where id = p_key_id and reseller_id = p_reseller_id
   for update;

  if v_status is null or v_status = 'deleted' then
    return; -- idempotent
  end if;

  -- Soft-delete; the trigger recomputes the counter (releases the reservation).
  update vpn_keys
     set status     = 'deleted',
         deleted_at = now(),
         updated_at = now()
   where id = p_key_id;
end $$;

-- 3. One-time reconcile: fix any historical drift so the trigger starts from a
--    correct baseline.
update vpn_servers s
   set current_active_keys = (
     select count(*) from vpn_keys k
      where k.server_id = s.id and k.status in ('active', 'pending')
   ),
   updated_at = now();

comment on function sync_server_active_keys() is
  'Owns vpn_servers.current_active_keys: recomputes count(active+pending keys) per affected server on every vpn_keys change, and enforces max_active_keys (row-locked, race-free). Replaces app-side counter management.';

commit;
