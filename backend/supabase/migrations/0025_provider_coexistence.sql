-- Keep legacy Outline servers identifiable while Marzneshin is introduced.
-- Databases that already ran the original 0013 marked existing Outline rows
-- as marzneshin. Fresh databases get the safe default directly from 0013.
begin;

alter table vpn_servers drop constraint if exists vpn_servers_panel_type_check;
alter table vpn_servers
  add constraint vpn_servers_panel_type_check
  check (panel_type in ('outline', 'marzneshin')) not valid;

update vpn_servers
set panel_type = 'outline'
where panel_url is null and outline_api_url is not null;

alter table vpn_servers validate constraint vpn_servers_panel_type_check;

alter table vpn_servers alter column panel_type set default 'outline';

commit;
