begin;

-- 0045 inline CHECKs have these PostgreSQL-generated constraint names.
-- Expand lifecycle-owned provider receipts/intents only; retain the empty
-- provider used by panel receipts. No data, bindings or ownership are changed.
alter table public.server_infrastructure_resources
  drop constraint server_infrastructure_resources_provider_check;
alter table public.server_infrastructure_resources
  add constraint server_infrastructure_resources_provider_check
  check (provider in ('', 'digitalocean', 'vultr', 'lightnode'));

alter table public.server_provider_create_intents
  drop constraint server_provider_create_intents_provider_check;
alter table public.server_provider_create_intents
  add constraint server_provider_create_intents_provider_check
  check (provider in ('digitalocean', 'vultr', 'lightnode'));

-- claim_server_provider_intent and register_server_infrastructure_resource
-- already validate scoped account/intent/lease evidence without provider enums.
-- ensure_server_operation_candidate accepts non-DO immutable text UUIDs, leaving
-- droplet_id NULL. Do not replace these RPCs or their ownership/replay guards.
-- 0051 adopt_existing_node intentionally remains DO/Vultr-only: adding a fresh
-- lifecycle provider does not authorize adoption of protected LightNode mirrors.

notify pgrst, 'reload schema';
commit;
