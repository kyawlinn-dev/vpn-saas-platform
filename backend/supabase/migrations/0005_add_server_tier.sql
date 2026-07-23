-- 0005_add_server_tier.sql
-- Separates trial and premium Outline capacity.
-- Existing servers are treated as premium until an admin marks one as trial.

alter table vpn_servers
  add column if not exists server_tier text not null default 'premium';

update vpn_servers
set server_tier = 'premium'
where server_tier is null
   or server_tier not in ('trial', 'premium');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'vpn_servers_server_tier_check'
  ) then
    alter table vpn_servers
      add constraint vpn_servers_server_tier_check
      check (server_tier in ('trial', 'premium'));
  end if;
end $$;

create index if not exists idx_vpn_servers_tier_status_region
  on vpn_servers (server_tier, status, region);
