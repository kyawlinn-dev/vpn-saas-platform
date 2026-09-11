-- Hybrid reseller onboarding: allow a 'pending' status.
--
-- Self-serve signup creates a reseller in 'pending' — they can log in, explore
-- the dashboard, and set up their brand/payment, but cannot provision real keys
-- until an admin approves them (status → 'active'). 'disabled' remains the
-- suspended state.

alter table resellers
  drop constraint if exists resellers_status_check;

alter table resellers
  add constraint resellers_status_check
  check (status in ('active', 'disabled', 'pending')) not valid;
