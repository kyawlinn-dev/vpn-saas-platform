-- Backend health monitoring state.
-- These compact tables power admin health cards without scanning app_events.

create table if not exists system_job_runs (
  job_name text primary key,
  status text not null default 'idle',
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  consecutive_failures integer not null default 0,
  run_count integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint system_job_runs_status_check
    check (status in ('idle', 'running', 'success', 'failed', 'stale'))
);

create table if not exists server_health_status (
  server_id uuid primary key references vpn_servers(id) on delete cascade,
  outline_api_status text not null default 'unknown',
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_usage_sync_at timestamptz,
  last_error text,
  response_ms integer,
  active_key_count_seen integer,
  consecutive_failures integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint server_health_status_status_check
    check (outline_api_status in ('unknown', 'healthy', 'degraded', 'failed', 'stale'))
);

create index if not exists idx_system_job_runs_status
  on system_job_runs (status, updated_at desc);

create index if not exists idx_server_health_status_status
  on server_health_status (outline_api_status, updated_at desc);

create index if not exists idx_server_health_status_usage_sync
  on server_health_status (last_usage_sync_at desc);

alter table system_job_runs enable row level security;
alter table server_health_status enable row level security;
