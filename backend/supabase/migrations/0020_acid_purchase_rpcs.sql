-- 0020_acid_purchase_rpcs.sql
--
-- Phase 1 of the Final Data Model (see FINAL_DATA_MODEL.md §6, §8): give key
-- provisioning real ACID guarantees.
--
-- Today the per-server provisioning loop in subscriptionProvisionService.js is a
-- sequence of independent PostgREST calls (increment server counter -> create
-- panel key -> insert vpn_keys -> assign token) with hand-rolled compensation in
-- a catch block. A crash or a failed compensation step leaves half-saved data:
-- an order with no key, or a server counter that was incremented but never
-- released.
--
-- This migration adds three SECURITY DEFINER functions that make the *database*
-- writes atomic. The external panel call still happens between them (it cannot
-- live inside a DB transaction), so the flow is a saga:
--
--     reserve_pending_key()  --(tx: counter++ AND insert pending key)
--            |
--     <panel createKey()>    --external, non-transactional
--            |
--     activate_vpn_key()     --(tx: flip pending -> active with panel result)
--            |
--     fail_pending_key()     --(tx: counter-- AND soft-delete)  on any failure
--
-- Every function is tenant-guarded (validates the reseller owns the row) so it
-- is safe under the service-role connection the backend already uses (Decision
-- 4). Additive: existing rows are untouched.

begin;

-- 1. Allow the transient 'pending' state used while a key is reserved but not
--    yet confirmed by the panel. 'failed' is intentionally NOT added — a failed
--    provision is soft-deleted (status='deleted'), matching today's behavior and
--    avoiding an orphan state with no reconcile job yet.
alter table vpn_keys drop constraint if exists vpn_keys_status_check;
alter table vpn_keys
  add constraint vpn_keys_status_check
  check (status in ('active', 'deleted', 'pending')) not valid;

-- 2. reserve_pending_key
--    Atomically reserve one unit of server capacity AND insert a pending key.
--    The capacity check is a single row-locked conditional UPDATE, which
--    replaces the app-side 5-attempt optimistic loop (and its SERVER_USAGE_RACE
--    retries) with a race-free reservation. A null/<=0 max_active_keys means
--    "no ceiling", preserving current semantics.
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
  v_key_id   uuid;
  v_reserved int;
begin
  -- Tenant guard (P2/P5): the order must belong to this reseller.
  if not exists (
    select 1 from vpn_orders
    where id = p_order_id and reseller_id = p_reseller_id
  ) then
    raise exception 'order % does not belong to reseller %', p_order_id, p_reseller_id
      using errcode = 'check_violation';
  end if;

  update vpn_servers
     set current_active_keys = current_active_keys + 1,
         last_error = null,
         updated_at = now()
   where id = p_server_id
     and (max_active_keys is null
          or max_active_keys <= 0
          or current_active_keys < max_active_keys)
  returning 1 into v_reserved;

  if v_reserved is null then
    -- Either the server does not exist or it is at capacity.
    raise exception 'server % is full or missing', p_server_id
      using errcode = 'check_violation';
  end if;

  insert into vpn_keys (
    order_id, customer_id, reseller_id, server_id,
    key_name, data_limit_bytes, used_bytes, status, protocol
  ) values (
    p_order_id, p_customer_id, p_reseller_id, p_server_id,
    p_key_name, p_data_limit_bytes, 0, 'pending', p_protocol
  )
  returning id into v_key_id;

  return v_key_id;
  -- Any exception above rolls back BOTH the counter increment and the insert.
end $$;

-- 3. activate_vpn_key
--    Flip a reserved (pending) key to active with the panel result. Capacity was
--    already reserved by reserve_pending_key, so the counter is untouched here.
create or replace function activate_vpn_key(
  p_key_id          uuid,
  p_reseller_id     uuid,
  p_outline_key_id  text,
  p_access_url      text,
  p_key_credentials jsonb
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

  if v_status is null then
    raise exception 'key % not found for reseller %', p_key_id, p_reseller_id
      using errcode = 'no_data_found';
  end if;
  if v_status = 'deleted' then
    raise exception 'key % is already deleted', p_key_id
      using errcode = 'check_violation';
  end if;

  update vpn_keys
     set status          = 'active',
         outline_key_id  = p_outline_key_id,
         access_url      = p_access_url,
         key_credentials = p_key_credentials,
         is_used         = true,
         used_at         = now(),
         deleted_at      = null,
         updated_at      = now()
   where id = p_key_id;
end $$;

-- 4. fail_pending_key
--    Release the reservation for a key whose panel provisioning failed:
--    decrement the counter (only if the key still holds a reservation) and
--    soft-delete the row, atomically. Idempotent — safe to call once from the
--    catch block even if the key was already cleaned up.
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
  v_server uuid;
begin
  select status, server_id into v_status, v_server
    from vpn_keys
   where id = p_key_id and reseller_id = p_reseller_id
   for update;

  if v_status is null or v_status = 'deleted' then
    return; -- nothing to release; idempotent
  end if;

  if v_status in ('pending', 'active') and v_server is not null then
    update vpn_servers
       set current_active_keys = greatest(0, current_active_keys - 1),
           updated_at = now()
     where id = v_server;
  end if;

  update vpn_keys
     set status     = 'deleted',
         deleted_at = now(),
         updated_at = now()
   where id = p_key_id;
end $$;

comment on function reserve_pending_key(uuid,uuid,uuid,uuid,text,bigint,text) is
  'ACID saga step 1: atomically reserve server capacity and insert a pending vpn_keys row. Tenant-guarded. Raises on full/missing server.';
comment on function activate_vpn_key(uuid,uuid,text,text,jsonb) is
  'ACID saga step 2: flip a reserved pending key to active with the panel result (access_url, credentials). Tenant-guarded.';
comment on function fail_pending_key(uuid,uuid) is
  'ACID saga compensation: release the capacity reservation and soft-delete a pending/active key after a failed provision. Idempotent, tenant-guarded.';

-- Least privilege (P5): these are SECURITY DEFINER and would otherwise be
-- callable by the anon/authenticated keys via PostgREST. Only the backend's
-- service_role connection should invoke them.
revoke execute on function reserve_pending_key(uuid,uuid,uuid,uuid,text,bigint,text) from public;
revoke execute on function activate_vpn_key(uuid,uuid,text,text,jsonb) from public;
revoke execute on function fail_pending_key(uuid,uuid) from public;
grant execute on function reserve_pending_key(uuid,uuid,uuid,uuid,text,bigint,text) to service_role;
grant execute on function activate_vpn_key(uuid,uuid,text,text,jsonb) to service_role;
grant execute on function fail_pending_key(uuid,uuid) to service_role;

commit;
