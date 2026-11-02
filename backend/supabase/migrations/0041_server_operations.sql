begin;

-- Private records: checkpoints may contain account snapshots. Never expose raw rows.
create table public.server_operations (
  id uuid primary key default gen_random_uuid(),
  environment text not null check(environment in ('development','production')),
  access_pool_id uuid not null,
  database_identity text not null check(length(database_identity) between 1 and 200),
  panel_identity text not null check(length(panel_identity) between 1 and 200),
  kind text not null check(kind in ('add','replace','move_retire')),
  idempotency_key text not null check(length(idempotency_key) between 1 and 200),
  payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
  payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=65536),
  status text not null default 'queued' check(status in ('queued','running','blocked','paused','completed','cancelled','failed','partial')),
  stage text not null default 'queued' check(length(stage) between 1 and 100),
  checkpoint jsonb not null default '{}' check(jsonb_typeof(checkpoint)='object' and octet_length(checkpoint::text)<=65536),
  lease_owner uuid,
  lease_until timestamptz,
  fence bigint not null default 0 check(fence>=0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(environment,access_pool_id,idempotency_key),
  unique(id,environment,access_pool_id),
  foreign key(access_pool_id,environment) references public.server_access_pools(id,environment)
);
create table public.server_operation_items (
  operation_id uuid not null references public.server_operations(id),
  item_key text not null check(length(item_key) between 1 and 200),
  expected jsonb not null check(jsonb_typeof(expected)='object' and octet_length(expected::text)<=65536),
  checkpoint jsonb not null default '{}' check(jsonb_typeof(checkpoint)='object' and octet_length(checkpoint::text)<=65536),
  status text not null default 'claimed' check(status in ('claimed','prepared','applied','verified','blocked','uncertain')),
  fence bigint not null,
  updated_at timestamptz not null default clock_timestamp(),
  primary key(operation_id,item_key)
);
create table public.server_operation_locks (
  environment text not null,
  access_pool_id uuid not null,
  resource_key text not null check(resource_key ~ '^(server|order):[a-f0-9-]{36}$'),
  operation_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(environment,access_pool_id,resource_key),
  foreign key(operation_id,environment,access_pool_id) references public.server_operations(id,environment,access_pool_id)
);
create index server_operations_claimable on public.server_operations(environment,access_pool_id,status,lease_until);
create index server_operation_locks_operation on public.server_operation_locks(operation_id);
alter table public.server_operations enable row level security;
alter table public.server_operation_items enable row level security;
alter table public.server_operation_locks enable row level security;
revoke all on public.server_operations,public.server_operation_items,public.server_operation_locks from public,anon,authenticated,service_role;
grant select on public.server_operations,public.server_operation_items,public.server_operation_locks to service_role;

commit;
