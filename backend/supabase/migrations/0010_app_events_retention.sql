-- app_events retention.
--
-- app_events grows quickly (every miniapp page view writes a row). We keep 90
-- days of raw events for debugging + funnel analysis, and rely on periodic
-- aggregation into monitoring summaries for longer-term trends.
--
-- This migration adds a helper function that the backend cleanup job calls
-- once per day.

create or replace function public.cleanup_old_app_events(p_days integer default 90)
returns integer
language plpgsql
security definer
as $$
declare
  cutoff timestamptz := now() - make_interval(days => greatest(p_days, 7));
  deleted_count integer;
begin
  delete from app_events
    where created_at < cutoff;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

comment on function public.cleanup_old_app_events(integer)
  is 'Deletes app_events older than N days (minimum 7). Called from cleanupAppEventsJob.';
